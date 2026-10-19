import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  Users,
  BookOpen,
  Clock,
  UserCheck,
  AlertTriangle,
  Play,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface TeacherDashboardProps {
  onNavigate: (tabId: string) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigate }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.get<any>('/teacher/dashboard')
      .then(res => setData(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading Instructor Dashboard...</div>;
  }

  const { teacher, stats, activeSessions, recentRecords, failureAttempts } = data || {};

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <span className="text-[11px] font-bold tracking-wider uppercase bg-blue-700/60 text-amber-300 px-2.5 py-0.5 rounded-full border border-blue-500/50">
            Instructor Portal
          </span>
          <div className="mt-3 flex items-center gap-4">
            {teacher?.profilePhoto ? (
              <img
                src={teacher.profilePhoto}
                alt={`${teacher.fullName} profile`}
                className="h-20 w-20 rounded-full border-4 border-amber-300 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-amber-300 bg-blue-700 text-xl font-extrabold text-white shadow-lg">
                {(teacher?.fullName || 'T').split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0].toUpperCase()).join('')}
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                Welcome back, {teacher?.title} {teacher?.fullName}
              </h1>
              <p className="text-xs text-blue-200 mt-1 max-w-2xl">
                {teacher?.department} • Faculty ID: {teacher?.facultyId}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('teacher-profile')}
                className="mt-2 text-[11px] font-semibold text-amber-300 hover:text-amber-200"
              >
                Manage Profile
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('teacher-sessions')}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Launch Attendance Session
            </button>
            <button
              type="button"
              onClick={() => onNavigate('teacher-registration-links')}
              className="px-4 py-2 bg-blue-700/80 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl border border-blue-400/40 transition"
            >
              Generate Student Registration Link
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Enrolled Students</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{stats?.enrolledStudentsCount || 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">Across {stats?.assignedSectionsCount || 0} assigned sections</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Pending Approvals</span>
            <UserCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700">{stats?.pendingRequestsCount || 0}</div>
          <button
            type="button"
            onClick={() => onNavigate('teacher-approvals')}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold mt-1 flex items-center gap-1"
          >
            Review registrations <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Active Sessions</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">{stats?.activeSessionsCount || 0}</div>
          <p className="text-[11px] text-emerald-600 mt-1">Accepting live verification</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span>Completed Sessions</span>
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{stats?.completedSessionsCount || 0}</div>
          <p className="text-[11px] text-slate-500 mt-1">Finalized attendance records</p>
        </div>
      </div>

      {/* Active Sessions Quick Monitor */}
      {activeSessions && activeSessions.length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="text-sm font-bold text-emerald-950">Active Attendance Session Currently Live</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('teacher-sessions')}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1"
            >
              Open Live Monitor <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {activeSessions.map((s: any) => (
              <div key={s.id} className="bg-white p-3.5 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{s.title}</span>
                  <p className="text-slate-500 text-[11px]">
                    Ends at {new Date(s.endTime).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('teacher-sessions')}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs"
                >
                  View Roster
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Attendance Activity & Verification Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Attendance Records */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Recent Attendance Records</h3>
            <span className="text-xs text-slate-500">Live feed</span>
          </div>

          {recentRecords && recentRecords.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {recentRecords.map((r: any) => (
                <div key={r.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-900">{r.studentName}</span>
                    <span className="text-slate-500 font-mono text-[11px] ml-2">({r.schoolId})</span>
                    <p className="text-[11px] text-slate-500">{r.subjectCode} • {r.sectionName}</p>
                  </div>
                  <div className="text-right">
                    {r.attendanceStatus === 'PRESENT' && (
                      <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                        PRESENT
                      </span>
                    )}
                    {r.attendanceStatus === 'LATE' && (
                      <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">
                        LATE
                      </span>
                    )}
                    {r.attendanceStatus === 'ABSENT' && (
                      <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px] border border-rose-300">
                        ABSENT
                      </span>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">No recent attendance records yet.</div>
          )}
        </div>

        {/* Verification Failures & Issues Requiring Review */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5 text-slate-900 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Verification Alerts & Issues</span>
            </div>
            <span className="text-xs text-slate-500">Security audits</span>
          </div>

          {failureAttempts && failureAttempts.length > 0 ? (
            <div className="space-y-2 text-xs">
              {failureAttempts.map((att: any) => (
                <div key={att.id} className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/60">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-950 font-mono text-[11px]">
                      {att.stepFailed}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(att.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 mt-1">{att.details}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-emerald-500 mb-2" />
              <span>No verification failures detected. All biometric and QR checks passed.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
