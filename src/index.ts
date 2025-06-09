#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { ProcessTool } from './tools/process.js';
import { DevServerTool } from './tools/dev-server.js';

const server = new Server(
  {
    name: 'devtools-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools = [
  new ProcessTool(),
  new DevServerTool(),
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const allTools = tools.flatMap(tool => tool.getTools());
  return {
    tools: allTools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  for (const tool of tools) {
    if (tool.hasTool(name)) {
      try {
        return await tool.executeTool(name, args || {});
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unknown tool: ${name}`
  );
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DevTools MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main:', error);
  process.exit(1);
});