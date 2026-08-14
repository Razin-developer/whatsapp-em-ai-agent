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

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT || 3001);

const HACKAI_API_KEY =
  process.env.HACKAI_API_KEY || '';

const DATA_DIR = path.resolve('./data');

const USAGE_FILE =
  path.join(DATA_DIR, 'usage.json');

const GROUPS_FILE =
  path.join(DATA_DIR, 'selected_groups.json');

const AUTH_DIR =
  path.join(DATA_DIR, 'whatsapp-auth');

const DIST_DIR =
  path.resolve('./dist');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(AUTH_DIR, { recursive: true });

/* =========================================================
   LOGGING
========================================================= */

let logs = [];

function addLog(type, message, details = {}) {
  const logItem = {
    id:
      Date.now() +
      Math.random().toString(36).substring(2, 7),

    type,
    message,
    details,
    timestamp: new Date().toISOString()
  };

  logs.unshift(logItem);

  if (logs.length > 100) {
    logs.length = 100;
  }

  console.log(
    `[${type}] ${message}`,
    Object.keys(details).length
      ? details
      : ''
  );

  broadcastWS('LOG_ADDED', logItem);
}

/* =========================================================
   HACKAI SDK
========================================================= */

let hackAiSdk = null;

try {
  hackAiSdk =
    await import('@razinmohammedpt/hackai-sdk');

  console.log('✅ HackAI SDK loaded');
} catch (error) {
  console.warn(
    '⚠️ HackAI SDK unavailable:',
    error.message
  );
}

/* =========================================================
   RATE LIMITER
========================================================= */

class RateLimiter {
  constructor(maxDailyLimit = 5) {
    this.maxDailyLimit = maxDailyLimit;
    this.ensureDataFile();
  }

  ensureDataFile() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(USAGE_FILE)) {
      fs.writeFileSync(
        USAGE_FILE,
        JSON.stringify(
          {
            records: {},
            config: {
              maxDailyLimit: this.maxDailyLimit
            }
          },
          null,
          2
        )
      );
    }
  }

  getTodayKey() {
    return new Date()
      .toISOString()
      .split('T')[0];
  }

  cleanPhoneNumber(rawNumber) {
    if (!rawNumber) {
      return 'Unknown';
    }

    return String(rawNumber)
      .replace(
        /@c\.us|@g\.us|@s\.whatsapp\.net/g,
        ''
      )
      .replace(/[^0-9+]/g, '');
  }

  loadData() {
    try {
      this.ensureDataFile();

      return JSON.parse(
        fs.readFileSync(
          USAGE_FILE,
          'utf8'
        )
      );
    } catch (error) {
      console.error(
        'Failed to load usage data:',
        error
      );

      return {
        records: {},
        config: {
          maxDailyLimit:
            this.maxDailyLimit
        }
      };
    }
  }

  saveData(data) {
    try {
      this.ensureDataFile();

      fs.writeFileSync(
        USAGE_FILE,
        JSON.stringify(
          data,
          null,
          2
        )
      );
    } catch (error) {
      console.error(
        'Failed to save usage data:',
        error
      );
    }
  }

  canAccess(phoneNumber) {
    const cleanNumber =
      this.cleanPhoneNumber(phoneNumber);

    const today =
      this.getTodayKey();

    const data =
      this.loadData();

    const limit =
      data.config?.maxDailyLimit ??
      this.maxDailyLimit;

    const record =
      data.records[cleanNumber];

    if (
      !record ||
      record.lastDate !== today
    ) {
      return {
        allowed: true,
        count: 0,
        limit,
        remaining: limit
      };
    }

    const count =
      record.count || 0;

    return {
      allowed: count < limit,
      count,
      limit,
      remaining: Math.max(
        0,
        limit - count
      )
    };
  }

  recordAccess(
    phoneNumber,
    pushName = ''
  ) {
    const cleanNumber =
      this.cleanPhoneNumber(phoneNumber);

    const today =
      this.getTodayKey();

    const data =
      this.loadData();

    if (
      !data.records[cleanNumber] ||
      data.records[cleanNumber].lastDate !== today
    ) {
      data.records[cleanNumber] = {
        name:
          pushName ||
          cleanNumber,

        count: 1,

        lastDate: today,

        lastTimestamp:
          new Date().toISOString()
      };
    } else {
      data.records[cleanNumber].count += 1;

      data.records[cleanNumber].name =
        pushName ||
        data.records[cleanNumber].name;

      data.records[cleanNumber].lastTimestamp =
        new Date().toISOString();
    }

    this.saveData(data);

    return data.records[cleanNumber];
  }

  getUsageStats() {
    const data =
      this.loadData();

    const today =
      this.getTodayKey();

    const limit =
      data.config?.maxDailyLimit ??
      this.maxDailyLimit;

    const users =
      Object.entries(data.records)
        .map(([number, record]) => {
          const isToday =
            record.lastDate === today;

          const count =
            isToday
              ? record.count
              : 0;

          return {
            number,

            name:
              record.name ||
              number,

            countToday:
              count,

            limit,

            remaining:
              Math.max(
                0,
                limit - count
              ),

            status:
              count >= limit
                ? 'LIMIT_REACHED'
                : count > 0
                  ? 'ACTIVE'
                  : 'IDLE',

            lastTimestamp:
              record.lastTimestamp
          };
        })
        .sort(
          (a, b) =>
            new Date(b.lastTimestamp) -
            new Date(a.lastTimestamp)
        );

    return {
      today,

      maxDailyLimit:
        limit,

      totalUsers:
        users.length,

      activeToday:
        users.filter(
          user =>
            user.countToday > 0
        ).length,

      users
    };
  }

  setDailyLimit(newLimit) {
    const limit =
      Number(newLimit);

    if (
      !Number.isFinite(limit) ||
      limit < 1
    ) {
      return;
    }

    const data =
      this.loadData();

    this.maxDailyLimit =
      limit;

    data.config = {
      ...(data.config || {}),
      maxDailyLimit: limit
    };

    this.saveData(data);
  }
}

const rateLimiter =
  new RateLimiter(5);

/* =========================================================
   SELECTED GROUPS
========================================================= */

function loadSelectedGroups() {
  try {
    if (
      fs.existsSync(GROUPS_FILE)
    ) {
      const data =
        JSON.parse(
          fs.readFileSync(
            GROUPS_FILE,
            'utf8'
          )
        );

      if (
        Array.isArray(data.groups)
      ) {
        return data.groups;
      }
    }
  } catch (error) {
    console.error(
      'Failed loading selected groups:',
      error
    );
  }

  return ['ALL'];
}

function saveSelectedGroups(
  groups
) {
  try {
    fs.mkdirSync(
      DATA_DIR,
      { recursive: true }
    );

    fs.writeFileSync(
      GROUPS_FILE,
      JSON.stringify(
        { groups },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      'Failed saving selected groups:',
      error
    );
  }
}

let selectedGroupIds =
  loadSelectedGroups();

/* =========================================================
   AI SERVICE (HACKAI SDK EXCLUSIVE)
========================================================= */

class AIService {
  constructor() {
    this.mode = 'AUTO'; // AUTO | SHORT_HUMAN | HIGH_DETAIL
  }

  detectDesiredMode(prompt) {
    if (!prompt) return 'SHORT_HUMAN';
    const clean = prompt.replace(/@ai/gi, '').trim().toLowerCase();
    const highDetailKeywords = ['detail', 'explain', 'step by step', 'guide', 'code', 'tutorial', 'compare', 'how to', 'why'];
    return (highDetailKeywords.some(k => clean.includes(k)) || clean.length > 140) ? 'HIGH_DETAIL' : 'SHORT_HUMAN';
  }

  async generateResponse(prompt, senderName = 'Friend') {
    const mode = this.mode === 'AUTO' ? this.detectDesiredMode(prompt) : this.mode;

    const systemInstruction = mode === 'SHORT_HUMAN'
      ? `You are a friendly, smart WhatsApp AI Assistant for ${senderName}. Keep response VERY SHORT, natural, informal, and human-like (1-3 sentences max).`
      : `You are a helpful WhatsApp AI Assistant for ${senderName}. Provide a detailed, well-structured response using WhatsApp markdown (*bold*, bullet points •).`;

    if (!HACKAI_API_KEY) {
      return `⚠️ HackAI API Key is missing. Please set HACKAI_API_KEY in your .env file.`;
    }

    try {
      if (!hackAiSdk) {
        throw new Error('@razinmohammedpt/hackai-sdk module is not loaded');
      }

      let aiText = '';

      // Initialize HackAI SDK Client
      const SDKClientClass = hackAiSdk.Client || hackAiSdk.default || hackAiSdk.HackAI;
      if (typeof SDKClientClass === 'function') {
        const clientInstance = new SDKClientClass({ apiKey: HACKAI_API_KEY });
        if (typeof clientInstance.chat === 'function') {
          const res = await clientInstance.chat({ system: systemInstruction, prompt });
          aiText = res?.text || res?.content || res?.message || '';
        } else if (typeof clientInstance.generateText === 'function') {
          const res = await clientInstance.generateText({ system: systemInstruction, prompt });
          aiText = res?.text || res?.content || res?.message || '';
        }
      } else if (typeof hackAiSdk.generateText === 'function') {
        const res = await hackAiSdk.generateText({ apiKey: HACKAI_API_KEY, system: systemInstruction, prompt });
        aiText = res?.text || res?.content || res?.message || '';
      } else if (typeof hackAiSdk.chat === 'function') {
        const res = await hackAiSdk.chat({ apiKey: HACKAI_API_KEY, system: systemInstruction, prompt });
        aiText = res?.text || res?.content || res?.message || '';
      }

      if (!aiText && typeof hackAiSdk.default === 'function') {
        const res = await hackAiSdk.default({ apiKey: HACKAI_API_KEY, system: systemInstruction, prompt });
        aiText = typeof res === 'string' ? res : (res?.text || res?.content || '');
      }

      if (aiText && typeof aiText === 'string') {
        return aiText.trim();
      }

      throw new Error('HackAI SDK returned empty response');
    } catch (error) {
      console.error('❌ HackAI Generation Error:', error);
      return `⚠️ HackAI Generation Failed: ${error.message || 'Unknown error'}`;
    }
  }
}

const aiService = new AIService();

/* =========================================================
   TYPING / RESPONSE DELAY
========================================================= */

class AntiBanEngine {
  constructor() {
    this.minDelayMs = 2500;
    this.maxDelayMs = 5500;
    this.enableTyping = true;
  }

  async execute(
    chat,
    textLength = 40
  ) {
    const jitter =
      Math.floor(
        Math.random() *
          (
            this.maxDelayMs -
            this.minDelayMs +
            1
          )
      ) +
      this.minDelayMs;

    const typingTime =
      Math.min(
        jitter,
        Math.max(
          1500,
          textLength * 35
        )
      );

    if (
      this.enableTyping &&
      chat &&
      typeof chat.sendStateTyping ===
        'function'
    ) {
      try {
        await chat.sendStateTyping();
      } catch (error) {
        console.warn(
          'Typing state failed:',
          error.message
        );
      }
    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          typingTime
        )
    );

    if (
      this.enableTyping &&
      chat &&
      typeof chat.clearState ===
        'function'
    ) {
      try {
        await chat.clearState();
      } catch (error) {
        console.warn(
          'Clear typing failed:',
          error.message
        );
      }
    }
  }
}

const antiBan =
  new AntiBanEngine();

/* =========================================================
   WHATSAPP STATE
========================================================= */

let client = null;

let initializing = false;

let agentStatus =
  'DISCONNECTED';

let qrCodeUrl = '';

let userPhone = '';

let cachedGroups = [];

let lastChatCount = 0;

let lastContactCount = 0;

/* =========================================================
   CHROME PATH
========================================================= */

function getChromePath() {
  if (
    process.env.PUPPETEER_EXECUTABLE_PATH
  ) {
    return process.env
      .PUPPETEER_EXECUTABLE_PATH;
  }

  if (
    process.platform !==
    'win32'
  ) {
    return undefined;
  }

  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (
    const chromePath of possiblePaths
  ) {
    if (
      fs.existsSync(chromePath)
    ) {
      return chromePath;
    }
  }

  return undefined;
}

/* =========================================================
   GROUP DISCOVERY
========================================================= */

async function fetchRealGroups(
  options = {}
) {
  const {
    maxAttempts = 20,
    delayMs = 3000,
    force = false
  } = options;

  if (!client) {
    addLog(
      'WARN',
      'Cannot fetch groups: WhatsApp client is null.'
    );

    return cachedGroups;
  }

  if (
    agentStatus !==
      'CONNECTED' &&
    !force
  ) {
    addLog(
      'WARN',
      `Cannot fetch groups: status is ${agentStatus}.`
    );

    return cachedGroups;
  }

  if (client.pupPage) {
    try {
      await client.pupPage.waitForFunction(
        () => window.Store && window.Store.Chat && typeof window.Store.Chat.getModelsArray === 'function',
        { timeout: 15000 }
      ).catch(() => {});
    } catch (e) {}
  }

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      console.log(
        `\n[GROUP SYNC] Attempt ${attempt}/${maxAttempts}`
      );

      let state = null;

      try {
        state =
          await client.getState();
      } catch (error) {
        console.warn(
          'getState failed:',
          error.message
        );
      }

      console.log(
        '[GROUP SYNC] WhatsApp state:',
        state
      );

      if (
        state &&
        state !== 'CONNECTED' &&
        !force
      ) {
        addLog(
          'WARN',
          `WhatsApp state is ${state}; waiting...`
        );
      }

      const chats =
        await client.getChats();

      lastChatCount =
        chats.length;

      console.log(
        `[GROUP SYNC] Total chats: ${chats.length}`
      );

      const groups =
        chats.filter(chat => {
          const serialized =
            chat?.id?._serialized ||
            '';

          return (
            chat?.isGroup === true ||
            serialized.endsWith(
              '@g.us'
            )
          );
        });

      console.log(
        `[GROUP SYNC] Total groups: ${groups.length}`
      );

      /*
       * IMPORTANT DEBUG OUTPUT
       */

      if (chats.length > 0) {
        console.log(
          '[GROUP SYNC] Sample chats:'
        );

        for (
          const chat of chats.slice(
            0,
            15
          )
        ) {
          console.log({
            id:
              chat?.id?._serialized,

            name:
              chat?.name,

            type:
              chat?.type,

            isGroup:
              chat?.isGroup
          });
        }
      }

      /*
       * If WhatsApp has populated chats,
       * we can confidently return groups.
       */

      if (
        chats.length > 0
      ) {
        cachedGroups =
          groups.map(group => ({
            id:
              group.id._serialized,

            name:
              group.name ||
              'Unnamed Group',

            unreadCount:
              group.unreadCount ||
              0,

            participantCount:
              Array.isArray(
                group.participants
              )
                ? group.participants.length
                : 0,

            timestamp:
              group.timestamp ||
              null
          }));

        addLog(
          'INFO',
          `Discovered ${cachedGroups.length} WhatsApp group(s).`,
          {
            totalChats:
              chats.length,

            totalGroups:
              cachedGroups.length
          }
        );

        broadcastWS(
          'GROUPS_LIST',
          {
            groups:
              cachedGroups
          }
        );

        return cachedGroups;
      }

      /*
       * No chats yet.
       */

      addLog(
        'WARN',
        `WhatsApp chat store is still empty (${attempt}/${maxAttempts}). Waiting ${delayMs}ms...`,
        {
          state,
          chats:
            chats.length
        }
      );
    } catch (error) {
      console.error(
        '[GROUP SYNC] ERROR:',
        error
      );

      addLog(
        'ERROR',
        `getChats() failed on attempt ${attempt}/${maxAttempts}: ${error.message}`,
        {
          stack:
            error.stack
        }
      );
    }

    if (
      attempt <
      maxAttempts
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            delayMs
          )
      );
    }
  }

  /*
   * FINAL DIAGNOSTICS
   */

  let finalState =
    'UNKNOWN';

  try {
    finalState =
      await client.getState();
  } catch {}

  let contacts = [];

  try {
    contacts =
      await client.getContacts();
  } catch (error) {
    console.error(
      'getContacts failed:',
      error
    );
  }

  lastContactCount =
    contacts.length;

  console.error(
    '\n========================================'
  );

  console.error(
    '❌ WHATSAPP CHAT SYNC FAILED'
  );

  console.error(
    'State:',
    finalState
  );

  console.error(
    'Chats:',
    lastChatCount
  );

  console.error(
    'Contacts:',
    lastContactCount
  );

  console.error(
    'Groups:',
    cachedGroups.length
  );

  console.error(
    'Account:',
    client?.info?.wid?._serialized
  );

  console.error(
    '========================================\n'
  );

  addLog(
    'ERROR',
    'WhatsApp chat list never populated.',
    {
      state:
        finalState,

      chats:
        lastChatCount,

      contacts:
        lastContactCount,

      groups:
        cachedGroups.length
    }
  );

  broadcastWS(
    'GROUPS_LIST',
    {
      groups:
        cachedGroups
    }
  );

  return cachedGroups;
}

/* =========================================================
   WHATSAPP DEBUG
========================================================= */

async function printWhatsAppDiagnostics() {
  console.log(
    '\n========== WHATSAPP DIAGNOSTICS =========='
  );

  if (!client) {
    console.log(
      'Client: NULL'
    );

    return;
  }

  try {
    console.log(
      'State:',
      await client.getState()
    );
  } catch (error) {
    console.log(
      'State: ERROR',
      error.message
    );
  }

  console.log(
    'Status:',
    agentStatus
  );

  console.log(
    'User:',
    client.info?.wid?._serialized ||
      'unknown'
  );

  console.log(
    'Push name:',
    client.info?.pushname ||
      'unknown'
  );

  try {
    const chats =
      await client.getChats();

    console.log(
      'Chats:',
      chats.length
    );
  } catch (error) {
    console.log(
      'Chats: ERROR',
      error.message
    );
  }

  try {
    const contacts =
      await client.getContacts();

    console.log(
      'Contacts:',
      contacts.length
    );
  } catch (error) {
    console.log(
      'Contacts: ERROR',
      error.message
    );
  }

  console.log(
    'Cached groups:',
    cachedGroups.length
  );

  console.log(
    'Auth directory:',
    AUTH_DIR
  );

  console.log(
    '===========================================\n'
  );
}

/* =========================================================
   INITIALIZE WHATSAPP
========================================================= */

async function initWhatsApp() {
  if (
    client ||
    initializing
  ) {
    addLog(
      'WARN',
      'WhatsApp initialization already running or client exists.'
    );

    return;
  }

  initializing = true;

  agentStatus =
    'INITIALIZING';

  broadcastWS(
    'STATUS_CHANGED',
    {
      status:
        agentStatus
    }
  );

  addLog(
    'INFO',
    'Initializing WhatsApp Web client...'
  );

  const chromePath =
    getChromePath();

  console.log(
    'Chrome path:',
    chromePath ||
      'Puppeteer default'
  );

  console.log(
    'WhatsApp auth directory:',
    AUTH_DIR
  );

  try {
    client =
      new Client({
        authStrategy:
          new LocalAuth({
            dataPath:
              AUTH_DIR,

            clientId:
              'main'
          }),

        puppeteer: {
          headless:
            process.env.WHATSAPP_HEADLESS !==
              'false',

          executablePath:
            chromePath,

          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--no-first-run',
            '--no-default-browser-check'
          ]
        }
      });

    /* -----------------------------------------
       QR
    ----------------------------------------- */

    client.on(
      'qr',
      async qrRaw => {
        console.log(
          '📱 New WhatsApp QR generated'
        );

        agentStatus =
          'QR_READY';

        try {
          qrCodeUrl =
            await qrcode.toDataURL(
              qrRaw
            );

          broadcastWS(
            'QR_CODE',
            {
              qr:
                qrCodeUrl
            }
          );
        } catch (error) {
          console.error(
            'QR generation failed:',
            error
          );
        }

        broadcastWS(
          'STATUS_CHANGED',
          {
            status:
              agentStatus
          }
        );

        addLog(
          'INFO',
          'WhatsApp QR code generated. Scan it from your phone.'
        );
      }
    );

    /* -----------------------------------------
       AUTHENTICATED
    ----------------------------------------- */

    client.on(
      'authenticated',
      () => {
        console.log(
          '✅ WhatsApp authenticated'
        );

        agentStatus =
          'AUTHENTICATED';

        qrCodeUrl = '';

        broadcastWS(
          'STATUS_CHANGED',
          {
            status:
              agentStatus
          }
        );

        addLog(
          'INFO',
          'WhatsApp Web authenticated successfully.'
        );
      }
    );

    /* -----------------------------------------
       AUTH FAILURE
    ----------------------------------------- */

    client.on(
      'auth_failure',
      error => {
        console.error(
          '❌ WhatsApp authentication failure:',
          error
        );

        agentStatus =
          'ERROR';

        broadcastWS(
          'STATUS_CHANGED',
          {
            status:
              agentStatus,

            error:
              error?.message ||
              'Authentication failed'
          }
        );

        addLog(
          'ERROR',
          `WhatsApp authentication failure: ${
            error?.message ||
            'Unknown'
          }`
        );
      }
    );

    /* -----------------------------------------
       STATE CHANGES
    ----------------------------------------- */

    client.on(
      'change_state',
      state => {
        console.log(
          '🔄 WhatsApp state:',
          state
        );

        addLog(
          'INFO',
          `WhatsApp state changed: ${state}`,
          {
            state
          }
        );
      }
    );

    /* -----------------------------------------
       READY
    ----------------------------------------- */

    client.on(
      'ready',
      async () => {
        console.log(
          '\n================================'
        );

        console.log(
          '✅ WHATSAPP WEB READY'
        );

        console.log(
          '================================'
        );

        agentStatus =
          'CONNECTED';

        userPhone =
          client.info?.wid?.user ||
          '';

        qrCodeUrl = '';

        initializing = false;

        broadcastWS(
          'STATUS_CHANGED',
          {
            status:
              agentStatus,

            phone:
              userPhone
          }
        );

        addLog(
          'INFO',
          `WhatsApp AI Agent connected: +${userPhone}`
        );

        /*
         * Print diagnostics first.
         */

        await printWhatsAppDiagnostics();

        /*
         * IMPORTANT:
         * Don't assume chats exist 2 seconds later.
         * Wait until the chat store is populated.
         */

        await fetchRealGroups({
          maxAttempts: 20,
          delayMs: 3000
        });
      }
    );

    /* -----------------------------------------
       DISCONNECTED
    ----------------------------------------- */

    client.on(
      'disconnected',
      reason => {
        console.error(
          '❌ WhatsApp disconnected:',
          reason
        );

        agentStatus =
          'DISCONNECTED';

        qrCodeUrl = '';

        userPhone = '';

        cachedGroups = [];

        broadcastWS(
          'STATUS_CHANGED',
          {
            status:
              agentStatus,

            reason
          }
        );

        addLog(
          'ERROR',
          `WhatsApp disconnected: ${reason}`
        );

        client = null;
        initializing = false;
      }
    );

    /* -----------------------------------------
       MESSAGE HANDLER
    ----------------------------------------- */

    const handleIncomingMsg =
      async msg => {
        try {
          const body =
            msg.body || '';

          if (!body) {
            return;
          }

          /*
           * Trigger:
           * @AI
           * @Ai
           * @aI
           * @ai
           */

          const isTriggered =
            /@ai\b/i.test(
              body
            );

          if (!isTriggered) {
            return;
          }

          const chat =
            await msg
              .getChat()
              .catch(
                () => null
              );

          if (!chat) {
            return;
          }

          /*
           * Group selection.
           */

          if (
            chat.isGroup
          ) {
            const isAll =
              selectedGroupIds.includes(
                'ALL'
              );

            const isSelected =
              selectedGroupIds.includes(
                chat.id._serialized
              );

            if (
              !isAll &&
              !isSelected
            ) {
              addLog(
                'INFO',
                `Ignoring message from unselected group: ${chat.name}`
              );

              return;
            }
          }

          const senderNumber =
            msg.author ||
            msg.from;

          const cleanNumber =
            rateLimiter.cleanPhoneNumber(
              senderNumber
            );

          const contact =
            await msg
              .getContact()
              .catch(
                () => ({
                  pushname:
                    cleanNumber
                })
              );

          const pushName =
            contact.pushname ||
            contact.name ||
            cleanNumber;

          addLog(
            'TRIGGER',
            `AI trigger from ${pushName}`,
            {
              message:
                body,

              sender:
                cleanNumber,

              chat:
                chat.name,

              chatId:
                chat.id?._serialized
            }
          );

          /*
           * Rate limit.
           */

          const access =
            rateLimiter.canAccess(
              senderNumber
            );

          if (!access.allowed) {
            await antiBan.execute(
              chat,
              50
            );

            await msg.reply(
              `⚠️ *Daily Limit Reached*\n\nYou have used ${access.count}/${access.limit} AI responses today.`
            );

            broadcastWS(
              'USAGE_UPDATED',
              rateLimiter.getUsageStats()
            );

            return;
          }

          /*
           * Typing.
           */

          addLog(
            'INFO',
            `Typing simulation for ${chat.name}`
          );

          await antiBan.execute(
            chat,
            body.length
          );

          /*
           * AI.
           */

          addLog(
            'INFO',
            'Generating AI response...'
          );

          const response =
            await aiService.generateResponse(
              body,
              pushName
            );

          /*
           * Record usage.
           */

          const record =
            rateLimiter.recordAccess(
              senderNumber,
              pushName
            );

          /*
           * Send.
           */

          await msg.reply(
            response
          );

          addLog(
            'AI_REPLY',
            `AI response sent to ${pushName} (${record.count}/5 today)`,
            {
              chat:
                chat.name,

              reply:
                response
            }
          );

          broadcastWS(
            'USAGE_UPDATED',
            rateLimiter.getUsageStats()
          );
        } catch (error) {
          console.error(
            'Message handler error:',
            error
          );

          addLog(
            'ERROR',
            `Message handler failed: ${error.message}`,
            {
              stack:
                error.stack
            }
          );
        }
      };

    client.on(
      'message',
      handleIncomingMsg
    );

    /*
     * message_create is useful for messages
     * created by this WhatsApp account.
     */

    client.on(
      'message_create',
      async msg => {
        if (
          msg.fromMe
        ) {
          await handleIncomingMsg(
            msg
          );
        }
      }
    );

    /* -----------------------------------------
       INITIALIZE
    ----------------------------------------- */

    await client.initialize();
  } catch (error) {
    console.error(
      '❌ WhatsApp initialization failed:',
      error
    );

    addLog(
      'ERROR',
      `WhatsApp initialization failed: ${error.message}`,
      {
        stack:
          error.stack
      }
    );

    agentStatus =
      'ERROR';

    client = null;
    initializing = false;

    broadcastWS(
      'STATUS_CHANGED',
      {
        status:
          agentStatus,

        error:
          error.message
      }
    );
  }
}

/* =========================================================
   EXPRESS
========================================================= */

const app =
  express();

app.use(
  express.json()
);

if (
  fs.existsSync(DIST_DIR)
) {
  app.use(
    express.static(
      DIST_DIR
    )
  );
}

/* =========================================================
   HTTP SERVER
========================================================= */

const server =
  http.createServer(
    app
  );

/* =========================================================
   WEBSOCKET
========================================================= */

const wss =
  new WebSocketServer({
    server
  });

const activeSockets =
  new Set();

function broadcastWS(
  event,
  data
) {
  const message =
    JSON.stringify({
      event,

      data,

      timestamp:
        new Date().toISOString()
    });

  for (
    const socket of activeSockets
  ) {
    if (
      socket.readyState ===
      1
    ) {
      try {
        socket.send(
          message
        );
      } catch (error) {
        console.error(
          'WebSocket send failed:',
          error
        );
      }
    }
  }
}

/* =========================================================
   WEBSOCKET CONNECTION
========================================================= */

wss.on(
  'connection',
  async ws => {
    activeSockets.add(ws);

    console.log(
      '🔌 Dashboard WebSocket connected'
    );

    /*
     * Don't block initial state on getChats().
     * Send cached groups immediately.
     */

    ws.send(
      JSON.stringify({
        event:
          'INITIAL_STATE',

        data: {
          status: {
            status:
              agentStatus,

            qrCodeUrl,

            userPhone,

            mode:
              aiService.mode,

            antiBan: {
              enabled:
                antiBan.enableTyping,

              minDelayMs:
                antiBan.minDelayMs,

              maxDelayMs:
                antiBan.maxDelayMs
            },

            logs:
              logs.slice(
                0,
                50
              )
          },

          usage:
            rateLimiter.getUsageStats(),

          groups:
            cachedGroups,

          selectedGroupIds
        }
      })
    );

    /*
     * If already connected,
     * refresh groups in background.
     */

    if (
      client &&
      agentStatus ===
        'CONNECTED'
    ) {
      fetchRealGroups({
        maxAttempts: 3,
        delayMs: 2000
      }).catch(
        error => {
          console.error(
            'Background group refresh failed:',
            error
          );
        }
      );
    }

    ws.on(
      'message',
      async buffer => {
        try {
          const message =
            JSON.parse(
              buffer.toString()
            );

          const action =
            message.action;

          const payload =
            message.payload || {};

          console.log(
            'Dashboard action:',
            action
          );

          /* -----------------------------------
             CONNECT
          ----------------------------------- */

          if (
            action ===
            'CONNECT'
          ) {
            await initWhatsApp();
          }

          /* -----------------------------------
             DISCONNECT
          ----------------------------------- */

          else if (
            action ===
            'DISCONNECT'
          ) {
            if (client) {
              try {
                await client.logout();
              } catch (error) {
                console.warn(
                  'Logout failed:',
                  error.message
                );
              }

              client = null;
            }

            agentStatus =
              'DISCONNECTED';

            qrCodeUrl = '';

            userPhone = '';

            cachedGroups = [];

            broadcastWS(
              'STATUS_CHANGED',
              {
                status:
                  agentStatus
              }
            );

            addLog(
              'INFO',
              'Logged out from WhatsApp Web.'
            );
          }

          /* -----------------------------------
             FETCH GROUPS
          ----------------------------------- */

          else if (
            action ===
            'FETCH_GROUPS'
          ) {
            console.log(
              'Manual group fetch requested'
            );

            if (
              !client
            ) {
              ws.send(
                JSON.stringify({
                  event:
                    'GROUPS_ERROR',

                  data: {
                    error:
                      'WhatsApp client is not initialized.'
                  }
                })
              );

              return;
            }

            const groups =
              await fetchRealGroups({
                maxAttempts: 10,
                delayMs: 2000,
                force: true
              });

            ws.send(
              JSON.stringify({
                event:
                  'GROUPS_LIST',

                data: {
                  groups
                }
              })
            );
          }

          /* -----------------------------------
             SET SELECTED GROUPS
          ----------------------------------- */

          else if (
            action ===
            'SET_SELECTED_GROUPS'
          ) {
            if (
              Array.isArray(
                payload.groups
              )
            ) {
              selectedGroupIds =
                payload.groups;

              saveSelectedGroups(
                selectedGroupIds
              );

              broadcastWS(
                'SELECTED_GROUPS_UPDATED',
                {
                  selectedGroupIds
                }
              );

              addLog(
                'INFO',
                `Updated selected groups: ${selectedGroupIds.length}`
              );
            }
          }

          /* -----------------------------------
             SETTINGS
          ----------------------------------- */

          else if (
            action ===
            'UPDATE_SETTINGS'
          ) {
            if (
              payload.aiMode
            ) {
              aiService.mode =
                payload.aiMode;
            }

            if (
              payload.maxDailyLimit
            ) {
              rateLimiter.setDailyLimit(
                payload.maxDailyLimit
              );
            }

            broadcastWS(
              'SETTINGS_UPDATED',
              {
                mode:
                  aiService.mode,

                maxDailyLimit:
                  rateLimiter.getUsageStats()
                    .maxDailyLimit
              }
            );
          }

          /* -----------------------------------
             DEBUG
          ----------------------------------- */

          else if (
            action ===
            'DEBUG_WHATSAPP'
          ) {
            await printWhatsAppDiagnostics();

            ws.send(
              JSON.stringify({
                event:
                  'WHATSAPP_DEBUG',

                data: {
                  status:
                    agentStatus,

                  userPhone,

                  chats:
                    lastChatCount,

                  contacts:
                    lastContactCount,

                  groups:
                    cachedGroups.length,

                  authDir:
                    AUTH_DIR
                }
              })
            );
          }
        } catch (error) {
          console.error(
            'WebSocket message error:',
            error
          );

          ws.send(
            JSON.stringify({
              event:
                'ERROR',

              data: {
                error:
                  error.message
              }
            })
          );
        }
      }
    );

    ws.on(
      'close',
      () => {
        activeSockets.delete(
          ws
        );

        console.log(
          '🔌 Dashboard WebSocket disconnected'
        );
      }
    );

    ws.on(
      'error',
      error => {
        console.error(
          'WebSocket error:',
          error
        );

        activeSockets.delete(
          ws
        );
      }
    );
  }
);

/* =========================================================
   HEALTH API
========================================================= */

app.get(
  '/api/health',
  async (req, res) => {
    let state = null;

    if (client) {
      try {
        state =
          await client.getState();
      } catch {}
    }

    res.json({
      ok: true,

      server:
        'online',

      whatsapp: {
        status:
          agentStatus,

        state,

        connected:
          Boolean(client),

        phone:
          userPhone,

        chats:
          lastChatCount,

        contacts:
          lastContactCount,

        groups:
          cachedGroups.length
      },

      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   GROUP API
========================================================= */

app.get(
  '/api/groups',
  async (req, res) => {
    try {
      const groups =
        client &&
        agentStatus ===
          'CONNECTED'
          ? await fetchRealGroups({
              maxAttempts: 5,
              delayMs: 1500
            })
          : cachedGroups;

      res.json({
        ok: true,

        groups,

        count:
          groups.length,

        selectedGroupIds
      });
    } catch (error) {
      res.status(500).json({
        ok: false,

        error:
          error.message,

        groups:
          cachedGroups
      });
    }
  }
);

/* =========================================================
   USAGE API
========================================================= */

app.get(
  '/api/usage',
  (req, res) => {
    res.json(
      rateLimiter.getUsageStats()
    );
  }
);

/* =========================================================
   SPA FALLBACK
========================================================= */

if (
  fs.existsSync(
    path.join(
      DIST_DIR,
      'index.html'
    )
  )
) {
  app.get(
    '*',
    (req, res) => {
      res.sendFile(
        path.join(
          DIST_DIR,
          'index.html'
        )
      );
    }
  );
}

/* =========================================================
   SERVER START
========================================================= */

server.listen(
  PORT,
  () => {
    console.log(
      '\n=================================================='
    );

    console.log(
      '🚀 WhatsApp Web AI Agent Server'
    );

    console.log(
      `🌐 Port: ${PORT}`
    );

    console.log(
      `📁 Auth: ${AUTH_DIR}`
    );

    console.log(
      `📁 Data: ${DATA_DIR}`
    );

    console.log(
      '==================================================\n'
    );

    /*
     * Automatically initialize WhatsApp.
     */

    initWhatsApp().catch(
      error => {
        console.error(
          'Startup WhatsApp error:',
          error
        );
      }
    );
  }
);

/* =========================================================
   PROCESS ERROR HANDLING
========================================================= */

process.on(
  'uncaughtException',
  error => {
    console.error(
      'UNCAUGHT EXCEPTION:',
      error
    );

    addLog(
      'ERROR',
      `Uncaught exception: ${error.message}`,
      {
        stack:
          error.stack
      }
    );
  }
);

process.on(
  'unhandledRejection',
  reason => {
    console.error(
      'UNHANDLED REJECTION:',
      reason
    );

    addLog(
      'ERROR',
      `Unhandled rejection: ${reason?.message || reason}`
    );
  }
);

process.on(
  'SIGTERM',
  async () => {
    console.log(
      'SIGTERM received'
    );

    try {
      if (client) {
        await client.destroy();
      }
    } catch (error) {
      console.error(
        'WhatsApp destroy failed:',
        error
      );
    }

    process.exit(0);
  }
);

process.on(
  'SIGINT',
  async () => {
    console.log(
      'SIGINT received'
    );

    try {
      if (client) {
        await client.destroy();
      }
    } catch (error) {
      console.error(
        'WhatsApp destroy failed:',
        error
      );
    }

    process.exit(0);
  }
);