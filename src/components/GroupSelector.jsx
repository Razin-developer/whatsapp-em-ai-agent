import React from 'react';
import { Users, CheckSquare, Square, RefreshCw, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function GroupSelector({ groups = [], selectedGroupIds = [], onToggleGroup, onSelectAllGroups, onRefreshGroups, loading }) {
  const isAllSelected = selectedGroupIds.includes('ALL') || (groups.length > 0 && selectedGroupIds.length === groups.length);

  return (
    <div className="glass-panel rounded-2xl p-5 border border-gray-800 space-y-4">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-emerald-400" />
            Target WhatsApp Groups Selection
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Choose which WhatsApp groups the @AI / @EM Agent should listen to and respond in.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAllGroups}
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition"
          >
            {isAllSelected ? 'Deselect All' : 'Select All Groups'}
          </button>

          <button
            onClick={onRefreshGroups}
            disabled={loading}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition disabled:opacity-50"
            title="Refresh WhatsApp Groups"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Group List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
        {groups.length === 0 ? (
          <div className="col-span-2 text-center text-gray-500 py-8 text-xs">
            {loading ? 'Fetching real WhatsApp groups...' : 'No WhatsApp groups detected yet. Connect WhatsApp or refresh!'}
          </div>
        ) : (
          groups.map((group) => {
            const isChecked = selectedGroupIds.includes('ALL') || selectedGroupIds.includes(group.id);

            return (
              <div
                key={group.id}
                onClick={() => onToggleGroup(group.id)}
                className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                  isChecked
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-gray-900 text-emerald-400 flex-shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs truncate text-white">{group.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {group.participantCount ? `${group.participantCount} members` : 'Group Chat'}
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0 text-emerald-400">
                  {isChecked ? (
                    <CheckSquare className="w-5 h-5 fill-emerald-500/20 text-emerald-400" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-600" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-800/80">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Active in <b>{selectedGroupIds.includes('ALL') ? 'All Groups' : `${selectedGroupIds.length} Selected Groups`}</b>
        </span>
        <span className="text-gray-500">Triggers: @AI, @Ai, @aI, @ai</span>
      </div>

    </div>
  );
}
