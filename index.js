import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

dotenv.config();

/* ============================================================
   CONFIG
============================================================ */

const PORT = Number(process.env.PORT || 3001);

const ROOT = process.cwd();

const DATA_DIR = path.join(ROOT, "data");
const AUTH_DIR = path.join(DATA_DIR, "whatsapp-auth");

const GROUPS_FILE = path.join(DATA_DIR, "groups.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LOG_FILE = path.join(DATA_DIR, "agent.log");

const DIST_DIR = path.join(ROOT, "dist");

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ============================================================
   HACKAI SDK
============================================================ */

let hackAiSdk = null;

try {
    hackAiSdk = await import("@razinmohammedpt/hackai-sdk");
    console.log("✅ HackAI SDK loaded");
} catch (error) {
    console.warn("⚠️ HackAI SDK unavailable:", error.message);
}

/* ============================================================
   RATE LIMITER (5 responses/day per number)
============================================================ */

class RateLimiter {
    constructor(maxDailyLimit = 5) {
        this.maxDailyLimit = maxDailyLimit;
        this.ensureDataFile();
    }

    ensureDataFile() {
        const USAGE_FILE = path.join(DATA_DIR, "usage.json");
        if (!fs.existsSync(USAGE_FILE)) {
            writeJson(USAGE_FILE, {
                records: {},
                config: { maxDailyLimit: this.maxDailyLimit }
            });
        }
    }

    getTodayKey() {
        return new Date().toISOString().split("T")[0];
    }

    cleanPhoneNumber(rawNumber) {
        if (!rawNumber) return "Unknown";
        return String(rawNumber)
            .replace(/@c\.us|@g\.us|@s\.whatsapp\.net|@lid/g, "")
            .replace(/[^0-9+]/g, "");
    }

    loadData() {
        const USAGE_FILE = path.join(DATA_DIR, "usage.json");
        return readJson(USAGE_FILE, {
            records: {},
            config: { maxDailyLimit: this.maxDailyLimit }
        });
    }

    saveData(data) {
        const USAGE_FILE = path.join(DATA_DIR, "usage.json");
        writeJson(USAGE_FILE, data);
    }

    canAccess(phoneNumber) {
        const cleanNumber = this.cleanPhoneNumber(phoneNumber);
        const today = this.getTodayKey();
        const data = this.loadData();
        const limit = data.config?.maxDailyLimit ?? this.maxDailyLimit;
        const record = data.records[cleanNumber];

        if (!record || record.lastDate !== today) {
            return { allowed: true, count: 0, limit, remaining: limit };
        }

        const count = record.count || 0;
        return {
            allowed: count < limit,
            count,
            limit,
            remaining: Math.max(0, limit - count)
        };
    }

    recordAccess(phoneNumber, pushName = "") {
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
        const limit = data.config?.maxDailyLimit ?? this.maxDailyLimit;
        const users = Object.entries(data.records || {})
            .map(([number, record]) => {
                const isToday = record.lastDate === today;
                const count = isToday ? record.count : 0;
                return {
                    number,
                    name: record.name || number,
                    countToday: count,
                    limit,
                    remaining: Math.max(0, limit - count),
                    status: count >= limit ? "LIMIT_REACHED" : count > 0 ? "ACTIVE" : "IDLE",
                    lastTimestamp: record.lastTimestamp
                };
            })
            .sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));

        return {
            today,
            maxDailyLimit: limit,
            totalUsers: users.length,
            activeToday: users.filter((u) => u.countToday > 0).length,
            users
        };
    }
}

const rateLimiter = new RateLimiter(5);

/* ============================================================
   SAFE UTILITIES
============================================================ */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function writeJson(file, value) {
    try {
        fs.writeFileSync(
            file,
            JSON.stringify(value, null, 2),
            "utf8"
        );
    } catch (err) {
        console.error("Failed writing", file, err.message);
    }
}

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        return safeJsonParse(
            fs.readFileSync(file, "utf8"),
            fallback
        );
    } catch {
        return fallback;
    }
}

function normalizeId(id) {
    if (!id) return null;

    if (typeof id === "string") {
        return id;
    }

    if (id._serialized) {
        return id._serialized;
    }

    if (id.user && id.server) {
        return `${id.user}@${id.server}`;
    }

    return null;
}

function isGroupId(id) {
    return typeof id === "string" && id.endsWith("@g.us");
}

function errorString(err) {
    if (!err) return "Unknown error";

    if (typeof err === "string") {
        return err;
    }

    return (
        err?.stack ||
        err?.message ||
        String(err)
    );
}

/* ============================================================
   LOGGING
============================================================ */

const logs = [];

function log(level, message, details = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        details
    };

    logs.unshift(entry);

    if (logs.length > 200) {
        logs.length = 200;
    }

    const line =
        `[${level}] ${message}` +
        (details ? ` ${JSON.stringify(details)}` : "");

    console.log(line);

    try {
        fs.appendFileSync(
            LOG_FILE,
            line + "\n",
            "utf8"
        );
    } catch {}
}

/* ============================================================
   SETTINGS
============================================================ */

const defaultSettings = {
    typingEnabled: true,
    minTypingMs: 1200,
    maxTypingMs: 3500,
    selectedGroups: ["ALL"]
};

let settings = {
    ...defaultSettings,
    ...readJson(SETTINGS_FILE, {})
};

function saveSettings() {
    writeJson(SETTINGS_FILE, settings);
}

/* ============================================================
   GROUP DATABASE
============================================================ */

/*
   IMPORTANT:

   We intentionally DO NOT use:

       client.getChats()

   because your installed whatsapp-web.js currently crashes
   inside window.WWebJS.getChats().

   Instead, groups are discovered through:

   1. Incoming messages
   2. Direct page-side WhatsApp stores when available
   3. Explicit group IDs
*/

const storedGroups = new Map();

function loadStoredGroups() {
    const data = readJson(GROUPS_FILE, {
        groups: []
    });

    if (!Array.isArray(data.groups)) {
        return;
    }

    for (const group of data.groups) {
        if (!group?.id) continue;

        storedGroups.set(group.id, {
            id: group.id,
            name: group.name || "Unnamed Group",
            participantCount: group.participantCount || 0,
            unreadCount: group.unreadCount || 0,
            lastSeen: group.lastSeen || null,
            source: group.source || "storage"
        });
    }
}

function saveStoredGroups() {
    writeJson(GROUPS_FILE, {
        updatedAt: new Date().toISOString(),
        groups: Array.from(storedGroups.values())
    });
}

loadStoredGroups();

function upsertGroup(group) {
    if (!group) return null;

    const id =
        normalizeId(group.id) ||
        normalizeId(group._serialized);

    if (!isGroupId(id)) {
        return null;
    }

    const existing = storedGroups.get(id) || {};

    const updated = {
        ...existing,
        id,

        name:
            group.name ||
            group.subject ||
            existing.name ||
            "Unnamed Group",

        participantCount:
            Number(
                group.participantCount ??
                group.participants?.length ??
                existing.participantCount ??
                0
            ),

        unreadCount:
            Number(
                group.unreadCount ??
                existing.unreadCount ??
                0
            ),

        lastSeen:
            new Date().toISOString(),

        source:
            group.source ||
            existing.source ||
            "runtime"
    };

    storedGroups.set(id, updated);

    saveStoredGroups();

    broadcast("GROUP_UPDATED", updated);

    return updated;
}

function getGroupList() {
    return Array.from(
        storedGroups.values()
    ).sort((a, b) =>
        String(a.name).localeCompare(
            String(b.name)
        )
    );
}

/* ============================================================
   WEBSOCKET
============================================================ */

const sockets = new Set();

function broadcast(event, data) {
    const payload = JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString()
    });

    for (const ws of sockets) {
        try {
            if (ws.readyState === 1) {
                ws.send(payload);
            }
        } catch {}
    }
}

function sendWS(ws, event, data) {
    try {
        if (ws.readyState === 1) {
            ws.send(
                JSON.stringify({
                    event,
                    data,
                    timestamp: new Date().toISOString()
                })
            );
        }
    } catch {}
}

/* ============================================================
   WHATSAPP CLIENT
============================================================ */

let client = null;

let agentStatus = "DISCONNECTED";
let qrCodeUrl = "";
let connectedPhone = "";

let initializing = false;

function setStatus(status, extra = {}) {
    agentStatus = status;

    broadcast(
        "STATUS_CHANGED",
        {
            status,
            ...extra
        }
    );
}

/* ============================================================
   CHROME DETECTION
============================================================ */

function findChrome() {
    const candidates = [];

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        candidates.push(
            process.env.PUPPETEER_EXECUTABLE_PATH
        );
    }

    if (process.platform === "win32") {
        candidates.push(
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Chromium\\Application\\chrome.exe"
        );
    }

    if (process.platform === "linux") {
        candidates.push(
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser"
        );
    }

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

/* ============================================================
   PAGE DIAGNOSTICS
============================================================ */

async function pageDiagnostics() {
    if (!client?.pupPage) {
        return {
            available: false
        };
    }

    try {
        const page = client.pupPage;

        const result = await page.evaluate(() => {
            const w = window;

            return {
                url: location.href,
                title: document.title,
                readyState: document.readyState,

                hasWWebJS:
                    typeof w.WWebJS !== "undefined",

                hasRequire:
                    typeof w.require === "function",

                bodyLength:
                    document.body?.innerText?.length || 0,

                roleListItems:
                    document.querySelectorAll(
                        '[role="listitem"]'
                    ).length,

                debugVersion:
                    w.Debug?.VERSION ||
                    w.Debug?.VERSION_BASE ||
                    null
            };
        });

        return {
            available: true,
            ...result
        };

    } catch (err) {
        return {
            available: false,
            error: errorString(err)
        };
    }
}

/* ============================================================
   SAFE PAGE EVALUATION
============================================================ */

async function safePageEvaluate(fn, ...args) {
    if (!client?.pupPage) {
        throw new Error(
            "WhatsApp page is not available"
        );
    }

    return client.pupPage.evaluate(
        fn,
        ...args
    );
}

/* ============================================================
   DIRECT GROUP DISCOVERY
============================================================ */

/*
   This is the important replacement for client.getChats().

   We first try the WhatsApp internal collections directly.

   This is deliberately defensive because WhatsApp changes
   internal module names over time.
*/

async function discoverGroupsFromPage() {
    if (!client?.pupPage) {
        return [];
    }

    try {
        const result = await safePageEvaluate(() => {
            const output = [];

            function add(value) {
                if (!value) return;

                let item = value;

                try {
                    if (
                        typeof item === "object" &&
                        item._models
                    ) {
                        item = item._models;
                    }

                    if (
                        typeof item === "object" &&
                        typeof item.getModelsArray === "function"
                    ) {
                        item =
                            item.getModelsArray();
                    }
                } catch {}
                
                if (Array.isArray(item)) {
                    for (const x of item) {
                        add(x);
                    }

                    return;
                }

                if (
                    typeof item !== "object" ||
                    !item
                ) {
                    return;
                }

                const id =
                    item.id?._serialized ||
                    item.id?.user && item.id?.server
                        ? `${item.id.user}@${item.id.server}`
                        : item.id;

                const serialized =
                    typeof id === "string"
                        ? id
                        : null;

                if (
                    serialized &&
                    serialized.endsWith("@g.us")
                ) {
                    output.push({
                        id: serialized,

                        name:
                            item.formattedTitle ||
                            item.name ||
                            item.subject ||
                            "Unnamed Group",

                        participantCount:
                            Array.isArray(
                                item.participants
                            )
                                ? item.participants.length
                                : 0
                    });
                }
            }

            /*
              Method A:
              WWebJS exists.
            */

            try {
                if (
                    typeof window.WWebJS !== "undefined"
                ) {
                    /*
                      Don't call WWebJS.getChats().
                      That is exactly the function crashing
                      on the user's installation.
                    */

                    const candidates = [
                        window.WWebJS.getChatModel,
                        window.WWebJS.getChats
                    ];

                    // getChats intentionally NOT called.
                    void candidates;
                }
            } catch {}

            /*
              Method B:
              WhatsApp module collections.
            */

            try {
                if (
                    typeof window.require === "function"
                ) {
                    const collections =
                        window.require(
                            "WAWebCollections"
                        );

                    if (collections) {

                        /*
                          Current whatsapp-web.js itself
                          uses WAWebCollections.Chat.
                        */

                        const chatStore =
                            collections.Chat;

                        if (chatStore) {
                            try {
                                if (
                                    typeof chatStore.getModelsArray ===
                                    "function"
                                ) {
                                    add(
                                        chatStore.getModelsArray()
                                    );
                                }
                            } catch {}

                            try {
                                if (
                                    Array.isArray(
                                        chatStore.models
                                    )
                                ) {
                                    add(
                                        chatStore.models
                                    );
                                }
                            } catch {}

                            try {
                                if (
                                    chatStore._models
                                ) {
                                    add(
                                        chatStore._models
                                    );
                                }
                            } catch {}
                        }
                    }
                }
            } catch {}

            /*
              Remove duplicates.
            */

            const map = new Map();

            for (const item of output) {
                if (!item.id) continue;

                if (!map.has(item.id)) {
                    map.set(
                        item.id,
                        item
                    );
                }
            }

            return Array.from(
                map.values()
            );
        });

        return Array.isArray(result)
            ? result
            : [];

    } catch (err) {
        log(
            "WARN",
            "Direct page group discovery failed",
            {
                error: errorString(err)
            }
        );

        return [];
    }
}

/* ============================================================
   GROUP SYNC
============================================================ */

let groupSyncRunning = false;

async function syncGroups() {

    if (groupSyncRunning) {
        log(
            "INFO",
            "Group synchronization already running"
        );

        return getGroupList();
    }

    if (
        !client ||
        agentStatus !== "CONNECTED"
    ) {
        log(
            "WARN",
            "Cannot synchronize groups: WhatsApp not connected"
        );

        return getGroupList();
    }

    groupSyncRunning = true;

    try {

        log(
            "INFO",
            "Starting safe group synchronization..."
        );

        /*
          NEVER call client.getChats() here.
        */

        const groups =
            await discoverGroupsFromPage();

        log(
            "INFO",
            `Direct WhatsApp group discovery returned ${groups.length} group(s)`
        );

        for (const group of groups) {
            upsertGroup({
                ...group,
                source: "whatsapp-page"
            });
        }

        const finalGroups =
            getGroupList();

        broadcast(
            "GROUPS_LIST",
            {
                groups: finalGroups,
                count: finalGroups.length
            }
        );

        log(
            "INFO",
            `Group database now contains ${finalGroups.length} group(s)`
        );

        return finalGroups;

    } catch (err) {

        log(
            "ERROR",
            "Safe group synchronization failed",
            {
                error: errorString(err)
            }
        );

        return getGroupList();

    } finally {
        groupSyncRunning = false;
    }
}

/* ============================================================
   FIND GROUP
============================================================ */

async function findGroup(groupId) {

    const normalized =
        normalizeId(groupId);

    if (!normalized) {
        throw new Error(
            "Invalid group ID"
        );
    }

    if (!isGroupId(normalized)) {
        throw new Error(
            "The supplied ID is not a WhatsApp group ID"
        );
    }

    /*
      Don't use client.getChatById().

      Your installation has the same class of issue
      affecting getChatById().
    */

    return normalized;
}

/* ============================================================
   TYPING
============================================================ */

async function showTyping(groupId, duration) {

    if (!settings.typingEnabled) {
        return;
    }

    if (!client?.pupPage) {
        return;
    }

    try {

        /*
          Prefer the documented Chat API if we can
          obtain a Chat object.

          But because getChatById() may be affected by
          the current WhatsApp Web regression, we use
          the underlying WWebJS chat-state function
          directly when available.
        */

        await safePageEvaluate(
            async (chatId) => {

                if (
                    window.WWebJS &&
                    typeof window.WWebJS.sendChatstate ===
                    "function"
                ) {
                    await window.WWebJS.sendChatstate(
                        "typing",
                        chatId
                    );

                    return true;
                }

                return false;
            },
            groupId
        );

    } catch (err) {

        log(
            "WARN",
            "Typing state failed",
            {
                groupId,
                error: errorString(err)
            }
        );
    }

    await sleep(duration);
}

/* ============================================================
   CLEAR TYPING
============================================================ */

async function clearTyping(groupId) {

    try {

        await safePageEvaluate(
            async (chatId) => {

                if (
                    window.WWebJS &&
                    typeof window.WWebJS.sendChatstate ===
                    "function"
                ) {
                    await window.WWebJS.sendChatstate(
                        "paused",
                        chatId
                    );

                    return true;
                }

                return false;
            },
            groupId
        );

    } catch {}
}

/* ============================================================
   SEND MESSAGE
============================================================ */

async function sendGroupMessage(
    groupId,
    text,
    options = {}
) {

    if (
        !client ||
        agentStatus !== "CONNECTED"
    ) {
        throw new Error(
            "WhatsApp is not connected"
        );
    }

    if (!text?.trim()) {
        throw new Error(
            "Message cannot be empty"
        );
    }

    const id =
        await findGroup(groupId);

    const min =
        Number(
            options.minTypingMs ??
            settings.minTypingMs
        );

    const max =
        Number(
            options.maxTypingMs ??
            settings.maxTypingMs
        );

    const typingMs =
        Math.max(
            0,
            Math.floor(
                min +
                Math.random() *
                Math.max(
                    0,
                    max - min
                )
            )
        );

    log(
        "INFO",
        `Preparing message for ${id}`,
        {
            typingMs,
            length: text.length
        }
    );

    try {

        await showTyping(
            id,
            typingMs
        );

        await clearTyping(id);

        /*
          whatsapp-web.js sendMessage accepts a chat ID.
          This avoids first calling getChatById().
        */

        const result =
            await client.sendMessage(
                id,
                text
            );

        log(
            "INFO",
            `Message sent to ${id}`
        );

        broadcast(
            "MESSAGE_SENT",
            {
                groupId: id,
                message: text
            }
        );

        return result;

    } catch (err) {

        await clearTyping(id);

        log(
            "ERROR",
            "Failed sending group message",
            {
                groupId: id,
                error: errorString(err)
            }
        );

        throw err;
    }
}

/* ============================================================
   MESSAGE CACHE
============================================================ */

const messageCache = new Map();

function cacheMessage(msg) {

    const id =
        msg?.id?._serialized ||
        `${msg?.timestamp || Date.now()}-${Math.random()}`;

    const item = {
        id,

        from:
            msg?.from || null,

        author:
            msg?.author || null,

        body:
            msg?.body || "",

        timestamp:
            msg?.timestamp || Date.now(),

        fromMe:
            Boolean(msg?.fromMe),

        type:
            msg?.type || "unknown"
    };

    messageCache.set(
        id,
        item
    );

    /*
      Keep only latest 1000 messages.
    */

    if (
        messageCache.size > 1000
    ) {

        const first =
            messageCache.keys().next().value;

        messageCache.delete(first);
    }

    return item;
}

/* ============================================================
   MESSAGE HANDLER
============================================================ */

const recentlySentBotMessages = new Set();

function extractTargetChatId(msg) {
    if (!msg) return null;
    const candidates = [
        msg.id?.remote,
        msg.from,
        msg.to,
        msg._data?.id?.remote,
        msg._data?.to,
        msg._data?.from
    ];

    for (const id of candidates) {
        if (typeof id === "string" && id.endsWith("@g.us")) {
            return id;
        }
    }

    for (const id of candidates) {
        if (typeof id === "string" && (id.endsWith("@c.us") || id.endsWith("@lid"))) {
            return id;
        }
    }

    return typeof msg.from === "string" ? msg.from : null;
}

/* ============================================================
   MESSAGE HANDLER
============================================================ */

async function handleMessage(msg) {
    try {
        if (!msg || !msg.body) return;

        const body = String(msg.body || "").trim();

        // 1. Skip if message is empty, starts with error prefix, or was sent by our bot
        if (body.startsWith("⚠️ HackAI") || recentlySentBotMessages.has(body)) {
            return;
        }

        // 2. Check trigger rule: @AI (case-insensitive)
        if (!/@ai\b/i.test(body)) {
            return;
        }

        const chatId = extractTargetChatId(msg);
        if (!chatId) return;

        const isGroup = chatId.endsWith("@g.us");

        log("INFO", `🎯 @AI trigger detected in ${isGroup ? "Group" : "Chat"}`, {
            chatId,
            sender: msg.author || msg.from,
            body: body.slice(0, 100)
        });

        // 3. Respect selected target groups if it's a group
        if (isGroup) {
            const selected = settings.selectedGroups || ["ALL"];
            if (!selected.includes("ALL") && !selected.includes(chatId)) {
                log("INFO", "AI trigger skipped: group is not in target selected groups", { chatId });
                return;
            }
        }

        // 4. Extract clean prompt
        const prompt = body.replace(/@ai\b/gi, "").trim();

        // 5. Rate limit check (5 responses / day per number)
        const rawSender = msg.author || msg.from || "unknown";
        const cleanSender = rawSender.replace(/[^0-9]/g, "");
        const pushName = msg._data?.notifyName || msg._data?.pushname || cleanSender;

        const rateCheck = rateLimiter.canAccess(cleanSender);
        if (!rateCheck.allowed) {
            log("WARN", `Rate limit exceeded for ${cleanSender} (${rateCheck.count}/${rateCheck.limit})`);
            await sendGroupMessage(chatId, `⚠️ Daily limit reached (${rateCheck.count}/${rateCheck.limit}). Resets at 00:00 UTC.`);
            return;
        }

        rateLimiter.recordAccess(cleanSender, pushName);
        broadcast("USAGE_UPDATED", rateLimiter.getUsageStats());

        // 6. Generate HackAI SDK response
        log("INFO", `Generating HackAI answer for ${pushName}...`);
        const aiReplyText = await generateAIResponse(prompt, pushName);

        // Track bot message to prevent self-looping
        recentlySentBotMessages.add(aiReplyText);
        setTimeout(() => recentlySentBotMessages.delete(aiReplyText), 60000);

        // 7. Send message to WhatsApp chat
        await sendGroupMessage(chatId, aiReplyText);

        log("INFO", `✅ HackAI reply sent successfully to ${chatId}`);
        broadcast("LOG_ADDED", {
            type: "AI_REPLY",
            message: `Replied to ${pushName} in ${chatId}`,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        log("ERROR", "Message processing error", { error: errorString(err) });
    }
}

/* ============================================================
   AI (HACKAI SDK EXCLUSIVE WITH DETAILED DEBUGGING)
============================================================ */

function extractTextFromResponse(res) {
    if (!res) return "";
    if (typeof res === "string") return res;
    if (res.text && typeof res.text === "string") return res.text;
    if (res.content && typeof res.content === "string") return res.content;
    if (res.message && typeof res.message === "string") return res.message;
    if (res.output && typeof res.output === "string") return res.output;
    if (res.response && typeof res.response === "string") return res.response;
    if (res.result && typeof res.result === "string") return res.result;
    if (res.choices?.[0]?.message?.content) return res.choices[0].message.content;
    if (res.choices?.[0]?.text) return res.choices[0].text;
    if (res.data && typeof res.data === "string") return res.data;
    return "";
}

async function generateAIResponse(prompt, senderName = "Friend") {
    const apiKey = process.env.HACKAI_API_KEY || "";

    log("INFO", "[AI CALL] Initiating generateAIResponse", {
        hasApiKey: Boolean(apiKey),
        senderName,
        promptLength: prompt?.length || 0,
        hackAiSdkLoaded: Boolean(hackAiSdk)
    });

    if (!apiKey) {
        log("WARN", "[AI CALL] Aborted: HACKAI_API_KEY is missing");
        return "⚠️ HackAI API Key is missing. Please set HACKAI_API_KEY in your .env file.";
    }

    const cleanPrompt = String(prompt).replace(/@ai\b/gi, "").trim() || "Hello";
    const systemInstruction = `You are a helpful, smart WhatsApp AI Assistant for ${senderName}. Keep your answers concise, natural, and helpful. Use WhatsApp markdown (*bold*, _italic_, • bullet points) where appropriate.`;

    try {
        let aiText = "";

        if (hackAiSdk) {
            log("INFO", "[AI CALL] Inspecting HackAI SDK exports", {
                keys: Object.keys(hackAiSdk),
                hasDefault: Boolean(hackAiSdk.default),
                hasClient: Boolean(hackAiSdk.Client),
                hasHackAI: Boolean(hackAiSdk.HackAI)
            });

            const SDKClient = hackAiSdk.Client || hackAiSdk.default || hackAiSdk.HackAI;
            
            if (typeof SDKClient === "function") {
                let clientInstance = null;
                try {
                    clientInstance = new SDKClient({ apiKey });
                } catch (instErr) {
                    try {
                        clientInstance = SDKClient({ apiKey });
                    } catch (fErr) {
                        log("WARN", "[AI CALL] SDKClient initialization failed", { error: fErr.message });
                    }
                }

                if (clientInstance) {
                    const methodNames = Object.keys(clientInstance).concat(
                        Object.getOwnPropertyNames(Object.getPrototypeOf(clientInstance) || {})
                    );

                    log("INFO", "[AI CALL] Client instance methods", { methods: methodNames });

                    // Try method 1: clientInstance.chat()
                    if (typeof clientInstance.chat === "function") {
                        try {
                            log("INFO", "[AI CALL] Calling clientInstance.chat()...");
                            const res = await clientInstance.chat({
                                apiKey,
                                system: systemInstruction,
                                prompt: cleanPrompt,
                                messages: [
                                    { role: "system", content: systemInstruction },
                                    { role: "user", content: cleanPrompt }
                                ]
                            });
                            log("INFO", "[AI CALL] clientInstance.chat() raw response", { raw: JSON.stringify(res)?.slice(0, 300) });
                            aiText = extractTextFromResponse(res);
                        } catch (err1) {
                            log("WARN", "[AI CALL] clientInstance.chat() failed", { error: err1.message });
                        }
                    }

                    // Try method 2: clientInstance.generateText()
                    if (!aiText && typeof clientInstance.generateText === "function") {
                        try {
                            log("INFO", "[AI CALL] Calling clientInstance.generateText()...");
                            const res = await clientInstance.generateText({ apiKey, system: systemInstruction, prompt: cleanPrompt });
                            log("INFO", "[AI CALL] clientInstance.generateText() raw response", { raw: JSON.stringify(res)?.slice(0, 300) });
                            aiText = extractTextFromResponse(res);
                        } catch (err2) {
                            log("WARN", "[AI CALL] clientInstance.generateText() failed", { error: err2.message });
                        }
                    }

                    // Try method 3: clientInstance.chat.completions.create()
                    if (!aiText && clientInstance.chat?.completions?.create) {
                        try {
                            log("INFO", "[AI CALL] Calling clientInstance.chat.completions.create()...");
                            const res = await clientInstance.chat.completions.create({
                                messages: [
                                    { role: "system", content: systemInstruction },
                                    { role: "user", content: cleanPrompt }
                                ]
                            });
                            log("INFO", "[AI CALL] completions.create() raw response", { raw: JSON.stringify(res)?.slice(0, 300) });
                            aiText = extractTextFromResponse(res);
                        } catch (err3) {
                            log("WARN", "[AI CALL] completions.create() failed", { error: err3.message });
                        }
                    }
                }
            }

            // Direct SDK functions: hackAiSdk.generateText / hackAiSdk.chat
            if (!aiText && typeof hackAiSdk.generateText === "function") {
                try {
                    log("INFO", "[AI CALL] Calling hackAiSdk.generateText()...");
                    const res = await hackAiSdk.generateText({ apiKey, system: systemInstruction, prompt: cleanPrompt });
                    log("INFO", "[AI CALL] hackAiSdk.generateText() raw response", { raw: JSON.stringify(res)?.slice(0, 300) });
                    aiText = extractTextFromResponse(res);
                } catch (err4) {
                    log("WARN", "[AI CALL] hackAiSdk.generateText() failed", { error: err4.message });
                }
            }

            if (!aiText && typeof hackAiSdk.chat === "function") {
                try {
                    log("INFO", "[AI CALL] Calling hackAiSdk.chat()...");
                    const res = await hackAiSdk.chat({ apiKey, system: systemInstruction, prompt: cleanPrompt });
                    log("INFO", "[AI CALL] hackAiSdk.chat() raw response", { raw: JSON.stringify(res)?.slice(0, 300) });
                    aiText = extractTextFromResponse(res);
                } catch (err5) {
                    log("WARN", "[AI CALL] hackAiSdk.chat() failed", { error: err5.message });
                }
            }
        }

        // Direct HTTP fallback if SDK returned empty
        if (!aiText) {
            log("INFO", "[AI CALL] Attempting HTTP fallback API call...");
            const endpoints = [
                "https://api.hackai.io/v1/chat/completions",
                "https://api.hackai.dev/v1/chat/completions"
            ];

            for (const endpoint of endpoints) {
                try {
                    log("INFO", `[AI CALL] Trying HTTP endpoint: ${endpoint}`);
                    const httpRes = await fetch(endpoint, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: "hackai-v1",
                            messages: [
                                { role: "system", content: systemInstruction },
                                { role: "user", content: cleanPrompt }
                            ]
                        })
                    });

                    log("INFO", `[AI CALL] HTTP status from ${endpoint}: ${httpRes.status}`);
                    if (httpRes.ok) {
                        const data = await httpRes.json();
                        log("INFO", `[AI CALL] HTTP JSON response`, { data: JSON.stringify(data)?.slice(0, 300) });
                        aiText = extractTextFromResponse(data);
                        if (aiText) break;
                    }
                } catch (fetchErr) {
                    log("WARN", `[AI CALL] HTTP endpoint ${endpoint} failed: ${fetchErr.message}`);
                }
            }
        }

        if (aiText && typeof aiText === "string") {
            log("INFO", `[AI CALL] ✅ Successfully generated AI response (${aiText.length} chars)`, {
                preview: aiText.slice(0, 100)
            });
            return aiText.trim();
        }

        log("ERROR", "[AI CALL] ❌ All AI generation methods returned empty response");
        throw new Error("HackAI SDK returned empty response");
    } catch (error) {
        log("ERROR", "[AI CALL] HackAI Generation Exception", { error: error.message, stack: error.stack });
        return `⚠️ HackAI Generation Failed: ${error.message || "Unknown error"}`;
    }
}

/* ============================================================
   CONNECTION DIAGNOSTICS
============================================================ */

async function diagnostics() {

    console.log(
        "\n========== WHATSAPP DIAGNOSTICS =========="
    );

    console.log(
        "Status:",
        agentStatus
    );

    console.log(
        "User:",
        client?.info?.wid?._serialized ||
        "unknown"
    );

    console.log(
        "Push name:",
        client?.info?.pushname ||
        "unknown"
    );

    console.log(
        "Cached groups:",
        storedGroups.size
    );

    console.log(
        "Auth:",
        AUTH_DIR
    );

    const page =
        await pageDiagnostics();

    console.log(
        "Page:",
        page
    );

    console.log(
        "===========================================\n"
    );

    broadcast(
        "DIAGNOSTICS",
        {
            status: agentStatus,
            user:
                client?.info?.wid?._serialized ||
                null,
            pushName:
                client?.info?.pushname ||
                null,
            groups:
                storedGroups.size,
            page
        }
    );

    return page;
}

/* ============================================================
   WHATSAPP INITIALIZATION
============================================================ */

async function initWhatsApp() {

    if (
        initializing ||
        client
    ) {
        log(
            "INFO",
            "WhatsApp client already initialized"
        );

        return;
    }

    initializing = true;

    setStatus(
        "INITIALIZING"
    );

    const chromePath =
        findChrome();

    log(
        "INFO",
        "Initializing WhatsApp Web client...",
        {
            chromePath,
            authDir: AUTH_DIR
        }
    );

    try {

        client =
            new Client({

                authStrategy:
                    new LocalAuth({
                        dataPath:
                            AUTH_DIR
                    }),

                puppeteer: {

                    headless:
                        true,

                    executablePath:
                        chromePath,

                    args: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--disable-features=Translate,BackForwardCache",
                        "--no-first-run",
                        "--no-default-browser-check"
                    ]
                }
            });

        /* -----------------------------------------
           QR
        ----------------------------------------- */

        client.on(
            "qr",
            async qrRaw => {

                try {

                    qrCodeUrl =
                        await qrcode.toDataURL(
                            qrRaw
                        );

                    setStatus(
                        "QR_READY"
                    );

                    broadcast(
                        "QR_CODE",
                        {
                            qr:
                                qrCodeUrl
                        }
                    );

                    log(
                        "INFO",
                        "New WhatsApp QR generated"
                    );

                } catch (err) {

                    log(
                        "ERROR",
                        "QR generation failed",
                        {
                            error:
                                errorString(err)
                        }
                    );
                }
            }
        );

        /* -----------------------------------------
           AUTHENTICATED
        ----------------------------------------- */

        client.on(
            "authenticated",
            () => {

                qrCodeUrl = "";

                log(
                    "INFO",
                    "WhatsApp authenticated"
                );

                broadcast(
                    "AUTHENTICATED",
                    {}
                );
            }
        );

        /* -----------------------------------------
           AUTH FAILURE
        ----------------------------------------- */

        client.on(
            "auth_failure",
            reason => {

                setStatus(
                    "ERROR",
                    {
                        error:
                            String(reason)
                    }
                );

                log(
                    "ERROR",
                    "WhatsApp authentication failure",
                    {
                        reason:
                            String(reason)
                    }
                );
            }
        );

        /* -----------------------------------------
           READY
        ----------------------------------------- */

        client.on(
            "ready",
            async () => {

                setStatus(
                    "CONNECTED"
                );

                qrCodeUrl = "";

                connectedPhone =
                    client?.info?.wid?.user ||
                    "";

                log(
                    "INFO",
                    "WhatsApp Web is READY",
                    {
                        phone:
                            connectedPhone
                    }
                );

                broadcast(
                    "READY",
                    {
                        phone:
                            connectedPhone
                    }
                );

                /*
                  Give WhatsApp Web a moment to finish
                  page initialization.

                  IMPORTANT:
                  We do NOT call client.getChats().
                */

                await sleep(5000);

                await diagnostics();

                /*
                  Try direct store discovery.
                */

                await syncGroups();

                /*
                  Continue periodically.

                  60 seconds is enough; there is no reason
                  to hammer WhatsApp.
                */

                startGroupSyncLoop();
            }
        );

        /* -----------------------------------------
           MESSAGE
        ----------------------------------------- */

        client.on(
            "message",
            handleMessage
        );

        /*
          message_create also sees our own messages.
        */

        client.on(
            "message_create",
            handleMessage
        );

        /* -----------------------------------------
           DISCONNECTED
        ----------------------------------------- */

        client.on(
            "disconnected",
            reason => {

                log(
                    "ERROR",
                    "WhatsApp disconnected",
                    {
                        reason:
                            String(reason)
                    }
                );

                setStatus(
                    "DISCONNECTED",
                    {
                        reason:
                            String(reason)
                    }
                );

                connectedPhone = "";

                stopGroupSyncLoop();

                client = null;
                initializing = false;
            }
        );

        /* -----------------------------------------
           STATE CHANGE
        ----------------------------------------- */

        client.on(
            "change_state",
            state => {

                log(
                    "INFO",
                    `WhatsApp state changed: ${state}`
                );

                broadcast(
                    "WHATSAPP_STATE",
                    {
                        state
                    }
                );
            }
        );

        /* -----------------------------------------
           INITIALIZE
        ----------------------------------------- */

        await client.initialize();

    } catch (err) {

        log(
            "ERROR",
            "WhatsApp initialization failed",
            {
                error:
                    errorString(err)
            }
        );

        setStatus(
            "ERROR",
            {
                error:
                    errorString(err)
            }
        );

        try {
            await client?.destroy();
        } catch {}

        client = null;

    } finally {

        initializing = false;
    }
}

/* ============================================================
   GROUP SYNC LOOP
============================================================ */

let groupSyncTimer = null;

function startGroupSyncLoop() {

    stopGroupSyncLoop();

    groupSyncTimer =
        setInterval(
            async () => {

                if (
                    agentStatus !==
                    "CONNECTED"
                ) {
                    return;
                }

                await syncGroups();

            },
            60_000
        );
}

function stopGroupSyncLoop() {

    if (groupSyncTimer) {

        clearInterval(
            groupSyncTimer
        );

        groupSyncTimer = null;
    }
}

/* ============================================================
   EXPRESS
============================================================ */

const app =
    express();

app.use(
    express.json({
        limit: "1mb"
    })
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

/* ============================================================
   REST API
============================================================ */

app.get(
    "/api/status",
    async (req, res) => {

        res.json({
            status:
                agentStatus,

            phone:
                connectedPhone,

            authenticated:
                Boolean(
                    client?.info
                ),

            groups:
                getGroupList(),

            selectedGroups:
                settings.selectedGroups
        });
    }
);

app.get(
    "/api/groups",
    async (req, res) => {

        /*
          Do not call getChats().
        */

        const groups =
            getGroupList();

        res.json({
            success: true,
            count:
                groups.length,
            groups
        });
    }
);

app.post(
    "/api/groups/sync",
    async (req, res) => {

        try {

            const groups =
                await syncGroups();

            res.json({
                success: true,
                count:
                    groups.length,
                groups
            });

        } catch (err) {

            res.status(500).json({
                success: false,
                error:
                    errorString(err)
            });
        }
    }
);

app.post(
    "/api/groups/select",
    (req, res) => {

        const groups =
            req.body?.groups;

        if (
            !Array.isArray(groups)
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "groups must be an array"
            });
        }

        settings.selectedGroups =
            groups;

        saveSettings();

        broadcast(
            "SELECTED_GROUPS_UPDATED",
            {
                selectedGroups:
                    settings.selectedGroups
            }
        );

        res.json({
            success: true,
            selectedGroups:
                settings.selectedGroups
        });
    }
);

app.post(
    "/api/groups/send",
    async (req, res) => {

        try {

            const {
                groupId,
                message,
                typingMs
            } = req.body || {};

            if (!groupId) {
                return res.status(400).json({
                    success: false,
                    error:
                        "groupId is required"
                });
            }

            if (!message) {
                return res.status(400).json({
                    success: false,
                    error:
                        "message is required"
                });
            }

            await sendGroupMessage(
                groupId,
                message,
                {
                    minTypingMs:
                        typingMs ||
                        settings.minTypingMs,

                    maxTypingMs:
                        typingMs ||
                        settings.maxTypingMs
                }
            );

            res.json({
                success: true,
                groupId,
                message
            });

        } catch (err) {

            res.status(500).json({
                success: false,
                error:
                    errorString(err)
            });
        }
    }
);

app.get(
    "/api/diagnostics",
    async (req, res) => {

        const page =
            await pageDiagnostics();

        res.json({
            status:
                agentStatus,

            phone:
                connectedPhone,

            groups:
                getGroupList(),

            page
        });
    }
);

app.post(
    "/api/connect",
    async (req, res) => {

        initWhatsApp();

        res.json({
            success: true,
            status:
                agentStatus
        });
    }
);

app.post(
    "/api/disconnect",
    async (req, res) => {

        try {

            stopGroupSyncLoop();

            if (client) {

                await client.logout()
                    .catch(() => {});

                await client.destroy()
                    .catch(() => {});
            }

        } catch {}

        client = null;

        setStatus(
            "DISCONNECTED"
        );

        res.json({
            success: true
        });
    }
);

/* ============================================================
   HTTP + WS
============================================================ */

const server =
    http.createServer(
        app
    );

const wss =
    new WebSocketServer({
        server
    });

wss.on(
    "connection",
    async ws => {

        sockets.add(ws);

        log(
            "INFO",
            "Dashboard WebSocket connected"
        );

        sendWS(
            ws,
            "INITIAL_STATE",
            {
                status: {
                    status:
                        agentStatus,

                    qrCodeUrl,

                    userPhone:
                        connectedPhone
                },

                groups:
                    getGroupList(),

                selectedGroups:
                    settings.selectedGroups,

                selectedGroupIds:
                    settings.selectedGroups,

                logs:
                    logs.slice(
                        0,
                        50
                    )
            }
        );

        ws.on(
            "message",
            async buffer => {

                try {

                    const request =
                        JSON.parse(
                            buffer.toString()
                        );

                    const action =
                        request.action;

                    const payload =
                        request.payload ||
                        {};

                    /* -------------------------
                       CONNECT
                    ------------------------- */

                    if (
                        action ===
                        "CONNECT"
                    ) {

                        await initWhatsApp();

                        return;
                    }

                    /* -------------------------
                       DISCONNECT
                    ------------------------- */

                    if (
                        action ===
                        "DISCONNECT"
                    ) {

                        try {

                            await client
                                ?.logout()
                                .catch(
                                    () => {}
                                );

                            await client
                                ?.destroy()
                                .catch(
                                    () => {}
                                );

                        } catch {}

                        client = null;

                        stopGroupSyncLoop();

                        setStatus(
                            "DISCONNECTED"
                        );

                        return;
                    }

                    /* -------------------------
                       FETCH GROUPS
                    ------------------------- */

                    if (
                        action ===
                        "FETCH_GROUPS"
                    ) {

                        /*
                          Safe sync only.
                          No client.getChats().
                        */

                        const groups =
                            await syncGroups();

                        sendWS(
                            ws,
                            "GROUPS_LIST",
                            {
                                groups
                            }
                        );

                        return;
                    }

                    /* -------------------------
                       SELECT GROUPS
                    ------------------------- */

                    if (
                        action ===
                        "SET_SELECTED_GROUPS"
                    ) {

                        if (
                            !Array.isArray(
                                payload.groups
                            )
                        ) {
                            throw new Error(
                                "groups must be an array"
                            );
                        }

                        settings.selectedGroups =
                            payload.groups;

                        saveSettings();

                        broadcast(
                            "SELECTED_GROUPS_UPDATED",
                            {
                                selectedGroups:
                                    settings.selectedGroups,
                                selectedGroupIds:
                                    settings.selectedGroups
                            }
                        );

                        return;
                    }

                    /* -------------------------
                       SEND GROUP MESSAGE
                    ------------------------- */

                    if (
                        action ===
                        "SEND_GROUP_MESSAGE"
                    ) {

                        const groupId =
                            payload.groupId;

                        const message =
                            payload.message;

                        if (
                            !groupId ||
                            !message
                        ) {
                            throw new Error(
                                "groupId and message are required"
                            );
                        }

                        await sendGroupMessage(
                            groupId,
                            message,
                            payload
                        );

                        return;
                    }

                    /* -------------------------
                       DIAGNOSTICS
                    ------------------------- */

                    if (
                        action ===
                        "DIAGNOSTICS"
                    ) {

                        const page =
                            await diagnostics();

                        sendWS(
                            ws,
                            "DIAGNOSTICS",
                            {
                                page,
                                groups:
                                    getGroupList()
                            }
                        );

                        return;
                    }

                } catch (err) {

                    log(
                        "ERROR",
                        "WebSocket action failed",
                        {
                            error:
                                errorString(err)
                        }
                    );

                    sendWS(
                        ws,
                        "ERROR",
                        {
                            error:
                                errorString(err)
                        }
                    );
                }
            }
        );

        ws.on(
            "close",
            () => {

                sockets.delete(
                    ws
                );

                log(
                    "INFO",
                    "Dashboard WebSocket disconnected"
                );
            }
        );
    }
);

/* ============================================================
   SPA FALLBACK
============================================================ */

if (
    fs.existsSync(
        path.join(
            DIST_DIR,
            "index.html"
        )
    )
) {

    app.get(
        "*",
        (req, res) => {

            res.sendFile(
                path.join(
                    DIST_DIR,
                    "index.html"
                )
            );
        }
    );
}

/* ============================================================
   START SERVER
============================================================ */

server.listen(
    PORT,
    () => {

        console.log(
            "\n=============================================="
        );

        console.log(
            "🚀 WhatsApp Web AI Agent"
        );

        console.log(
            `🌐 http://localhost:${PORT}`
        );

        console.log(
            `📁 Auth: ${AUTH_DIR}`
        );

        console.log(
            `📁 Data: ${DATA_DIR}`
        );

        console.log(
            "==============================================\n"
        );

        /*
          Start WhatsApp automatically.
        */

        initWhatsApp()
            .catch(err => {

                log(
                    "ERROR",
                    "Automatic WhatsApp startup failed",
                    {
                        error:
                            errorString(err)
                    }
                );
            });
    }
);

/* ============================================================
   GLOBAL ERROR PROTECTION
============================================================ */

process.on(
    "unhandledRejection",
    reason => {

        log(
            "ERROR",
            "Unhandled promise rejection",
            {
                error:
                    errorString(reason)
            }
        );
    }
);

process.on(
    "uncaughtException",
    err => {

        log(
            "ERROR",
            "Uncaught exception",
            {
                error:
                    errorString(err)
            }
        );
    }
);