class AntiBanEngine {
  constructor() {
    this.minDelayMs = 2500;  // 2.5 seconds minimum delay
    this.maxDelayMs = 5500;  // 5.5 seconds maximum delay
    this.enableTypingSimulation = true;
    this.maxMessagesPerMinute = 12;
    this.messageTimestamps = [];
  }

  setSettings(minDelay, maxDelay, enableTyping, maxPerMin) {
    if (minDelay !== undefined) this.minDelayMs = Math.max(1000, Number(minDelay));
    if (maxDelay !== undefined) this.maxDelayMs = Math.max(this.minDelayMs, Number(maxDelay));
    if (enableTyping !== undefined) this.enableTypingSimulation = Boolean(enableTyping);
    if (maxPerMin !== undefined) this.maxMessagesPerMinute = Math.max(3, Number(maxPerMin));
  }

  getSettings() {
    return {
      minDelayMs: this.minDelayMs,
      maxDelayMs: this.maxDelayMs,
      enableTypingSimulation: this.enableTypingSimulation,
      maxMessagesPerMinute: this.maxMessagesPerMinute
    };
  }

  getRandomJitter() {
    return Math.floor(Math.random() * (this.maxDelayMs - this.minDelayMs + 1)) + this.minDelayMs;
  }

  checkGlobalThrottle() {
    const now = Date.now();
    // Keep timestamps from the last 60 seconds
    this.messageTimestamps = this.messageTimestamps.filter(ts => now - ts < 60000);

    if (this.messageTimestamps.length >= this.maxMessagesPerMinute) {
      console.warn(`[Anti-Ban Protection] Throttle triggered! (${this.messageTimestamps.length}/${this.maxMessagesPerMinute} msgs in last minute). Pausing output.`);
      return false; // Throttled
    }

    this.messageTimestamps.push(now);
    return true; // Safe to proceed
  }

  async executeAntiBanRoutine(chat, textToLength = 50) {
    // 1. Check global rate limit protection
    if (!this.checkGlobalThrottle()) {
      console.log('[Anti-Ban] Waiting 6 seconds for global throttle cooldown...');
      await new Promise(res => setTimeout(res, 6000));
    }

    // 2. Calculate dynamic human typing duration based on response length
    const jitterDelay = this.getRandomJitter();
    const typingDuration = Math.min(jitterDelay, Math.max(1500, textToLength * 35));

    if (this.enableTypingSimulation && chat && typeof chat.sendStateTyping === 'function') {
      try {
        await chat.sendStateTyping();
      } catch (err) {
        // Safe swallow if typing status non-critical
      }
    }

    // 3. Pause for realistic human typing delay
    await new Promise(resolve => setTimeout(resolve, typingDuration));

    if (this.enableTypingSimulation && chat && typeof chat.clearState === 'function') {
      try {
        await chat.clearState();
      } catch (err) {}
    }
  }
}

export default new AntiBanEngine();
