import React, { useState } from 'react';
import { StudentAttendanceVerification } from '../student/StudentAttendanceVerification';
import { ArrowLeft, GraduationCap } from 'lucide-react';

interface StudentAttendanceSessionPageProps {
  token: string;
  onClose?: () => void;
}

export const StudentAttendanceSessionPage: React.FC<StudentAttendanceSessionPageProps> = ({
  token,
  onClose,
}) => {
  const [sessionExpired, setSessionExpired] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {onClose && !sessionExpired && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </button>
        )}

        <StudentAttendanceVerification
          initialSessionToken={token}
          onDone={onClose}
          onSessionExpired={() => setSessionExpired(true)}
        />
      </div>
    </div>
  );
};
