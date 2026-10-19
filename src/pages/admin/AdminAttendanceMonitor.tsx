import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { CalendarCheck, Clock, MapPin, RefreshCw, UserCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

export const AdminAttendanceMonitor: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [liveSessionData, setLiveSessionData] = useState<any | null>(null);

  const fetchActiveSessions = async () => {
    setLoading(true);
    try {
      const res = await api.get<any>('/admin/dashboard-stats');
      // Fetch all sessions
      const sessionsData = await api.get<any[]>('/teacher/attendance-sessions').catch(() => []);
      setSessions(sessionsData);
      if (sessionsData.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessionsData[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveSessions();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      api.get<any>(`/teacher/attendance-sessions/${selectedSessionId}/live`)
        .then(res => setLiveSessionData(res))
        .catch(err => console.error(err));
    }
  }, [selectedSessionId]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">University Attendance Monitoring</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time university-wide class attendance oversight, verification integrity, and geofence tracking.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchActiveSessions}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions list */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
            Sessions Overview ({sessions.length})
          </h2>

          {sessions.map(s => {
            const isSelected = selectedSessionId === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-400 shadow-xs ring-1 ring-blue-400'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">{s.title}</span>
                  {s.status === 'ACTIVE' ? (
                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                      LIVE
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-[10px]">
                      CLOSED
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1">{s.subjectCode} • {s.sectionName}</p>
                <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-indigo-500" /> {s.locationName}
                  </span>
                  <span>{s.sessionDate}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Roster of selected session */}
        <div className="lg:col-span-2">
          {liveSessionData ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{liveSessionData.session.title}</h3>
                  <p className="text-xs text-slate-500">
                    {liveSessionData.subject?.code} ({liveSessionData.section?.name}) • Room: {liveSessionData.location?.name}
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
                  {liveSessionData.studentStatuses?.length} Students
                </span>
              </div>

              {/* Status Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Student</th>
                      <th className="px-4 py-2.5">School ID</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Verification</th>
                      <th className="px-4 py-2.5">Recorded Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liveSessionData.studentStatuses?.map((st: any) => (
                      <tr key={st.studentId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">{st.fullName}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{st.schoolId}</td>
                        <td className="px-4 py-3">
                          {st.status === 'PRESENT' && (
                            <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                              PRESENT
                            </span>
                          )}
                          {st.status === 'LATE' && (
                            <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">
                              LATE
                            </span>
                          )}
                          {st.status === 'ABSENT' && (
                            <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px] border border-rose-300">
                              ABSENT
                            </span>
                          )}
                          {st.status === 'NOT_YET_RECORDED' && (
                            <span className="bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded text-[10px]">
                              Unrecorded
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">
                          {st.verificationMethod === 'AUTOMATED_BIOMETRIC'
                            ? `QR + Face (${(st.faceConfidenceScore * 100).toFixed(0)}%) • ${st.distanceFromLocationMeters}m`
                            : st.isOverridden
                            ? `Override: ${st.overrideReason}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">
                          {st.timestamp ? new Date(st.timestamp).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
              Select an attendance session on the left to monitor live.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
