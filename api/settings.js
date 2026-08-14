import rateLimiter from '../server/rateLimiter.js';
import aiService from '../server/aiService.js';
import antiBan from '../server/antiBan.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { aiMode, maxDailyLimit, antiBanMinDelay, antiBanMaxDelay, enableTyping } = req.body || {};

    if (aiMode) aiService.setMode(aiMode);
    if (maxDailyLimit) rateLimiter.setDailyLimit(maxDailyLimit);
    if (antiBanMinDelay !== undefined || antiBanMaxDelay !== undefined || enableTyping !== undefined) {
      antiBan.setSettings(antiBanMinDelay, antiBanMaxDelay, enableTyping);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Settings updated successfully.',
    currentSettings: {
      aiMode: aiService.getMode(),
      maxDailyLimit: rateLimiter.getUsageStats().maxDailyLimit,
      antiBan: antiBan.getSettings()
    }
  });
}
