# 24/7 WhatsApp AI Agent Persistent Background Runner Dockerfile
FROM node:20-slim

# Install Chromium and headless browser dependencies for WhatsApp Web
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer executable path to system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PORT=3001

WORKDIR /app

# Copy package files and install dependencies via pnpm
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy project source code
COPY . .

# Build frontend dashboard
RUN pnpm run build

# Expose port
EXPOSE 3001

# Start persistent Node.js WhatsApp runner
CMD ["node", "server/index.js"]
