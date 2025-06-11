import express, { Request, Response } from 'express';
import cors from 'cors';
import { BrowserLogEntry } from '../types/browser-logs.js';
import { logManager } from '../utils/log-manager.js';

const app = express();
const PORT = process.env.BROWSER_LOG_PORT || 3456;

// Middleware
app.use(cors({
  origin: /^http:\/\/localhost(:\d+)?$/,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Log submission endpoint
app.post('/api/browser-logs', (req: Request, res: Response) => {
  try {
    const logData = req.body as Omit<BrowserLogEntry, 'id'>;
    
    // Debug log incoming data
    console.error('[HTTP Server] Received log:', JSON.stringify(logData, null, 2));
    
    // Validate required fields
    if (!logData.timestamp || !logData.level || !logData.message || !logData.url) {
      console.error('[HTTP Server] Missing required fields:', {
        timestamp: !!logData.timestamp,
        level: !!logData.level,
        message: !!logData.message,
        url: !!logData.url
      });
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Add log to manager
    console.error('[HTTP Server] Adding log to logManager...');
    const entry = logManager.addLog(logData);
    console.error('[HTTP Server] Log added with ID:', entry.id);
    
    const currentStats = logManager.getStats();
    console.error('[HTTP Server] Current stats after adding:', currentStats);
    
    res.json({ 
      success: true, 
      id: entry.id,
      stats: currentStats
    });
  } catch (error) {
    console.error('Error processing browser log:', error);
    res.status(500).json({ 
      error: 'Failed to process log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get logs endpoint
app.get('/api/browser-logs', (req: Request, res: Response) => {
  console.error('[HTTP Server] GET /api/browser-logs called');
  console.error('[HTTP Server] Query parameters:', req.query);
  
  try {
    const { port, project, level, limit, start, end, clear } = req.query;
    
    const filter: any = {};
    if (port) filter.port = port as string;
    if (project) filter.project = project as string;
    if (level) filter.level = (level as string).split(',');
    if (limit) filter.limit = parseInt(limit as string);
    if (start && end) {
      filter.timeRange = {
        start: parseInt(start as string),
        end: parseInt(end as string)
      };
    }
    
    console.error('[HTTP Server] Filter object:', filter);
    const logs = logManager.getLogs(filter);
    console.error('[HTTP Server] Retrieved logs count:', logs.length);
    
    if (clear === 'true') {
      logManager.clearLogs(filter.port, filter.project);
    }
    
    res.json({
      logs,
      total: logs.length,
      filtered: logs.length
    });
  } catch (error) {
    console.error('Error getting browser logs:', error);
    res.status(500).json({ 
      error: 'Failed to get logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stats endpoint
app.get('/api/browser-logs/stats', (_req: Request, res: Response) => {
  res.json(logManager.getStats());
});

// Start server
export function startHttpServer(): void {
  app.listen(PORT, () => {
    console.error(`Browser log HTTP server listening on port ${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('Shutting down HTTP server...');
  process.exit(0);
});