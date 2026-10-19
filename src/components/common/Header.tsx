import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, LogOut, Menu } from 'lucide-react';
import { Role } from '../../types';
import { api } from '../../services/api';

interface HeaderProps {
  onToggleSidebar?: () => void;
  currentPageTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, currentPageTitle }) => {
  const { user, profile, logout, switchRoleDemo } = useAuth();
  const [branding, setBranding] = useState<{ institutionName: string; logoDataUrl: string | null }>({
    institutionName: 'Samar State University',
    logoDataUrl: null,
  });

  useEffect(() => {
    const loadBranding = () => {
      api.get<{ institutionName: string; logoDataUrl: string | null }>('/public/branding')
        .then(setBranding)
        .catch(error => console.error('Failed to load system branding:', error));
    };
    loadBranding();
    window.addEventListener('system-branding-updated', loadBranding);
    return () => window.removeEventListener('system-branding-updated', loadBranding);
  }, []);

  const getRoleBadge = (role?: Role) => {
    switch (role) {
      case 'ADMIN':
        return <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-purple-300">Administrator</span>;
      case 'TEACHER':
        return <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-300">Instructor</span>;
      case 'STUDENT':
        return <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">Student</span>;
      default:
        return null;
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            title="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* SSU Logo / Seal Mark */}
          <div className="flex items-center gap-2.5">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 flex items-center justify-center text-white shadow-md shadow-blue-900/20">
              {branding.logoDataUrl ? (
                <img src={branding.logoDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <GraduationCap className="w-6 h-6 text-amber-300" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base tracking-wide uppercase font-extrabold text-[#2563eb] hidden sm:inline">
                  {branding.institutionName}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-none hidden sm:block">
                Student Attendance Verification System
              </p>
            </div>
          </div>
        </div>

        {/* User profile */}
        <div className="flex items-center gap-3">
          {/* User profile card */}
          {user ? (
            <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xs font-bold text-slate-800">
                    {profile?.fullName || user.username}
                  </span>
                  {getRoleBadge(user.role)}
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  {user.role === 'STUDENT' ? profile?.schoolId || user.username : user.email}
                </p>
              </div>
              {user.role === 'TEACHER' && profile?.profilePhoto && (
                <img
                  src={profile.profilePhoto}
                  alt=""
                  className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                />
              )}

              <button
                type="button"
                onClick={() => logout()}
                className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => switchRoleDemo('STUDENT')}
                className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-800"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
