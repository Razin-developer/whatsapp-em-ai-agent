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

async function handleMessage(msg) {

    try {

        const from =
            msg?.from || null;

        /*
          Group messages have @g.us IDs.
        */

        if (
            !isGroupId(from)
        ) {
            return;
        }

        const body =
            String(msg?.body || "");

        /*
          Cache immediately.

          We do NOT call msg.getChat().
        */

        const cached =
            cacheMessage(msg);

        /*
          Discover the group directly from
          message metadata.
        */

        let groupName =
            "WhatsApp Group";

        /*
          Sometimes _data contains chat information.
        */

        try {

            groupName =
                msg?._data?.chat?.name ||
                msg?._data?.chat?.formattedTitle ||
                msg?._data?.chat?.subject ||
                groupName;

        } catch {}

        const group =
            upsertGroup({
                id: from,
                name: groupName,
                source: "message"
            });

        broadcast(
            "GROUP_MESSAGE",
            {
                group,
                message: cached
            }
        );

        log(
            "INFO",
            `Group message received: ${groupName}`,
            {
                groupId: from,
                body: body.slice(0, 200)
            }
        );

        /*
          Optional AI trigger.
        */

        if (
            !/@(?:ai|em)\b/i.test(body)
        ) {
            return;
        }

        /*
          Respect selected groups.
        */

        const selected =
            settings.selectedGroups || ["ALL"];

        if (
            !selected.includes("ALL") &&
            !selected.includes(from)
        ) {
            log(
                "INFO",
                "AI trigger ignored because group is not selected",
                {
                    groupId: from
                }
            );

            return;
        }

        log(
            "INFO",
            "AI trigger detected",
            {
                groupId: from,
                message: body
            }
        );

        /*
          Placeholder AI response.

          Replace generateAIResponse() with your
          HackAI implementation.
        */

        const response =
            await generateAIResponse(
                body
            );

        if (!response) {
            return;
        }

        await sendGroupMessage(
            from,
            response
        );

    } catch (err) {

        log(
            "ERROR",
            "Message handler failed",
            {
                error: errorString(err)
            }
        );
    }
}

/* ============================================================
   AI
============================================================ */

async function generateAIResponse(prompt) {

    const cleaned =
        String(prompt)
            .replace(/@(?:ai|em)\b/gi, "")
            .trim();

    if (!cleaned) {
        return "Hey! 👋";
    }

    /*
      If HackAI SDK is installed, you can plug your
      existing SDK here.

      This intentionally does not pretend to know the
      exact API of your private package.
    */

    if (
        process.env.HACKAI_API_KEY
    ) {

        try {

            /*
              Keep your existing SDK/API implementation
              here if needed.
            */

            const response =
                await fetch(
                    "https://api.openai.com/v1/chat/completions",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${process.env.HACKAI_API_KEY}`
                        },

                        body: JSON.stringify({
                            model:
                                process.env.AI_MODEL ||
                                "gpt-4o-mini",

                            messages: [
                                {
                                    role: "system",
                                    content:
                                        "You are a helpful WhatsApp group assistant. Be concise and natural."
                                },
                                {
                                    role: "user",
                                    content:
                                        cleaned
                                }
                            ],

                            max_tokens: 300
                        })
                    }
                );

            if (response.ok) {

                const data =
                    await response.json();

                const text =
                    data?.choices?.[0]
                        ?.message
                        ?.content
                        ?.trim();

                if (text) {
                    return text;
                }
            }

        } catch (err) {

            log(
                "WARN",
                "AI request failed",
                {
                    error:
                        errorString(err)
                }
            );
        }
    }

    return (
        `🤖 I received: "${cleaned.slice(0, 150)}"`
    );
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
            msg => {

                if (
                    msg?.fromMe
                ) {
                    log(
                        "INFO",
                        "Outgoing message observed",
                        {
                            chatId:
                                msg?.from
                        }
                    );
                }
            }
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