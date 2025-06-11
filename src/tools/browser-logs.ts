import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from '../types/index.js';
import { GetBrowserLogsParams } from '../types/browser-logs.js';
import { logManager } from '../utils/log-manager.js';

export class BrowserLogTool implements BaseTool {
  getTools(): Tool[] {
    return [
      {
        name: 'get_browser_logs',
        description: 'Get browser console logs with filtering options. Returns logs from web applications running on localhost.',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'object',
              properties: {
                port: {
                  type: 'string',
                  description: 'Filter logs by port number (e.g., "3000", "8080")'
                },
                project: {
                  type: 'string',
                  description: 'Filter logs by project identifier'
                },
                level: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['log', 'warn', 'error', 'info', 'debug']
                  },
                  description: 'Filter logs by severity level'
                },
                timeRange: {
                  type: 'object',
                  properties: {
                    start: {
                      type: 'number',
                      description: 'Start timestamp (Unix milliseconds)'
                    },
                    end: {
                      type: 'number',
                      description: 'End timestamp (Unix milliseconds)'
                    }
                  },
                  required: ['start', 'end']
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of logs to return (default: 100)'
                }
              }
            },
            clear: {
              type: 'boolean',
              description: 'Clear logs after retrieving them'
            }
          }
        }
      },
      {
        name: 'get_browser_log_stats',
        description: 'Get statistics about collected browser logs',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'clear_browser_logs',
        description: 'Clear browser logs',
        inputSchema: {
          type: 'object',
          properties: {
            port: {
              type: 'string',
              description: 'Clear logs for specific port only'
            },
            project: {
              type: 'string',
              description: 'Clear logs for specific project only'
            }
          }
        }
      },
      {
        name: 'test_http_endpoint',
        description: 'Test direct access to HTTP endpoint (debug tool)',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  hasTool(name: string): boolean {
    return ['get_browser_logs', 'get_browser_log_stats', 'clear_browser_logs', 'test_http_endpoint'].includes(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    switch (name) {
      case 'get_browser_logs': {
        try {
          const params = args as GetBrowserLogsParams;
          
          // Build query string for HTTP endpoint
          const queryParams = new URLSearchParams();
          if (params.filter?.port) queryParams.set('port', params.filter.port);
          if (params.filter?.project) queryParams.set('project', params.filter.project);
          if (params.filter?.level) queryParams.set('level', params.filter.level.join(','));
          if (params.filter?.limit) queryParams.set('limit', params.filter.limit.toString());
          if (params.filter?.timeRange) {
            queryParams.set('start', params.filter.timeRange.start.toString());
            queryParams.set('end', params.filter.timeRange.end.toString());
          }
          if (params.clear) queryParams.set('clear', 'true');
          
          const url = `http://localhost:3456/api/browser-logs?${queryParams.toString()}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Failed to fetch logs from HTTP endpoint',
                  message: error instanceof Error ? error.message : String(error),
                  fallbackLogs: logManager.getLogs((args as GetBrowserLogsParams).filter)
                }, null, 2)
              }
            ]
          };
        }
      }

      case 'get_browser_log_stats': {
        try {
          // Get stats from HTTP endpoint instead
          const response = await fetch('http://localhost:3456/api/browser-logs/stats');
          const httpStats = await response.json();
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ...httpStats,
                  httpServerPort: process.env.BROWSER_LOG_PORT || 3456,
                  source: 'http_endpoint'
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          // Fallback to local logManager
          const stats = logManager.getStats();
          const activePorts = logManager.getActivePorts();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ...stats,
                  activePorts,
                  httpServerPort: process.env.BROWSER_LOG_PORT || 3456,
                  source: 'fallback_local',
                  error: error instanceof Error ? error.message : String(error)
                }, null, 2)
              }
            ]
          };
        }
      }

      case 'clear_browser_logs': {
        const { port, project } = args as { port?: string; project?: string };
        logManager.clearLogs(port, project);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: port || project 
                  ? `Cleared logs for ${port ? `port ${port}` : ''}${project ? ` project ${project}` : ''}`
                  : 'All logs cleared'
              })
            }
          ]
        };
      }

      case 'test_http_endpoint': {
        try {
          const response = await fetch('http://localhost:3456/api/browser-logs/stats');
          const data = await response.json();
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  httpEndpointWorking: true,
                  httpStats: data,
                  mcpStats: logManager.getStats(),
                  comparison: {
                    httpTotal: data.totalLogs,
                    mcpTotal: logManager.getStats().totalLogs,
                    instancesMatch: data.totalLogs === logManager.getStats().totalLogs
                  }
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  httpEndpointWorking: false,
                  error: error instanceof Error ? error.message : String(error),
                  mcpStats: logManager.getStats()
                }, null, 2)
              }
            ]
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}