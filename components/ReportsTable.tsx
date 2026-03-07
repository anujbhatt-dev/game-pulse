"use client";

import { IconDownload, IconEye } from "@tabler/icons-react";

import type { ReportSummary } from "@/types/report";

interface ReportsTableProps {
  reports: ReportSummary[];
  isLoading: boolean;
  onView: (date: string) => Promise<void>;
}

export default function ReportsTable({ reports, isLoading, onView }: ReportsTableProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/70 bg-zinc-950/80 p-5 shadow-xl shadow-black/20 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Reports</h2>
        <span className="text-sm text-zinc-400">Newest first</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-800 text-sm text-zinc-200">
          <thead>
            <tr className="text-left text-zinc-400">
              <th className="px-3 py-3 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">Failed Count</th>
              <th className="px-3 py-3 font-medium">View</th>
              <th className="px-3 py-3 font-medium">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-400">
                  Loading reports...
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-400">
                  No reports generated yet.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.file} className="hover:bg-zinc-900/60">
                  <td className="px-3 py-3">{report.date}</td>
                  <td className="px-3 py-3">{report.failedCount}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        void onView(report.date);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 transition hover:border-zinc-500"
                    >
                      <IconEye size={15} />
                      View
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <a
                      href={`/api/reports/${report.date}?download=true`}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 transition hover:border-zinc-500"
                    >
                      <IconDownload size={15} />
                      Download
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
