import "server-only";

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import chromiumPackage from "@sparticuz/chromium";
import { chromium } from "playwright-core";

import { readGamesCSV, writeFailedCSV } from "@/lib/csv";
import { appendStatusLog, createRunningStatus, writeMonitorStatus } from "@/lib/monitor-state";
import { checkUrlWithRetry } from "@/lib/playwright-checker";
import type { FailedGameEntry, MonitorRunResult, MonitorStatus } from "@/types/report";

const MAX_URLS = 10_000;
const BATCH_SIZE = 200;
const CONCURRENCY = 8;
const BATCH_DELAY_MIN_MS = 300;
const BATCH_DELAY_MAX_MS = 900;
const CHECK_LOG_INTERVAL = 25;
const STATUS_PERSIST_INTERVAL = 10;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function randomBatchDelayMs(): number {
  return Math.floor(Math.random() * (BATCH_DELAY_MAX_MS - BATCH_DELAY_MIN_MS + 1)) + BATCH_DELAY_MIN_MS;
}

function createFailure(url: string): FailedGameEntry {
  return {
    timestamp: new Date().toISOString(),
    url,
    reason: "redirected_to_home",
  };
}

function resolveChromiumBinDirFromFs(): string | null {
  const directPath = path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");

  if (existsSync(directPath)) {
    return directPath;
  }

  const pnpmRoot = path.join(process.cwd(), "node_modules", ".pnpm");

  if (!existsSync(pnpmRoot)) {
    return null;
  }

  try {
    const entries = readdirSync(pnpmRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (!entry.name.startsWith("@sparticuz+chromium@")) {
        continue;
      }

      const candidate = path.join(
        pnpmRoot,
        entry.name,
        "node_modules",
        "@sparticuz",
        "chromium",
        "bin",
      );

      if (existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function launchMonitorBrowser(): Promise<import("playwright-core").Browser> {
  const isServerlessLinux = process.platform === "linux" && Boolean(process.env.VERCEL);

  try {
    if (isServerlessLinux) {
      const chromiumBinDir = resolveChromiumBinDirFromFs();
      const executablePath = chromiumBinDir
        ? await chromiumPackage.executablePath(chromiumBinDir)
        : await chromiumPackage.executablePath();

      return await chromium.launch({
        headless: true,
        executablePath,
        args: [...chromiumPackage.args, "--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    return await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown browser launch error";

    if (message.includes("Executable doesn't exist")) {
      throw new Error(
        "Chromium executable is missing in runtime. Ensure Vercel deployment includes @sparticuz/chromium and rebuild without cache.",
      );
    }

    throw error;
  }
}

class MonitorStatusTracker {
  private status: MonitorStatus;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(totalUrls: number) {
    this.status = createRunningStatus(totalUrls);
  }

  async start(): Promise<void> {
    await writeMonitorStatus(this.status);
  }

  private queuePersist(): void {
    const snapshot: MonitorStatus = {
      ...this.status,
      logs: [...this.status.logs],
    };

    this.writeQueue = this.writeQueue
      .then(async () => {
        await writeMonitorStatus(snapshot);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown monitor status write error";
        console.warn(`Monitor status write warning: ${message}`);
      });
  }

  recordCheck(globalIndex: number, totalUrls: number, failed: boolean, url: string): void {
    this.status.checked += 1;

    if (failed) {
      this.status.failed += 1;
      this.status = appendStatusLog(this.status, `Failed (${globalIndex}/${totalUrls}): ${url}`, "warn");
    } else {
      this.status.success += 1;

      if (globalIndex % CHECK_LOG_INTERVAL === 0 || globalIndex === totalUrls) {
        this.status = appendStatusLog(this.status, `Checked ${globalIndex}/${totalUrls}`);
      }
    }

    if (this.status.checked % STATUS_PERSIST_INTERVAL === 0 || failed || globalIndex === totalUrls) {
      this.queuePersist();
    }
  }

  recordWarning(url: string, message: string): void {
    this.status = appendStatusLog(this.status, `Warning for ${url}: ${message}`, "warn");
    this.queuePersist();
  }

  recordInfo(message: string): void {
    this.status = appendStatusLog(this.status, message, "info");
    this.queuePersist();
  }

  async complete(result: MonitorRunResult): Promise<void> {
    this.status.running = false;
    this.status.finishedAt = new Date().toISOString();
    this.status.duration = result.duration;
    this.status.reportFile = result.reportFile;
    this.status.error = null;
    this.status.checked = result.checked;
    this.status.failed = result.failed;
    this.status.success = result.success;
    this.status.totalUrls = result.totalUrls;
    this.status = appendStatusLog(this.status, `Completed. Failed: ${result.failed}, Success: ${result.success}`, "info");

    this.queuePersist();
    await this.writeQueue;
  }

  async fail(totalUrls: number, checked: number, failed: number, message: string): Promise<void> {
    this.status.running = false;
    this.status.finishedAt = new Date().toISOString();
    this.status.totalUrls = totalUrls;
    this.status.checked = checked;
    this.status.failed = failed;
    this.status.success = Math.max(0, checked - failed);
    this.status.duration = this.status.startedAt
      ? Date.now() - new Date(this.status.startedAt).getTime()
      : this.status.duration;
    this.status.error = message;
    this.status = appendStatusLog(this.status, `Monitor failed: ${message}`, "error");

    this.queuePersist();
    await this.writeQueue;
  }
}

async function processBatch(
  urls: string[],
  startIndex: number,
  totalUrls: number,
  browser: import("playwright-core").Browser,
  tracker: MonitorStatusTracker,
): Promise<{ checked: number; failures: FailedGameEntry[] }> {
  const failures: FailedGameEntry[] = [];
  let checked = 0;
  let cursor = 0;

  const workerCount = Math.min(CONCURRENCY, urls.length);

  async function worker(): Promise<void> {
    while (true) {
      const localIndex = cursor;
      cursor += 1;

      if (localIndex >= urls.length) {
        return;
      }

      const url = urls[localIndex];
      const globalIndex = startIndex + localIndex + 1;

      try {
        console.log(`Checking ${globalIndex}/${totalUrls}`);
        const result = await checkUrlWithRetry(browser, url);

        if (result.failed) {
          failures.push(createFailure(url));
          tracker.recordCheck(globalIndex, totalUrls, true, url);
        } else {
          tracker.recordCheck(globalIndex, totalUrls, false, url);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown check error";
        console.warn(`Check warning for ${url}: ${message}`);
        tracker.recordWarning(url, message);
        tracker.recordCheck(globalIndex, totalUrls, false, url);
      } finally {
        checked += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, async () => worker()));

  return { checked, failures };
}

export async function runMonitor(): Promise<MonitorRunResult> {
  const startedAt = Date.now();

  const allUrls = await readGamesCSV();
  const urls = allUrls.slice(0, MAX_URLS);

  const tracker = new MonitorStatusTracker(urls.length);
  await tracker.start();

  if (allUrls.length > MAX_URLS) {
    const message = `Loaded ${allUrls.length} URLs. Processing first ${MAX_URLS}.`;
    console.warn(message);
    tracker.recordInfo(message);
  }

  if (urls.length === 0) {
    const reportFile = await writeFailedCSV([]);

    const result: MonitorRunResult = {
      totalUrls: 0,
      checked: 0,
      failed: 0,
      success: 0,
      duration: Date.now() - startedAt,
      reportFile,
    };

    await tracker.complete(result);

    return result;
  }

  let browser: import("playwright-core").Browser | null = null;
  let checked = 0;
  const failures: FailedGameEntry[] = [];

  try {
    browser = await launchMonitorBrowser();

    for (let start = 0; start < urls.length; start += BATCH_SIZE) {
      const batch = urls.slice(start, start + BATCH_SIZE);
      tracker.recordInfo(
        `Starting batch ${Math.floor(start / BATCH_SIZE) + 1} (${start + 1}-${start + batch.length} of ${urls.length})`,
      );

      const batchResult = await processBatch(batch, start, urls.length, browser, tracker);

      checked += batchResult.checked;
      failures.push(...batchResult.failures);

      if (start + BATCH_SIZE < urls.length) {
        await wait(randomBatchDelayMs());
      }
    }

    const reportFile = await writeFailedCSV(failures);

    const result: MonitorRunResult = {
      totalUrls: urls.length,
      checked,
      failed: failures.length,
      success: checked - failures.length,
      duration: Date.now() - startedAt,
      reportFile,
    };

    await tracker.complete(result);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown monitor execution error";
    await tracker.fail(urls.length, checked, failures.length, message);
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
