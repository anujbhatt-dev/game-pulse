import "server-only";

import { createReadStream } from "node:fs";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

import csvParser from "csv-parser";
import { writeToStream } from "fast-csv";
import { format } from "date-fns";

import type { FailedGameEntry, ReportSummary } from "@/types/report";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(DATA_DIR, "reports");
const GAMES_CSV_PATH = path.join(DATA_DIR, "games.csv");
const REPORT_FILE_PATTERN = /^failed-games-(\d{4}-\d{2}-\d{2})\.csv$/;

interface RawCsvRow {
  timestamp?: string;
  url?: string;
  reason?: string;
  [key: string]: string | undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all([fs.mkdir(DATA_DIR, { recursive: true }), fs.mkdir(REPORTS_DIR, { recursive: true })]);
}

export async function readGamesCSV(): Promise<string[]> {
  await ensureStorageDirectories();

  try {
    await fs.access(GAMES_CSV_PATH);
  } catch {
    return [];
  }

  return new Promise<string[]>((resolve, reject) => {
    const urls: string[] = [];

    createReadStream(GAMES_CSV_PATH)
      .on("error", reject)
      .pipe(csvParser())
      .on("data", (row: RawCsvRow) => {
        const url = row.url?.trim() ?? "";

        if (!isHttpUrl(url)) {
          return;
        }

        urls.push(url);
      })
      .on("end", () => {
        resolve(urls);
      })
      .on("error", reject);
  });
}

function reportFileNameForDate(date: Date): string {
  const dateKey = format(date, "yyyy-MM-dd");
  return `failed-games-${dateKey}.csv`;
}

export async function writeFailedCSV(failedUrls: FailedGameEntry[], date = new Date()): Promise<string> {
  await ensureStorageDirectories();

  const fileName = reportFileNameForDate(date);
  const reportPath = path.join(REPORTS_DIR, fileName);
  const tempPath = `${reportPath}.tmp`;

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(tempPath, { encoding: "utf8" });

    stream.on("error", reject);

    writeToStream(
      stream,
      failedUrls.map((entry) => ({
        timestamp: entry.timestamp,
        url: entry.url,
        reason: entry.reason,
      })),
      {
        headers: ["timestamp", "url", "reason"],
        alwaysWriteHeaders: true,
        includeEndRowDelimiter: true,
      },
    )
      .on("finish", () => {
        resolve();
      })
      .on("error", reject);
  });

  await fs.rename(tempPath, reportPath);

  return fileName;
}

export async function readFailedCSV(filePath: string): Promise<FailedGameEntry[]> {
  return new Promise<FailedGameEntry[]>((resolve, reject) => {
    const entries: FailedGameEntry[] = [];

    createReadStream(filePath)
      .on("error", reject)
      .pipe(csvParser())
      .on("data", (row: RawCsvRow) => {
        const url = row.url?.trim() ?? "";

        if (!isHttpUrl(url)) {
          return;
        }

        const reason = row.reason?.trim() === "redirected_to_home" ? "redirected_to_home" : null;

        if (!reason) {
          return;
        }

        entries.push({
          timestamp: row.timestamp?.trim() || new Date(0).toISOString(),
          url,
          reason,
        });
      })
      .on("end", () => {
        resolve(entries);
      })
      .on("error", reject);
  });
}

export function getReportsDir(): string {
  return REPORTS_DIR;
}

export function getReportPathByDate(date: string): string {
  return path.join(REPORTS_DIR, `failed-games-${date}.csv`);
}

export function normalizeReportDate(value: string): string | null {
  const cleaned = value.replace(/^failed-games-/, "").replace(/\.csv$/, "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

export async function listReportSummaries(): Promise<ReportSummary[]> {
  await ensureStorageDirectories();

  const files = await fs.readdir(REPORTS_DIR);
  const reportFiles = files.filter((file) => REPORT_FILE_PATTERN.test(file));

  const summaries = await Promise.all(
    reportFiles.map(async (fileName) => {
      const match = REPORT_FILE_PATTERN.exec(fileName);

      if (!match) {
        return null;
      }

      const entries = await readFailedCSV(path.join(REPORTS_DIR, fileName));

      return {
        date: match[1],
        file: fileName,
        failedCount: entries.length,
      } satisfies ReportSummary;
    }),
  );

  return summaries
    .filter((summary): summary is ReportSummary => summary !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}
