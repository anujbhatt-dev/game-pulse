import { NextResponse } from "next/server";

import { listReportSummaries } from "@/lib/csv";
import type { ReportSummary } from "@/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<ReportSummary[] | { error: string }>> {
  try {
    const summaries = await listReportSummaries();
    return NextResponse.json(summaries);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list reports";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
