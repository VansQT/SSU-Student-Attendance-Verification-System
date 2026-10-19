import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AuditLog } from '../../types';
import { ShieldCheck, RefreshCw, Search } from 'lucide-react';

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.get<AuditLog[]>('/admin/audit-logs');
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter(l =>
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.targetType.toLowerCase().includes(search.toLowerCase()) ||
    l.actorRole?.toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(l.details).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 text-purple-800 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">System Audit Trail</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident chronological audit logs of all registration approvals, attendance verifications, and teacher overrides.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search action or details..."
            className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white outline-hidden focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading audit trail...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">No audit logs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 text-slate-600 font-sans font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Action Code</th>
                  <th className="px-6 py-3.5">Actor Role</th>
                  <th className="px-6 py-3.5">Target Type</th>
                  <th className="px-6 py-3.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 font-bold text-blue-800">
                      {l.action}
                    </td>
                    <td className="px-6 py-3.5 font-sans font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        l.actorRole === 'ADMIN'
                          ? 'bg-purple-100 text-purple-800'
                          : l.actorRole === 'TEACHER'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {l.actorRole || 'SYSTEM'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-700">{l.targetType}</td>
                    <td className="px-6 py-3.5 text-slate-600 text-[11px] max-w-md truncate" title={JSON.stringify(l.details, null, 2)}>
                      {JSON.stringify(l.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
