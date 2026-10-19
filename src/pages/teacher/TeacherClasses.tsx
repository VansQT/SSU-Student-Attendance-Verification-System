import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';

interface ClassOptions {
  programs: Array<{ id: string; code: string; name: string }>;
  subjects: Array<{ id: string; code: string; title: string }>;
  sections: Array<{ id: string; name: string; yearLevel: string }>;
}

interface ImportedStudent {
  schoolId: string;
  fullName: string;
  courseProgram: string;
  yearLevel: string;
}

function parseCsv(text: string): ImportedStudent[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index++;
      row.push(field.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  if (quoted) throw new Error('The CSV file has an unclosed quoted field.');
  if (rows.length < 2) throw new Error('The CSV must contain a header row and at least one student.');

  const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const headers = rows[0].map(normalizeHeader);
  const column = (aliases: string[]) => headers.findIndex(header => aliases.includes(header));
  const schoolIdIndex = column(['studentid', 'schoolid', 'id', 'ssuid']);
  const nameIndex = column(['fullname', 'studentname', 'name']);
  const programIndex = column(['degreeprogram', 'courseprogram', 'program', 'degree']);
  const yearIndex = column(['yearlevel', 'year', 'level']);

  if ([schoolIdIndex, nameIndex, programIndex, yearIndex].some(index => index < 0)) {
    throw new Error('CSV headers must include Student ID, Full Name, Degree Program, and Year Level.');
  }

  return rows.slice(1).map((values, index): ImportedStudent => {
    const student: ImportedStudent = {
      schoolId: values[schoolIdIndex] || '',
      fullName: values[nameIndex] || '',
      courseProgram: values[programIndex] || '',
      yearLevel: values[yearIndex] || '',
    };
    if (!student.schoolId || !student.fullName || !student.courseProgram || !student.yearLevel) {
      throw new Error(`CSV row ${index + 2} is missing a required student field.`);
    }
    return student;
  });
}

async function parseExcelRoster(buffer: ArrayBuffer): Promise<ImportedStudent[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error('The Excel workbook does not contain a worksheet.');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '', raw: false });
  if (rows.length < 2) throw new Error('The Excel sheet must contain a header row and at least one student.');

  const normalizeHeader = (value: unknown) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const headers = rows[0].map(normalizeHeader);
  const column = (aliases: string[]) => headers.findIndex(header => aliases.includes(header));
  const schoolIdIndex = column(['studentid', 'schoolid', 'id', 'ssuid']);
  const nameIndex = column(['fullname', 'studentname', 'name']);
  const programIndex = column(['degreeprogram', 'courseprogram', 'program', 'degree']);
  const yearIndex = column(['yearlevel', 'year', 'level']);

  if ([schoolIdIndex, nameIndex, programIndex, yearIndex].some(index => index < 0)) {
    throw new Error('Excel headers must include Student ID, Full Name, Degree Program, and Year Level.');
  }

  return rows.slice(1).filter(values => values.some(value => String(value).trim())).map((values, index) => {
    const student: ImportedStudent = {
      schoolId: String(values[schoolIdIndex] ?? '').trim(),
      fullName: String(values[nameIndex] ?? '').trim(),
      courseProgram: String(values[programIndex] ?? '').trim(),
      yearLevel: String(values[yearIndex] ?? '').trim(),
    };
    if (!student.schoolId || !student.fullName || !student.courseProgram || !student.yearLevel) {
      throw new Error(`Excel row ${index + 2} is missing a required student field.`);
    }
    return student;
  });
}

export const TeacherClasses: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedRosterStudent, setSelectedRosterStudent] = useState<any | null>(null);
  const [activeSectionView, setActiveSectionView] = useState<'assigned' | 'sections'>('assigned');
  const [options, setOptions] = useState<ClassOptions>({ programs: [], subjects: [], sections: [] });
  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddClass, setShowAddClass] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [programId, setProgramId] = useState('');
  const [yearLevel, setYearLevel] = useState('1st Year');
  const [classCode, setClassCode] = useState('');
  const [classTitle, setClassTitle] = useState('');
  const [classUnits, setClassUnits] = useState(3);
  const [classSectionId, setClassSectionId] = useState('');
  const [savingSection, setSavingSection] = useState(false);
  const [savingClass, setSavingClass] = useState(false);
  const [importingRoster, setImportingRoster] = useState(false);
  const [studentFormOpen, setStudentFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [studentForm, setStudentForm] = useState<ImportedStudent>({
    schoolId: '',
    fullName: '',
    courseProgram: '',
    yearLevel: '1st Year',
  });
  const [savingStudent, setSavingStudent] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const sectionRosterFileRef = useRef<HTMLInputElement>(null);

  const fetchData = async (selectedAssignmentId?: string) => {
    const [classesData, optionsData] = await Promise.all([
      api.get<any[]>('/teacher/my-classes'),
      api.get<ClassOptions>('/teacher/class-options'),
    ]);
    if (!Array.isArray(optionsData.sections) || !Array.isArray(optionsData.programs) || !Array.isArray(optionsData.subjects)) {
      throw new Error('The server returned incomplete class options. Refresh the page or restart the application.');
    }
    setClasses(classesData);
    setOptions(optionsData);
    setSelectedClass(
      classesData.find(item => item.assignmentId === selectedAssignmentId) ||
      classesData.find(item => item.assignmentId === selectedClass?.assignmentId) ||
      classesData[0] ||
      null
    );
    if (!programId && optionsData.programs.length > 0) setProgramId(optionsData.programs[0].id);
    if (!classSectionId && optionsData.sections.length > 0) setClassSectionId(optionsData.sections[0].id);
  };

  useEffect(() => {
    fetchData()
      .catch(error => {
        console.error('Failed to load classes and roster:', error);
        setMessage({ text: error.message || 'Unable to load classes and roster.', error: true });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAddSection = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingSection(true);
    setMessage(null);
    try {
      const created = await api.post<{ section: { id: string } }>('/teacher/sections', {
        sectionName: sectionName.trim(),
        programId,
        yearLevel,
      });
      setShowAddSection(false);
      setSectionName('');
      await fetchData(created.section.id);
      setSelectedSectionId(created.section.id);
      setMessage({ text: 'Section added without a subject. Add a class when needed, then import its student roster.', error: false });
    } catch (error: any) {
      setMessage({ text: error.message || 'Unable to add section.', error: true });
    } finally {
      setSavingSection(false);
    }
  };

  const handleAddClass = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingClass(true);
    setMessage(null);
    try {
      const created = await api.post<{ assignment: { id: string } }>('/teacher/classes', {
        code: classCode.trim(),
        title: classTitle.trim(),
        units: classUnits,
        sectionId: classSectionId,
      });
      setShowAddClass(false);
      setClassCode('');
      setClassTitle('');
      await fetchData(created.assignment.id);
      setMessage({ text: 'Class added to your assigned section.', error: false });
    } catch (error: any) {
      setMessage({ text: error.message || 'Unable to add class.', error: true });
    } finally {
      setSavingClass(false);
    }
  };

  const handleRosterImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedSection) return;

    setImportingRoster(true);
    setMessage(null);
    try {
      const students = file.name.toLowerCase().endsWith('.csv')
        ? parseCsv(await file.text())
        : await parseExcelRoster(await file.arrayBuffer());
      if (selectedSection.rosterCount > 0 &&
          !window.confirm(`Replace the existing ${selectedSection.rosterCount}-student roster with ${students.length} rows?`)) {
        return;
      }
      const response = await api.post<{ importedCount: number }>(
        `/teacher/sections/${encodeURIComponent(selectedSection.sectionId)}/roster/import`,
        { students }
      );
      await fetchData(selectedClass?.assignmentId);
      setSelectedSectionId(selectedSection.sectionId);
      setSelectedRosterStudent(null);
      setMessage({ text: `Imported ${response.importedCount} students into ${selectedSection.sectionName}.`, error: false });
    } catch (error: any) {
      setMessage({ text: error.message || 'Unable to import the student roster.', error: true });
    } finally {
      setImportingRoster(false);
    }
  };

  const openAddStudent = () => {
    setEditingStudent(null);
    setStudentForm({
      schoolId: '',
      fullName: '',
      courseProgram: options.programs.find(program => program.id === selectedSection?.programId)?.name || '',
      yearLevel: selectedSection?.yearLevel || '1st Year',
    });
    setStudentFormOpen(true);
  };

  const openEditStudent = (student: any) => {
    setEditingStudent(student);
    setStudentForm({
      schoolId: student.schoolId,
      fullName: student.fullName,
      courseProgram: student.courseProgram,
      yearLevel: student.yearLevel,
    });
    setStudentFormOpen(true);
  };

  const handleSaveStudent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSection) return;
    setSavingStudent(true);
    setMessage(null);
    try {
      const sectionPath = `/teacher/sections/${encodeURIComponent(selectedSection.sectionId)}/roster`;
      if (editingStudent?.rosterEntryId) {
        await api.put(`${sectionPath}/${encodeURIComponent(editingStudent.rosterEntryId)}`, studentForm);
      } else {
        await api.post(sectionPath, studentForm);
      }
      setStudentFormOpen(false);
      setEditingStudent(null);
      await fetchData(selectedClass?.assignmentId);
      setSelectedSectionId(selectedSection.sectionId);
      setSelectedRosterStudent(null);
      setMessage({
        text: editingStudent ? 'Student roster entry updated.' : `Student added to ${selectedSection.sectionName}.`,
        error: false,
      });
    } catch (error: any) {
      setMessage({ text: error.message || 'Unable to save the student roster entry.', error: true });
    } finally {
      setSavingStudent(false);
    }
  };

  const handleDeleteStudent = async (student: any) => {
    if (!selectedSection) return;
    if (!window.confirm(`Remove ${student.fullName} (${student.schoolId}) from this section? Their account and attendance history will be preserved.`)) return;
    setMessage(null);
    try {
      await api.delete(
        `/teacher/sections/${encodeURIComponent(selectedSection.sectionId)}/roster/${encodeURIComponent(student.schoolId)}`
      );
      setStudentFormOpen(false);
      setEditingStudent(null);
      await fetchData(selectedClass?.assignmentId);
      setSelectedSectionId(selectedSection.sectionId);
      setSelectedRosterStudent(null);
      setMessage({ text: `${student.fullName} was removed from ${selectedSection.sectionName}.`, error: false });
    } catch (error: any) {
      setMessage({ text: error.message || 'Unable to remove the student from the roster.', error: true });
    }
  };

  const downloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Student ID', 'Full Name', 'Degree Program', 'Year Level'],
        ['SSU-2026-00001', 'Juan Dela Cruz', 'BS Information Technology', '1st Year'],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
      XLSX.writeFile(workbook, 'section-student-roster-template.xlsx');
    } catch (error: any) {
      console.error('Failed to create Excel roster template:', error);
      setMessage({ text: error.message || 'Unable to create the Excel template.', error: true });
    }
  };

  const classSectionRoster = classes.find(classItem => classItem.sectionId === classSectionId);
  const sections = Array.from(
    new Map(classes.map(classItem => [classItem.sectionId, classItem])).values()
  );
  const selectedSection = sections.find(section => section.sectionId === selectedSectionId) || sections[0] || null;

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading classes and students...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">My Classes & Sections</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage sections and class rosters. Student IDs are checked against the imported roster during registration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAddClass(true)}
            disabled={options.sections.length === 0}
            title={options.sections.length === 0 ? 'Add a section first, then add a class to it.' : undefined}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-700 px-4 py-2.5 text-xs font-semibold text-blue-800 shadow-xs transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Class
          </button>
          <button
            type="button"
            onClick={() => setShowAddSection(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Add Section
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
          message.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {message.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs" role="tablist" aria-label="Class and section views">
        <button
          type="button"
          role="tab"
          aria-selected={activeSectionView === 'assigned'}
          onClick={() => setActiveSectionView('assigned')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeSectionView === 'assigned'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Assigned Sections ({classes.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSectionView === 'sections'}
          onClick={() => setActiveSectionView('sections')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeSectionView === 'sections'
              ? 'bg-indigo-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Sections ({sections.length})
        </button>
      </div>

      {activeSectionView === 'assigned' && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Assigned Sections ({classes.length})
          </h2>
          {classes.map(classItem => {
            const isSelected = selectedClass?.assignmentId === classItem.assignmentId;
            return (
              <button
                type="button"
                key={classItem.assignmentId}
                onClick={() => setSelectedClass(classItem)}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50/70 shadow-xs ring-1 ring-blue-400'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">{classItem.subjectCode || 'No class assigned'}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                    {classItem.sectionName}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{classItem.subjectTitle || 'Add a class to this section when ready'}</p>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-blue-600" />
                    {classItem.registeredCount} Registered
                  </span>
                  <span className="text-slate-400">{classItem.rosterCount} on roster</span>
                </div>
              </button>
            );
          })}
          {classes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
              You have no sections yet. Add a section to get started.
            </div>
          )}

        </div>

        <div className="lg:col-span-2">
          {selectedClass ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Students — {selectedClass.sectionName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedClass.subjectCode
                      ? `${selectedClass.subjectCode}: ${selectedClass.subjectTitle}`
                      : 'No class assigned to this section yet'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {selectedClass.registeredCount} registered · {selectedClass.rosterCount} on roster
                  </p>
                </div>
              </div>

              {selectedClass.students.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p>No students are listed in this section yet.</p>
                  <p className="mt-1 text-[11px] text-slate-400">Import the roster from the Sections panel below.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Student</th>
                        <th className="px-5 py-3">Degree Program</th>
                        <th className="px-5 py-3">Year Level</th>
                        <th className="px-5 py-3">Registration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedClass.students.map((student: any) => (
                        <tr key={student.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-900">{student.fullName}</div>
                            <div className="font-mono text-[11px] font-medium text-blue-700">{student.schoolId}</div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">{student.courseProgram}</td>
                          <td className="px-5 py-3.5 text-slate-500">{student.yearLevel}</td>
                          <td className="px-5 py-3.5">
                            {student.isRegistered ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" /> Registered
                              </span>
                            ) : student.registrationPending ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                                <Clock3 className="h-3 w-3" /> Pending
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                Not registered
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
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
              Select or add a section to manage its students.
            </div>
          )}
        </div>
      </div>
      )}

      {activeSectionView === 'sections' && (
      <section className="space-y-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Sections ({sections.length})</h2>
          <p className="mt-1 text-xs text-slate-500">Import or manage each section’s student roster from its student panel.</p>
        </div>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-1">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-900">All Sections</h3>
              <p className="mt-1 text-[11px] text-slate-500">{sections.length} unique sections</p>
            </div>
            <div className="divide-y divide-slate-100">
              {sections.map(section => {
                const isSelected = selectedSection?.sectionId === section.sectionId;
                return (
                  <button
                    type="button"
                    key={section.sectionId}
                    onClick={() => {
                      setSelectedSectionId(section.sectionId);
                      setSelectedRosterStudent(null);
                    }}
                    className={`w-full px-5 py-4 text-left transition ${
                      isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-900">{section.sectionName}</span>
                      <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-bold text-indigo-800">
                        {section.students.length} {section.students.length === 1 ? 'student' : 'students'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {section.registeredCount} registered · {section.rosterCount} on roster
                    </p>
                  </button>
                );
              })}
              {sections.length === 0 && (
                <p className="px-5 py-8 text-center text-xs text-slate-500">No sections available yet.</p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-2">
            {selectedSection ? (
              <>
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Students — {selectedSection.sectionName}</h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {selectedSection.students.length} students · {selectedSection.registeredCount} registered · {selectedSection.rosterCount} on roster
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openAddStudent}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-800"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Student
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedRosterStudent && handleDeleteStudent(selectedRosterStudent)}
                        disabled={!selectedRosterStudent}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                      <button
                        type="button"
                        onClick={downloadTemplate}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" /> Excel Template
                      </button>
                      <button
                        type="button"
                        onClick={() => sectionRosterFileRef.current?.click()}
                        disabled={importingRoster}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {importingRoster ? 'Importing...' : 'Import Excel'}
                      </button>
                      <input
                        ref={sectionRosterFileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        className="hidden"
                        onChange={handleRosterImport}
                      />
                    </div>
                  </div>
                </div>
                {selectedSection.students.length > 0 ? (
                  <div className="max-h-[28rem] overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                        <tr>
                          <th className="px-5 py-3">Student</th>
                          <th className="px-5 py-3">Degree Program</th>
                          <th className="px-5 py-3">Year Level</th>
                          <th className="px-5 py-3">Registration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedSection.students.map((student: any) => (
                          <tr
                            key={student.id}
                            onClick={() => setSelectedRosterStudent(student)}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedRosterStudent(student);
                              }
                            }}
                            tabIndex={0}
                            aria-selected={selectedRosterStudent?.id === student.id}
                            title={student.rosterEntryId ? 'Select this student to edit or delete' : 'Select this student'}
                            className={selectedRosterStudent?.id === student.id
                              ? 'cursor-pointer bg-blue-50 hover:bg-blue-50/60 focus:bg-blue-50/60 focus:outline-hidden'
                              : 'cursor-pointer hover:bg-blue-50/60 focus:bg-blue-50/60 focus:outline-hidden'}
                          >
                            <td className="px-5 py-3">
                              <div className="font-bold text-slate-900">{student.fullName}</div>
                              <div className="font-mono text-[11px] text-blue-700">{student.schoolId}</div>
                            </td>
                            <td className="px-5 py-3 text-slate-600">{student.courseProgram}</td>
                            <td className="px-5 py-3 text-slate-500">{student.yearLevel}</td>
                            <td className="px-5 py-3">
                              {student.isRegistered ? (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                                  Registered
                                </span>
                              ) : student.registrationPending ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                                  Pending
                                </span>
                              ) : (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                  Not registered
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-5 py-12 text-center text-xs text-slate-500">
                    No students have been added to this section yet.
                  </div>
                )}
              </>
            ) : (
              <div className="px-5 py-12 text-center text-xs text-slate-500">
                Add or select a section to see its students.
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {studentFormOpen && selectedSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveStudent} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div>
              <h2 className="text-base font-bold text-slate-900">{editingStudent ? 'Edit Student' : 'Add Student'}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {editingStudent ? 'Update this student’s roster details.' : `Add a student to the ${selectedSection.sectionName} roster.`}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Student ID *</label>
              <input
                value={studentForm.schoolId}
                onChange={event => setStudentForm({ ...studentForm, schoolId: event.target.value })}
                maxLength={80}
                disabled={!!editingStudent && (!!editingStudent.isRegistered || !!editingStudent.registrationPending)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs uppercase outline-hidden focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-500"
                required
              />
              {editingStudent && (editingStudent.isRegistered || editingStudent.registrationPending) && (
              <p className="mt-1 text-[11px] text-slate-500">
                Student ID cannot be changed while registration is active. Registered students’ displayed details come from their account.
              </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Full Name *</label>
              <input
                value={studentForm.fullName}
                onChange={event => setStudentForm({ ...studentForm, fullName: event.target.value })}
                maxLength={200}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Degree Program *</label>
              <input
                value={studentForm.courseProgram}
                onChange={event => setStudentForm({ ...studentForm, courseProgram: event.target.value })}
                maxLength={200}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Year Level *</label>
              <select
                value={studentForm.yearLevel}
                onChange={event => setStudentForm({ ...studentForm, yearLevel: event.target.value })}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs"
                required
              >
                {!['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].includes(studentForm.yearLevel) && (
                  <option value={studentForm.yearLevel}>{studentForm.yearLevel}</option>
                )}
                {['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setStudentFormOpen(false);
                  setEditingStudent(null);
                }}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStudent}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {editingStudent ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {savingStudent ? 'Saving...' : editingStudent ? 'Save Changes' : 'Add Student'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddSection} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div>
              <h2 className="text-base font-bold text-slate-900">Add Section</h2>
              <p className="mt-1 text-xs text-slate-500">Create a section now; you can add a class to it later.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Section Name *</label>
              <input
                value={sectionName}
                onChange={event => setSectionName(event.target.value)}
                placeholder="e.g. BSIT 1-A"
                maxLength={100}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Degree Program *</label>
                <select value={programId} onChange={event => setProgramId(event.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5 text-xs" required>
                  {options.programs.map(program => <option key={program.id} value={program.id}>{program.code} — {program.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Year Level *</label>
                <select value={yearLevel} onChange={event => setYearLevel(event.target.value)} className="w-full rounded-xl border border-slate-300 p-2.5 text-xs" required>
                  {['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map(year => <option key={year}>{year}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setShowAddSection(false)} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button type="submit" disabled={savingSection || !options.programs.length} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" />
                {savingSection ? 'Adding...' : 'Add Section'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddClass} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div>
              <h2 className="text-base font-bold text-slate-900">Add Class</h2>
              <p className="mt-1 text-xs text-slate-500">Create a subject and assign it to one of your sections.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Class Code *</label>
                <input
                  value={classCode}
                  onChange={event => setClassCode(event.target.value)}
                  placeholder="e.g. IT-101"
                  maxLength={30}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs uppercase outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Units *</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={classUnits}
                  onChange={event => setClassUnits(Number(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Class Title *</label>
              <input
                value={classTitle}
                onChange={event => setClassTitle(event.target.value)}
                placeholder="e.g. Introduction to Computing"
                maxLength={200}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Assigned Section *</label>
              <select
                value={classSectionId}
                onChange={event => setClassSectionId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs"
                required
              >
                {options.sections.map(section => (
                  <option key={section.id} value={section.id}>{section.name} — {section.yearLevel}</option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-800">
                    Students in {options.sections.find(section => section.id === classSectionId)?.name || 'selected section'}
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Only students approved for this section and class will see it in their student portal.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-blue-800">
                  {classSectionRoster?.students?.length || 0} students
                </span>
              </div>
              {classSectionRoster?.students?.length ? (
                <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-blue-100 bg-white">
                  {classSectionRoster.students.map((student: { id: string; fullName: string; schoolId: string; isRegistered: boolean }) => (
                    <div key={student.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-slate-800">{student.fullName}</p>
                        <p className="font-mono text-[10px] text-slate-500">{student.schoolId}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        student.isRegistered ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {student.isRegistered ? 'Registered in section' : 'Not registered'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-blue-200 bg-white px-3 py-4 text-center text-[11px] text-slate-500">
                  No students are listed in this section yet. Add the class, then import the section roster.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setShowAddClass(false)} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button type="submit" disabled={savingClass || !options.sections.length} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" />
                {savingClass ? 'Adding...' : 'Add Class'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
