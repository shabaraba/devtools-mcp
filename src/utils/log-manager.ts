import { BrowserLogEntry, LogFilter } from '../types/browser-logs.js';

export class LogManager {
  private logs: Map<string, BrowserLogEntry[]> = new Map();
  private logIdCounter = 0;
  private readonly maxLogsPerPort = 1000;  // ポート別上限を1000件に削減
  private readonly maxTotalLogs = 5000;   // 全体上限を5000件に削減

  addLog(logData: Omit<BrowserLogEntry, 'id'>): BrowserLogEntry {
    const id = `log-${Date.now()}-${this.logIdCounter++}`;
    
    // Extract port from URL if not provided
    let port = logData.port;
    let project = logData.project;
    
    if (!port && logData.url) {
      const match = logData.url.match(/localhost:(\d+)/);
      port = match ? match[1] : 'unknown';
    }
    
    if (!project) {
      project = port ? `localhost:${port}` : 'unknown';
    }
    
    const entry: BrowserLogEntry = {
      ...logData,
      id,
      port: port || 'unknown',
      project: project || 'unknown'
    };

    const portKey = `${entry.port}-${entry.project}`;
    
    if (!this.logs.has(portKey)) {
      this.logs.set(portKey, []);
    }

    const portLogs = this.logs.get(portKey)!;
    portLogs.push(entry);

    // Debug log
    console.error(`[LogManager] Added log: port=${entry.port}, project=${entry.project}, message=${entry.message}`);

    // Limit logs per port
    if (portLogs.length > this.maxLogsPerPort) {
      portLogs.splice(0, portLogs.length - this.maxLogsPerPort);
    }

    // Check total logs across all ports
    this.enforceTotalLogLimit();

    return entry;
  }

  getLogs(filter?: LogFilter): BrowserLogEntry[] {
    let allLogs: BrowserLogEntry[] = [];

    console.error('[LogManager] getLogs called with filter:', filter);
    console.error('[LogManager] Available keys:', Array.from(this.logs.keys()));

    // Collect logs based on filter
    for (const [key, logs] of this.logs) {
      const [port, project] = key.split('-', 2);
      
      console.error(`[LogManager] Checking key: ${key}, port: ${port}, project: ${project}, logs: ${logs.length}`);
      
      if (filter?.port && port !== filter.port) {
        console.error(`[LogManager] Port filter mismatch: ${port} !== ${filter.port}`);
        continue;
      }
      if (filter?.project && project !== filter.project) {
        console.error(`[LogManager] Project filter mismatch: ${project} !== ${filter.project}`);
        continue;
      }
      
      console.error(`[LogManager] Including ${logs.length} logs from key: ${key}`);
      allLogs = allLogs.concat(logs);
    }

    // Apply additional filters
    if (filter?.level && filter.level.length > 0) {
      allLogs = allLogs.filter(log => filter.level!.includes(log.level));
    }

    if (filter?.timeRange) {
      allLogs = allLogs.filter(log => 
        log.timestamp >= filter.timeRange!.start && 
        log.timestamp <= filter.timeRange!.end
      );
    }

    // Sort by timestamp descending
    allLogs.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (filter?.limit) {
      allLogs = allLogs.slice(0, filter.limit);
    }

    return allLogs;
  }

  clearLogs(port?: string, project?: string): void {
    if (port || project) {
      // Clear specific port/project logs
      const keysToDelete: string[] = [];
      for (const key of this.logs.keys()) {
        const [p, proj] = key.split('-', 2);
        if ((port && p === port) || (project && proj === project)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.logs.delete(key));
    } else {
      // Clear all logs
      this.logs.clear();
    }
  }

  getActivePorts(): string[] {
    const ports = new Set<string>();
    for (const key of this.logs.keys()) {
      const [port] = key.split('-');
      ports.add(port);
    }
    return Array.from(ports);
  }

  getStats(): { totalLogs: number; portStats: Record<string, number>; debugKeys: string[] } {
    const portStats: Record<string, number> = {};
    const debugKeys: string[] = [];
    let totalLogs = 0;

    for (const [key, logs] of this.logs) {
      debugKeys.push(key);
      const [port] = key.split('-', 2);
      portStats[port] = (portStats[port] || 0) + logs.length;
      totalLogs += logs.length;
    }

    console.error('[LogManager] Current keys:', debugKeys);
    console.error('[LogManager] Port stats:', portStats);

    return { totalLogs, portStats, debugKeys };
  }

  private enforceTotalLogLimit(): void {
    let totalLogs = 0;
    for (const logs of this.logs.values()) {
      totalLogs += logs.length;
    }

    if (totalLogs > this.maxTotalLogs) {
      // Remove oldest logs from all ports proportionally
      const excess = totalLogs - this.maxTotalLogs;
      const portKeys = Array.from(this.logs.keys());
      const toRemovePerPort = Math.ceil(excess / portKeys.length);

      for (const key of portKeys) {
        const logs = this.logs.get(key)!;
        if (logs.length > toRemovePerPort) {
          logs.splice(0, toRemovePerPort);
        }
      }
    }
  }
}

// Ensure truly global singleton using Symbol.for
const GLOBAL_LOG_MANAGER_KEY = Symbol.for('devtools-mcp.logManager');

function getLogManager(): LogManager {
  // Check if instance already exists in global registry
  let instance = (globalThis as any)[GLOBAL_LOG_MANAGER_KEY];
  
  if (!instance) {
    console.error('[LogManager] Creating new global singleton instance');
    instance = new LogManager();
    (globalThis as any)[GLOBAL_LOG_MANAGER_KEY] = instance;
  } else {
    console.error('[LogManager] Using existing global singleton instance');
  }
  
  return instance;
}

// Singleton instance
export const logManager = getLogManager();