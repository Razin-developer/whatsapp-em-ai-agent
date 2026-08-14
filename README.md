# 🤖 WhatsApp @EM AI Agent & Web Dashboard

An automated WhatsApp Web AI Agent powered by `@razinmohammedpt/hackai-sdk`, `whatsapp-web.js`, and `Playwright`. It triggers when anyone mentions `@` and `EM` (e.g. `@EM`, `@bot EM`) in WhatsApp chats, responds with human-like concise replies, enforces a strict **5 responses per phone number per day** limit, and includes comprehensive **Anti-Ban safety protections**.

---

## 🌟 Key Features

- ⚡ **Trigger Activation Rule**: Listens for any message containing `@` + `EM` (e.g., `@EM`, `@bot EM`, `@someone EM`).
- 🤖 **AI Powered by HackAI SDK (`@razinmohammedpt/hackai-sdk`)**: Short, natural, human-like response generation with option for high detail expansion.
- 🛑 **Per-Number Access Control (Max 5/Day)**: Strictly caps access to 5 AI interactions per phone number per day to prevent abuse and spam.
- 🛡️ **Anti-Ban Protection System**:
  - Simulated human typing status indicator (`typing...`).
  - Randomized typing jitter delays (2.5s – 5.5s).
  - Global message rate throttling across chats.
- 📊 **Real-Time Web Dashboard**:
  - WhatsApp Web QR code pairing modal.
  - Live status indicator & WhatsApp user info.
  - Per-number usage table (Quota remaining, 5/5 max badges).
  - Anti-ban delay & AI behavior configuration controls.
  - Real-time streaming log feed via WebSockets.
  - Test Mention Simulator for offline testing.

---

## 🚀 Quick Start Guide (Local Setup)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your `HACKAI_API_KEY` (if applicable).

### 3. Start Dashboard & Agent Server
```bash
pnpm run server
```
Access the Dashboard at: **`http://localhost:3001`**

### 4. Connect WhatsApp
1. Click **Connect WhatsApp** or open the **QR Code Modal** on the dashboard.
2. Open **WhatsApp** on your phone → **Linked Devices** → **Link a Device**.
3. Scan the QR code displayed on the dashboard.
4. Once connected, send a test message on WhatsApp: `@EM explain black holes`!

---

## 🛠️ GitHub & Vercel Deployment Instructions

### Option 1: Deploying Dashboard to Vercel
1. Push this repository to **GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - WhatsApp EM AI Agent"
   git remote add origin https://github.com/YOUR_USERNAME/whatsapp-em-ai-agent.git
   git push -u origin main
   ```
2. Go to [Vercel](https://vercel.com) → **Add New Project** → Import your GitHub repository.
3. Vercel automatically detects `vite` configuration via `vercel.json`. Click **Deploy**.

### Option 2: Running the WhatsApp Agent Engine
WhatsApp Web uses Playwright/Chromium browser automation. Run the background server process on any persistent host (local PC, Railway, Render, Docker, or VPS):
```bash
pnpm run server
```

---

## 📄 License
MIT License
