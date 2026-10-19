import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  FileText,
  ShieldCheck,
  Settings,
  Link as LinkIcon,
  UserCheck,
  Clock,
  History,
  QrCode,
  MapPin,
  HelpCircle,
  UserCog,
  UserRound,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tabId: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, isOpen = false, onClose }) => {
  const { user } = useAuth();
  const role = user?.role || 'STUDENT';

  const adminNav = [
    { id: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'admin-teachers', label: 'Teacher Management', icon: Users },
    { id: 'admin-students', label: 'Student Directory', icon: GraduationCap },
    { id: 'admin-academic', label: 'Academic & Locations', icon: MapPin },
    { id: 'admin-subjects', label: 'Subjects & Sections', icon: BookOpen },
    { id: 'admin-monitoring', label: 'Attendance Monitor', icon: CalendarCheck },
    { id: 'admin-reports', label: 'Reports & Exports', icon: FileText },
    { id: 'admin-audit', label: 'Audit Logs', icon: ShieldCheck },
    { id: 'admin-settings', label: 'System Settings', icon: Settings },
  ];

  const teacherNav = [
    { id: 'teacher-dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'teacher-classes', label: 'My Classes', icon: BookOpen },
    { id: 'teacher-registration-links', label: 'Registration Links', icon: LinkIcon },
    { id: 'teacher-approvals', label: 'Pending Approvals', icon: UserCheck },
    { id: 'teacher-sessions', label: 'Attendance Sessions', icon: Clock },
    { id: 'teacher-reports', label: 'Attendance Records', icon: FileText },
    { id: 'teacher-profile', label: 'Profile Settings', icon: UserCog },
  ];

  const studentNav = [
    { id: 'student-dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'student-attendance', label: 'Verify Attendance', icon: QrCode },
    { id: 'student-classes', label: 'My Classes', icon: BookOpen },
    { id: 'student-history', label: 'Attendance History', icon: History },
    { id: 'student-profile', label: 'Profile Settings', icon: UserRound },
  ];

  const items = role === 'ADMIN' ? adminNav : role === 'TEACHER' ? teacherNav : studentNav;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4 space-y-6">
          {/* Header in sidebar */}
          <div className="px-2 py-2 border-b border-slate-800">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Navigation Portal
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-bold text-white capitalize">
                {role.toLowerCase()} Workspace
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700">
                v1.0-SSU
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {items.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    if (onClose) onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30 font-bold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Info Footnote */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300">Samar State University</p>
          <p className="text-[10px] text-slate-400">Catbalogan City, Samar</p>
          <p className="text-[10px] text-slate-400">CITC Attendance Engine</p>
        </div>
      </aside>
    </>
  );
};
