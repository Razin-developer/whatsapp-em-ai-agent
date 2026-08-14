import rateLimiter from '../server/rateLimiter.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const usage = rateLimiter.getUsageStats();
  res.status(200).json({ success: true, usage });
}
