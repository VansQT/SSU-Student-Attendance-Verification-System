import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { FileText, Download, Printer, Filter, Calendar, CheckCircle2 } from 'lucide-react';

export const AdminReports: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [academic, setAcademic] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSubjectId) params.append('subjectId', selectedSubjectId);
      if (selectedSectionId) params.append('sectionId', selectedSectionId);
      if (selectedStatus) params.append('status', selectedStatus);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const [repData, acadData] = await Promise.all([
        api.get<any>(`/admin/reports?${params.toString()}`),
        api.get<any>('/admin/academic-data'),
      ]);

      setRecords(repData.records || []);
      setAcademic(acadData);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleExportCSV = () => {
    if (records.length === 0) {
      alert('No records to export.');
      return;
    }

    const headers = [
      'Record ID',
      'Student Name',
      'School ID',
      'Course Program',
      'Subject Code',
      'Subject Title',
      'Section Name',
      'Instructor',
      'Session Title',
      'Status',
      'Verification Method',
      'Timestamp',
      'Face Confidence',
      'Distance (m)',
    ];

    const rows = records.map(r => [
      `"${r.id}"`,
      `"${r.studentName}"`,
      `"${r.schoolId}"`,
      `"${r.courseProgram}"`,
      `"${r.subjectCode}"`,
      `"${r.subjectTitle}"`,
      `"${r.sectionName}"`,
      `"${r.teacherName}"`,
      `"${r.sessionTitle}"`,
      `"${r.attendanceStatus}"`,
      `"${r.verificationMethod}"`,
      `"${r.timestamp}"`,
      r.faceConfidenceScore ? `${(r.faceConfidenceScore * 100).toFixed(0)}%` : 'N/A',
      r.distanceFromLocationMeters || 'N/A',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SSU_Attendance_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Attendance Reports & Exports</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Generate and export authenticated attendance records across academic terms, departments, and class sections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs rounded-xl shadow-xs transition"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={e => setSelectedSubjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 outline-hidden focus:ring-2 focus:ring-blue-600"
            >
              <option value="">All Subjects</option>
              {academic?.subjects?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.code}: {s.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Section</label>
            <select
              value={selectedSectionId}
              onChange={e => setSelectedSectionId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 outline-hidden focus:ring-2 focus:ring-blue-600"
            >
              <option value="">All Sections</option>
              {academic?.sections?.map((sec: any) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2 outline-hidden focus:ring-2 focus:ring-blue-600"
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
              <option value="EXCUSED">Excused</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={fetchReports}
              className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Report Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Attendance Records ({records.length})</h2>
          <span className="text-xs text-slate-500">Official Institutional Transcript</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Filtering records...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No attendance records match the selected parameters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Student</th>
                  <th className="px-6 py-3.5">School ID</th>
                  <th className="px-6 py-3.5">Class / Section</th>
                  <th className="px-6 py-3.5">Instructor</th>
                  <th className="px-6 py-3.5">Session / Topic</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{r.studentName}</td>
                    <td className="px-6 py-3.5 font-mono text-blue-700 font-semibold">{r.schoolId}</td>
                    <td className="px-6 py-3.5 text-slate-700">
                      {r.subjectCode} ({r.sectionName})
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">{r.teacherName}</td>
                    <td className="px-6 py-3.5 text-slate-600 font-medium">{r.sessionTitle}</td>
                    <td className="px-6 py-3.5">
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
                      {r.attendanceStatus === 'EXCUSED' && (
                        <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px] border border-blue-300">
                          EXCUSED
                        </span>
                      )}
                      {r.isOverridden && (
                        <span className="ml-1 bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded text-[9px] border border-purple-200">
                          OVERRIDDEN
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 font-mono text-[11px]">
                      {new Date(r.timestamp).toLocaleString()}
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
