"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  IconAlertTriangle,
  IconClockHour4,
  IconDeviceGamepad2,
  IconFileAnalytics,
  IconWaveSquare,
} from "@tabler/icons-react";
import { format } from "date-fns";

import ReportViewer from "@/components/ReportViewer";
import ReportsTable from "@/components/ReportsTable";
import RunMonitorButton from "@/components/RunMonitorButton";
import StatsCard from "@/components/StatsCard";
import type {
  DashboardData,
  FailedGameEntry,
  MonitorRunResult,
  MonitorStatus,
  ReportSummary,
} from "@/types/report";

interface DashboardLayoutProps {
  initialData: DashboardData;
}

type ErrorResponse = {
  error?: string;
};

type MonitorConflictResponse = {
  error?: string;
  status?: MonitorStatus;
};

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainder}s`;
  }

  return `${remainder}s`;
}

export default function DashboardLayout({ initialData }: DashboardLayoutProps) {
  const [reports, setReports] = useState<ReportSummary[]>(initialData.reports);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<MonitorRunResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(initialData.lastRunAt);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null);

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isViewerLoading, setIsViewerLoading] = useState(false);
  const [viewerDate, setViewerDate] = useState<string | null>(null);
  const [viewerEntries, setViewerEntries] = useState<FailedGameEntry[]>([]);

  const previousRunning = useRef(false);

  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);

    try {
      const response = await fetch("/api/reports", { cache: "no-store" });

      if (!response.ok) {
        const error = (await response.json()) as ErrorResponse;
        throw new Error(error.error || "Failed to fetch reports");
      }

      const data = (await response.json()) as ReportSummary[];
      setReports(data);
      setLastRunAt(data[0]?.date ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch reports";
      setErrorMessage(message);
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  const fetchMonitorStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/monitor/status", { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const status = (await response.json()) as MonitorStatus;

      setMonitorStatus(status);
      setIsRunning(status.running);

      if (status.finishedAt) {
        setLastRunAt(status.finishedAt);
      }

      if (!status.running && status.reportFile) {
        setLastRunResult({
          totalUrls: status.totalUrls,
          checked: status.checked,
          failed: status.failed,
          success: status.success,
          duration: status.duration,
          reportFile: status.reportFile,
        });
      }

      if (status.error) {
        setErrorMessage(status.error);
      }
    } catch {
      // Ignore transient polling errors.
    }
  }, []);

  useEffect(() => {
    void fetchMonitorStatus();
  }, [fetchMonitorStatus]);

  useEffect(() => {
    const interval = setInterval(
      () => {
        void fetchMonitorStatus();
      },
      isRunning ? 2000 : 10000,
    );

    return () => {
      clearInterval(interval);
    };
  }, [fetchMonitorStatus, isRunning]);

  useEffect(() => {
    if (previousRunning.current && !isRunning) {
      void loadReports();
    }

    previousRunning.current = isRunning;
  }, [isRunning, loadReports]);

  const handleRunMonitor = useCallback(async () => {
    setIsRunning(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/monitor", {
        method: "POST",
      });

      if (response.status === 409) {
        const conflict = (await response.json()) as MonitorConflictResponse;

        if (conflict.status) {
          setMonitorStatus(conflict.status);
          setIsRunning(conflict.status.running);
        }

        throw new Error(conflict.error || "A monitor run is already in progress.");
      }

      if (!response.ok) {
        const error = (await response.json()) as ErrorResponse;
        throw new Error(error.error || "Failed to run monitor");
      }

      const result = (await response.json()) as MonitorRunResult;
      setLastRunResult(result);
      setLastRunAt(new Date().toISOString());
      await loadReports();
      await fetchMonitorStatus();
      setIsRunning(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run monitor";
      setErrorMessage(message);
      await fetchMonitorStatus();
    }
  }, [fetchMonitorStatus, loadReports]);

  const handleViewReport = useCallback(async (date: string) => {
    setViewerDate(date);
    setViewerEntries([]);
    setIsViewerOpen(true);
    setIsViewerLoading(true);

    try {
      const response = await fetch(`/api/reports/${date}`, { cache: "no-store" });

      if (!response.ok) {
        const error = (await response.json()) as ErrorResponse;
        throw new Error(error.error || "Failed to load report details");
      }

      const data = (await response.json()) as FailedGameEntry[];
      setViewerEntries(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load report details";
      setErrorMessage(message);
    } finally {
      setIsViewerLoading(false);
    }
  }, []);

  const todayKey = format(new Date(), "yyyy-MM-dd");

  const failedToday = useMemo(() => {
    const report = reports.find((item) => item.date === todayKey);
    return report?.failedCount ?? 0;
  }, [reports, todayKey]);

  const visibleLogs = useMemo(() => {
    return monitorStatus?.logs.slice(-120) ?? [];
  }, [monitorStatus]);

  const totalUrlsForCard = monitorStatus?.running
    ? monitorStatus.totalUrls
    : lastRunResult?.totalUrls || initialData.totalUrls;

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.18),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.14),transparent_35%),linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_25%)]" />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8"
      >
        <header className="space-y-2">
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            GamePulse Dashboard
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.16 }}
            className="text-zinc-300"
          >
            Game Health Monitoring
          </motion.p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="Total URLs" value={totalUrlsForCard} description="Loaded from data/games.csv" icon={IconDeviceGamepad2} />
          <StatsCard title="Failed Today" value={failedToday} description="URLs that failed checks today" icon={IconAlertTriangle} />
          <StatsCard
            title="Last Run Time"
            value={lastRunAt ? format(new Date(lastRunAt), "yyyy-MM-dd HH:mm") : "N/A"}
            description="Most recent monitor execution"
            icon={IconClockHour4}
          />
          <StatsCard title="Total Reports" value={reports.length} description="Daily report files" icon={IconFileAnalytics} />
        </section>

        <section className="rounded-2xl border border-zinc-800/70 bg-zinc-950/80 p-5 shadow-xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Run Monitoring</h2>
              <p className="mt-1 text-sm text-zinc-400">Live status is persisted on server and survives page refresh.</p>
            </div>
            <RunMonitorButton isRunning={isRunning} onRun={handleRunMonitor} />
          </div>

          {monitorStatus ? (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-sm text-zinc-300">
              <p>
                Status: {monitorStatus.running ? "Running" : "Idle"} | Checked {monitorStatus.checked}/{monitorStatus.totalUrls} |
                Failed {monitorStatus.failed} | Success {monitorStatus.success}
              </p>
            </div>
          ) : null}

          {lastRunResult ? (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-sm text-zinc-300">
              <p className="inline-flex items-center gap-2">
                <IconWaveSquare size={16} className="text-emerald-300" />
                Last run: {lastRunResult.checked}/{lastRunResult.totalUrls} checked, {lastRunResult.failed} failed, duration{" "}
                {formatDuration(lastRunResult.duration)}.
              </p>
            </div>
          ) : null}

          {visibleLogs.length > 0 ? (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/80 p-3">
              <p className="mb-2 text-sm font-medium text-zinc-300">Run Logs</p>
              <div className="max-h-64 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/70 p-2">
                {visibleLogs.map((log, index) => (
                  <p
                    key={`${log.timestamp}-${index}`}
                    className={`font-mono text-xs ${
                      log.level === "error"
                        ? "text-red-300"
                        : log.level === "warn"
                          ? "text-amber-300"
                          : "text-zinc-300"
                    }`}
                  >
                    [{format(new Date(log.timestamp), "HH:mm:ss")}] {log.message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
          ) : null}
        </section>

        <ReportsTable reports={reports} isLoading={isLoadingReports} onView={handleViewReport} />
      </motion.main>

      <ReportViewer
        date={viewerDate}
        isOpen={isViewerOpen}
        isLoading={isViewerLoading}
        entries={viewerEntries}
        onClose={() => {
          setIsViewerOpen(false);
        }}
      />
    </div>
  );
}
