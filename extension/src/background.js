// Background service worker for Chrome extension
let logBuffer = [];
let isOnline = true;
const BATCH_SIZE = 10;
const BATCH_INTERVAL = 1000; // 1 second
const MCP_SERVER_URL = 'http://localhost:3456/api/browser-logs';

// Check server availability
async function checkServerStatus() {
  try {
    const response = await fetch('http://localhost:3456/health', {
      method: 'GET',
      mode: 'cors'
    });
    isOnline = response.ok;
  } catch (error) {
    isOnline = false;
  }
}

// Send logs to MCP server
async function sendLogsToServer(logs) {
  if (!isOnline || logs.length === 0) return;

  for (const log of logs) {
    try {
      console.log('[Extension] Sending log to server:', log);
      const response = await fetch(MCP_SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(log),
        mode: 'cors'
      });

      if (!response.ok) {
        console.error('Failed to send log:', response.status, await response.text());
        // Re-add to buffer for retry
        logBuffer.push(log);
      } else {
        console.log('[Extension] Log sent successfully:', await response.text());
      }
    } catch (error) {
      console.error('Error sending log:', error);
      isOnline = false;
      // Re-add to buffer for retry
      logBuffer.push(log);
    }
  }
}

// Process log buffer periodically
async function processLogBuffer() {
  if (logBuffer.length === 0) return;

  const logsToSend = logBuffer.splice(0, BATCH_SIZE);
  await sendLogsToServer(logsToSend);
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'console_log') {
    // Transform to expected format
    const logEntry = {
      timestamp: message.timestamp,
      level: message.level,
      message: message.message || (Array.isArray(message.args) ? message.args.join(' ') : String(message.args)),
      url: message.url || sender.tab?.url || 'unknown',
      port: message.port || detectPort(message.url || sender.tab?.url),
      project: message.project || detectProject(message.url || sender.tab?.url),
      userAgent: message.userAgent || navigator.userAgent,
      stack: message.stack
    };
    
    console.log('[Extension] Received log from content script:', logEntry);
    logBuffer.push(logEntry);
    
    // Send immediately if buffer is getting large
    if (logBuffer.length >= BATCH_SIZE) {
      processLogBuffer();
    }
  }
});

// Detect port from URL
function detectPort(url) {
  if (!url) return 'unknown';
  const match = url.match(/localhost:(\d+)/);
  return match ? match[1] : 'unknown';
}

// Detect project from URL
function detectProject(url) {
  if (!url) return 'unknown';
  const match = url.match(/localhost:(\d+)/);
  return match ? `localhost:${match[1]}` : 'unknown';
}

// Set up periodic tasks
setInterval(checkServerStatus, 5000); // Check server every 5 seconds
setInterval(processLogBuffer, BATCH_INTERVAL); // Process buffer every second

// Initial server check
checkServerStatus();

// Extension icon badge to show status
chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

// Update badge based on server status
setInterval(() => {
  if (isOnline) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'DevTools MCP Logger - Connected' });
  } else {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    chrome.action.setTitle({ title: 'DevTools MCP Logger - Disconnected' });
  }
}, 1000);

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('DevTools MCP Browser Logger installed');
});