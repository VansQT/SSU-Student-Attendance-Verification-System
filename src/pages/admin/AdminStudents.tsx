import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { GraduationCap, Search, QrCode, ShieldCheck, CheckCircle2, Clock, Filter } from 'lucide-react';

export const AdminStudents: React.FC = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterApproved, setFilterApproved] = useState<string>('ALL');

  useEffect(() => {
    api.get<any[]>('/admin/students')
      .then(res => setStudents(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = students.filter(s => {
    const matchesSearch =
      s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.schoolId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterApproved === 'APPROVED') return s.isApproved;
    if (filterApproved === 'PENDING') return !s.isApproved;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Student Directory</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Search student accounts, inspect physical printed ID QR sync, and review facial biometric enrollment.
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by ID or name..."
              className="pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white outline-hidden focus:ring-2 focus:ring-blue-600 w-48 sm:w-60"
            />
          </div>

          <select
            value={filterApproved}
            onChange={e => setFilterApproved(e.target.value)}
            className="text-xs font-semibold rounded-xl border border-slate-300 px-3 py-2 bg-slate-50 text-slate-700 outline-hidden"
          >
            <option value="ALL">All Statuses ({students.length})</option>
            <option value="APPROVED">Approved Only</option>
            <option value="PENDING">Pending Review</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading student directory...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No students found matching your query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Student Name & ID</th>
                  <th className="px-6 py-3.5">Program & Year</th>
                  <th className="px-6 py-3.5">Printed QR Status</th>
                  <th className="px-6 py-3.5">Facial Biometrics</th>
                  <th className="px-6 py-3.5">Enrolled Sections</th>
                  <th className="px-6 py-3.5">Approval Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(st => (
                  <tr key={st.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{st.fullName}</div>
                      <div className="font-mono text-[11px] text-blue-700 font-semibold">{st.schoolId}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div>{st.courseProgram}</div>
                      <div className="text-[11px] text-slate-400">{st.yearLevel}</div>
                    </td>
                    <td className="px-6 py-4">
                      {st.hasEnrolledQr ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 font-mono text-[11px]">
                          <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="truncate max-w-[140px]" title={st.qrValue}>
                            {st.qrValue}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not scanned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {st.hasEnrolledFace ? (
                        <div className="flex items-center gap-1 text-emerald-700 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Face Template Ready</span>
                        </div>
                      ) : (
                        <span className="text-amber-600 italic">Pending capture</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {st.enrollments && st.enrollments.length > 0 ? (
                          st.enrollments.map((e: any) => (
                            <span
                              key={e.id}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                e.status === 'APPROVED'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {e.sectionName} ({e.subjectCode || 'Enrolled'})
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">No sections</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {st.isApproved ? (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-300">
                          Approved
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-amber-300">
                          Pending Approval
                        </span>
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
