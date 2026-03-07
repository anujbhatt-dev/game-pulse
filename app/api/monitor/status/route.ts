import { NextResponse } from "next/server";

import { readMonitorStatus } from "@/lib/monitor-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const status = await readMonitorStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch monitor status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
