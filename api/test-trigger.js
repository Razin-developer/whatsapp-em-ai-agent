import rateLimiter from '../server/rateLimiter.js';
import aiService from '../server/aiService.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { phoneNumber = '+919876543210', pushName = 'Test User', message = '@EM Hello AI' } = req.body || {};

  const cleanNumber = rateLimiter.cleanPhoneNumber(phoneNumber);
  const accessCheck = rateLimiter.canAccess(phoneNumber);

  if (!accessCheck.allowed) {
    return res.status(200).json({
      success: true,
      allowed: false,
      message: `⚠️ Daily Limit Reached for +${cleanNumber} (${accessCheck.count}/${accessCheck.limit} accesses today).`,
      reply: `⚠️ Daily limit reached! (${accessCheck.count}/${accessCheck.limit} today)`
    });
  }

  const aiReply = await aiService.generateResponse(message, pushName);
  const updatedRecord = rateLimiter.recordAccess(phoneNumber, pushName);

  res.status(200).json({
    success: true,
    allowed: true,
    message: 'Test trigger processed successfully.',
    sender: cleanNumber,
    reply: aiReply,
    usage: `${updatedRecord.count}/${accessCheck.limit}`
  });
}
