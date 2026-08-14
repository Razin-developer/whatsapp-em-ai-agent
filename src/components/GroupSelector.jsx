import React, { useState } from 'react';
import { Users, CheckSquare, Square, RefreshCw, ShieldCheck, Search, CheckCircle2, XSquare } from 'lucide-react';

export default function GroupSelector({
  groups = [],
  selectedGroupIds = [],
  onToggleGroup,
  onSelectAllGroups,
  onDeselectAllGroups,
  onRefreshGroups,
  loading
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter groups by search query
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isAllSelected = selectedGroupIds.includes('ALL');
  const selectedCount = isAllSelected
    ? groups.length
    : selectedGroupIds.filter((id) => id !== 'ALL').length;

  return (
    <div className="glass-panel rounded-2xl p-5 border border-gray-800 space-y-4">
      
      {/* Header & Control Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-emerald-400" />
            Target WhatsApp Groups Selection
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Choose which WhatsApp groups the @AI Agent should listen to and respond in.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAllGroups}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Select All
          </button>

          <button
            onClick={onDeselectAllGroups}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30 transition"
          >
            <XSquare className="w-3.5 h-3.5" />
            Deselect All
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

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search WhatsApp groups by name..."
          className="w-full bg-gray-950/80 border border-gray-800 focus:border-emerald-500/60 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none transition font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Group List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
        {groups.length === 0 ? (
          <div className="col-span-2 text-center text-gray-500 py-8 text-xs">
            {loading ? 'Fetching real WhatsApp groups...' : 'No WhatsApp groups detected yet. Connect WhatsApp or refresh!'}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="col-span-2 text-center text-gray-500 py-8 text-xs">
            No groups matching "{searchQuery}".
          </div>
        ) : (
          filteredGroups.map((group) => {
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

      {/* Footer Summary */}
      <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-800/80">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Active in <b>{selectedGroupIds.includes('ALL') ? 'All Groups' : `${selectedCount} / ${groups.length} Selected Groups`}</b>
        </span>
        <span className="text-gray-500">Triggers: @AI, @Ai, @aI, @ai</span>
      </div>

    </div>
  );
}
