import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

const LOCK_PATH = path.join(process.cwd(), "data", "monitor.lock");

export class MonitorLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitorLockError";
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

export async function acquireMonitorLock(): Promise<void> {
  await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });

  try {
    await fs.writeFile(
      LOCK_PATH,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      { flag: "wx" },
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new MonitorLockError("A monitor run is already in progress.");
    }

    throw error;
  }
}

export async function releaseMonitorLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

export async function withMonitorLock<T>(task: () => Promise<T>): Promise<T> {
  await acquireMonitorLock();

  try {
    return await task();
  } finally {
    await releaseMonitorLock();
  }
}
