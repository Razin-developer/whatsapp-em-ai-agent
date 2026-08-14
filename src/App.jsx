import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import QRModal from './components/QRModal.jsx';
import UsageTable from './components/UsageTable.jsx';
import AntiBanPanel from './components/AntiBanPanel.jsx';
import LogViewer from './components/LogViewer.jsx';
import TestSimulatorModal from './components/TestSimulatorModal.jsx';
import { Play, Sparkles, RefreshCw, Zap, Shield, HelpCircle } from 'lucide-react';

export default function App() {
  const [runnerUrl, setRunnerUrl] = useState(() => {
    const saved = localStorage.getItem('EM_AGENT_RUNNER_URL');
    if (saved) return saved;
    // Default to relative path (empty string) on Vercel to use Vercel Serverless API, or localhost when developing locally
    return window.location.port === '5173' ? 'http://localhost:3001' : '';
  });
  const [statusInfo, setStatusInfo] = useState({ status: 'DISCONNECTED', userPhone: '', qrCodeUrl: '', mode: 'AUTO' });
  const [usageData, setUsageData] = useState({ users: [], maxDailyLimit: 5, totalUsers: 0, activeToday: 0 });
  const [logs, setLogs] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const saveRunnerUrl = (url) => {
    const clean = url.replace(/\/$/, '');
    setRunnerUrl(clean);
    localStorage.setItem('EM_AGENT_RUNNER_URL', clean);
  };

  const fetchStatus = async () => {
    try {
      const statusRes = await fetch(`${runnerUrl}/api/status`);
      const statusJson = await statusRes.json();
      if (statusJson.success) {
        setStatusInfo(statusJson.agent);
        setUsageData(statusJson.usage);
        if (statusJson.agent.logs) setLogs(statusJson.agent.logs);
        if (statusJson.agent.status === 'QR_READY') setShowQR(true);
        if (statusJson.agent.status === 'CONNECTED') setShowQR(false);
      }
    } catch (err) {
      // Runner disconnected or unreachable
    }
  };

  // Setup WebSocket connection with Automatic HTTP Polling Fallback for Vercel
  useEffect(() => {
    fetchStatus();

    // 1. HTTP Polling fallback timer (Every 2.5s for seamless Vercel updates)
    const pollInterval = setInterval(() => {
      fetchStatus();
    }, 2500);

    // 2. Try WebSocket for real-time streaming when supported
    let socket = null;
    if (runnerUrl) {
      try {
        const wsProtocol = runnerUrl.startsWith('https') ? 'wss:' : 'ws:';
        const cleanHost = runnerUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${cleanHost}`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => setWsConnected(true);
        socket.onclose = () => setWsConnected(false);
        socket.onerror = () => setWsConnected(false);

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            handleWebSocketEvent(payload);
          } catch (e) {}
        };
      } catch (e) {
        setWsConnected(false);
      }
    }

    return () => {
      clearInterval(pollInterval);
      if (socket) socket.close();
    };
  }, [runnerUrl]);


  const handleWebSocketEvent = (payload) => {
    const { event, data } = payload;
    if (event === 'INITIAL_STATE') {
      if (data.status) setStatusInfo(data.status);
      if (data.usage) setUsageData(data.usage);
      if (data.status?.logs) setLogs(data.status.logs);
      if (data.status?.status === 'QR_READY') setShowQR(true);
    } else if (event === 'STATUS_CHANGED') {
      setStatusInfo((prev) => ({ ...prev, ...data }));
      if (data.status === 'QR_READY') setShowQR(true);
      if (data.status === 'CONNECTED') setShowQR(false);
    } else if (event === 'QR_CODE') {
      setStatusInfo((prev) => ({ ...prev, qrCodeUrl: data.qr }));
      setShowQR(true);
    } else if (event === 'USAGE_UPDATED') {
      setUsageData(data);
    } else if (event === 'LOG_ADDED') {
      setLogs((prev) => [data, ...prev.slice(0, 49)]);
    }
  };

  const handleConnect = async () => {
    try {
      setStatusInfo((prev) => ({ ...prev, status: 'INITIALIZING' }));
      await fetch(`${runnerUrl}/api/connect`, { method: 'POST' });
    } catch (err) {
      console.error('Error connecting WhatsApp:', err);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch(`${runnerUrl}/api/disconnect`, { method: 'POST' });
      setStatusInfo((prev) => ({ ...prev, status: 'DISCONNECTED', userPhone: '', qrCodeUrl: '' }));
      setShowQR(false);
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  };

  const handleSaveSettings = async (newSettings) => {
    try {
      const res = await fetch(`${runnerUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        setStatusInfo((prev) => ({ ...prev, mode: newSettings.aiMode, antiBan: data.currentSettings.antiBan }));
        setUsageData((prev) => ({ ...prev, maxDailyLimit: newSettings.maxDailyLimit }));
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  const handleRunTestTrigger = async (testData) => {
    try {
      await fetch(`${runnerUrl}/api/test-trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });
      setShowSimulator(false);
    } catch (err) {
      console.error('Error running test trigger:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      
      {/* Header Bar */}
      <Header
        statusInfo={statusInfo}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onOpenQR={() => setShowQR(true)}
        runnerUrl={runnerUrl}
        onSaveRunnerUrl={saveRunnerUrl}
        wsConnected={wsConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Quick Activation Bar */}
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 via-gray-900 to-gray-900 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Trigger Activation Rule: <code className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono text-xs">@</code> + <code className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono text-xs">EM</code>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                The agent responds automatically in group or direct WhatsApp chats whenever anyone mentions both <code className="text-emerald-400">@</code> and <code className="text-emerald-400">EM</code> (e.g. <b>@EM</b>, <b>@bot EM</b>).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSimulator(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              Test Mention Simulator
            </button>

            <button
              onClick={fetchStatus}
              className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
              title="Refresh Dashboard"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Grid: Usage Table & Anti-Ban Config */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UsageTable usageData={usageData} />
          </div>
          <div>
            <AntiBanPanel settings={statusInfo} onSaveSettings={handleSaveSettings} />
          </div>
        </div>

        {/* Bottom Stream: Live Activity Log Viewer */}
        <div>
          <LogViewer logs={logs} />
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 py-4 text-center text-xs text-gray-500">
        WhatsApp @EM AI Agent Powered by HackAI SDK & Playwright • 5 Responses/Day Rate Limiter • GitHub & Vercel Ready
      </footer>

      {/* QR Code Modal */}
      {showQR && (
        <QRModal
          qrCodeUrl={statusInfo.qrCodeUrl}
          onClose={() => setShowQR(false)}
          onRefresh={handleConnect}
        />
      )}

      {/* Test Simulator Modal */}
      <TestSimulatorModal
        isOpen={showSimulator}
        onClose={() => setShowSimulator(false)}
        onRunTest={handleRunTestTrigger}
      />

    </div>
  );
}
