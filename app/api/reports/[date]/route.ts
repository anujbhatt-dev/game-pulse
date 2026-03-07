import { promises as fs } from "node:fs";

import { NextResponse } from "next/server";

import { getReportPathByDate, normalizeReportDate, readFailedCSV } from "@/lib/csv";
import type { FailedGameEntry } from "@/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse<FailedGameEntry[] | { error: string }>> {
  const { date: rawDate } = await params;
  const date = normalizeReportDate(rawDate);

  if (!date) {
    return NextResponse.json({ error: "Invalid report date format" }, { status: 400 });
  }

  const reportPath = getReportPathByDate(date);

  try {
    await fs.access(reportPath);
  } catch {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const wantsDownload = requestUrl.searchParams.get("download") === "true";

  if (wantsDownload) {
    const contents = await fs.readFile(reportPath, "utf8");

    return new NextResponse(contents, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="failed-games-${date}.csv"`,
      },
    });
  }

  try {
    const entries = await readFailedCSV(reportPath);
    return NextResponse.json(entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
