# DevTools MCP Server

A specialized Model Context Protocol (MCP) server focused on process management and development server control. Solves the common issue where `npm run dev` blocks Claude Code execution.

## Features

### Process Management
- `kill_process` - Kill process by name or PID with signal control
- `detailed_process_list` - Get detailed process info with CPU/memory usage and sorting
- `find_process_url` - Find URLs/ports for a process by name (development servers)

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

### Process Management Examples

```javascript
// Kill process by name
{
  "tool": "kill_process",
  "arguments": {
    "name": "node",
    "signal": "TERM",
    "force": false
  }
}

// Get detailed process list sorted by CPU usage
{
  "tool": "detailed_process_list",
  "arguments": {
    "filter": "node",
    "sortBy": "cpu",
    "limit": 10
  }
}

// Find development server URL by process name
{
  "tool": "find_process_url",
  "arguments": {
    "processName": "node"
  }
}
// Returns: "Development server likely running at: http://localhost:3000"
```

## License

MIT