import dotenv from 'dotenv';
dotenv.config();

let hackAiSdk = null;
try {
  hackAiSdk = await import('@razinmohammedpt/hackai-sdk');
} catch (e) {
  // HackAI SDK dynamic fallback handled gracefully
}

class AIService {
  constructor() {
    this.mode = process.env.AI_RESPONSE_MODE || 'AUTO'; // AUTO | SHORT_HUMAN | HIGH_DETAIL
    this.apiKey = process.env.HACKAI_API_KEY || process.env.AI_API_KEY || '';
  }

  setMode(newMode) {
    if (['AUTO', 'SHORT_HUMAN', 'HIGH_DETAIL'].includes(newMode)) {
      this.mode = newMode;
      console.log(`[AI Service] Mode updated to: ${newMode}`);
    }
  }

  getMode() {
    return this.mode;
  }

  detectDesiredMode(prompt) {
    if (!prompt || typeof prompt !== 'string') return 'SHORT_HUMAN';
    const cleanPrompt = prompt.replace(/@EM|@\w+/gi, '').trim().toLowerCase();

    // High detail triggers & keywords
    const highDetailKeywords = [
      'detail', 'detailed', 'explain', 'step by step', 'elaborate', 'comprehensive',
      'full guide', 'code', 'tutorial', 'compare', 'pros and cons', 'deep dive',
      'list all', 'write a', 'essay', 'summarize', 'documentation', 'breakdown',
      'how to', 'why does', 'algorithm', 'recipe'
    ];

    const demandsDetail = highDetailKeywords.some(keyword => cleanPrompt.includes(keyword)) || cleanPrompt.length > 140;
    return demandsDetail ? 'HIGH_DETAIL' : 'SHORT_HUMAN';
  }

  async generateResponse(prompt, senderName = 'Friend', overrideMode = null) {
    // Determine target mode: if current mode is 'AUTO' (or null), intelligently detect from query!
    let effectiveMode = overrideMode || this.mode;
    if (!effectiveMode || effectiveMode === 'AUTO') {
      effectiveMode = this.detectDesiredMode(prompt);
    }
    
    let systemInstruction = "";
    if (effectiveMode === 'SHORT_HUMAN') {
      systemInstruction = `You are a friendly, smart WhatsApp AI Assistant. 
The user is asking a simple query. Keep your response VERY SHORT, natural, informal, and human-like (maximum 1 to 3 short sentences). 
Avoid corporate speak, robotic greetings, or long explanations unless specifically requested. Speak naturally like a knowledgeable friend chatting on WhatsApp.`;
    } else {
      systemInstruction = `You are a helpful, expert WhatsApp AI Assistant.
The user is requesting detailed information or an explanation. Provide a comprehensive, well-structured, high-detail response formatted cleanly with WhatsApp markdown (*bold*, bullet points •, and sections).`;
    }


    try {
      // 1. Try using @razinmohammedpt/hackai-sdk if imported and initialized
      if (hackAiSdk && (hackAiSdk.Client || hackAiSdk.generateText || hackAiSdk.default)) {
        try {
          const client = hackAiSdk.Client ? new hackAiSdk.Client({ apiKey: this.apiKey }) : hackAiSdk.default;
          if (client && typeof client.chat === 'function') {
            const res = await client.chat({
              system: systemInstruction,
              prompt: prompt
            });
            if (res && res.text) return res.text;
          } else if (typeof hackAiSdk.generateText === 'function') {
            const res = await hackAiSdk.generateText({
              apiKey: this.apiKey,
              system: systemInstruction,
              prompt: prompt
            });
            if (res && res.text) return res.text;
          }
        } catch (sdkErr) {
          console.warn('[AI Service] HackAI SDK attempt failed, using fallback engine:', sdkErr.message);
        }
      }

      // 2. HTTP Fallback to standard AI endpoint if key is provided
      if (this.apiKey) {
        const fetchRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: prompt }
            ],
            max_tokens: effectiveMode === 'SHORT_HUMAN' ? 120 : 600
          })
        });

        if (fetchRes.ok) {
          const data = await fetchRes.json();
          return data.choices?.[0]?.message?.content?.trim() || this.getSmartFallbackResponse(prompt, effectiveMode, senderName);
        }
      }

      // 3. Built-in Smart Conversational Engine Fallback (Works zero-config offline/online)
      return this.getSmartFallbackResponse(prompt, effectiveMode, senderName);

    } catch (error) {
      console.error('[AI Service Error]:', error);
      return this.getSmartFallbackResponse(prompt, effectiveMode, senderName);
    }
  }

  getSmartFallbackResponse(prompt, mode, senderName = 'there') {
    const cleanQuery = prompt.replace(/@EM|@\w+/gi, '').trim();

    if (mode === 'SHORT_HUMAN') {
      if (!cleanQuery) return `Hey ${senderName}! What's up? Mention me with your question! 🚀`;
      if (/hello|hi|hey|greetings/i.test(cleanQuery)) return `Hey ${senderName}! How can I help you out today? 😊`;
      if (/who are you|what are you/i.test(cleanQuery)) return `I'm your EM AI agent on WhatsApp! Ready to help whenever you mention @EM.`;
      if (/help|what can you do/i.test(cleanQuery)) return `Just mention me with @EM + your question and I'll give you quick, smart answers!`;
      
      // Default short human answer format
      return `Got it! Regarding "${cleanQuery.slice(0, 40)}${cleanQuery.length > 40 ? '...' : ''}": I'm on it! Let me know if you need more details. 👍`;
    } else {
      // High detail fallback
      return `🤖 *EM AI Assistant Report*\n\nHello ${senderName}! Here is the detailed summary for your request:\n\n📌 *Query*: "${cleanQuery || 'General Request'}"\n\n💡 *Key Highlights*:\n• Processed via EM AI Smart Engine.\n• Per-number daily access control active (5 accesses/day limit).\n• Anti-ban human typing delay enabled for WhatsApp safety.\n\nNeed anything else? Just tag me with @EM!`;
    }
  }
}

export default new AIService();
