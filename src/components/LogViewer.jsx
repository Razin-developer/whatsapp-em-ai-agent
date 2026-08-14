import React from 'react';
import { Terminal, ShieldAlert, Sparkles, MessageSquare, AlertCircle, Info } from 'lucide-react';

export default function LogViewer({ logs = [] }) {
  const getLogIcon = (type) => {
    switch (type) {
      case 'TRIGGER':
        return <MessageSquare className="w-3.5 h-3.5 text-blue-400" />;
      case 'AI_REPLY':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-400" />;
      case 'RATE_LIMIT':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />;
      case 'ERROR':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Info className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const getLogClass = (type) => {
    switch (type) {
      case 'TRIGGER': return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
      case 'AI_REPLY': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      case 'RATE_LIMIT': return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
      case 'ERROR': return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      default: return 'bg-gray-800/60 text-gray-300 border-gray-800';
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-gray-800 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          Live Agent Activity Stream
        </h2>
        <span className="text-[10px] font-mono text-gray-500">
          Auto-updating via WebSockets
        </span>
      </div>

      <div className="bg-gray-950/90 rounded-xl border border-gray-800/80 p-3 h-64 overflow-y-auto font-mono text-xs space-y-2">
        {logs.length === 0 ? (
          <div className="text-center text-gray-600 py-10">
            Waiting for activity... Logs will stream here live when @EM is mentioned.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`p-2.5 rounded-lg border flex flex-col gap-1 transition ${getLogClass(log.type)}`}
            >
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 font-bold">
                  {getLogIcon(log.type)}
                  <span>[{log.type}]</span>
                  <span className="font-sans font-medium text-white">{log.message}</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">{log.timestamp}</span>
              </div>

              {log.details && Object.keys(log.details).length > 0 && (
                <div className="text-[10px] bg-black/40 p-2 rounded border border-white/5 font-mono text-gray-300 space-y-0.5 mt-0.5">
                  {log.details.message && <div>💬 <b>Msg</b>: "{log.details.message}"</div>}
                  {log.details.reply && <div>🤖 <b>AI Reply</b>: "{log.details.reply}"</div>}
                  {log.details.sender && <div>📱 <b>Phone</b>: +{log.details.sender}</div>}
                  {log.details.usage && <div>📊 <b>Usage</b>: {log.details.usage}</div>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
