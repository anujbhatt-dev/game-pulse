import "server-only";

import path from "node:path";

function cleanPath(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getSourceDataDir(): string {
  return cleanPath(process.env.MONITOR_SOURCE_DATA_DIR) ?? path.join(process.cwd(), "data");
}

export function getRuntimeDataDir(): string {
  const explicit = cleanPath(process.env.MONITOR_RUNTIME_DATA_DIR);

  if (explicit) {
    return explicit;
  }

  if (process.env.VERCEL) {
    return path.join("/tmp", "game-pulse-data");
  }

  return getSourceDataDir();
}

export function getGamesCsvPath(): string {
  return cleanPath(process.env.MONITOR_GAMES_CSV_PATH) ?? path.join(getSourceDataDir(), "games.csv");
}

export function getRuntimeGamesCsvFallbackPath(): string {
  return path.join(getRuntimeDataDir(), "games.csv");
}

export function getReportsDir(): string {
  return path.join(getRuntimeDataDir(), "reports");
}

export function getMonitorLockPath(): string {
  return path.join(getRuntimeDataDir(), "monitor.lock");
}

export function getMonitorStatusPath(): string {
  return path.join(getRuntimeDataDir(), "monitor-status.json");
}
