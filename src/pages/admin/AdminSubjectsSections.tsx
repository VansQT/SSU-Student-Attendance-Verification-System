import React, { useEffect, useState } from 'react';
import { BookOpen, Layers } from 'lucide-react';
import { api } from '../../services/api';

interface AcademicData {
  programs: Array<{ id: string; code: string; name: string; department: string }>;
  sections: Array<{ id: string; name: string; programId: string; yearLevel: string; academicYearId: string }>;
  subjects: Array<{ id: string; code: string; title: string; units: number }>;
  academicYears: Array<{ id: string; name: string; isCurrent: boolean }>;
}

export const AdminSubjectsSections: React.FC = () => {
  const [data, setData] = useState<AcademicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AcademicData>('/admin/academic-data')
      .then(setData)
      .catch(fetchError => {
        console.error('Failed to load subjects and sections:', fetchError);
        setError(fetchError.message || 'Unable to load academic data.');
      })
      .finally(() => setLoading(false));
  }, []);

  const currentAcademicYear = (id: string) =>
    data?.academicYears.find(year => year.id === id)?.name || 'Academic year not set';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-blue-100 p-2 text-blue-800">
            <BookOpen className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Subjects & Sections</h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Review academic programs, class sections, and curricular subjects.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
          Loading subjects and sections...
        </div>
      ) : data && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Layers className="h-4 w-4 text-blue-600" />
              <h2>Academic Programs ({data.programs.length})</h2>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {data.programs.map(program => (
                <div key={program.id} className="py-2.5">
                  <span className="font-bold text-blue-700">{program.code}</span>
                  <p className="text-slate-600">{program.name}</p>
                  <span className="text-[10px] text-slate-400">{program.department}</span>
                </div>
              ))}
              {data.programs.length === 0 && <p className="py-4 text-slate-500">No programs found.</p>}
            </div>
            <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              Manage degree programs in System Settings.
            </p>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              <h2>Sections ({data.sections.length})</h2>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {data.sections.map(section => {
                const program = data.programs.find(item => item.id === section.programId);
                return (
                  <div key={section.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <span className="font-bold text-slate-800">{section.name}</span>
                      <p className="text-[11px] text-slate-500">
                        {program?.code || 'Program unavailable'} · {section.yearLevel}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {currentAcademicYear(section.academicYearId)}
                    </span>
                  </div>
                );
              })}
              {data.sections.length === 0 && <p className="py-4 text-slate-500">No sections found.</p>}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <BookOpen className="h-4 w-4 text-emerald-600" />
              <h2>Curricular Subjects ({data.subjects.length})</h2>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {data.subjects.map(subject => (
                <div key={subject.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <span className="font-bold text-slate-800">{subject.code}</span>
                    <p className="text-[11px] text-slate-500">{subject.title}</p>
                  </div>
                  <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    {subject.units} Units
                  </span>
                </div>
              ))}
              {data.subjects.length === 0 && <p className="py-4 text-slate-500">No subjects found.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
