import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Users, Plus, CheckCircle2, XCircle, BookOpen, Shield } from 'lucide-react';

export const AdminTeachers: React.FC = () => {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [academic, setAcademic] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // New Teacher Modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newFullName, setNewFullName] = useState<string>('');
  const [newFacultyId, setNewFacultyId] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newDepartment, setNewDepartment] = useState<string>('CITC');
  const [newTitle, setNewTitle] = useState<string>('Instructor');
  const [newPassword, setNewPassword] = useState<string>('Password123!');
  const [creating, setCreating] = useState<boolean>(false);

  // Assign Subject/Section Modal
  const [assignModalOpen, setAssignModalOpen] = useState<boolean>(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [assigning, setAssigning] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teachersData, academicData] = await Promise.all([
        api.get<any[]>('/admin/teachers'),
        api.get<any>('/admin/academic-data'),
      ]);
      setTeachers(teachersData);
      setAcademic(academicData);
      if (academicData.subjects?.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(academicData.subjects[0].id);
      }
      if (academicData.sections?.length > 0 && !selectedSectionId) {
        setSelectedSectionId(academicData.sections[0].id);
      }
    } catch (err) {
      console.error('Error fetching teachers data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/admin/teachers', {
        fullName: newFullName.trim(),
        facultyId: newFacultyId.trim(),
        email: newEmail.trim(),
        username: newUsername.trim(),
        department: newDepartment.trim(),
        title: newTitle.trim(),
        password: newPassword,
      });
      setShowAddModal(false);
      setNewFullName('');
      setNewFacultyId('');
      setNewEmail('');
      setNewUsername('');
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create teacher.');
    } finally {
      setCreating(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher || !selectedSubjectId || !selectedSectionId) return;
    setAssigning(true);
    try {
      await api.post('/admin/teacher-assignments', {
        teacherId: selectedTeacher.id,
        subjectId: selectedSubjectId,
        sectionId: selectedSectionId,
      });
      setAssignModalOpen(false);
      setSelectedTeacher(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to assign class.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-800 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Faculty & Instructor Management</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage teacher profiles, access credentials, and subject/section teaching assignments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Add Faculty Member
        </button>
      </div>

      {/* Teachers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Faculty Directory ({teachers.length})</h2>
          <span className="text-xs text-slate-500">Samar State University CITC</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading faculty accounts...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Instructor Name</th>
                  <th className="px-6 py-3.5">Faculty ID</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Assigned Classes</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{t.fullName}</div>
                      <div className="text-[11px] text-slate-500">{t.email} • {t.title}</div>
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold text-blue-700">{t.facultyId}</td>
                    <td className="px-6 py-4 text-slate-600">{t.department}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {t.assignments && t.assignments.length > 0 ? (
                          t.assignments.map((a: any) => (
                            <span
                              key={a.id}
                              className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-700 border border-slate-200 font-medium"
                            >
                              {a.subjectCode} ({a.sectionName})
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">No classes assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {t.isActive ? (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px] border border-emerald-300">
                          Active
                        </span>
                      ) : (
                        <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full text-[10px] border border-rose-300">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeacher(t);
                          setAssignModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold text-[11px] transition"
                      >
                        Assign Class
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Create Teacher Account</h3>
            <p className="text-xs text-slate-500 mb-4">
              Add a new faculty member with institutional email and credentials.
            </p>

            <form onSubmit={handleCreateTeacher} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  placeholder="e.g. Engr. Allan Gomez, M.Eng."
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Faculty ID *</label>
                  <input
                    type="text"
                    value={newFacultyId}
                    onChange={e => setNewFacultyId(e.target.value)}
                    placeholder="e.g. FAC-2022-088"
                    className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Title / Rank</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="e.g. Assistant Professor"
                    className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">SSU Email Address *</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="e.g. allan.gomez@ssu.edu.ph"
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="e.g. agomez"
                    className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Temporary Password</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl shadow-xs transition"
                >
                  {creating ? 'Saving...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Class Modal */}
      {assignModalOpen && selectedTeacher && academic && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Assign Class to Instructor</h3>
            <p className="text-xs text-slate-500 mb-4">
              Authorize <span className="font-bold text-slate-800">{selectedTeacher.fullName}</span> to manage attendance for a subject and section.
            </p>

            <form onSubmit={handleAssignSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Subject *</label>
                <select
                  value={selectedSubjectId}
                  onChange={e => setSelectedSubjectId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                >
                  {academic.subjects?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.code}: {s.title} ({s.units} Units)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Section *</label>
                <select
                  value={selectedSectionId}
                  onChange={e => setSelectedSectionId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                >
                  {academic.sections?.map((sec: any) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name} ({sec.yearLevel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl shadow-xs transition"
                >
                  {assigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
