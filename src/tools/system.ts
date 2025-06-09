import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform, arch, cpus, totalmem, freemem, release } from 'os';
import { BaseTool, SystemInfo } from '../types/index.js';

const execAsync = promisify(exec);

export class SystemTool implements BaseTool {
  getTools(): Tool[] {
    return [
      {
        name: 'system_info',
        description: 'Get system information including OS, CPU, and memory details',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'process_list',
        description: 'List running processes',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Filter processes by name',
            },
            limit: {
              type: 'number',
              description: 'Limit number of results',
              default: 20,
            },
          },
        },
      },
      {
        name: 'network_info',
        description: 'Get network interface information',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'disk_usage',
        description: 'Get disk usage information',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to check disk usage for (defaults to current directory)',
            },
          },
        },
      },
      {
        name: 'execute_command',
        description: 'Execute a system command',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute',
            },
            cwd: {
              type: 'string',
              description: 'Working directory for command execution',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 30000,
            },
          },
          required: ['command'],
        },
      },
    ];
  }

  hasTool(name: string): boolean {
    return ['system_info', 'process_list', 'network_info', 'disk_usage', 'execute_command'].includes(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'system_info':
          return await this.getSystemInfo();
        case 'process_list':
          return await this.getProcessList(args);
        case 'network_info':
          return await this.getNetworkInfo();
        case 'disk_usage':
          return await this.getDiskUsage(args);
        case 'execute_command':
          return await this.executeCommand(args);
        default:
          throw new Error(`Unknown system tool: ${name}`);
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

  private async getSystemInfo(): Promise<CallToolResult> {
    const cpuInfo = cpus();
    const totalMem = totalmem();
    const freeMem = freemem();

    const systemInfo: SystemInfo = {
      os: release(),
      arch: arch(),
      platform: platform(),
      nodeVersion: process.version,
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
      },
      cpu: {
        model: cpuInfo[0]?.model || 'Unknown',
        cores: cpuInfo.length,
        speed: cpuInfo[0]?.speed || 0,
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(systemInfo, null, 2),
        },
      ],
    };
  }

  private async getProcessList(args: Record<string, unknown>): Promise<CallToolResult> {
    const filter = args.filter as string;
    const limit = (args.limit as number) || 20;

    let command = platform() === 'win32' 
      ? 'tasklist /fo csv' 
      : 'ps aux';

    if (filter && platform() !== 'win32') {
      command += ` | grep ${filter}`;
    }

    const { stdout } = await execAsync(command);
    const lines = stdout.toString().trim().split('\n');
    
    let processData = lines.slice(0, limit);
    
    if (filter && platform() === 'win32') {
      processData = processData.filter(line => 
        line.toLowerCase().includes(filter.toLowerCase())
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: processData.join('\n'),
        },
      ],
    };
  }

  private async getNetworkInfo(): Promise<CallToolResult> {
    const command = platform() === 'win32' ? 'ipconfig' : 'ifconfig';
    const { stdout } = await execAsync(command);

    return {
      content: [
        {
          type: 'text',
          text: stdout.toString(),
        },
      ],
    };
  }

  private async getDiskUsage(args: Record<string, unknown>): Promise<CallToolResult> {
    const path = (args.path as string) || '.';
    const command = platform() === 'win32' 
      ? `dir "${path}" /-c` 
      : `df -h "${path}"`;

    const { stdout } = await execAsync(command);

    return {
      content: [
        {
          type: 'text',
          text: stdout.toString(),
        },
      ],
    };
  }

  private async executeCommand(args: Record<string, unknown>): Promise<CallToolResult> {
    const command = args.command as string;
    const cwd = args.cwd as string;
    const timeout = (args.timeout as number) || 30000;

    const options: { timeout: number; cwd?: string } = { timeout };
    if (cwd) options.cwd = cwd;

    const { stdout, stderr } = await execAsync(command, options);

    return {
      content: [
        {
          type: 'text',
          text: stdout.toString() || stderr.toString() || 'Command executed successfully',
        },
      ],
    };
  }
}