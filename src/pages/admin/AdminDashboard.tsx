import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Users,
  GraduationCap,
  BookOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  CalendarCheck,
  TrendingUp,
  MapPin,
  ArrowRight,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (tabId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.get<any>('/admin/dashboard-stats')
      .then(res => setData(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading University Administrator Portal...</div>;
  }

  const { metrics, recentLogs } = data || {};

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-2xl p-6 text-white shadow-lg border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-900/60 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-700">
              System Administration
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold mt-2 tracking-tight">
              Samar State University Attendance Center
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Institutional attendance verification monitoring, biometrics oversight, and audit control.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('admin-monitoring')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-xs transition"
            >
              Live Sessions Monitor
            </button>
            <button
              type="button"
              onClick={() => onNavigate('admin-reports')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition"
            >
              Export Reports
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Total Students</span>
            <GraduationCap className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{metrics?.totalStudents || 0}</div>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            {metrics?.approvedStudents || 0} approved ({metrics?.pendingRegistrations || 0} pending)
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Faculty Instructors</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{metrics?.totalTeachers || 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">Across {metrics?.totalSections || 0} class sections</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Active Sessions</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">{metrics?.activeSessions || 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">{metrics?.completedSessions || 0} sessions completed</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Verification Failures</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-700">{metrics?.failedAttempts || 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">{metrics?.overrideCount || 0} manual teacher overrides</p>
        </div>
      </div>

      {/* Attendance Distribution Counters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Institutional Attendance Totals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center justify-between text-emerald-800 text-xs mb-1 font-semibold">
              <span>Present (Verified On-Time)</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-950">{metrics?.presentCount || 0}</div>
            <p className="text-[11px] text-emerald-700 mt-0.5">Biometrics & QR validated before cutoff</p>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center justify-between text-amber-800 text-xs mb-1 font-semibold">
              <span>Late Submissions</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-2xl font-extrabold text-amber-950">{metrics?.lateCount || 0}</div>
            <p className="text-[11px] text-amber-700 mt-0.5">Verified after late cutoff</p>
          </div>

          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
            <div className="flex items-center justify-between text-rose-800 text-xs mb-1 font-semibold">
              <span>Marked Absent</span>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-2xl font-extrabold text-rose-950">{metrics?.absentCount || 0}</div>
            <p className="text-[11px] text-rose-700 mt-0.5">Unrecorded at session closure</p>
          </div>
        </div>
      </div>

      {/* Recent Audit Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent System Audit Trail</h3>
            <p className="text-xs text-slate-500">Chronological activity log across administrators, faculty, and students</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('admin-audit')}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
          >
            View Full Audit Log <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {recentLogs && recentLogs.length > 0 ? (
            recentLogs.map((log: any) => (
              <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 font-mono text-[11px] mr-2">[{log.action}]</span>
                  <span className="text-slate-600 font-medium">Role: {log.actorRole || 'SYSTEM'}</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {JSON.stringify(log.details).slice(0, 80)}...
                  </p>
                </div>
                <span className="text-[10px] text-slate-400">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">No recent logs recorded.</div>
          )}
        </div>
      </div>
    </div>
  );
};
