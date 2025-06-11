export type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface BrowserLogMessage {
  type: 'console_log';
  timestamp: number;
  level: LogLevel;
  message: string[];
  url: string;
  port: string;
  projectId: string;
  userAgent: string;
  stack?: string;
}