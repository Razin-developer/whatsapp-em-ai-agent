import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import QRModal from './components/QRModal.jsx';
import UsageTable from './components/UsageTable.jsx';
import AntiBanPanel from './components/AntiBanPanel.jsx';
import LogViewer from './components/LogViewer.jsx';
import TestSimulatorModal from './components/TestSimulatorModal.jsx';
import { Play, RefreshCw, Zap, QrCode, LayoutDashboard } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('SETUP'); // SETUP | DASHBOARD
  const [statusInfo, setStatusInfo] = useState({ status: 'DISCONNECTED', userPhone: '', qrCodeUrl: '', mode: 'AUTO' });
  const [usageData, setUsageData] = useState({ users: [], maxDailyLimit: 5, totalUsers: 0, activeToday: 0 });
  const [logs, setLogs] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Single Pure WebSocket Connection
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host || 'localhost:3001';
    const wsUrl = `${wsProtocol}//${wsHost}`;

    let socket = null;
    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsConnected(true);
      };

      socket.onclose = () => {
        setWsConnected(false);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleWebSocketMessage(payload);
        } catch (e) {}
      };

      setWs(socket);
    } catch (e) {
      setWsConnected(false);
    }

    return () => {
      if (socket) socket.close();
    };
  }, []);

  const handleWebSocketMessage = ({ event, data }) => {
    if (event === 'INITIAL_STATE') {
      if (data.status) setStatusInfo(data.status);
      if (data.usage) setUsageData(data.usage);
      if (data.status?.logs) setLogs(data.status.logs);
      if (data.status?.status === 'QR_READY') setShowQR(true);
      if (data.status?.status === 'CONNECTED') {
        setShowQR(false);
        setActiveTab('DASHBOARD');
      }
    } else if (event === 'STATUS_CHANGED') {
      setStatusInfo((prev) => ({ ...prev, ...data }));
      if (data.status === 'QR_READY') setShowQR(true);
      if (data.status === 'CONNECTED') {
        setShowQR(false);
        setActiveTab('DASHBOARD');
      }
    } else if (event === 'QR_CODE') {
      setStatusInfo((prev) => ({ ...prev, qrCodeUrl: data.qr }));
      setShowQR(true);
    } else if (event === 'USAGE_UPDATED') {
      setUsageData(data);
    } else if (event === 'LOG_ADDED') {
      setLogs((prev) => [data, ...prev.slice(0, 49)]);
    }
  };

  const sendWSAction = (action, payload = {}) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action, payload }));
    }
  };

  const handleConnect = () => {
    setStatusInfo((prev) => ({ ...prev, status: 'INITIALIZING' }));
    sendWSAction('CONNECT');
  };

  const handleDisconnect = () => {
    sendWSAction('DISCONNECT');
    setStatusInfo((prev) => ({ ...prev, status: 'DISCONNECTED', userPhone: '', qrCodeUrl: '' }));
    setShowQR(false);
  };

  const handleSaveSettings = (newSettings) => {
    sendWSAction('UPDATE_SETTINGS', newSettings);
  };

  const handleRunTestTrigger = (testData) => {
    sendWSAction('TEST_TRIGGER', testData);
    setShowSimulator(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      
      {/* Header Bar */}
      <Header
        statusInfo={statusInfo}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onOpenQR={() => setShowQR(true)}
        runnerUrl="ws://localhost:3001"
        wsConnected={wsConnected}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
          <button
            onClick={() => setActiveTab('SETUP')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'SETUP'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            WhatsApp Setup Wizard
          </button>

          <button
            onClick={() => setActiveTab('DASHBOARD')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'DASHBOARD'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Live Agent Dashboard
          </button>
        </div>

        {activeTab === 'SETUP' ? (
          /* SETUP WIZARD VIEW */
          <SetupWizard
            statusInfo={statusInfo}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onGoToDashboard={() => setActiveTab('DASHBOARD')}
          />
        ) : (
          /* DASHBOARD VIEW */
          <>
            {/* Quick Trigger Rule Bar */}
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
                    Responds automatically whenever anyone mentions both <code className="text-emerald-400">@</code> and <code className="text-emerald-400">EM</code> in chats.
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
          </>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 py-4 text-center text-xs text-gray-500">
        WhatsApp @EM AI Agent Powered by Pure WebSockets & Headless Chrome • 5 Responses/Day Rate Limiter
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
