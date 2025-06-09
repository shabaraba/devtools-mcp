# DevTools MCP Server

A Model Context Protocol (MCP) server providing development tools and utilities for enhanced development workflows.

## Features

### Git Operations
- `git_status` - Get repository status
- `git_diff` - Show file differences
- `git_log` - View commit history
- `git_add` - Stage files
- `git_commit` - Create commits

### File Operations
- `list_directory` - List files and directories
- `read_file` - Read file contents
- `write_file` - Write content to files
- `file_info` - Get file/directory information
- `search_files` - Search for files with patterns

### System Information
- `system_info` - Get system details (OS, CPU, memory)
- `process_list` - List running processes
- `network_info` - Network interface information
- `disk_usage` - Disk space information
- `execute_command` - Run system commands

### Database Operations
- `db_connect` - Connect to databases (SQLite, PostgreSQL, MySQL)
- `db_query` - Execute SQL queries
- `db_schema` - Get database schema
- `db_disconnect` - Close connections
- `db_list_connections` - List active connections

### Development Server Management
- `start_dev_server` - Start development server in background (solves npm run dev blocking)
- `stop_dev_server` - Stop running development server
- `check_dev_server` - Check server status and port availability
- `list_running_servers` - List all running servers
- `get_server_logs` - Get server logs for debugging
- `restart_dev_server` - Restart a development server

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Usage

The server runs on stdio and can be integrated with MCP-compatible clients.

### Development Server Management Examples

```javascript
// Start a development server in background
{
  "tool": "start_dev_server",
  "arguments": {
    "command": "npm run dev",
    "name": "my-app",
    "port": 3000,
    "cwd": "/path/to/project"
  }
}

// Check server status
{
  "tool": "check_dev_server",
  "arguments": {
    "name": "my-app",
    "port": 3000
  }
}

// Get server logs for debugging
{
  "tool": "get_server_logs",
  "arguments": {
    "name": "my-app",
    "lines": 50
  }
}

// Stop server when done
{
  "tool": "stop_dev_server",
  "arguments": {
    "name": "my-app"
  }
}
```

This solves the common issue where `npm run dev` blocks Claude Code execution. The server starts in the background and returns immediately, allowing Claude Code to continue with other tasks while monitoring the development server status.

## License

MIT