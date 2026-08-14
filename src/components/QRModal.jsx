import React from 'react';
import { X, QrCode, Smartphone, CheckCircle, RefreshCw } from 'lucide-react';

export default function QRModal({ qrCodeUrl, onClose, onRefresh }) {
  if (!qrCodeUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-5">
          <div className="inline-flex p-3 rounded-xl bg-emerald-500/10 text-emerald-400 mb-2 border border-emerald-500/20">
            <QrCode className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Scan WhatsApp QR Code</h2>
          <p className="text-xs text-gray-400 mt-1">
            Connect your WhatsApp account to enable the @EM AI Agent
          </p>
        </div>

        {/* QR Display Frame */}
        <div className="relative mx-auto w-64 h-64 p-3 bg-white rounded-2xl shadow-xl flex items-center justify-center border-4 border-emerald-500/30">
          <img
            src={qrCodeUrl}
            alt="WhatsApp Web QR Code"
            className="w-full h-full object-contain rounded-lg"
          />
        </div>

        {/* Setup Steps */}
        <div className="mt-6 space-y-2.5 bg-gray-950/60 p-4 rounded-xl border border-gray-800 text-xs text-gray-300">
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
            <span>3. Tap <b>Link a Device</b> and point camera at screen</span>
          </div>
        </div>

        {/* Footer Action */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onRefresh}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-generate QR Code
          </button>
        </div>
      </div>
    </div>
  );
}
