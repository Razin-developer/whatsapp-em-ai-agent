import React from 'react';
import { Users, Phone, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';

export default function UsageTable({ usageData }) {
  const { users = [], maxDailyLimit = 5, totalUsers = 0, activeToday = 0 } = usageData || {};

  return (
    <div className="glass-panel rounded-2xl p-5 border border-gray-800">
      
      {/* Table Header & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            Per-Number Access Control (Max {maxDailyLimit}/day)
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Strict 5 requests per day limit per WhatsApp number (Resets at 00:00 UTC)
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300">
            Total Tracked: <strong className="text-white">{totalUsers}</strong>
          </span>
          <span className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
            Active Today: <strong className="text-white">{activeToday}</strong>
          </span>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="bg-gray-900/80 text-gray-400 uppercase text-[10px] font-bold tracking-wider border-b border-gray-800">
            <tr>
              <th className="py-3 px-4">Phone Number / Contact</th>
              <th className="py-3 px-4">Today's Usage</th>
              <th className="py-3 px-4">Quota Remaining</th>
              <th className="py-3 px-4">Access Status</th>
              <th className="py-3 px-4 text-right">Last Interaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60 font-medium">
            {users.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-8 text-center text-gray-500">
                  No interactions recorded today yet. Mention <b>@EM</b> on WhatsApp to trigger!
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isLimitReached = u.countToday >= maxDailyLimit;
                const percent = Math.min(100, Math.round((u.countToday / maxDailyLimit) * 100));

                return (
                  <tr key={u.number} className="hover:bg-gray-800/40 transition">
                    
                    {/* Contact Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-gray-800 text-emerald-400">
                          <Phone className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-white">+{u.number}</div>
                          <div className="text-[10px] text-gray-400">{u.name}</div>
                        </div>
                      </div>
                    </td>

                    {/* Progress Bar & Count */}
                    <td className="py-3 px-4">
                      <div className="w-36">
                        <div className="flex justify-between text-[11px] font-bold mb-1">
                          <span className={isLimitReached ? 'text-rose-400' : 'text-emerald-400'}>
                            {u.countToday} / {maxDailyLimit}
                          </span>
                          <span className="text-gray-500">{percent}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isLimitReached ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Quota Remaining */}
                    <td className="py-3 px-4">
                      <span className="font-bold text-gray-200">
                        {u.remaining} left
                      </span>
                    </td>

                    {/* Access Status */}
                    <td className="py-3 px-4">
                      {isLimitReached ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <ShieldAlert className="w-3 h-3" />
                          5/5 MAX LIMIT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          ALLOWED
                        </span>
                      )}
                    </td>

                    {/* Last Interaction */}
                    <td className="py-3 px-4 text-right text-gray-400 font-mono text-[11px]">
                      <div className="flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3 text-gray-500" />
                        {u.lastTimestamp ? new Date(u.lastTimestamp).toLocaleTimeString() : 'N/A'}
                      </div>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
