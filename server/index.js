import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import whatsappAgent from './agent.js';
import rateLimiter from './rateLimiter.js';
import aiService from './aiService.js';
import antiBan from './antiBan.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static frontend files if built
const distPath = path.resolve('./dist');
app.use(express.static(distPath));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket connection handling
const activeWsSockets = new Set();

wss.on('connection', (ws) => {
  activeWsSockets.add(ws);

  // Send current state on connection
  const statusData = whatsappAgent.getStatus();
  const usageData = rateLimiter.getUsageStats();

  ws.send(JSON.stringify({ event: 'INITIAL_STATE', data: { status: statusData, usage: usageData } }));

  ws.on('close', () => {
    activeWsSockets.delete(ws);
  });
});

// Broadcast WhatsApp agent events to all connected WebSocket dashboard clients
whatsappAgent.onEvent((eventPayload) => {
  const jsonStr = JSON.stringify(eventPayload);
  for (const client of activeWsSockets) {
    if (client.readyState === 1) { // OPEN
      client.send(jsonStr);
    }
  }
});

// REST API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    agent: whatsappAgent.getStatus(),
    usage: rateLimiter.getUsageStats()
  });
});

app.post('/api/connect', async (req, res) => {
  try {
    await whatsappAgent.initialize();
    res.json({ success: true, message: 'WhatsApp initialization started.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    await whatsappAgent.logout();
    res.json({ success: true, message: 'WhatsApp logged out.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/usage', (req, res) => {
  res.json({ success: true, usage: rateLimiter.getUsageStats() });
});

app.post('/api/settings', (req, res) => {
  const { aiMode, maxDailyLimit, antiBanMinDelay, antiBanMaxDelay, enableTyping } = req.body;

  if (aiMode) aiService.setMode(aiMode);
  if (maxDailyLimit) rateLimiter.setDailyLimit(maxDailyLimit);
  if (antiBanMinDelay !== undefined || antiBanMaxDelay !== undefined || enableTyping !== undefined) {
    antiBan.setSettings(antiBanMinDelay, antiBanMaxDelay, enableTyping);
  }

  res.json({
    success: true,
    message: 'Settings updated successfully.',
    currentSettings: {
      aiMode: aiService.getMode(),
      maxDailyLimit: rateLimiter.getUsageStats().maxDailyLimit,
      antiBan: antiBan.getSettings()
    }
  });
});

app.get('/api/logs', (req, res) => {
  res.json({ success: true, logs: whatsappAgent.getStatus().logs });
});

// Simulated trigger test endpoint for testing without live phone
app.post('/api/test-trigger', async (req, res) => {
  const { phoneNumber = '+1234567890', pushName = 'Test User', message = '@EM Hello AI, give me a quick summary' } = req.body;
  
  const mockMsg = {
    from: phoneNumber,
    body: message,
    fromMe: false,
    getContact: async () => ({ pushname: pushName }),
    getChat: async () => ({
      sendStateTyping: async () => console.log('[Mock Chat] Typing indicator...'),
      clearState: async () => console.log('[Mock Chat] Clear state...')
    }),
    reply: async (text) => console.log(`[Mock Reply to ${phoneNumber}]:`, text)
  };

  try {
    await whatsappAgent.handleIncomingMessage(mockMsg);
    res.json({ success: true, message: 'Test trigger processed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Dashboard UI build not found. Run "pnpm run build" first.');
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 WhatsApp Web AI Agent Dashboard Server Running!`);
  console.log(`🌐 Dashboard URL: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});


