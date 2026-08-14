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

  const usage = rateLimiter.getUsageStats();

  res.status(200).json({
    success: true,
    agent: {
      status: 'CONNECTED',
      userPhone: 'EM-AI-Agent-Cloud',
      qrCodeUrl: '',
      mode: aiService.getMode(),
      antiBan: antiBan.getSettings(),
      logs: [
        {
          id: 'v1',
          type: 'INFO',
          message: 'Vercel Serverless AI Agent API online & ready.',
          timestamp: new Date().toLocaleTimeString()
        }
      ]
    },
    usage
  });
}
