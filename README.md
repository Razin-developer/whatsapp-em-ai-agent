# 🤖 WhatsApp AI Agent & Web Dashboard (100% Local Setup)

An automated WhatsApp Web AI Agent powered by `@razinmohammedpt/hackai-sdk`, `whatsapp-web.js`, and `Headless Chrome`. It triggers when anyone mentions `@AI` (e.g. `@AI`, `@Ai`, `@ai`) in target WhatsApp group or direct chats, responds with human-like answers (or high detail when requested), enforces a strict **5 responses per phone number per day** limit, and includes comprehensive **Anti-Ban safety protections**.

---

## 🌟 Core Features

- ⚡ **Trigger Activation Rule**: Listens for `@AI` (case insensitive: `@AI`, `@Ai`, `@aI`, `@ai`).
- 👥 **Real WhatsApp Group Selection**: Choose target WhatsApp groups with search and individual/bulk group toggles.
- 🧠 **AI Powered by HackAI SDK (`@razinmohammedpt/hackai-sdk`)**: Smart Auto-Detect Response Engine.
- 🛑 **Per-Number Access Control (Max 5/Day)**: Strictly caps access to 5 AI interactions per phone number per day (resets at 00:00 UTC).
- 🛡️ **Anti-Ban Safety System**:
  - Simulated human typing status indicator (`typing...`).
  - Randomized typing jitter delays (2.5s – 5.5s).
  - Global message rate throttling across chats.

---

## 🚀 Quick Start (Single Shortcut Command)

### 1. Configure Environment Variables (`.env`)
```env
PORT=3001
HACKAI_API_KEY=your_hackai_api_key_here
AI_RESPONSE_MODE=AUTO
MIN_TYPING_DELAY_MS=2500
MAX_TYPING_DELAY_MS=5500
MAX_DAILY_LIMIT=5
```

### 2. Start Everything with One Shortcut Command
Run either `npm start` or `pnpm start`:
```bash
npm start
```

This single command builds the dashboard UI and launches the server at:
👉 **`http://localhost:3001`**

### 3. Connect WhatsApp & Start Using
1. Open **`http://localhost:3001`** in your browser.
2. Click **Connect WhatsApp Account Now**.
3. Open **WhatsApp** on your phone → **Linked Devices** → **Link a Device**.
4. Scan the QR code displayed on the dashboard screen!
5. Select target groups and start typing **`@AI`** in any group to get instant AI answers!

---

## 📄 License
MIT License
