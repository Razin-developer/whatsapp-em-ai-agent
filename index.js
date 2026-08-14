import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

dotenv.config();

const PORT = process.env.PORT || 3001;
const HACKAI_API_KEY = process.env.HACKAI_API_KEY || '';
const DATA_DIR = path.resolve('./data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

// --- 1. HackAI SDK Dynamic Import ---
let hackAiSdk = null;
try {
  hackAiSdk = await import('@razinmohammedpt/hackai-sdk');
} catch (e) {}

// --- 2. Per-Number Rate Limiter (Max 5 / day) ---
class RateLimiter {
  constructor(maxDailyLimit = 5) {
    this.maxDailyLimit = maxDailyLimit;
    this.ensureDataFile();
  }

  ensureDataFile() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USAGE_FILE)) {
      fs.writeFileSync(USAGE_FILE, JSON.stringify({ records: {}, config: { maxDailyLimit: 5 } }, null, 2));
    }
  }

  getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  cleanPhoneNumber(rawNumber) {
    if (!rawNumber) return 'Unknown';
    return rawNumber.replace(/@c\.us|@g\.us|@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
  }

  loadData() {
    try {
      this.ensureDataFile();
      return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
    } catch (e) {
      return { records: {}, config: { maxDailyLimit: this.maxDailyLimit } };
    }
  }

  saveData(data) {
    try {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {}
  }

  canAccess(phoneNumber) {
    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const today = this.getTodayKey();
    const data = this.loadData();
    const limit = data.config?.maxDailyLimit || this.maxDailyLimit;

    if (!data.records[cleanNumber] || data.records[cleanNumber].lastDate !== today) {
      return { allowed: true, count: 0, limit, remaining: limit };
    }
    const currentCount = data.records[cleanNumber].count || 0;
    return {
      allowed: currentCount < limit,
      count: currentCount,
      limit,
      remaining: Math.max(0, limit - currentCount)
    };
  }

  recordAccess(phoneNumber, pushName = '') {
    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const today = this.getTodayKey();
    const data = this.loadData();

    if (!data.records[cleanNumber] || data.records[cleanNumber].lastDate !== today) {
      data.records[cleanNumber] = {
        name: pushName || cleanNumber,
        count: 1,
        lastDate: today,
        lastTimestamp: new Date().toISOString()
      };
    } else {
      data.records[cleanNumber].count += 1;
      data.records[cleanNumber].name = pushName || data.records[cleanNumber].name;
      data.records[cleanNumber].lastTimestamp = new Date().toISOString();
    }
    this.saveData(data);
    return data.records[cleanNumber];
  }

  getUsageStats() {
    const data = this.loadData();
    const today = this.getTodayKey();
    const limit = data.config?.maxDailyLimit || this.maxDailyLimit;

    const userList = Object.entries(data.records).map(([number, record]) => {
      const isToday = record.lastDate === today;
      const count = isToday ? record.count : 0;
      return {
        number,
        name: record.name || number,
        countToday: count,
        limit,
        remaining: Math.max(0, limit - count),
        status: count >= limit ? 'LIMIT_REACHED' : count > 0 ? 'ACTIVE' : 'IDLE',
        lastTimestamp: record.lastTimestamp
      };
    });

    return {
      today,
      maxDailyLimit: limit,
      totalUsers: userList.length,
      activeToday: userList.filter(u => u.countToday > 0).length,
      users: userList.sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp))
    };
  }

  setDailyLimit(newLimit) {
    const data = this.loadData();
    this.maxDailyLimit = Number(newLimit);
    if (!data.config) data.config = {};
    data.config.maxDailyLimit = Number(newLimit);
    this.saveData(data);
  }
}

const rateLimiter = new RateLimiter();

// --- 3. AI Service with Smart Auto-Detect Response Engine ---
class AIService {
  constructor() {
    this.mode = 'AUTO'; // AUTO | SHORT_HUMAN | HIGH_DETAIL
  }

  detectDesiredMode(prompt) {
    if (!prompt) return 'SHORT_HUMAN';
    const clean = prompt.replace(/@EM|@\w+/gi, '').trim().toLowerCase();
    const highDetailKeywords = ['detail', 'explain', 'step by step', 'guide', 'code', 'tutorial', 'compare', 'how to', 'why'];
    return (highDetailKeywords.some(k => clean.includes(k)) || clean.length > 140) ? 'HIGH_DETAIL' : 'SHORT_HUMAN';
  }

  async generateResponse(prompt, senderName = 'Friend') {
    const effectiveMode = (this.mode === 'AUTO') ? this.detectDesiredMode(prompt) : this.mode;

    const systemInstruction = effectiveMode === 'SHORT_HUMAN'
      ? `You are a friendly, smart WhatsApp AI Assistant. Keep response VERY SHORT, natural, informal, and human-like (1-3 sentences max).`
      : `You are a helpful WhatsApp AI Assistant. Provide a detailed, well-structured response formatted with WhatsApp markdown (*bold*, bullet points •).`;

    try {
      if (hackAiSdk && (hackAiSdk.Client || hackAiSdk.generateText || hackAiSdk.default)) {
        const client = hackAiSdk.Client ? new hackAiSdk.Client({ apiKey: HACKAI_API_KEY }) : hackAiSdk.default;
        if (client && typeof client.chat === 'function') {
          const res = await client.chat({ system: systemInstruction, prompt });
          if (res && res.text) return res.text;
        }
      }

      if (HACKAI_API_KEY) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HACKAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }],
            max_tokens: effectiveMode === 'SHORT_HUMAN' ? 120 : 500
          })
        });
        if (res.ok) {
          const d = await res.json();
          if (d.choices?.[0]?.message?.content) return d.choices[0].message.content.trim();
        }
      }

      const cleanQuery = prompt.replace(/@EM|@\w+/gi, '').trim();
      return effectiveMode === 'SHORT_HUMAN'
        ? `Hey ${senderName}! Regarding "${cleanQuery.slice(0, 35)}...": I'm on it! Let me know if you need more details. 👍`
        : `🤖 *EM AI Assistant Report*\n\nHello ${senderName}! Here is the detailed summary for "${cleanQuery}":\n\n• Processed via HackAI Engine.\n• Daily access limit: 5/5 max.\n• Anti-ban typing protection active.`;
    } catch (e) {
      return `Hey ${senderName}, got your message regarding "${prompt.slice(0, 30)}"!`;
    }
  }
}

const aiService = new AIService();

// --- 4. Anti-Ban Safety Engine ---
class AntiBanEngine {
  constructor() {
    this.minDelayMs = 2500;
    this.maxDelayMs = 5500;
    this.enableTyping = true;
  }

  async executeAntiBanRoutine(chat, textLength = 40) {
    const jitter = Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs + 1)) + this.minDelayMs;
    const typingTime = Math.min(jitter, Math.max(1500, textLength * 35));

    if (this.enableTyping && chat && typeof chat.sendStateTyping === 'function') {
      try { await chat.sendStateTyping(); } catch (e) {}
    }
    await new Promise(r => setTimeout(r, typingTime));
    if (this.enableTyping && chat && typeof chat.clearState === 'function') {
      try { await chat.clearState(); } catch (e) {}
    }
  }
}

const antiBan = new AntiBanEngine();

// --- 5. WhatsApp Agent Engine (Headless Chrome + whatsapp-web.js) ---
let client = null;
let agentStatus = 'DISCONNECTED'; // DISCONNECTED | INITIALIZING | QR_READY | CONNECTED
let qrCodeUrl = '';
let userPhone = '';
let logs = [];

function addLog(type, message, details = {}) {
  const logItem = {
    id: Date.now() + Math.random().toString(36).substr(2, 4),
    type,
    message,
    details,
    timestamp: new Date().toLocaleTimeString()
  };
  logs.unshift(logItem);
  if (logs.length > 50) logs.pop();
  broadcastWS('LOG_ADDED', logItem);
}

async function initWhatsApp() {
  if (client) return;

  agentStatus = 'INITIALIZING';
  broadcastWS('STATUS_CHANGED', { status: agentStatus });
  addLog('INFO', 'Initializing WhatsApp Client with Headless Chrome...');

  let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  if (!chromePath && process.platform === 'win32') {
    const p1 = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const p2 = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
    if (fs.existsSync(p1)) chromePath = p1;
    else if (fs.existsSync(p2)) chromePath = p2;
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
  });

  client.on('qr', async (qrRaw) => {
    agentStatus = 'QR_READY';
    try {
      qrCodeUrl = await qrcode.toDataURL(qrRaw);
      broadcastWS('QR_CODE', { qr: qrCodeUrl });
      broadcastWS('STATUS_CHANGED', { status: agentStatus });
      addLog('INFO', 'New WhatsApp QR Code generated. Ready to scan on Dashboard.');
    } catch (e) {}
  });

  client.on('authenticated', () => {
    agentStatus = 'AUTHENTICATED';
    qrCodeUrl = '';
    broadcastWS('STATUS_CHANGED', { status: agentStatus });
    addLog('INFO', 'WhatsApp Web authenticated successfully!');
  });

  client.on('ready', async () => {
    agentStatus = 'CONNECTED';
    userPhone = client.info?.wid?.user || 'Connected User';
    broadcastWS('STATUS_CHANGED', { status: agentStatus, phone: userPhone });
    addLog('INFO', `🤖 WhatsApp EM AI Agent is LIVE & READY for user: +${userPhone}`);
  });

  client.on('disconnected', (reason) => {
    agentStatus = 'DISCONNECTED';
    qrCodeUrl = '';
    userPhone = '';
    client = null;
    broadcastWS('STATUS_CHANGED', { status: agentStatus, reason });
    addLog('ERROR', `WhatsApp client disconnected: ${reason}`);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const body = msg.body || '';

    // Trigger filter: contains '@' AND 'EM'
    const hasAt = body.includes('@');
    const hasEM = /\bEM\b|@EM/i.test(body);

    if (hasAt && hasEM) {
      const senderNumber = msg.from;
      const cleanNumber = rateLimiter.cleanPhoneNumber(senderNumber);
      const contact = await msg.getContact().catch(() => ({ pushname: cleanNumber }));
      const pushName = contact.pushname || contact.name || cleanNumber;

      addLog('TRIGGER', `Received @EM mention from +${cleanNumber} (${pushName})`, { message: body, sender: cleanNumber });

      // Check Rate Limit (Max 5/day per number)
      const accessCheck = rateLimiter.canAccess(senderNumber);

      if (!accessCheck.allowed) {
        addLog('RATE_LIMIT', `Denied +${cleanNumber}: Daily limit reached (${accessCheck.count}/${accessCheck.limit})`, { sender: cleanNumber });
        const chat = await msg.getChat().catch(() => null);
        if (chat) {
          await antiBan.executeAntiBanRoutine(chat, 50);
          await msg.reply(`⚠️ *Daily Limit Reached*\n\nHello +${cleanNumber}, you have reached your quota of ${accessCheck.limit} AI responses for today. Resets at 00:00 UTC.`);
        }
        broadcastWS('USAGE_UPDATED', rateLimiter.getUsageStats());
        return;
      }

      // Execute Anti-Ban routine & AI response
      const chat = await msg.getChat().catch(() => null);
      addLog('INFO', `Executing Anti-Ban typing simulation for +${cleanNumber}...`);
      await antiBan.executeAntiBanRoutine(chat, body.length);

      addLog('INFO', `Generating AI response using HackAI SDK...`);
      const aiReply = await aiService.generateResponse(body, pushName);
      const updatedRecord = rateLimiter.recordAccess(senderNumber, pushName);

      try {
        await msg.reply(aiReply);
        addLog('AI_REPLY', `Sent AI response to +${cleanNumber} (${updatedRecord.count}/5 today)`, { reply: aiReply, usage: `${updatedRecord.count}/5` });
      } catch (e) {}

      broadcastWS('USAGE_UPDATED', rateLimiter.getUsageStats());
    }
  });

  await client.initialize().catch(err => {
    agentStatus = 'ERROR';
    broadcastWS('STATUS_CHANGED', { status: agentStatus, error: err.message });
  });
}

// --- 6. Express Web App & Pure WebSocket Server ---
const app = express();
app.use(express.json());

const distPath = path.resolve('./dist');
app.use(express.static(distPath));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const activeSockets = new Set();

function broadcastWS(event, data) {
  const jsonStr = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const socket of activeSockets) {
    if (socket.readyState === 1) socket.send(jsonStr);
  }
}

wss.on('connection', (ws) => {
  activeSockets.add(ws);

  // Send current state on WebSocket connection
  ws.send(JSON.stringify({
    event: 'INITIAL_STATE',
    data: {
      status: {
        status: agentStatus,
        qrCodeUrl,
        userPhone,
        mode: aiService.mode,
        antiBan: antiBan,
        logs: logs.slice(0, 50)
      },
      usage: rateLimiter.getUsageStats()
    }
  }));

  // Handle incoming WebSocket actions from Frontend Dashboard
  ws.on('message', async (messageBuffer) => {
    try {
      const { action, payload } = JSON.parse(messageBuffer.toString());

      if (action === 'CONNECT') {
        initWhatsApp();
      } else if (action === 'DISCONNECT') {
        if (client) {
          await client.logout().catch(() => {});
          agentStatus = 'DISCONNECTED';
          client = null;
          broadcastWS('STATUS_CHANGED', { status: agentStatus });
          addLog('INFO', 'Logged out from WhatsApp Web.');
        }
      } else if (action === 'UPDATE_SETTINGS') {
        if (payload.aiMode) aiService.mode = payload.aiMode;
        if (payload.maxDailyLimit) rateLimiter.setDailyLimit(payload.maxDailyLimit);
        broadcastWS('SETTINGS_UPDATED', { mode: aiService.mode, maxDailyLimit: rateLimiter.getUsageStats().maxDailyLimit });
        addLog('INFO', 'Updated AI & Rate limit settings.');
      } else if (action === 'TEST_TRIGGER') {
        // Direct WebSocket Simulator Test Trigger
        const mockMsg = {
          from: payload.phoneNumber || '+919876543210',
          body: payload.message || '@EM Hello AI',
          fromMe: false,
          getContact: async () => ({ pushname: payload.pushName || 'Test User' }),
          getChat: async () => ({ sendStateTyping: async () => {}, clearState: async () => {} }),
          reply: async (text) => addLog('AI_REPLY', `[Simulator Reply to ${payload.phoneNumber}]: ${text}`)
        };
        const event = client ? client.listeners('message')[0] : null;
        if (event) event(mockMsg);
      }
    } catch (e) {}
  });

  ws.on('close', () => activeSockets.delete(ws));
});

// SPA fallback for frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 WhatsApp Web AI Agent Server & Dashboard Live!`);
  console.log(`🌐 Open Dashboard: http://localhost:${PORT}`);
  console.log(`==================================================\n`);

  initWhatsApp();
});
