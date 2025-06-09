import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool, DatabaseConnection, QueryResult } from '../types/index.js';

export class DatabaseTool implements BaseTool {
  private connections: Map<string, DatabaseConnection> = new Map();

  getTools(): Tool[] {
    return [
      {
        name: 'db_connect',
        description: 'Connect to a database',
        inputSchema: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: 'Unique identifier for this connection',
            },
            type: {
              type: 'string',
              enum: ['sqlite', 'postgres', 'mysql'],
              description: 'Database type',
            },
            host: {
              type: 'string',
              description: 'Database host (not required for SQLite)',
            },
            port: {
              type: 'number',
              description: 'Database port',
            },
            database: {
              type: 'string',
              description: 'Database name or file path for SQLite',
            },
            username: {
              type: 'string',
              description: 'Database username',
            },
            password: {
              type: 'string',
              description: 'Database password',
            },
          },
          required: ['connectionId', 'type', 'database'],
        },
      },
      {
        name: 'db_query',
        description: 'Execute a SQL query',
        inputSchema: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: 'Connection identifier',
            },
            query: {
              type: 'string',
              description: 'SQL query to execute',
            },
            params: {
              type: 'array',
              items: { type: 'string' },
              description: 'Query parameters',
            },
          },
          required: ['connectionId', 'query'],
        },
      },
      {
        name: 'db_schema',
        description: 'Get database schema information',
        inputSchema: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: 'Connection identifier',
            },
            table: {
              type: 'string',
              description: 'Specific table name (optional)',
            },
          },
          required: ['connectionId'],
        },
      },
      {
        name: 'db_disconnect',
        description: 'Disconnect from a database',
        inputSchema: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: 'Connection identifier',
            },
          },
          required: ['connectionId'],
        },
      },
      {
        name: 'db_list_connections',
        description: 'List all active database connections',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  hasTool(name: string): boolean {
    return ['db_connect', 'db_query', 'db_schema', 'db_disconnect', 'db_list_connections'].includes(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'db_connect':
          return await this.connect(args);
        case 'db_query':
          return await this.query(args);
        case 'db_schema':
          return await this.getSchema(args);
        case 'db_disconnect':
          return await this.disconnect(args);
        case 'db_list_connections':
          return await this.listConnections();
        default:
          throw new Error(`Unknown database tool: ${name}`);
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

  private async connect(args: Record<string, unknown>): Promise<CallToolResult> {
    const connectionId = args.connectionId as string;
    const type = args.type as 'sqlite' | 'postgres' | 'mysql';
    const host = args.host as string;
    const port = args.port as number;
    const database = args.database as string;
    const username = args.username as string;
    const password = args.password as string;

    const connection: DatabaseConnection = {
      type,
      database,
      host,
      port,
      username,
      password,
    };

    this.connections.set(connectionId, connection);

    return {
      content: [
        {
          type: 'text',
          text: `Connected to ${type} database: ${database} (ID: ${connectionId})`,
        },
      ],
    };
  }

  private async query(args: Record<string, unknown>): Promise<CallToolResult> {
    const connectionId = args.connectionId as string;
    const query = args.query as string;

    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // This is a mock implementation
    // In a real implementation, you would use actual database drivers
    const mockResult: QueryResult = {
      rows: [
        { id: 1, name: 'Sample Row 1', created_at: '2024-01-01' },
        { id: 2, name: 'Sample Row 2', created_at: '2024-01-02' },
      ],
      rowCount: 2,
      fields: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'varchar' },
        { name: 'created_at', type: 'date' },
      ],
    };

    return {
      content: [
        {
          type: 'text',
          text: `Query executed on ${connection.type}:\n${query}\n\nResult:\n${JSON.stringify(mockResult, null, 2)}`,
        },
      ],
    };
  }

  private async getSchema(args: Record<string, unknown>): Promise<CallToolResult> {
    const connectionId = args.connectionId as string;
    const table = args.table as string;

    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // Mock schema information
    const schema = {
      database: connection.database,
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer', nullable: false, primaryKey: true },
            { name: 'name', type: 'varchar(255)', nullable: false },
            { name: 'email', type: 'varchar(255)', nullable: false },
            { name: 'created_at', type: 'timestamp', nullable: false },
          ],
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', type: 'integer', nullable: false, primaryKey: true },
            { name: 'user_id', type: 'integer', nullable: false },
            { name: 'title', type: 'varchar(255)', nullable: false },
            { name: 'content', type: 'text', nullable: true },
            { name: 'created_at', type: 'timestamp', nullable: false },
          ],
        },
      ],
    };

    const result = table 
      ? schema.tables.find(t => t.name === table) || { error: `Table ${table} not found` }
      : schema;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async disconnect(args: Record<string, unknown>): Promise<CallToolResult> {
    const connectionId = args.connectionId as string;

    if (!this.connections.has(connectionId)) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    this.connections.delete(connectionId);

    return {
      content: [
        {
          type: 'text',
          text: `Disconnected from database (ID: ${connectionId})`,
        },
      ],
    };
  }

  private async listConnections(): Promise<CallToolResult> {
    const connections = Array.from(this.connections.entries()).map(([id, conn]) => ({
      id,
      type: conn.type,
      database: conn.database,
      host: conn.host,
      port: conn.port,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(connections, null, 2),
        },
      ],
    };
  }
}