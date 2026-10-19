import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { RegistrationLink } from '../../types';
import { Link as LinkIcon, Plus, Copy, Check, ShieldAlert, Clock, ExternalLink } from 'lucide-react';

interface TeacherRegistrationLinksProps {
  onOpenPublicRegistration?: (token: string) => void;
}

export const TeacherRegistrationLinks: React.FC<TeacherRegistrationLinksProps> = ({ onOpenPublicRegistration }) => {
  const [links, setLinks] = useState<RegistrationLink[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [durationHours, setDurationHours] = useState<number>(48);
  const [creating, setCreating] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [linksData, classesData] = await Promise.all([
        api.get<RegistrationLink[]>('/teacher/registration-links'),
        api.get<any[]>('/teacher/my-classes'),
      ]);
      setLinks(linksData);
      setClasses(classesData);
      const sections = Array.from(
        new Map(classesData.filter(item => item.subjectId).map(item => [item.sectionId, item])).values()
      );
      if (sections.length > 0 && !sections.some(section => section.sectionId === selectedSectionId)) {
        setSelectedSectionId(sections[0].sectionId);
      }
    } catch (err) {
      console.error('Error fetching registration links:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSectionId) return;
    setCreating(true);
    try {
      await api.post('/teacher/registration-links', {
        sectionId: selectedSectionId,
        durationHours,
      });
      setShowCreateModal(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create registration link.');
    } finally {
      setCreating(false);
    }
  };

  const sections = Array.from(
    new Map(classes.filter(item => item.subjectId).map(item => [item.sectionId, item])).values()
  );

  const handleRevoke = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this registration link? Students will no longer be able to use it.')) return;
    try {
      await api.post(`/teacher/registration-links/${linkId}/revoke`);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke registration link.');
    }
  };

  const copyToClipboard = (token: string) => {
    const fullUrl = `${window.location.origin}?registerToken=${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <LinkIcon className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Student Registration Links</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Generate secure, cryptographically unpredictable registration links for your assigned sections.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Create Registration Link
        </button>
      </div>

      {/* Notice on Registration Links vs Attendance Links */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Important Architectural Distinction:</span> This link is for{' '}
          <span className="underline font-bold">Initial Student Registration</span> (student ID verification and face enrollment). It is completely separate from an{' '}
          <span className="font-bold">Attendance Session Link</span>.
        </div>
      </div>

      {/* Table of Links */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Generated Links</h2>
          <span className="text-xs text-slate-500">{links.length} total generated</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading registration links...</div>
        ) : links.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No registration links created yet. Click "Create Registration Link" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Subject & Section</th>
                  <th className="px-6 py-3">Secure Token</th>
                  <th className="px-6 py-3">Expires At</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Registrations</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {links.map(link => (
                  <tr key={link.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{link.subjectCode} - {link.subjectTitle}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{link.sectionName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-[11px] bg-slate-100 px-2 py-1 rounded text-slate-700 font-mono">
                        {link.token}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(link.expiresAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {link.status === 'ACTIVE' && (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-300">
                          ACTIVE
                        </span>
                      )}
                      {link.status === 'EXPIRED' && (
                        <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-slate-300">
                          EXPIRED
                        </span>
                      )}
                      {link.status === 'REVOKED' && (
                        <span className="bg-red-100 text-red-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-red-300">
                          REVOKED
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-semibold">
                      {link.requestCount || 0} submissions
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(link.token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] transition"
                        title="Copy student registration URL"
                      >
                        {copiedToken === link.token ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>

                      {onOpenPublicRegistration && link.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => onOpenPublicRegistration(link.token)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-[11px] transition"
                          title="Open student registration page directly"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open Form</span>
                        </button>
                      )}

                      {link.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(link.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-medium text-[11px] transition"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Link Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Create Student Registration Link</h3>
            <p className="text-xs text-slate-500 mb-4">
              Select an assigned section. Students on its roster can register for the classes assigned to that section.
            </p>

            <form onSubmit={handleCreateLink} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Section</label>
                <select
                  value={selectedSectionId}
                  onChange={e => setSelectedSectionId(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  required
                >
                  {sections.map(section => (
                    <option key={section.sectionId} value={section.sectionId}>
                      {section.sectionName} — {section.yearLevel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Link Expiration Duration</label>
                <select
                  value={durationHours}
                  onChange={e => setDurationHours(Number(e.target.value))}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-600 outline-hidden"
                >
                  <option value={2}>2 Hours (Quick In-Class Enrollment)</option>
                  <option value={24}>24 Hours (1 Day)</option>
                  <option value={48}>48 Hours (2 Days - Recommended)</option>
                  <option value={168}>7 Days (1 Week)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || sections.length === 0}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                >
                  {creating ? 'Generating...' : 'Generate Secure Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
