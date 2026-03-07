export type MonitorFailureReason = "redirected_to_home";
export type MonitorLogLevel = "info" | "warn" | "error";

export interface FailedGameEntry {
  timestamp: string;
  url: string;
  reason: MonitorFailureReason;
}

export interface MonitorRunResult {
  totalUrls: number;
  checked: number;
  failed: number;
  success: number;
  duration: number;
  reportFile: string;
}

export interface MonitorLogEntry {
  timestamp: string;
  level: MonitorLogLevel;
  message: string;
}

export interface MonitorStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  totalUrls: number;
  checked: number;
  failed: number;
  success: number;
  duration: number;
  reportFile: string | null;
  error: string | null;
  logs: MonitorLogEntry[];
}

export interface ReportSummary {
  date: string;
  file: string;
  failedCount: number;
}

export interface DashboardData {
  totalUrls: number;
  failedToday: number;
  lastRunAt: string | null;
  reports: ReportSummary[];
}
