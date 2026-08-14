# 🤖 WhatsApp @EM AI Agent & Web Dashboard (100% Local Setup)

An automated WhatsApp Web AI Agent powered by `@razinmohammedpt/hackai-sdk`, `whatsapp-web.js`, and `Headless Chrome`. It triggers when anyone mentions `@` and `EM` (e.g. `@EM`, `@bot EM`) or tags the bot in WhatsApp group/direct chats, responds with human-like answers (or high detail when requested), enforces a strict **5 responses per phone number per day** limit, and includes comprehensive **Anti-Ban safety protections**.

---

## 🌟 Core Features

- ⚡ **Trigger Activation Rule**: Listens for any message containing `@` + `EM` (e.g., `@EM`, `@bot EM`, tagging the bot in groups).
- 🧠 **AI Powered by HackAI SDK (`@razinmohammedpt/hackai-sdk`)**: Smart Auto-Detect Response Engine (short human answers for simple queries, detailed answers for complex requests).
- 🛑 **Per-Number Access Control (Max 5/Day)**: Strictly caps access to 5 AI interactions per phone number per day (resets at 00:00 UTC).
- 🛡️ **Anti-Ban Safety System**:
  - Simulated human typing status indicator (`typing...`).
  - Randomized typing jitter delays (2.5s – 5.5s).
  - Global message rate throttling across chats.
- 📊 **Local Web Dashboard & Setup Wizard**:
  - WhatsApp Web QR code pairing wizard.
  - Live status indicator & WhatsApp user info.
  - Per-number usage table (Quota remaining, 5/5 max limit badges).
  - Anti-ban delay & AI behavior configuration controls.
  - Test Mention Simulator for instant offline testing.

---

## 🚀 Quick Start (Single Shortcut Command)

### 1. Configure Environment Variables (`.env`)
Your `.env` file is preconfigured with your HackAI API key:
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
*(Or `pnpm start` / `pnpm run dev`)*

This single command builds the dashboard UI and launches the server at:
👉 **`http://localhost:3001`**

### 3. Connect WhatsApp & Start Using
1. Open **`http://localhost:3001`** in your browser.
2. Click **Connect WhatsApp Account Now**.
3. Open **WhatsApp** on your phone → **Linked Devices** → **Link a Device**.
4. Scan the QR code displayed on the dashboard screen!
5. Once connected, tag the bot with `@EM` in any group chat to start receiving AI answers!

---

## 📄 License
MIT License
