export type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface BrowserLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  url: string;
  port: string;
  project: string;
  userAgent?: string;
  stack?: string;
}

export interface LogFilter {
  port?: string;
  project?: string;
  level?: LogLevel[];
  timeRange?: {
    start: number;
    end: number;
  };
  limit?: number;
}

export interface GetBrowserLogsParams {
  filter?: LogFilter;
  clear?: boolean;
}

export interface BrowserLogResponse {
  logs: BrowserLogEntry[];
  total: number;
  filtered: number;
}