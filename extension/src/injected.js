// This script runs in the page context to capture console logs
(function() {
  // Save original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  // Helper to serialize arguments
  function serializeArgs(args) {
    return Array.from(args).map(arg => {
      try {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'function') return arg.toString();
        if (typeof arg === 'object') {
          // Handle DOM elements
          if (arg instanceof Element) {
            return arg.outerHTML.substring(0, 200) + '...';
          }
          // Handle errors
          if (arg instanceof Error) {
            return {
              name: arg.name,
              message: arg.message,
              stack: arg.stack
            };
          }
          // Try to stringify other objects
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return Object.prototype.toString.call(arg);
          }
        }
        return String(arg);
      } catch (e) {
        return '[Serialization Error]';
      }
    });
  }

  // Get current port and project info
  const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
  const hostname = window.location.hostname;
  
  // Try to detect project type from page
  function detectProject() {
    const title = document.title;
    const metaGenerator = document.querySelector('meta[name="generator"]');
    const metaApplication = document.querySelector('meta[name="application-name"]');
    
    if (metaGenerator) {
      const content = metaGenerator.content.toLowerCase();
      if (content.includes('next')) return 'nextjs-app';
      if (content.includes('gatsby')) return 'gatsby-app';
      if (content.includes('nuxt')) return 'nuxt-app';
    }
    
    if (metaApplication) {
      return metaApplication.content;
    }
    
    if (title.includes('Vite')) return 'vite-app';
    if (title.includes('React')) return 'react-app';
    if (title.includes('Vue')) return 'vue-app';
    if (title.includes('Angular')) return 'angular-app';
    
    return `${hostname}-${currentPort}`;
  }

  // Send log to content script
  function sendLog(level, args) {
    const message = {
      type: 'console_log',
      timestamp: Date.now(),
      level: level,
      message: serializeArgs(args).join(' '),
      url: window.location.href,
      port: currentPort,
      project: detectProject(),
      userAgent: navigator.userAgent
    };

    // Get stack trace for errors
    if (level === 'error') {
      const error = new Error();
      message.stack = error.stack;
    }

    // Send to content script via custom event
    window.postMessage({
      source: 'devtools-mcp-logger',
      payload: message
    }, '*');
  }

  // Override console methods
  Object.keys(originalConsole).forEach(method => {
    console[method] = function(...args) {
      // Call original method
      originalConsole[method].apply(console, args);
      // Send to logger
      sendLog(method, args);
    };
  });

  // Override fetch to capture HTTP errors
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const request = originalFetch.apply(this, args);
    
    return request.then(response => {
      // Log HTTP errors
      if (!response.ok) {
        const url = args[0];
        const method = args[1]?.method || 'GET';
        sendLog('error', [`${method} ${url} ${response.status} (${response.statusText})`]);
      }
      return response;
    }).catch(error => {
      // Log network errors
      const url = args[0];
      const method = args[1]?.method || 'GET';
      sendLog('error', [`Network Error: ${method} ${url}`, error.message]);
      throw error; // Re-throw to maintain normal error handling
    });
  };

  // Override XMLHttpRequest to capture HTTP errors
  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    
    let method = '';
    let url = '';
    
    xhr.open = function(m, u, ...args) {
      method = m;
      url = u;
      return originalOpen.apply(this, [m, u, ...args]);
    };
    
    xhr.send = function(...args) {
      xhr.addEventListener('loadend', function() {
        if (xhr.status >= 400) {
          sendLog('error', [`${method} ${url} ${xhr.status} (${xhr.statusText})`]);
        }
      });
      
      xhr.addEventListener('error', function() {
        sendLog('error', [`Network Error: ${method} ${url}`]);
      });
      
      return originalSend.apply(this, args);
    };
    
    return xhr;
  };

  // Notify that logger is active
  originalConsole.log('%c[DevTools MCP] Console logger activated', 'color: #4CAF50; font-weight: bold');
})();