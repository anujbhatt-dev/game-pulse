import "server-only";

import type { Browser } from "playwright-core";
import type { Request } from "playwright-core";
import type { MonitorFailureReason } from "@/types/report";

export interface UrlCheckResult {
  failed: boolean;
  finalUrl: string;
  homeSeenUrl: string | null;
  attempts: number;
  failureReason: MonitorFailureReason | null;
  httpStatus: number | null;
  errorMessage: string | null;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown navigation error";
}

function isHttpLikeUrl(urlValue: string): boolean {
  try {
    const parsed = new URL(urlValue);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
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
    let navigationError: string | null = null;

    try {
      navigationResponse = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: config.navigationTimeoutMs,
      });
    } catch (error) {
      navigationError = getErrorMessage(error);
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
    const httpStatus = navigationResponse?.status() ?? null;

    const checkUntil = Date.now() + config.redirectWaitMs;

    while (!homeSeenUrl && Date.now() < checkUntil) {
      await page.waitForTimeout(500);
      markRedirectIfHome(page.url());
    }

    const latestUrl = page.url();

    if (homeSeenUrl) {
      return {
        failed: true,
        finalUrl: latestUrl,
        homeSeenUrl,
        attempts: 1,
        failureReason: "redirected_to_home",
        httpStatus,
        errorMessage: null,
      };
    }

    if (httpStatus !== null && httpStatus >= 400) {
      return {
        failed: true,
        finalUrl: latestUrl,
        homeSeenUrl: null,
        attempts: 1,
        failureReason: "http_error",
        httpStatus,
        errorMessage: `HTTP ${httpStatus}`,
      };
    }

    if (navigationError) {
      const finalNavigationUrl = latestUrl || finalUrl;
      const message =
        !isHttpLikeUrl(finalNavigationUrl) && finalNavigationUrl !== url
          ? `${navigationError} (final=${finalNavigationUrl})`
          : navigationError;

      return {
        failed: true,
        finalUrl: finalNavigationUrl,
        homeSeenUrl: null,
        attempts: 1,
        failureReason: "navigation_error",
        httpStatus,
        errorMessage: message,
      };
    }

    return {
      failed: false,
      finalUrl: latestUrl,
      homeSeenUrl: null,
      attempts: 1,
      failureReason: null,
      httpStatus,
      errorMessage: null,
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
  const secondAttempt = await runSingleCheck(browser, url, mergedConfig);

  // Strict policy: one confirmed redirect to /home is enough to fail the URL.
  if (
    firstAttempt.failureReason === "redirected_to_home" ||
    secondAttempt.failureReason === "redirected_to_home"
  ) {
    const preferred =
      firstAttempt.failureReason === "redirected_to_home" ? firstAttempt : secondAttempt;

    return {
      failed: true,
      finalUrl: preferred.finalUrl,
      homeSeenUrl: preferred.homeSeenUrl,
      attempts: 2,
      failureReason: "redirected_to_home",
      httpStatus: preferred.httpStatus,
      errorMessage: preferred.errorMessage,
    };
  }

  // For non-redirect failures, require both attempts to fail so transient issues do not pollute reports.
  if (firstAttempt.failed && secondAttempt.failed) {
    const preferred = secondAttempt.failureReason ? secondAttempt : firstAttempt;

    return {
      failed: true,
      finalUrl: preferred.finalUrl,
      homeSeenUrl: preferred.homeSeenUrl,
      attempts: 2,
      failureReason: preferred.failureReason,
      httpStatus: preferred.httpStatus,
      errorMessage: preferred.errorMessage,
    };
  }

  return {
    failed: false,
    finalUrl: secondAttempt.finalUrl,
    homeSeenUrl: null,
    attempts: 2,
    failureReason: null,
    httpStatus: secondAttempt.httpStatus,
    errorMessage: null,
  };
}
