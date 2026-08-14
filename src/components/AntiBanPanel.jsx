import React, { useState } from 'react';
import { ShieldCheck, Sliders, MessageSquare, Save, Zap } from 'lucide-react';

export default function AntiBanPanel({ settings, onSaveSettings }) {
  const [aiMode, setAiMode] = useState(settings?.mode || 'SHORT_HUMAN');
  const [maxLimit, setMaxLimit] = useState(settings?.maxDailyLimit || 5);
  const [minDelay, setMinDelay] = useState(settings?.antiBan?.minDelayMs || 2500);
  const [maxDelay, setMaxDelay] = useState(settings?.antiBan?.maxDelayMs || 5500);
  const [enableTyping, setEnableTyping] = useState(settings?.antiBan?.enableTypingSimulation ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSaveSettings({
      aiMode,
      maxDailyLimit: Number(maxLimit),
      antiBanMinDelay: Number(minDelay),
      antiBanMaxDelay: Number(maxDelay),
      enableTyping
    });
    setSaving(false);
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-gray-800 space-y-5">
      
      {/* Panel Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Anti-Ban Safety & AI Behavior Settings
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          WhatsApp Protection Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
        
        {/* 1. Response Mode Selector */}
        <div className="glass-card p-4 rounded-xl space-y-3">
          <label className="font-bold text-gray-200 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            AI Response Mode
          </label>
          <p className="text-gray-400 text-[11px]">
            Controls AI output length to match human chatting habits or detailed explanations.
          </p>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAiMode('AUTO')}
              className={`p-2.5 rounded-xl border text-left transition ${
                aiMode === 'AUTO'
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Auto-Detect
              </div>
              <p className="text-[10px] font-normal text-gray-400 mt-1">
                Smart auto-switch based on question intent.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setAiMode('SHORT_HUMAN')}
              className={`p-2.5 rounded-xl border text-left transition ${
                aiMode === 'SHORT_HUMAN'
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                Short Human
              </div>
              <p className="text-[10px] font-normal text-gray-400 mt-1">
                Concise 1-3 short sentences like a real chatter.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setAiMode('HIGH_DETAIL')}
              className={`p-2.5 rounded-xl border text-left transition ${
                aiMode === 'HIGH_DETAIL'
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                High Detail
              </div>
              <p className="text-[10px] font-normal text-gray-400 mt-1">
                Formatted comprehensive response breakdown.
              </p>
            </button>
          </div>
        </div>

        {/* 2. Anti-Ban Delay & Quota Settings */}
        <div className="glass-card p-4 rounded-xl space-y-3">
          <label className="font-bold text-gray-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Human Simulation & Limits
          </label>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] text-gray-300 mb-1">
                <span>Daily Limit Per Phone Number:</span>
                <strong className="text-emerald-400">{maxLimit} requests / day</strong>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={maxLimit}
                onChange={(e) => setMaxLimit(e.target.value)}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Min Delay (ms)</label>
                <input
                  type="number"
                  value={minDelay}
                  onChange={(e) => setMinDelay(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Max Delay (ms)</label>
                <input
                  type="number"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="enableTyping"
                checked={enableTyping}
                onChange={(e) => setEnableTyping(e.target.checked)}
                className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-emerald-500 focus:ring-emerald-500"
              />
              <label htmlFor="enableTyping" className="text-gray-300 font-medium cursor-pointer">
                Simulate "typing..." status before replying on WhatsApp
              </label>
            </div>
          </div>
        </div>

      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving Settings...' : 'Save Configuration'}
        </button>
      </div>

    </div>
  );
}
