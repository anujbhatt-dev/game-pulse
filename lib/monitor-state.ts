import "server-only";

import { promises as fs } from "node:fs";
import { getMonitorStatusPath, getRuntimeDataDir } from "@/lib/storage-paths";

import type { MonitorLogEntry, MonitorLogLevel, MonitorStatus } from "@/types/report";

const DATA_DIR = getRuntimeDataDir();
const STATUS_PATH = getMonitorStatusPath();
const MAX_LOGS = 250;

function createDefaultStatus(): MonitorStatus {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    totalUrls: 0,
    checked: 0,
    failed: 0,
    success: 0,
    duration: 0,
    reportFile: null,
    error: null,
    logs: [],
  };
}

function sanitizeLogs(value: unknown): MonitorLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const logs: MonitorLogEntry[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const entry = item as Partial<MonitorLogEntry>;
    const level: MonitorLogLevel = entry.level === "warn" || entry.level === "error" ? entry.level : "info";

    if (typeof entry.timestamp !== "string" || typeof entry.message !== "string") {
      continue;
    }

    logs.push({
      timestamp: entry.timestamp,
      message: entry.message,
      level,
    });
  }

  return logs.slice(-MAX_LOGS);
}

function sanitizeStatus(value: unknown): MonitorStatus {
  if (typeof value !== "object" || value === null) {
    return createDefaultStatus();
  }

  const raw = value as Partial<MonitorStatus>;

  return {
    running: Boolean(raw.running),
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : null,
    totalUrls: typeof raw.totalUrls === "number" ? raw.totalUrls : 0,
    checked: typeof raw.checked === "number" ? raw.checked : 0,
    failed: typeof raw.failed === "number" ? raw.failed : 0,
    success: typeof raw.success === "number" ? raw.success : 0,
    duration: typeof raw.duration === "number" ? raw.duration : 0,
    reportFile: typeof raw.reportFile === "string" ? raw.reportFile : null,
    error: typeof raw.error === "string" ? raw.error : null,
    logs: sanitizeLogs(raw.logs),
  };
}

export function createRunningStatus(totalUrls: number): MonitorStatus {
  const now = new Date().toISOString();

  return {
    running: true,
    startedAt: now,
    finishedAt: null,
    totalUrls,
    checked: 0,
    failed: 0,
    success: 0,
    duration: 0,
    reportFile: null,
    error: null,
    logs: [
      {
        timestamp: now,
        level: "info",
        message: `Monitor started for ${totalUrls} URLs`,
      },
    ],
  };
}

export function appendStatusLog(
  status: MonitorStatus,
  message: string,
  level: MonitorLogLevel = "info",
): MonitorStatus {
  const nextLogs = [
    ...status.logs,
    {
      timestamp: new Date().toISOString(),
      level,
      message,
    },
  ].slice(-MAX_LOGS);

  return {
    ...status,
    logs: nextLogs,
  };
}

export async function readMonitorStatus(): Promise<MonitorStatus> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const content = await fs.readFile(STATUS_PATH, "utf8");
    return sanitizeStatus(JSON.parse(content));
  } catch {
    return createDefaultStatus();
  }
}

export async function writeMonitorStatus(status: MonitorStatus): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const tempPath = `${STATUS_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(status, null, 2), "utf8");
  await fs.rename(tempPath, STATUS_PATH);
}
