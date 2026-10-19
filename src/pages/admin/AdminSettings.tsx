import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { SystemSettings } from '../../types';
import { Settings, Save, CheckCircle2, Shield, Plus, Pencil, Trash2, X, Upload, Image } from 'lucide-react';

interface DegreeProgram {
  id: string;
  code: string;
  name: string;
  department: string;
}

export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [programs, setPrograms] = useState<DegreeProgram[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [programForm, setProgramForm] = useState({ code: '', name: '', department: '' });
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [programBusy, setProgramBusy] = useState<boolean>(false);
  const [programMessage, setProgramMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [logoBusy, setLogoBusy] = useState<boolean>(false);
  const [logoMessage, setLogoMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<SystemSettings>('/admin/settings'),
      api.get<{ programs: DegreeProgram[] }>('/admin/academic-data'),
    ])
      .then(([settingsData, academicData]) => {
        setSettings(settingsData);
        setPrograms(academicData.programs);
      })
      .catch(err => {
        console.error('Failed to load settings and degree programs:', err);
        setProgramMessage({ text: err.message || 'Failed to load degree programs.', error: true });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await api.put('/admin/settings', settings);
      window.dispatchEvent(new Event('system-branding-updated'));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setLogoMessage({ text: 'Choose a PNG, JPEG, or WebP image.', error: true });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoMessage({ text: 'The logo must be smaller than 2 MB.', error: true });
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setLogoMessage({ text: 'Unable to read the selected image.', error: true });
    reader.onload = async () => {
      if (typeof reader.result !== 'string') {
        setLogoMessage({ text: 'Unable to read the selected image.', error: true });
        return;
      }
      setLogoBusy(true);
      setLogoMessage(null);
      try {
        const result = await api.put<{ logoDataUrl: string }>('/admin/settings/logo', {
          logoDataUrl: reader.result,
        });
        setSettings(current => current ? { ...current, logoDataUrl: result.logoDataUrl } : current);
        window.dispatchEvent(new Event('system-branding-updated'));
        setLogoMessage({ text: 'System logo updated successfully.', error: false });
      } catch (err: any) {
        setLogoMessage({ text: err.message || 'Unable to update the system logo.', error: true });
      } finally {
        setLogoBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLogoRemove = async () => {
    setLogoBusy(true);
    setLogoMessage(null);
    try {
      await api.delete('/admin/settings/logo');
      setSettings(current => {
        if (!current) return current;
        const { logoDataUrl: _removedLogo, ...remainingSettings } = current;
        return remainingSettings;
      });
      window.dispatchEvent(new Event('system-branding-updated'));
      setLogoMessage({ text: 'Custom logo removed. The default system emblem is now shown.', error: false });
    } catch (err: any) {
      setLogoMessage({ text: err.message || 'Unable to remove the system logo.', error: true });
    } finally {
      setLogoBusy(false);
    }
  };

  const resetProgramForm = () => {
    setProgramForm({ code: '', name: '', department: '' });
    setEditingProgramId(null);
  };

  const handleProgramSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProgramBusy(true);
    setProgramMessage(null);
    const payload = {
      code: programForm.code.trim(),
      name: programForm.name.trim(),
      department: programForm.department.trim(),
    };
    try {
      if (editingProgramId) {
        const updated = await api.put<DegreeProgram>(`/admin/programs/${editingProgramId}`, payload);
        setPrograms(current => current.map(program => program.id === updated.id ? updated : program));
        setProgramMessage({ text: 'Degree program updated.', error: false });
      } else {
        const created = await api.post<DegreeProgram>('/admin/programs', payload);
        setPrograms(current => [...current, created]);
        setProgramMessage({ text: 'Degree program added.', error: false });
      }
      resetProgramForm();
    } catch (err: any) {
      setProgramMessage({ text: err.message || 'Unable to save degree program.', error: true });
    } finally {
      setProgramBusy(false);
    }
  };

  const handleDeleteProgram = async (program: DegreeProgram) => {
    if (!window.confirm(`Delete ${program.code} — ${program.name}?`)) return;
    setProgramBusy(true);
    setProgramMessage(null);
    try {
      await api.delete(`/admin/programs/${program.id}`);
      setPrograms(current => current.filter(item => item.id !== program.id));
      if (editingProgramId === program.id) resetProgramForm();
      setProgramMessage({ text: 'Degree program deleted.', error: false });
    } catch (err: any) {
      setProgramMessage({ text: err.message || 'Unable to delete degree program.', error: true });
    } finally {
      setProgramBusy(false);
    }
  };

  if (loading || !settings) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading system settings...</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-xl">
              <Settings className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">System Policies & Settings</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure institutional verification thresholds, session timeouts, and biometric matching parameters.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        {saveSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved and applied university-wide successfully!</span>
          </div>
        )}

        {/* Section 1: Institution Branding */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Institution Identity</h3>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700">System Logo</label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                {settings.logoDataUrl ? (
                  <img src={settings.logoDataUrl} alt="Current system logo" className="h-full w-full object-cover" />
                ) : (
                  <Image className="h-8 w-8 text-slate-400" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 ${logoBusy ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload className="h-4 w-4" />
                  {logoBusy ? 'Uploading...' : settings.logoDataUrl ? 'Edit Logo' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    disabled={logoBusy}
                    className="sr-only"
                  />
                </label>
                {settings.logoDataUrl && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    disabled={logoBusy}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-slate-500">PNG, JPEG, or WebP. Maximum file size: 2 MB. The uploaded logo is shown across the system.</p>
            {logoMessage && (
              <div className={`rounded-xl border p-3 text-xs ${
                logoMessage.error
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}>
                {logoMessage.text}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Institution Name</label>
            <input
              type="text"
              value={settings.institutionName}
              onChange={e => setSettings({ ...settings, institutionName: e.target.value })}
              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
        </div>

        {/* Section 2: Attendance Thresholds */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attendance Rules & Thresholds</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Default Late Threshold (Minutes)</label>
              <input
                type="number"
                value={settings.defaultLateThresholdMinutes}
                onChange={e => setSettings({ ...settings, defaultLateThresholdMinutes: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                min={1}
                max={60}
              />
              <span className="text-[10px] text-slate-400">Time window before attendance changes from Present to Late</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Default Session Duration (Minutes)</label>
              <input
                type="number"
                value={settings.defaultSessionDurationMinutes}
                onChange={e => setSettings({ ...settings, defaultSessionDurationMinutes: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                min={5}
                max={240}
              />
              <span className="text-[10px] text-slate-400">Total duration an attendance session remains open</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Registration Link Duration (Hours)</label>
              <input
                type="number"
                value={settings.defaultRegLinkDurationHours}
                onChange={e => setSettings({ ...settings, defaultRegLinkDurationHours: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                min={1}
                max={720}
              />
              <span className="text-[10px] text-slate-400">Default expiration duration for teacher registration links</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Classroom Geofence Radius (Meters)</label>
              <input
                type="number"
                value={settings.maxLocationDistanceMeters}
                onChange={e => setSettings({ ...settings, maxLocationDistanceMeters: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                min={20}
                max={500}
              />
              <span className="text-[10px] text-slate-400">Maximum allowed GPS boundary tolerance from classroom</span>
            </div>
          </div>
        </div>

        {/* Section 3: Biometric Security */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            Biometric & Verification Policies
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <label className="font-bold text-slate-700">Face Recognition Match Strictness</label>
                <span className="font-mono font-bold text-blue-700">{(settings.faceMatchThreshold * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.9"
                max="1"
                step="0.01"
                value={settings.faceMatchThreshold}
                onChange={e => setSettings({ ...settings, faceMatchThreshold: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
              <span className="text-[10px] text-slate-400">Higher values require a closer local face-recognition match. Keep at 95% or higher; values below 90% are not allowed.</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="font-bold text-slate-800">Enforce Active Liveness Detection</span>
                <p className="text-[11px] text-slate-500">Require natural eye blink or head micro-movement to prevent photo spoofing</p>
              </div>
              <input
                type="checkbox"
                checked={settings.requireLivenessCheck}
                onChange={e => setSettings({ ...settings, requireLivenessCheck: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="font-bold text-slate-800">Allow Instructor Manual Overrides</span>
                <p className="text-[11px] text-slate-500">Permit teachers to record overrides with mandatory written justification</p>
              </div>
              <input
                type="checkbox"
                checked={settings.allowTeacherOverride}
                onChange={e => setSettings({ ...settings, allowTeacherOverride: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="font-bold text-slate-800">Auto-Finalize Expired Sessions as Absent</span>
                <p className="text-[11px] text-slate-500">Automatically mark unrecorded enrolled students as absent upon session close</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoCloseExpiredSessions}
                onChange={e => setSettings({ ...settings, autoCloseExpiredSessions: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Settings...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Degree Programs</h2>
          <p className="mt-1 text-xs text-slate-500">
            Manage degree programs available in the teacher’s Add Section dropdown.
          </p>
        </div>

        {programMessage && (
          <div className={`rounded-xl border p-3 text-xs ${
            programMessage.error
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}>
            {programMessage.text}
          </div>
        )}

        <form onSubmit={handleProgramSubmit} className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Program Code *</label>
            <input
              value={programForm.code}
              onChange={event => setProgramForm({ ...programForm, code: event.target.value })}
              placeholder="e.g. BSIT"
              maxLength={30}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs uppercase outline-hidden focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Department *</label>
            <input
              value={programForm.department}
              onChange={event => setProgramForm({ ...programForm, department: event.target.value })}
              placeholder="e.g. College of Computing"
              maxLength={100}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-700">Degree Program Name *</label>
            <input
              value={programForm.name}
              onChange={event => setProgramForm({ ...programForm, name: event.target.value })}
              placeholder="e.g. Bachelor of Science in Information Technology"
              maxLength={200}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs outline-hidden focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 sm:justify-end">
            {editingProgramId && (
              <button
                type="button"
                onClick={resetProgramForm}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
              >
                <X className="h-3.5 w-3.5" /> Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={programBusy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {editingProgramId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {programBusy ? 'Saving...' : editingProgramId ? 'Update Program' : 'Add Program'}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Degree Program</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programs.map(program => (
                <tr key={program.id}>
                  <td className="px-4 py-3 font-bold text-blue-800">{program.code}</td>
                  <td className="px-4 py-3 text-slate-800">{program.name}</td>
                  <td className="px-4 py-3 text-slate-600">{program.department}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${program.code}`}
                        onClick={() => {
                          setProgramForm({ code: program.code, name: program.name, department: program.department });
                          setEditingProgramId(program.id);
                          setProgramMessage(null);
                        }}
                        className="rounded-lg p-2 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${program.code}`}
                        onClick={() => handleDeleteProgram(program)}
                        disabled={programBusy}
                        className="rounded-lg p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No degree programs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
