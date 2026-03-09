import "server-only";

import type { Browser } from "playwright-core";
import type { Request } from "playwright-core";

export interface UrlCheckResult {
  failed: boolean;
  finalUrl: string;
  homeSeenUrl: string | null;
  attempts: number;
}

export interface UrlCheckerConfig {
  navigationTimeoutMs: number;
  redirectWaitMs: number;
  userAgent: string;
}

const DEFAULT_CONFIG: UrlCheckerConfig = {
  navigationTimeoutMs: 30_000,
  redirectWaitMs: 30_000,
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
  const originalComparableUrl = normalizeComparableUrl(url);
  let homeSeenUrl: string | null = null;

  const markRedirectIfHome = (candidateUrl: string) => {
    if (!endsWithHome(candidateUrl)) {
      return;
    }

    if (normalizeComparableUrl(candidateUrl) !== originalComparableUrl) {
      if (!homeSeenUrl) {
        homeSeenUrl = candidateUrl;
      }
    }
  };

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      markRedirectIfHome(frame.url());
    }
  });

  try {
    let navigationResponse: Awaited<ReturnType<typeof page.goto>> | null = null;

    try {
      navigationResponse = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: config.navigationTimeoutMs,
      });
    } catch {
      // Ignore navigation timing issues: only confirmed home redirect is a failure.
    }

    if (navigationResponse) {
      let currentRequest: Request | null = navigationResponse.request();

      while (currentRequest) {
        markRedirectIfHome(currentRequest.url());
        currentRequest = currentRequest.redirectedFrom();
      }
    }

    const finalUrl = page.url();
    markRedirectIfHome(finalUrl);

    const checkUntil = Date.now() + config.redirectWaitMs;

    while (!homeSeenUrl && Date.now() < checkUntil) {
      await page.waitForTimeout(500);
      markRedirectIfHome(page.url());
    }

    return {
      failed: Boolean(homeSeenUrl),
      finalUrl,
      homeSeenUrl,
      attempts: 1,
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
      homeSeenUrl: null,
      attempts: 2,
    };
  }

  return {
    ...secondAttempt,
    attempts: 2,
  };
}
