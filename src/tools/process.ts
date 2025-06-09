import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { BaseTool } from '../types/index.js';

const execAsync = promisify(exec);

export class ProcessTool implements BaseTool {
  getTools(): Tool[] {
    return [
      {
        name: 'kill_process',
        description: 'Kill process by name or PID',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Process name to kill',
            },
            pid: {
              type: 'number',
              description: 'Process ID to kill',
            },
            signal: {
              type: 'string',
              description: 'Signal to send (TERM, KILL, etc.)',
              default: 'TERM',
            },
            force: {
              type: 'boolean',
              description: 'Force kill all matching processes',
              default: false,
            },
          },
        },
      },
      {
        name: 'detailed_process_list',
        description: 'Get detailed process information with CPU, memory usage',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Filter processes by name',
            },
            sortBy: {
              type: 'string',
              enum: ['cpu', 'memory', 'name', 'pid'],
              description: 'Sort processes by field',
              default: 'cpu',
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
        name: 'find_process_url',
        description: 'Find URL/port for a process by name',
        inputSchema: {
          type: 'object',
          properties: {
            processName: {
              type: 'string',
              description: 'Process name to search for',
            },
            port: {
              type: 'number',
              description: 'Specific port to check',
            },
          },
          required: ['processName'],
        },
      },
    ];
  }

  hasTool(name: string): boolean {
    return [
      'kill_process',
      'detailed_process_list',
      'find_process_url'
    ].includes(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'kill_process':
          return await this.killProcess(args);
        case 'detailed_process_list':
          return await this.getDetailedProcessList(args);
        case 'find_process_url':
          return await this.findProcessUrl(args);
        default:
          throw new Error(`Unknown process tool: ${name}`);
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

  private async killProcess(args: Record<string, unknown>): Promise<CallToolResult> {
    const name = args.name as string;
    const pid = args.pid as number;
    const signal = (args.signal as string) || 'TERM';
    const force = args.force as boolean;

    if (!name && !pid) {
      throw new Error('Either process name or PID must be provided');
    }

    let command: string;
    let results: string[] = [];

    if (pid) {
      // Kill by PID
      command = platform() === 'win32' 
        ? `taskkill /PID ${pid} ${signal === 'KILL' ? '/F' : ''}` 
        : `kill -${signal} ${pid}`;
      
      try {
        const { stdout, stderr } = await execAsync(command);
        results.push(`Killed process PID ${pid}: ${stdout || stderr || 'Success'}`);
      } catch (error) {
        results.push(`Failed to kill PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (name) {
      // Find and kill by name
      const findCommand = platform() === 'win32'
        ? `tasklist /FI "IMAGENAME eq ${name}*" /FO CSV | findstr ${name}`
        : `pgrep -f "${name}"`;

      try {
        const { stdout } = await execAsync(findCommand);
        const pids = platform() === 'win32'
          ? stdout.split('\n').slice(1).map(line => {
              const parts = line.split(',');
              return parts[1] ? parts[1].replace(/"/g, '') : '';
            }).filter(pid => pid)
          : stdout.trim().split('\n').filter(pid => pid);

        if (pids.length === 0) {
          results.push(`No processes found matching "${name}"`);
        } else {
          for (const processPid of pids) {
            if (!processPid) continue;
            
            const killCommand = platform() === 'win32'
              ? `taskkill /PID ${processPid} ${signal === 'KILL' ? '/F' : ''}`
              : `kill -${signal} ${processPid}`;

            try {
              const { stdout, stderr } = await execAsync(killCommand);
              results.push(`Killed process "${name}" PID ${processPid}: ${stdout || stderr || 'Success'}`);
            } catch (error) {
              results.push(`Failed to kill "${name}" PID ${processPid}: ${error instanceof Error ? error.message : String(error)}`);
            }

            if (!force) break; // Only kill first match unless force is true
          }
        }
      } catch (error) {
        results.push(`Failed to find process "${name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n'),
        },
      ],
    };
  }

  private async getDetailedProcessList(args: Record<string, unknown>): Promise<CallToolResult> {
    const filter = args.filter as string;
    const sortBy = (args.sortBy as string) || 'cpu';
    const limit = (args.limit as number) || 20;

    let command: string;
    
    if (platform() === 'win32') {
      command = 'tasklist /FO CSV';
      if (filter) {
        command += ` /FI "IMAGENAME eq *${filter}*"`;
      }
    } else {
      // Use ps with detailed format
      command = 'ps aux';
      if (filter) {
        command += ` | grep "${filter}"`;
      }
    }

    const { stdout } = await execAsync(command);
    
    let processData: string;
    
    if (platform() === 'win32') {
      const lines = stdout.trim().split('\n');
      processData = lines.join('\n');
    } else {
      const lines = stdout.trim().split('\n');
      
      // Sort by specified field if possible
      if (sortBy === 'cpu' || sortBy === 'memory') {
        const header = lines[0];
        const processes = lines.slice(1);
        
        const sortedProcesses = processes.sort((a, b) => {
          const aFields = a.trim().split(/\s+/);
          const bFields = b.trim().split(/\s+/);
          
          const aValue = parseFloat(sortBy === 'cpu' ? aFields[2] : aFields[3]) || 0;
          const bValue = parseFloat(sortBy === 'cpu' ? bFields[2] : bFields[3]) || 0;
          
          return bValue - aValue; // Descending order
        });
        
        processData = [header, ...sortedProcesses.slice(0, limit)].join('\n');
      } else {
        processData = lines.slice(0, limit + 1).join('\n'); // +1 for header
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: processData,
        },
      ],
    };
  }

  private async findProcessUrl(args: Record<string, unknown>): Promise<CallToolResult> {
    const processName = args.processName as string;
    const specificPort = args.port as number;

    if (!processName) {
      throw new Error('Process name is required');
    }

    const results: string[] = [];

    try {
      // Find process PID first
      const findCommand = platform() === 'win32'
        ? `tasklist /FI "IMAGENAME eq *${processName}*" /FO CSV`
        : `pgrep -f "${processName}"`;

      const { stdout: pidOutput } = await execAsync(findCommand);
      
      let pids: string[] = [];
      
      if (platform() === 'win32') {
        const lines = pidOutput.split('\n').slice(1);
        pids = lines.map(line => {
          const parts = line.split(',');
          return parts[1] ? parts[1].replace(/"/g, '') : '';
        }).filter(pid => pid);
      } else {
        pids = pidOutput.trim().split('\n').filter(pid => pid);
      }

      if (pids.length === 0) {
        results.push(`No processes found matching "${processName}"`);
      } else {
        results.push(`Found ${pids.length} process(es) matching "${processName}"`);
        
        // Check for open ports for each PID
        for (const pid of pids) {
          if (!pid) continue;
          
          let portCommand: string;
          
          if (platform() === 'win32') {
            portCommand = `netstat -ano | findstr ${pid}`;
          } else {
            portCommand = `lsof -Pan -p ${pid} -i`;
          }

          try {
            const { stdout: portOutput } = await execAsync(portCommand);
            
            if (portOutput.trim()) {
              const portLines = portOutput.trim().split('\n');
              const ports = new Set<string>();
              
              portLines.forEach(line => {
                const match = line.match(/:(\d+)/g);
                if (match) {
                  match.forEach(portMatch => {
                    const port = portMatch.substring(1);
                    if (parseInt(port) > 1000) { // Filter out system ports
                      ports.add(port);
                    }
                  });
                }
              });

              if (ports.size > 0) {
                results.push(`\nPID ${pid} is listening on ports: ${Array.from(ports).join(', ')}`);
                
                // Generate URLs for common development ports
                Array.from(ports).forEach(port => {
                  const portNum = parseInt(port);
                  if (specificPort && portNum !== specificPort) return;
                  
                  let protocol = 'http';
                  if (portNum === 443 || portNum === 8443) protocol = 'https';
                  
                  results.push(`  ${protocol}://localhost:${port}`);
                  
                  // Common development server patterns
                  if ([3000, 3001, 4200, 5173, 8080, 8000].includes(portNum)) {
                    results.push(`  Development server likely running at: ${protocol}://localhost:${port}`);
                  }
                });
              } else {
                results.push(`\nPID ${pid} has no listening ports found`);
              }
            } else {
              results.push(`\nPID ${pid} has no network connections`);
            }
          } catch (error) {
            results.push(`\nFailed to check ports for PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    } catch (error) {
      results.push(`Error finding process "${processName}": ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n'),
        },
      ],
    };
  }
}