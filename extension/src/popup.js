// Popup script to show connection status
async function updateStatus() {
  const statusEl = document.getElementById('status');
  const statusTextEl = document.getElementById('status-text');
  
  try {
    const response = await fetch('http://localhost:3456/health');
    if (response.ok) {
      statusEl.className = 'status-indicator online';
      statusTextEl.textContent = 'Connected to MCP server';
      
      // Get stats
      const statsResponse = await fetch('http://localhost:3456/api/browser-logs/stats');
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        statusTextEl.textContent = `Connected (${stats.totalLogs} logs)`;
      }
    } else {
      throw new Error('Server not responding');
    }
  } catch (error) {
    statusEl.className = 'status-indicator offline';
    statusTextEl.textContent = 'MCP server not running';
  }
}

// Update status immediately and then every 2 seconds
updateStatus();
setInterval(updateStatus, 2000);