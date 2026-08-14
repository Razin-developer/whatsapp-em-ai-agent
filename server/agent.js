import fs from 'fs';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import rateLimiter from './rateLimiter.js';
import aiService from './aiService.js';
import antiBan from './antiBan.js';

class WhatsAppAgent {
  constructor() {
    this.client = null;
    this.status = 'DISCONNECTED'; // DISCONNECTED | INITIALIZING | QR_READY | CONNECTED | AUTH_FAILURE
    this.qrCodeUrl = '';
    this.userPhone = '';
    this.eventListeners = new Set();
    this.logs = [];
  }

  onEvent(listener) {
    this.eventListeners.add(listener);
  }

  offEvent(listener) {
    this.eventListeners.delete(listener);
  }

  broadcast(event, data) {
    const payload = { event, data, timestamp: new Date().toISOString() };
    for (const listener of this.eventListeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error('Error in event listener:', e);
      }
    }
  }

  addLog(type, message, details = {}) {
    const logItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      type, // 'INFO' | 'TRIGGER' | 'RATE_LIMIT' | 'AI_REPLY' | 'ERROR'
      message,
      details,
      timestamp: new Date().toLocaleTimeString()
    };
    this.logs.unshift(logItem);
    if (this.logs.length > 100) this.logs.pop();
    this.broadcast('LOG_ADDED', logItem);
  }

  async initialize() {
    if (this.client) {
      console.log('[WhatsApp Agent] Client already initialized.');
      return;
    }

    this.status = 'INITIALIZING';
    this.broadcast('STATUS_CHANGED', { status: this.status });
    this.addLog('INFO', 'Initializing WhatsApp Web Client with Playwright engine...');

    // Auto-detect system Chrome path on Windows if installed
    let chromePath = undefined;
    if (process.platform === 'win32') {
      const standardPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      const x86Path = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
      if (fs.existsSync(standardPath)) chromePath = standardPath;
      else if (fs.existsSync(x86Path)) chromePath = x86Path;
    }

    try {
      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
        puppeteer: {
          headless: true,
          executablePath: chromePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        }
      });


      this.setupHandlers();
      await this.client.initialize();
    } catch (err) {
      console.error('[WhatsApp Agent Init Error]:', err);
      this.status = 'ERROR';
      this.broadcast('STATUS_CHANGED', { status: this.status, error: err.message });
      this.addLog('ERROR', `Initialization failed: ${err.message}`);
    }
  }

  setupHandlers() {
    this.client.on('qr', async (qrRaw) => {
      this.status = 'QR_READY';
      try {
        this.qrCodeUrl = await qrcode.toDataURL(qrRaw);
        this.broadcast('QR_CODE', { qr: this.qrCodeUrl });
        this.broadcast('STATUS_CHANGED', { status: this.status });
        this.addLog('INFO', 'New WhatsApp QR code generated. Ready to scan on Dashboard.');
      } catch (err) {
        console.error('Error rendering QR code:', err);
      }
    });

    this.client.on('authenticated', () => {
      this.status = 'AUTHENTICATED';
      this.qrCodeUrl = '';
      this.broadcast('STATUS_CHANGED', { status: this.status });
      this.addLog('INFO', 'WhatsApp Web authenticated successfully!');
    });

    this.client.on('auth_failure', (msg) => {
      this.status = 'AUTH_FAILURE';
      this.broadcast('STATUS_CHANGED', { status: this.status, message: msg });
      this.addLog('ERROR', `WhatsApp authentication failed: ${msg}`);
    });

    this.client.on('ready', async () => {
      this.status = 'CONNECTED';
      try {
        const info = this.client.info;
        this.userPhone = info ? info.wid.user : 'Connected User';
      } catch (e) {
        this.userPhone = 'Connected User';
      }
      this.broadcast('STATUS_CHANGED', { status: this.status, phone: this.userPhone });
      this.addLog('INFO', `🤖 WhatsApp EM AI Agent is LIVE & READY for user: +${this.userPhone}`);
    });

    this.client.on('disconnected', (reason) => {
      this.status = 'DISCONNECTED';
      this.qrCodeUrl = '';
      this.userPhone = '';
      this.broadcast('STATUS_CHANGED', { status: this.status, reason });
      this.addLog('ERROR', `WhatsApp client disconnected: ${reason}`);
      this.client = null;
    });

    this.client.on('message', async (msg) => {
      await this.handleIncomingMessage(msg);
    });
  }

  isTriggered(body) {
    if (!body || typeof body !== 'string') return false;
    // Activates when message contains '@' AND 'EM' (e.g. '@EM', '@bot EM', 'hey @someone EM')
    const hasAt = body.includes('@');
    const hasEM = /\bEM\b|@EM/i.test(body);
    return hasAt && hasEM;
  }

  async handleIncomingMessage(msg) {
    const body = msg.body || '';
    
    // Ignore self messages unless for testing
    if (msg.fromMe) return;

    if (!this.isTriggered(body)) {
      return; // Skip messages without @ and EM
    }

    const senderNumber = msg.from;
    const cleanNumber = rateLimiter.cleanPhoneNumber(senderNumber);
    const contact = await msg.getContact().catch(() => ({ pushname: cleanNumber }));
    const pushName = contact.pushname || contact.name || cleanNumber;

    this.addLog('TRIGGER', `Received @EM mention from +${cleanNumber} (${pushName})`, {
      message: body,
      sender: cleanNumber
    });

    // 1. Check Rate Limit (Max 5 / day / phone number)
    const accessCheck = rateLimiter.canAccess(senderNumber);

    if (!accessCheck.allowed) {
      this.addLog('RATE_LIMIT', `Denied +${cleanNumber}: Daily limit reached (${accessCheck.count}/${accessCheck.limit})`, {
        sender: cleanNumber
      });

      // Send daily limit warning message
      const chat = await msg.getChat().catch(() => null);
      if (chat) {
        await antiBan.executeAntiBanRoutine(chat, 50);
        const limitMessage = `⚠️ *Daily Limit Reached*\n\nHello +${cleanNumber}, you have reached your daily quota of ${accessCheck.limit} AI responses for today.\n\nYour limit resets at 00:00 UTC. Thank you!`;
        await msg.reply(limitMessage);
      }
      this.broadcast('USAGE_UPDATED', rateLimiter.getUsageStats());
      return;
    }

    // 2. Allowed access - Execute Anti-Ban protection routine
    const chat = await msg.getChat().catch(() => null);
    
    this.addLog('INFO', `Executing Anti-Ban typing simulation & delay for +${cleanNumber}...`);
    await antiBan.executeAntiBanRoutine(chat, body.length);

    // 3. Generate AI Response
    this.addLog('INFO', `Generating AI response using HackAI SDK (${aiService.getMode()} mode)...`);
    const aiResponse = await aiService.generateResponse(body, pushName);

    // 4. Record successful access in RateLimiter
    const updatedRecord = rateLimiter.recordAccess(senderNumber, pushName);

    // 5. Send WhatsApp reply
    try {
      await msg.reply(aiResponse);
      this.addLog('AI_REPLY', `Sent AI response to +${cleanNumber} (${updatedRecord.count}/5 today)`, {
        reply: aiResponse,
        usage: `${updatedRecord.count}/5`
      });
    } catch (sendErr) {
      console.error('Error replying to message:', sendErr);
      this.addLog('ERROR', `Failed to send reply to +${cleanNumber}: ${sendErr.message}`);
    }

    // 6. Broadcast updated stats to dashboard
    this.broadcast('USAGE_UPDATED', rateLimiter.getUsageStats());
  }

  async logout() {
    if (this.client) {
      try {
        await this.client.logout();
      } catch (e) {}
      this.status = 'DISCONNECTED';
      this.client = null;
      this.broadcast('STATUS_CHANGED', { status: this.status });
      this.addLog('INFO', 'Logged out from WhatsApp Web.');
    }
  }

  getStatus() {
    return {
      status: this.status,
      qrCodeUrl: this.qrCodeUrl,
      userPhone: this.userPhone,
      mode: aiService.getMode(),
      antiBan: antiBan.getSettings(),
      logs: this.logs.slice(0, 50)
    };
  }
}

export default new WhatsAppAgent();
