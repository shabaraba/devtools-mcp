import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, GitStatus } from '../types/index.js';

const execAsync = promisify(exec);

export class GitTool implements BaseTool {
  getTools(): Tool[] {
    return [
      {
        name: 'git_status',
        description: 'Get the current git status of the repository',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository (defaults to current directory)',
            },
          },
        },
      },
      {
        name: 'git_diff',
        description: 'Show git diff for specified files or all changes',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to specific file or directory',
            },
            staged: {
              type: 'boolean',
              description: 'Show staged changes only',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_log',
        description: 'Show git commit history',
        inputSchema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: 'Number of commits to show',
              default: 10,
            },
            oneline: {
              type: 'boolean',
              description: 'Show one line per commit',
              default: true,
            },
            path: {
              type: 'string',
              description: 'Path to specific file or directory',
            },
          },
        },
      },
      {
        name: 'git_add',
        description: 'Stage files for commit',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to stage (use "." for all files)',
            },
          },
          required: ['files'],
        },
      },
      {
        name: 'git_commit',
        description: 'Create a new commit',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Commit message',
            },
            amend: {
              type: 'boolean',
              description: 'Amend the last commit',
              default: false,
            },
          },
          required: ['message'],
        },
      },
    ];
  }

  hasTool(name: string): boolean {
    return ['git_status', 'git_diff', 'git_log', 'git_add', 'git_commit'].includes(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const cwd = (args.path as string) || process.cwd();

    try {
      switch (name) {
        case 'git_status':
          return await this.getGitStatus(cwd);
        case 'git_diff':
          return await this.getGitDiff(cwd, args);
        case 'git_log':
          return await this.getGitLog(cwd, args);
        case 'git_add':
          return await this.gitAdd(cwd, args);
        case 'git_commit':
          return await this.gitCommit(cwd, args);
        default:
          throw new Error(`Unknown git tool: ${name}`);
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

  private async getGitStatus(cwd: string): Promise<CallToolResult> {
    const { stdout } = await execAsync('git status --porcelain -b', { cwd });
    const lines = stdout.trim().split('\n').filter(line => line);
    
    const status: GitStatus = {
      branch: '',
      ahead: 0,
      behind: 0,
      modified: [],
      added: [],
      deleted: [],
      untracked: [],
    };

    for (const line of lines) {
      if (line.startsWith('##')) {
        const branchInfo = line.substring(3);
        const [branch, tracking] = branchInfo.split('...');
        status.branch = branch;
        
        if (tracking) {
          const aheadMatch = tracking.match(/ahead (\d+)/);
          const behindMatch = tracking.match(/behind (\d+)/);
          if (aheadMatch) status.ahead = parseInt(aheadMatch[1]);
          if (behindMatch) status.behind = parseInt(behindMatch[1]);
        }
      } else {
        const statusCode = line.substring(0, 2);
        const filepath = line.substring(3);
        
        if (statusCode[0] === 'M' || statusCode[1] === 'M') status.modified.push(filepath);
        if (statusCode[0] === 'A') status.added.push(filepath);
        if (statusCode[0] === 'D') status.deleted.push(filepath);
        if (statusCode === '??') status.untracked.push(filepath);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  private async getGitDiff(cwd: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const staged = args.staged as boolean;
    const path = args.path as string;
    
    let command = `git diff${staged ? ' --cached' : ''}`;
    if (path) command += ` ${path}`;
    
    const { stdout } = await execAsync(command, { cwd });
    
    return {
      content: [
        {
          type: 'text',
          text: stdout || 'No changes found',
        },
      ],
    };
  }

  private async getGitLog(cwd: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const count = (args.count as number) || 10;
    const oneline = args.oneline as boolean !== false;
    const path = args.path as string;
    
    let command = `git log -${count}`;
    if (oneline) command += ' --oneline';
    if (path) command += ` -- ${path}`;
    
    const { stdout } = await execAsync(command, { cwd });
    
    return {
      content: [
        {
          type: 'text',
          text: stdout || 'No commits found',
        },
      ],
    };
  }

  private async gitAdd(cwd: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const files = args.files as string[];
    if (!files || files.length === 0) {
      throw new Error('No files specified');
    }
    
    const command = `git add ${files.join(' ')}`;
    const { stdout, stderr } = await execAsync(command, { cwd });
    
    return {
      content: [
        {
          type: 'text',
          text: stdout || stderr || 'Files staged successfully',
        },
      ],
    };
  }

  private async gitCommit(cwd: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const message = args.message as string;
    const amend = args.amend as boolean;
    
    if (!message) {
      throw new Error('Commit message is required');
    }
    
    let command = `git commit -m "${message.replace(/"/g, '\\"')}"`;
    if (amend) command = `git commit --amend -m "${message.replace(/"/g, '\\"')}"`;
    
    const { stdout, stderr } = await execAsync(command, { cwd });
    
    return {
      content: [
        {
          type: 'text',
          text: stdout || stderr || 'Commit created successfully',
        },
      ],
    };
  }
}