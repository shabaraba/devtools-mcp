import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import { BaseTool, FileInfo } from '../types/index.js';

export class FileTool implements BaseTool {
  getTools(): Tool[] {
    return [
      {
        name: 'list_directory',
        description: 'List files and directories in a given path',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list',
            },
            includeHidden: {
              type: 'boolean',
              description: 'Include hidden files (starting with .)',
              default: false,
            },
            recursive: {
              type: 'boolean',
              description: 'List files recursively',
              default: false,
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'read_file',
        description: 'Read contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path to read',
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf8)',
              default: 'utf8',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path to write to',
            },
            content: {
              type: 'string',
              description: 'Content to write',
            },
            encoding: {
              type: 'string',
              description: 'File encoding (default: utf8)',
              default: 'utf8',
            },
            createDir: {
              type: 'boolean',
              description: 'Create directory if it does not exist',
              default: false,
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'file_info',
        description: 'Get information about a file or directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File or directory path',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'search_files',
        description: 'Search for files matching a pattern',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory to search in',
            },
            pattern: {
              type: 'string',
              description: 'Glob pattern to match',
            },
            content: {
              type: 'string',
              description: 'Search for content within files',
            },
            includeHidden: {
              type: 'boolean',
              description: 'Include hidden files',
              default: false,
            },
          },
          required: ['path'],
        },
      },
    ];
  }

  hasTool(name: string): boolean {
    return ['list_directory', 'read_file', 'write_file', 'file_info', 'search_files'].includes(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'list_directory':
          return await this.listDirectory(args);
        case 'read_file':
          return await this.readFile(args);
        case 'write_file':
          return await this.writeFile(args);
        case 'file_info':
          return await this.getFileInfo(args);
        case 'search_files':
          return await this.searchFiles(args);
        default:
          throw new Error(`Unknown file tool: ${name}`);
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

  private async listDirectory(args: Record<string, unknown>): Promise<CallToolResult> {
    const path = args.path as string;
    const includeHidden = args.includeHidden as boolean;
    const recursive = args.recursive as boolean;

    const files: FileInfo[] = [];
    
    const processDirectory = async (dirPath: string, basePath = ''): Promise<void> => {
      const entries = await fs.readdir(dirPath);
      
      for (const entry of entries) {
        if (!includeHidden && entry.startsWith('.')) continue;
        
        const fullPath = join(dirPath, entry);
        const relativePath = basePath ? join(basePath, entry) : entry;
        const stat = await fs.stat(fullPath);
        
        files.push({
          path: relativePath,
          size: stat.size,
          isDirectory: stat.isDirectory(),
          lastModified: stat.mtime,
          permissions: (stat.mode & parseInt('777', 8)).toString(8),
        });
        
        if (recursive && stat.isDirectory()) {
          await processDirectory(fullPath, relativePath);
        }
      }
    };

    await processDirectory(path);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(files, null, 2),
        },
      ],
    };
  }

  private async readFile(args: Record<string, unknown>): Promise<CallToolResult> {
    const path = args.path as string;
    const encoding = (args.encoding as 'utf8' | 'ascii' | 'base64') || 'utf8';

    const content = await fs.readFile(path, encoding);

    return {
      content: [
        {
          type: 'text',
          text: content,
        },
      ],
    };
  }

  private async writeFile(args: Record<string, unknown>): Promise<CallToolResult> {
    const path = args.path as string;
    const content = args.content as string;
    const encoding = (args.encoding as 'utf8' | 'ascii' | 'base64') || 'utf8';
    const createDir = args.createDir as boolean;

    if (createDir) {
      const dir = dirname(path);
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(path, content, encoding);

    return {
      content: [
        {
          type: 'text',
          text: `File written successfully to ${path}`,
        },
      ],
    };
  }

  private async getFileInfo(args: Record<string, unknown>): Promise<CallToolResult> {
    const path = args.path as string;
    const stat = await fs.stat(path);

    const info: FileInfo = {
      path: basename(path),
      size: stat.size,
      isDirectory: stat.isDirectory(),
      lastModified: stat.mtime,
      permissions: (stat.mode & parseInt('777', 8)).toString(8),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }

  private async searchFiles(args: Record<string, unknown>): Promise<CallToolResult> {
    const path = args.path as string;
    const pattern = args.pattern as string;
    const contentSearch = args.content as string;
    const includeHidden = args.includeHidden as boolean;

    const results: string[] = [];

    const searchInDirectory = async (dirPath: string): Promise<void> => {
      const entries = await fs.readdir(dirPath);

      for (const entry of entries) {
        if (!includeHidden && entry.startsWith('.')) continue;

        const fullPath = join(dirPath, entry);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          await searchInDirectory(fullPath);
        } else {
          if (pattern && !this.matchesPattern(entry, pattern)) continue;

          if (contentSearch) {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              if (content.includes(contentSearch)) {
                results.push(fullPath);
              }
            } catch {
              // Skip files that can't be read as text
            }
          } else {
            results.push(fullPath);
          }
        }
      }
    };

    await searchInDirectory(path);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  private matchesPattern(filename: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regex = new RegExp(
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    );
    return regex.test(filename);
  }
}