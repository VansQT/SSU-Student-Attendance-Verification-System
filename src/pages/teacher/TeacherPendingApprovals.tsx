import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { RegistrationRequest } from '../../types';
import { UserCheck, CheckCircle2, XCircle, AlertCircle, QrCode, Shield, RefreshCw } from 'lucide-react';

export const TeacherPendingApprovals: React.FC = () => {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRequest, setSelectedRequest] = useState<RegistrationRequest | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await api.get<RegistrationRequest[]>('/teacher/pending-registrations');
      setRequests(data);
    } catch (err) {
      console.error('Error fetching pending registrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (request: RegistrationRequest) => {
    if (!confirm(`Approve student registration for ${request.fullName} (${request.schoolId}) into ${request.sectionName}?`)) return;
    setActionInProgress(true);
    try {
      await api.post(`/teacher/registrations/${request.id}/approve`);
      await fetchPending();
    } catch (err: any) {
      alert(err.message || 'Failed to approve registration.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleOpenReject = (request: RegistrationRequest) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setRejectModalOpen(true);
  };

  const submitReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !rejectionReason.trim()) return;
    setActionInProgress(true);
    try {
      await api.post(`/teacher/registrations/${selectedRequest.id}/reject`, {
        rejectionReason: rejectionReason.trim(),
      });
      setRejectModalOpen(false);
      setSelectedRequest(null);
      await fetchPending();
    } catch (err: any) {
      alert(err.message || 'Failed to reject registration.');
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Student Registration Approvals</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review student personal details, scanned printed ID QR codes, and facial biometric enrollment before activating attendance eligibility.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchPending}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          Refresh Requests
        </button>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Pending Submissions ({requests.filter(r => r.status === 'PENDING').length})
          </h2>
          <span className="text-xs text-slate-500">Institutional Identity Verification</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading pending requests...</div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No student registration requests currently pending review.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map(request => (
              <div key={request.id} className="p-6 hover:bg-slate-50/70 transition flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                {/* Student Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900 text-sm">{request.fullName}</span>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {request.schoolId}
                    </span>
                    {request.status === 'PENDING' && (
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                        PENDING REVIEW
                      </span>
                    )}
                    {request.status === 'APPROVED' && (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                        APPROVED
                      </span>
                    )}
                    {request.status === 'REJECTED' && (
                      <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-300">
                        REJECTED
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1 gap-x-4 text-xs text-slate-500">
                    <div>
                      <span className="font-medium text-slate-700">Course: </span>
                      {request.courseProgram} ({request.yearLevel})
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Section: </span>
                      <span className="font-semibold text-slate-800">{request.sectionName}</span>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Subject: </span>
                      {request.subjectCode} - {request.subjectTitle}
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Email: </span>
                      {request.email}
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Submitted: </span>
                      {new Date(request.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {/* Verification Elements Box */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    {/* Printed QR Check */}
                    <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-mono text-slate-700 border border-slate-200">
                      <QrCode className="w-3.5 h-3.5 text-blue-600" />
                      <span>Printed QR: {request.qrValue}</span>
                    </div>

                    {/* Biometric Check */}
                    <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl text-xs text-emerald-800 border border-emerald-200">
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Face recognition template captured</span>
                    </div>
                  </div>

                  {request.rejectionReason && (
                    <div className="text-xs text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Rejection Reason: {request.rejectionReason}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {request.status === 'PENDING' && (
                  <div className="flex items-center gap-2 self-end lg:self-center">
                    <button
                      type="button"
                      disabled={actionInProgress}
                      onClick={() => handleApprove(request)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Student
                    </button>
                    <button
                      type="button"
                      disabled={actionInProgress}
                      onClick={() => handleOpenReject(request)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs rounded-xl border border-red-200 transition"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Reject Registration</h3>
            <p className="text-xs text-slate-500 mb-4">
              Please specify the reason for rejecting <span className="font-semibold text-slate-700">{selectedRequest.fullName}</span> ({selectedRequest.schoolId}).
            </p>

            <form onSubmit={submitReject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rejection Reason *</label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g. Scanned QR code does not match official Samar State University student ID records, or blurry face capture."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 h-24 focus:ring-2 focus:ring-red-600 outline-hidden"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                >
                  {actionInProgress ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
