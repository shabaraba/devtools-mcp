import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface BaseTool {
  getTools(): Tool[];
  hasTool(name: string): boolean;
  executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
}