import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { spawn, ChildProcess } from 'child_process';
import { BaseTool } from '../types/index.js';

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

export class DevServerTool implements BaseTool {
  private servers: Map<string, DevServer> = new Map();
  private maxLogLines = 1000;

  constructor() {
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

    // Handle process events
    childProcess.stdout?.on('data', (data) => {
      this.addLog(name, `[STDOUT] ${data.toString()}`);
    });

    childProcess.stderr?.on('data', (data) => {
      this.addLog(name, `[STDERR] ${data.toString()}`);
    });

    childProcess.on('error', (error) => {
      this.addLog(name, `[ERROR] ${error.message}`);
      server.status = 'error';
    });

    childProcess.on('exit', (code, signal) => {
      this.addLog(name, `[EXIT] Process exited with code ${code}, signal ${signal}`);
      server.status = 'stopped';
    });

    // Wait a moment to see if process starts successfully
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (childProcess.exitCode !== null) {
      server.status = 'error';
      return {
        content: [
          {
            type: 'text',
            text: `Failed to start server "${name}". Process exited with code ${childProcess.exitCode}. Check logs for details.`,
          },
        ],
      };
    }

    server.status = 'running';

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
    const serverList = Array.from(this.servers.values()).map(server => ({
      name: server.name,
      status: server.status,
      command: server.command,
      port: server.port,
      pid: server.process.pid,
      uptime: Date.now() - server.startTime.getTime(),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(serverList, null, 2),
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

  private cleanup(): void {
    for (const [name, server] of this.servers) {
      if (server.status === 'running' || server.status === 'starting') {
        console.error(`Cleaning up server "${name}"`);
        server.process.kill('SIGTERM');
      }
    }
  }
}