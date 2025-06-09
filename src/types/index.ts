import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface BaseTool {
  getTools(): Tool[];
  hasTool(name: string): boolean;
  executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export interface FileInfo {
  path: string;
  size: number;
  isDirectory: boolean;
  lastModified: Date;
  permissions: string;
}

export interface SystemInfo {
  os: string;
  arch: string;
  platform: string;
  nodeVersion: string;
  memory: {
    total: number;
    free: number;
    used: number;
  };
  cpu: {
    model: string;
    cores: number;
    speed: number;
  };
}

export interface DatabaseConnection {
  type: 'sqlite' | 'postgres' | 'mysql';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
}

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  fields: Array<{
    name: string;
    type: string;
  }>;
}