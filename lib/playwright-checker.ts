import "server-only";

import type { Browser } from "playwright";

export interface UrlCheckResult {
  failed: boolean;
  finalUrl: string;
}

export interface UrlCheckerConfig {
  navigationTimeoutMs: number;
  redirectWaitMs: number;
  userAgent: string;
}

const DEFAULT_CONFIG: UrlCheckerConfig = {
  navigationTimeoutMs: 30_000,
  redirectWaitMs: 12_000,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

function endsWithHome(urlValue: string): boolean {
  try {
    const parsed = new URL(urlValue);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return normalizedPath.endsWith("/home");
  } catch {
    return /\/home\/?$/i.test(urlValue.replace(/[?#].*$/, ""));
  }
}

function normalizeComparableUrl(urlValue: string): string {
  try {
    const parsed = new URL(urlValue);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${normalizedPath}`.toLowerCase();
  } catch {
    return urlValue.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

async function runSingleCheck(
  browser: Browser,
  url: string,
  config: UrlCheckerConfig,
): Promise<UrlCheckResult> {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: config.userAgent,
  });

  const page = await context.newPage();

  try {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: config.navigationTimeoutMs,
      });

      await page.waitForURL(
        (currentUrl) => {
          return endsWithHome(currentUrl.toString());
        },
        { timeout: config.redirectWaitMs },
      );
    } catch {
      // Ignore navigation timing issues: only confirmed home redirect is a failure.
    }

    const finalUrl = page.url();
    const redirectedToHome =
      endsWithHome(finalUrl) && normalizeComparableUrl(finalUrl) !== normalizeComparableUrl(url);

    return {
      failed: redirectedToHome,
      finalUrl,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

export async function checkUrlWithRetry(
  browser: Browser,
  url: string,
  config: Partial<UrlCheckerConfig> = {},
): Promise<UrlCheckResult> {
  const mergedConfig: UrlCheckerConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const firstAttempt = await runSingleCheck(browser, url, mergedConfig);

  if (!firstAttempt.failed) {
    return firstAttempt;
  }

  const secondAttempt = await runSingleCheck(browser, url, mergedConfig);

  if (!secondAttempt.failed) {
    return {
      failed: false,
      finalUrl: secondAttempt.finalUrl,
    };
  }

  return secondAttempt;
}
