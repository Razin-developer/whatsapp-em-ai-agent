import React, { useState } from 'react';
import { Play, X, Send, Bot, ShieldCheck } from 'lucide-react';

export default function TestSimulatorModal({ isOpen, onClose, onRunTest }) {
  const [phoneNumber, setPhoneNumber] = useState('+919876543210');
  const [pushName, setPushName] = useState('Alex');
  const [message, setMessage] = useState('@EM Hey! What can you do?');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onRunTest({ phoneNumber, pushName, message });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Test @EM Mention Simulator</h2>
            <p className="text-xs text-gray-400">Simulate incoming WhatsApp message with @ and EM trigger</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-300 font-semibold mb-1">Simulated Sender Phone Number</label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+919876543210"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white font-mono"
              required
            />
            <p className="text-[10px] text-gray-500 mt-1">Tests 5 requests/day limit for this specific number</p>
          </div>

          <div>
            <label className="block text-gray-300 font-semibold mb-1">Simulated Contact Name</label>
            <input
              type="text"
              value={pushName}
              onChange={(e) => setPushName(e.target.value)}
              placeholder="Alex"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-gray-300 font-semibold mb-1">Message Body (Must include @ and EM)</label>
            <textarea
              rows="3"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white font-sans"
              required
            />
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-[11px] text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>Anti-ban typing delay and rate limiting will be triggered in real-time.</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {loading ? 'Simulating...' : 'Send Simulated Mention'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
