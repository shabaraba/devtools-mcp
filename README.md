# DevTools MCP Server

A specialized Model Context Protocol (MCP) server focused on process management, development server control, and browser console log collection. Solves common development challenges including `npm run dev` blocking and browser debugging visibility.

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

### Browser Log Collection
- `get_browser_logs` - Retrieve browser console logs with filtering
- `get_browser_log_stats` - Get statistics about collected logs
- `clear_browser_logs` - Clear stored browser logs

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

### Browser Log Collection

The browser log collection feature requires installing a Chrome extension to capture console logs from localhost development servers.

#### Setup Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `extension` directory from this project
4. The extension will automatically start collecting logs from all localhost tabs

#### Using Browser Log Tools

```javascript
// Get recent browser logs
{
  "tool": "get_browser_logs",
  "arguments": {
    "filter": {
      "port": "3000",
      "level": ["error", "warn"],
      "limit": 50
    }
  }
}

// Get browser log statistics
{
  "tool": "get_browser_log_stats",
  "arguments": {}
}
// Returns: { totalLogs: 234, portStats: { "3000": 150, "8080": 84 }, activePorts: ["3000", "8080"] }

// Clear logs for specific port
{
  "tool": "clear_browser_logs",
  "arguments": {
    "port": "3000"
  }
}
```

The MCP server automatically starts an HTTP server on port 3456 to receive logs from the Chrome extension. Logs are stored in memory and can be filtered by:
- Port number (e.g., "3000", "8080")
- Log level (log, warn, error, info, debug)
- Time range
- Project ID (auto-detected from page)

## License

MIT