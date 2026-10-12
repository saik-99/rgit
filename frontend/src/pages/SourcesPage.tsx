import React, { useState, useEffect } from 'react'
import { Database, ShieldCheck, ShieldAlert, AlertTriangle, Search, Filter, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { fetchSources } from '../api'
import type { SourceItem } from '../types'

export const SourcesPage: React.FC = () => {
  const [sources, setSources] = useState<SourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const load = async () => {
    try {
      setLoading(true)
      const data = await fetchSources()
      setSources(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = sources.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
                          s.device_id.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || s.source_type === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F5F7FA] dark:bg-slate-950 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white font-display">
              Municipal Telemetry & Sensor Sources
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Cryptographic integrity verification, HMAC keys, and trust score health across all deployed municipal devices.
            </p>
          </div>

          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center space-x-1.5 self-start sm:self-auto shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Registry</span>
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search device ID or station..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-[#0079C1]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-hidden"
            >
              <option value="all">All Source Types</option>
              <option value="water_level">Water Level Sensors</option>
              <option value="road_sensor">Road Loops</option>
              <option value="transit">Transit Telemetry</option>
              <option value="weather">Weather Adapters</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Device ID</th>
                  <th className="px-4 py-3">Station Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Coordinates</th>
                  <th className="px-4 py-3">Trust Score</th>
                  <th className="px-4 py-3">HMAC Status</th>
                  <th className="px-4 py-3">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      {s.device_id}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {s.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                        {s.source_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                      {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              s.trust_score >= 0.8 ? 'bg-emerald-500' :
                              s.trust_score >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${s.trust_score * 100}%` }}
                          />
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {Math.round(s.trust_score * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.signature_status === 'verified' ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded text-[11px]">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded text-[11px]">
                          <ShieldAlert className="w-3 h-3" />
                          <span>Unsigned</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.trust_score < 0.4 || s.is_flagged ? (
                        <span className="inline-flex items-center space-x-1 text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60 px-2 py-0.5 rounded text-[11px]">
                          <XCircle className="w-3 h-3" />
                          <span>Quarantined</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Healthy</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
