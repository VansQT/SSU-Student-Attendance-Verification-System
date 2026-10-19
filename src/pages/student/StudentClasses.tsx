import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { BookOpen, User, CalendarCheck } from 'lucide-react';

export const StudentClasses: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api.get<any[]>('/student/my-classes')
      .then(res => setClasses(res))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading enrolled classes...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Enrolled Classes</h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Subjects and sections for which your registration has been approved by your instructors.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {classes.map(c => (
          <div key={c.enrollmentId} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  {c.subjectCode} ({c.units} Units)
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-2">{c.subjectTitle}</h3>
                <p className="text-xs font-semibold text-slate-600 mt-0.5">Section: {c.sectionName}</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-blue-900">{c.attendance.percentage}%</span>
                <p className="text-[10px] text-slate-400">Attendance Rate</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                <span>Instructor: <strong className="text-slate-800">{c.teacherName}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="block font-bold">{c.attendance.present}</span>
                <span className="text-[10px] text-emerald-600">Present</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
                <span className="block font-bold">{c.attendance.late}</span>
                <span className="text-[10px] text-amber-600">Late</span>
              </div>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-800 border border-rose-200">
                <span className="block font-bold">{c.attendance.absent}</span>
                <span className="text-[10px] text-rose-600">Absent</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
