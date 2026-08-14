import React from 'react';
import { Bot, QrCode, LogOut, ShieldCheck, Zap, Radio } from 'lucide-react';

export default function Header({ statusInfo, onConnect, onDisconnect, onOpenQR }) {
  const { status = 'DISCONNECTED', userPhone = '', qrCodeUrl = '' } = statusInfo || {};

  const getStatusBadge = () => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
            Connected (+{userPhone})
          </span>
        );
      case 'QR_READY':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping mr-2"></span>
            Scan QR Code
          </span>
        );
      case 'INITIALIZING':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Radio className="w-3 h-3 animate-spin mr-1.5" />
            Initializing Engine...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-2"></span>
            Disconnected
          </span>
        );
    }
  };

  return (
    <header className="glass-panel sticky top-0 z-40 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        
        {/* Logo & Info */}
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 text-black shadow-lg shadow-emerald-500/20">
            <Bot className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">WhatsApp @EM AI Agent</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                HackAI SDK
              </span>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Anti-Ban System • 5 Responses/Day Limit
            </p>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-3">
          {getStatusBadge()}

          {status === 'QR_READY' && qrCodeUrl && (
            <button
              onClick={onOpenQR}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-all shadow-md"
            >
              <QrCode className="w-4 h-4" />
              View QR Code
            </button>
          )}

          {status === 'CONNECTED' ? (
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-rose-950/40 text-gray-300 hover:text-rose-400 border border-gray-700 hover:border-rose-900 transition-all text-xs font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          ) : status === 'DISCONNECTED' ? (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-all shadow-lg shadow-emerald-600/20"
            >
              <Zap className="w-3.5 h-3.5" />
              Connect WhatsApp
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
