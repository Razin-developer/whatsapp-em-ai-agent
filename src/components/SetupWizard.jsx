import React from 'react';
import { QrCode, Smartphone, CheckCircle, ShieldCheck, Zap, Bot, RefreshCw, Radio, ArrowRight } from 'lucide-react';

export default function SetupWizard({ statusInfo, onConnect, onDisconnect, onGoToDashboard }) {
  const { status = 'DISCONNECTED', userPhone = '', qrCodeUrl = '' } = statusInfo || {};

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
      
      {/* Setup Hero Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 text-black shadow-xl shadow-emerald-500/20 mb-2">
          <Bot className="w-10 h-10 stroke-[2.2]" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          WhatsApp AI Agent Setup
        </h1>
        <p className="text-sm text-gray-400 max-w-lg mx-auto">
          Connect your WhatsApp account to enable the <b>@EM</b> mention AI agent with 5/day per-number access control and Anti-Ban protection.
        </p>
      </div>

      {/* Step Progress Bar */}
      <div className="grid grid-cols-3 gap-3 text-xs font-semibold">
        <div className={`p-3 rounded-xl border flex items-center gap-2 ${status === 'DISCONNECTED' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[11px]">1</span>
          <span>1. Initialize Engine</span>
        </div>
        <div className={`p-3 rounded-xl border flex items-center gap-2 ${status === 'QR_READY' || status === 'INITIALIZING' ? 'bg-amber-500/15 border-amber-500 text-amber-400' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
          <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px]">2</span>
          <span>2. Scan QR Code</span>
        </div>
        <div className={`p-3 rounded-xl border flex items-center gap-2 ${status === 'CONNECTED' ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[11px]">3</span>
          <span>3. Agent Live</span>
        </div>
      </div>

      {/* Main Interactive Setup Container */}
      <div className="glass-panel rounded-3xl p-8 border border-gray-800 shadow-2xl text-center">
        
        {status === 'CONNECTED' ? (
          /* State 3: Successfully Connected */
          <div className="space-y-6 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30 glow-emerald">
              <CheckCircle className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">WhatsApp Agent Connected!</h2>
              <p className="text-xs text-gray-300">
                Connected to WhatsApp Account: <span className="font-bold text-emerald-400">+{userPhone || 'Active User'}</span>
              </p>
            </div>

            <div className="max-w-md mx-auto p-4 rounded-2xl bg-gray-950/80 border border-gray-800 text-left text-xs space-y-2 text-gray-300">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                Active Features:
              </div>
              <div className="pl-6 space-y-1 text-gray-400">
                <p>• Triggers when anyone mentions <b>@EM</b> in chats</p>
                <p>• Strictly limits each phone number to <b>5 accesses per day</b></p>
                <p>• Simulated human typing delay (2.5s – 5.5s) to prevent bans</p>
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={onGoToDashboard}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-600/20"
              >
                Go to Agent Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onDisconnect}
                className="px-5 py-3 rounded-2xl bg-gray-800 hover:bg-rose-950/40 text-gray-400 hover:text-rose-400 text-xs font-semibold border border-gray-700 transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : status === 'QR_READY' && qrCodeUrl ? (
          /* State 2: QR Code Ready for Scanning */
          <div className="space-y-6">
            <div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                Action Required: Scan QR Code
              </span>
              <h2 className="text-xl font-bold text-white">Scan with WhatsApp on your Phone</h2>
            </div>

            {/* QR Code Container */}
            <div className="relative mx-auto w-64 h-64 p-3 bg-white rounded-2xl shadow-2xl flex items-center justify-center border-4 border-emerald-500/40">
              <img
                src={qrCodeUrl}
                alt="WhatsApp Web QR Code"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>

            {/* Instructions */}
            <div className="max-w-md mx-auto space-y-2 bg-gray-950/80 p-4 rounded-2xl border border-gray-800 text-xs text-left text-gray-300">
              <div className="flex items-start gap-2.5">
                <Smartphone className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>1. Open <b>WhatsApp</b> on your phone</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>2. Tap <b>Menu (⋮)</b> or <b>Settings ⚙️</b> → <b>Linked Devices</b></span>
              </div>
              <div className="flex items-start gap-2.5">
                <QrCode className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>3. Tap <b>Link a Device</b> and scan this QR Code</span>
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={onConnect}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh QR Code
              </button>
            </div>
          </div>
        ) : status === 'INITIALIZING' ? (
          /* State 1.5: Engine Initializing */
          <div className="py-12 space-y-4">
            <div className="p-4 rounded-full bg-blue-500/10 text-blue-400 w-16 h-16 mx-auto flex items-center justify-center border border-blue-500/20">
              <Radio className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-lg font-bold text-white">Starting WhatsApp Web Engine...</h2>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Initializing browser session and generating QR code. This takes a few seconds...
            </p>
          </div>
        ) : (
          /* State 1: Disconnected / Start Setup */
          <div className="py-8 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
              <QrCode className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Ready to Connect WhatsApp</h2>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Click below to launch the pairing wizard. You'll get a QR code to scan directly on your phone.
              </p>
            </div>

            <button
              onClick={onConnect}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-xl shadow-emerald-600/30"
            >
              <Zap className="w-4 h-4 fill-white" />
              Connect WhatsApp Account Now
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
