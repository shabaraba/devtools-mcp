import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { spawn, ChildProcess } from 'child_process';
import { BaseTool } from '../types/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface DevServer {
  name: string;
  process: ChildProcess;
  command: string;
  port: number;
  cwd: string;
  startTime: Date;
  logs: string[];
  status: 'starting' | 'running' | 'stopped' | 'error';
}

interface SerializedDevServer {
  name: string;
  pid: number;
  command: string;
  port: number;
  cwd: string;
  startTime: string;
  logs: string[];
  status: 'starting' | 'running' | 'stopped' | 'error';
}

export class DevServerTool implements BaseTool {
  private servers: Map<string, DevServer> = new Map();
  private maxLogLines = 100;
  private maxLogLength = 1000;
  private stateFile: string;

  constructor() {
    this.stateFile = path.join(os.tmpdir(), 'devtools-mcp-servers.json');
    
    // Load existing servers on startup
    this.loadState();
    
    // Cleanup on process exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  getTools(): Tool[] {
    return [
      {
        name: 'start_dev_server',
        description: 'Start a development server in the background and return immediately',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to run (e.g., "npm run dev")',
              default: 'npm run dev',
            },
            name: {
              type: 'string',
              description: 'Server name for identification',
              default: 'default',
            },
            port: {
              type: 'number',
              description: 'Port number to expect the server on',
              default: 3000,
            },
            cwd: {
              type: 'string',
              description: 'Working directory (defaults to current directory)',
            },
            env: {
              type: 'object',
              description: 'Environment variables',
            },
          },
        },
      },
      {
        name: 'stop_dev_server',
        description: 'Stop a running development server',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Server name to stop',
              default: 'default',
            },
            force: {
              type: 'boolean',
              description: 'Force kill the process',
              default: false,
            },
          },
        },
      },
      {
        name: 'check_dev_server',
        description: 'Check the status of a development server',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Server name to check',
              default: 'default',
            },
            port: {
              type: 'number',
              description: 'Port to check if server is responding',
            },
          },
        },
      },
      {
        name: 'list_running_servers',
        description: 'List all running development servers',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_server_logs',
        description: 'Get logs from a development server',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Server name',
              default: 'default',
            },
            lines: {
              type: 'number',
              description: 'Number of recent log lines to return',
              default: 50,
            },
          },
        },
      },
      {
        name: 'restart_dev_server',
        description: 'Restart a development server',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Server name to restart',
              default: 'default',
            },
          },
        },
      },
    ];
  }

  hasTool(name: string): boolean {
    return [
      'start_dev_server',
      'stop_dev_server', 
      'check_dev_server',
      'list_running_servers',
      'get_server_logs',
      'restart_dev_server'
    ].includes(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'start_dev_server':
          return await this.startDevServer(args);
        case 'stop_dev_server':
          return await this.stopDevServer(args);
        case 'check_dev_server':
          return await this.checkDevServer(args);
        case 'list_running_servers':
          return await this.listRunningServers();
        case 'get_server_logs':
          return await this.getServerLogs(args);
        case 'restart_dev_server':
          return await this.restartDevServer(args);
        default:
          throw new Error(`Unknown dev server tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private async startDevServer(args: Record<string, unknown>): Promise<CallToolResult> {
    const command = (args.command as string) || 'npm run dev';
    const name = (args.name as string) || 'default';
    const port = (args.port as number) || 3000;
    const cwd = (args.cwd as string) || process.cwd();
    const env = args.env as Record<string, string> || {};

    // Check if server already exists
    if (this.servers.has(name)) {
      const server = this.servers.get(name);
      if (server && (server.status === 'running' || server.status === 'starting')) {
        return {
          content: [
            {
              type: 'text',
              text: `Server "${name}" is already running on port ${server.port}`,
            },
          ],
        };
      }
    }

    // Parse command
    const [cmd, ...cmdArgs] = command.split(' ');

    // Spawn process
    const childProcess = spawn(cmd, cmdArgs, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    const server: DevServer = {
      name,
      process: childProcess,
      command,
      port,
      cwd,
      startTime: new Date(),
      logs: [],
      status: 'starting',
    };

    this.servers.set(name, server);

    // Handle process events with async logging and data limits
    childProcess.stdout?.on('data', (data) => {
      setImmediate(() => {
        const logData = data.toString();
        const truncatedData = logData.length > this.maxLogLength 
          ? logData.substring(0, this.maxLogLength) + '...[truncated]'
          : logData;
        this.addLog(name, `[STDOUT] ${truncatedData}`);
      });
    });

    childProcess.stderr?.on('data', (data) => {
      setImmediate(() => {
        const logData = data.toString();
        const truncatedData = logData.length > this.maxLogLength 
          ? logData.substring(0, this.maxLogLength) + '...[truncated]'
          : logData;
        this.addLog(name, `[STDERR] ${truncatedData}`);
      });
    });

    childProcess.on('error', (error) => {
      setImmediate(() => {
        this.addLog(name, `[ERROR] ${error.message}`);
        server.status = 'error';
      });
    });

    childProcess.on('exit', (code, signal) => {
      setImmediate(() => {
        this.addLog(name, `[EXIT] Process exited with code ${code}, signal ${signal}`);
        server.status = 'stopped';
      });
    });

    // Quick check if process started - with timeout
    const startupPromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(true), 2000); // 2 second timeout
      
      // If process exits immediately, it failed
      childProcess.once('exit', () => {
        clearTimeout(timeout);
        resolve(false);
      });
      
      // If process survives initial period, consider it started
      setTimeout(() => {
        if (!childProcess.killed && childProcess.exitCode === null) {
          clearTimeout(timeout);
          resolve(true);
        }
      }, 500);
    });

    const started = await startupPromise;

    if (!started || childProcess.exitCode !== null) {
      server.status = 'error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to start server "${name}". Process may have exited immediately. Check logs for details.`,
          },
        ],
      };
    }

    server.status = 'running';
    
    // Save state after starting server
    this.saveState();

    return {
      content: [
        {
          type: 'text',
          text: `Development server "${name}" started successfully in background.\nCommand: ${command}\nPort: ${port}\nPID: ${childProcess.pid}\nWorking Directory: ${cwd}\n\nServer is running in the background. Use check_dev_server to monitor status.`,
        },
      ],
    };
  }

  private async stopDevServer(args: Record<string, unknown>): Promise<CallToolResult> {
    const name = (args.name as string) || 'default';
    const force = args.force as boolean;

    const server = this.servers.get(name);
    if (!server) {
      return {
        content: [
          {
            type: 'text',
            text: `Server "${name}" not found`,
          },
        ],
      };
    }

    if (server.status === 'stopped') {
      return {
        content: [
          {
            type: 'text',
            text: `Server "${name}" is already stopped`,
          },
        ],
      };
    }

    // Kill process
    const signal = force ? 'SIGKILL' : 'SIGTERM';
    server.process.kill(signal);

    // Wait for process to exit
    await new Promise(resolve => setTimeout(resolve, 2000));

    server.status = 'stopped';
    this.addLog(name, `[STOP] Server stopped by user (${signal})`);
    
    // Save state after stopping server
    this.saveState();

    return {
      content: [
        {
          type: 'text',
          text: `Development server "${name}" stopped successfully`,
        },
      ],
    };
  }

  private async checkDevServer(args: Record<string, unknown>): Promise<CallToolResult> {
    const name = (args.name as string) || 'default';
    const checkPort = args.port as number;

    const server = this.servers.get(name);
    if (!server) {
      return {
        content: [
          {
            type: 'text',
            text: `Server "${name}" not found`,
          },
        ],
      };
    }

    const runtime = Date.now() - server.startTime.getTime();
    const uptimeMinutes = Math.floor(runtime / 60000);
    const uptimeSeconds = Math.floor((runtime % 60000) / 1000);

    let portStatus = 'Unknown';
    const portToCheck = checkPort || server.port;

    try {
      await this.checkPort(portToCheck);
      portStatus = `Port ${portToCheck} is open and responding`;
    } catch {
      portStatus = `Port ${portToCheck} is not responding`;
    }

    const status = {
      name: server.name,
      status: server.status,
      command: server.command,
      port: server.port,
      cwd: server.cwd,
      pid: server.process.pid,
      uptime: `${uptimeMinutes}m ${uptimeSeconds}s`,
      portStatus,
      lastLogLines: server.logs.slice(-5),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  private async listRunningServers(): Promise<CallToolResult> {
    const serverList = Array.from(this.servers.values()).map(server => {
      // Check if process is actually alive
      const isAlive = this.isProcessAlive(server.process);
      
      // Update status if process is dead but status shows running
      if (!isAlive && (server.status === 'running' || server.status === 'starting')) {
        server.status = 'stopped';
        this.addLog(server.name, '[STATUS] Process detected as stopped');
      }

      const uptimeMs = Date.now() - server.startTime.getTime();
      const uptimeMinutes = Math.floor(uptimeMs / 60000);
      const uptimeSeconds = Math.floor((uptimeMs % 60000) / 1000);

      return {
        name: server.name,
        status: server.status,
        command: server.command,
        port: server.port,
        pid: server.process.pid,
        uptime: `${uptimeMinutes}m ${uptimeSeconds}s`,
        isProcessAlive: isAlive,
        cwd: server.cwd,
        startTime: server.startTime.toISOString(),
      };
    });

    // Filter out completely dead servers if needed
    const activeServers = serverList.filter(server => 
      server.status !== 'stopped' || server.isProcessAlive
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            total: serverList.length,
            active: activeServers.length,
            servers: serverList
          }, null, 2),
        },
      ],
    };
  }

  private async getServerLogs(args: Record<string, unknown>): Promise<CallToolResult> {
    const name = (args.name as string) || 'default';
    const lines = (args.lines as number) || 50;

    const server = this.servers.get(name);
    if (!server) {
      return {
        content: [
          {
            type: 'text',
            text: `Server "${name}" not found`,
          },
        ],
      };
    }

    const recentLogs = server.logs.slice(-lines).join('');

    return {
      content: [
        {
          type: 'text',
          text: recentLogs || 'No logs available',
        },
      ],
    };
  }

  private async restartDevServer(args: Record<string, unknown>): Promise<CallToolResult> {
    const name = (args.name as string) || 'default';

    const server = this.servers.get(name);
    if (!server) {
      return {
        content: [
          {
            type: 'text',
            text: `Server "${name}" not found`,
          },
        ],
      };
    }

    // Store original configuration
    const originalConfig = {
      command: server.command,
      port: server.port,
      cwd: server.cwd,
    };

    // Stop server
    await this.stopDevServer({ name });

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restart server
    return await this.startDevServer({
      name,
      command: originalConfig.command,
      port: originalConfig.port,
      cwd: originalConfig.cwd,
    });
  }

  private addLog(serverName: string, log: string): void {
    const server = this.servers.get(serverName);
    if (!server) return;

    const timestamp = new Date().toISOString();
    server.logs.push(`[${timestamp}] ${log}`);

    // Keep only recent logs
    if (server.logs.length > this.maxLogLines) {
      server.logs = server.logs.slice(-this.maxLogLines);
    }
  }

  private isProcessAlive(process: ChildProcess): boolean {
    if (!process || !process.pid) {
      return false;
    }

    try {
      // Sending signal 0 checks if process exists without killing it
      return process.kill(0);
    } catch (error) {
      return false;
    }
  }

  private async checkPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(`lsof -i :${port}`, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        const serializedServers: SerializedDevServer[] = JSON.parse(data);
        
        for (const serialized of serializedServers) {
          // Try to reconnect to existing process
          try {
            const existingProcess = this.attachToExistingProcess(serialized.pid);
            if (existingProcess) {
              const server: DevServer = {
                name: serialized.name,
                process: existingProcess,
                command: serialized.command,
                port: serialized.port,
                cwd: serialized.cwd,
                startTime: new Date(serialized.startTime),
                logs: serialized.logs || [],
                status: this.isProcessAlive(existingProcess) ? 'running' : 'stopped'
              };
              this.servers.set(serialized.name, server);
            }
          } catch (error) {
            // Process no longer exists, skip
          }
        }
      }
    } catch (error) {
      // If state file is corrupted, start fresh
      console.warn('Failed to load dev server state:', error);
    }
  }

  private saveState(): void {
    try {
      const serializedServers: SerializedDevServer[] = [];
      
      for (const server of this.servers.values()) {
        if (server.process.pid) {
          serializedServers.push({
            name: server.name,
            pid: server.process.pid,
            command: server.command,
            port: server.port,
            cwd: server.cwd,
            startTime: server.startTime.toISOString(),
            logs: server.logs.slice(-10), // Keep only recent logs
            status: server.status
          });
        }
      }
      
      fs.writeFileSync(this.stateFile, JSON.stringify(serializedServers, null, 2));
    } catch (error) {
      console.warn('Failed to save dev server state:', error);
    }
  }

  private attachToExistingProcess(pid: number): ChildProcess | null {
    try {
      // Create a mock ChildProcess object that references existing PID
      const mockProcess = {
        pid: pid,
        kill: (signal?: string | number) => {
          try {
            return process.kill(pid, signal as any);
          } catch {
            return false;
          }
        },
        killed: false,
        exitCode: null,
        stdout: null,
        stderr: null,
        stdin: null,
        stdio: [null, null, null],
        on: () => {},
        once: () => {},
        emit: () => false,
        removeListener: () => {},
        removeAllListeners: () => {},
      } as any;
      
      return mockProcess;
    } catch {
      return null;
    }
  }

  private cleanup(): void {
    for (const [name, server] of this.servers) {
      if (server.status === 'running' || server.status === 'starting') {
        console.error(`Cleaning up server "${name}"`);
        server.process.kill('SIGTERM');
      }
    }
    this.saveState();
  }
}