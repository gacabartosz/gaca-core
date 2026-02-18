// OpenClaw Bridge API Routes
// Endpoints for communicating with OpenClaw Gateway

import { Router, Request, Response } from 'express';
import { getOpenClawBridge } from '../../core/OpenClawBridge.js';

export function createOpenClawRoutes(): Router {
  const router = Router();
  const bridge = getOpenClawBridge();

  // GET /api/openclaw/status - Connection status
  router.get('/status', (req: Request, res: Response) => {
    res.json(bridge.getHealth());
  });

  // POST /api/openclaw/connect - Connect to OpenClaw Gateway
  router.post('/connect', async (req: Request, res: Response) => {
    try {
      const { url, token } = req.body;
      const gatewayUrl = url || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
      const gatewayToken = token || process.env.OPENCLAW_GATEWAY_TOKEN;

      if (!gatewayToken) {
        return res.status(400).json({ error: 'Gateway token is required (provide token in body or set OPENCLAW_GATEWAY_TOKEN env var)' });
      }

      await bridge.connect(gatewayUrl, gatewayToken);
      res.json({ status: 'connected', gatewayUrl, connectedSince: bridge.getHealth().connectedSince });
    } catch (error: any) {
      res.status(500).json({ error: `Failed to connect: ${error.message}` });
    }
  });

  // POST /api/openclaw/disconnect - Disconnect from Gateway
  router.post('/disconnect', (req: Request, res: Response) => {
    bridge.disconnect();
    res.json({ status: 'disconnected' });
  });

  // POST /api/openclaw/message - Send message to Claw
  router.post('/message', async (req: Request, res: Response) => {
    try {
      const { text, target } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'text is required' });
      }
      const message = await bridge.sendMessage(text, target);
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/openclaw/history - Get message history
  router.get('/history', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = bridge.getHistory();
    res.json(history.slice(-limit));
  });

  return router;
}
