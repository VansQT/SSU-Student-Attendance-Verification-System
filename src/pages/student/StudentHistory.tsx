import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AttendanceRecord } from '../../types';
import { Clock, CheckCircle2, AlertTriangle, ShieldCheck, Calendar, Filter } from 'lucide-react';

export const StudentHistory: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    api.get<AttendanceRecord[]>('/student/attendance-history')
      .then(res => setRecords(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = statusFilter === 'ALL'
    ? records
    : records.filter(r => r.attendanceStatus === statusFilter);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">My Attendance History</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete record of your verified class attendances and official institutional statuses.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs font-semibold rounded-xl border border-slate-300 px-3 py-2 bg-slate-50 text-slate-700 outline-hidden"
          >
            <option value="ALL">All Statuses ({records.length})</option>
            <option value="PRESENT">Present</option>
            <option value="LATE">Late</option>
            <option value="ABSENT">Absent</option>
            <option value="EXCUSED">Excused</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading attendance history...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No attendance records found for the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Date & Time</th>
                  <th className="px-6 py-3.5">Subject & Session</th>
                  <th className="px-6 py-3.5">Section</th>
                  <th className="px-6 py-3.5">Instructor</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Verification Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">
                        {new Date(r.timestamp).toLocaleDateString()}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{r.subjectCode}: {r.subjectTitle}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{r.sessionTitle}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-700">{r.sectionName}</td>
                    <td className="px-6 py-4 text-slate-600">{r.teacherName}</td>
                    <td className="px-6 py-4">
                      {r.attendanceStatus === 'PRESENT' && (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-300">
                          PRESENT
                        </span>
                      )}
                      {r.attendanceStatus === 'LATE' && (
                        <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-amber-300">
                          LATE
                        </span>
                      )}
                      {r.attendanceStatus === 'ABSENT' && (
                        <span className="bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-rose-300">
                          ABSENT
                        </span>
                      )}
                      {r.attendanceStatus === 'EXCUSED' && (
                        <span className="bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-blue-300">
                          EXCUSED
                        </span>
                      )}
                      {r.isOverridden && (
                        <span className="ml-1 bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full text-[9px] border border-purple-200">
                          OVERRIDE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {r.verificationMethod === 'AUTOMATED_BIOMETRIC' ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>QR + Live Face + GPS</span>
                        </div>
                      ) : (
                        <div className="text-purple-700 text-[11px] font-medium" title={r.overrideReason}>
                          Instructor Override: {r.overrideReason || 'Approved in person'}
                        </div>
                      )}
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
