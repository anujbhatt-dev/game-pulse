import { NextResponse } from "next/server";

import { withMonitorLock, MonitorLockError } from "@/lib/lock";
import { runMonitor } from "@/lib/monitor";
import { readMonitorStatus } from "@/lib/monitor-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const result = await withMonitorLock(async () => runMonitor());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MonitorLockError) {
      const status = await readMonitorStatus();
      return NextResponse.json({ error: error.message, status }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Monitor execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
