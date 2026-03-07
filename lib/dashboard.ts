import "server-only";

import { format } from "date-fns";

import { listReportSummaries, readGamesCSV } from "@/lib/csv";
import type { DashboardData } from "@/types/report";

export async function loadDashboardData(): Promise<DashboardData> {
  const [urls, reports] = await Promise.all([readGamesCSV(), listReportSummaries()]);

  const today = format(new Date(), "yyyy-MM-dd");
  const todayReport = reports.find((report) => report.date === today) ?? null;

  return {
    totalUrls: urls.length,
    failedToday: todayReport?.failedCount ?? 0,
    lastRunAt: reports[0]?.date ?? null,
    reports,
  };
}
