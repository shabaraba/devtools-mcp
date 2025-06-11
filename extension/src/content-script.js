// Inject script into the page context to capture console logs
(function() {
  // This code runs in the isolated content script context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/injected.js');
  script.onload = function() {
    script.remove();
  };

  // Inject the script
  (document.head || document.documentElement).appendChild(script);

  // Listen for messages from the injected script
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    // Check if it's our message
    if (event.data && event.data.source === 'devtools-mcp-logger') {
      // Forward to background script
      chrome.runtime.sendMessage(event.data.payload);
    }
  });
})();