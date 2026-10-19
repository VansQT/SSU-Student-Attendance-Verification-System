import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { LoginPage } from './pages/auth/LoginPage';

// Admin pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminTeachers } from './pages/admin/AdminTeachers';
import { AdminStudents } from './pages/admin/AdminStudents';
import { AdminAcademicLocations } from './pages/admin/AdminAcademicLocations';
import { AdminSubjectsSections } from './pages/admin/AdminSubjectsSections';
import { AdminAttendanceMonitor } from './pages/admin/AdminAttendanceMonitor';
import { AdminReports } from './pages/admin/AdminReports';
import { AdminAuditLogs } from './pages/admin/AdminAuditLogs';
import { AdminSettings } from './pages/admin/AdminSettings';

// Teacher pages
import { TeacherDashboard } from './pages/teacher/TeacherDashboard';
import { TeacherClasses } from './pages/teacher/TeacherClasses';
import { TeacherRegistrationLinks } from './pages/teacher/TeacherRegistrationLinks';
import { TeacherPendingApprovals } from './pages/teacher/TeacherPendingApprovals';
import { TeacherAttendanceSessions } from './pages/teacher/TeacherAttendanceSessions';
import { TeacherProfileSettings } from './pages/teacher/TeacherProfileSettings';

// Student pages
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentAttendanceVerification } from './pages/student/StudentAttendanceVerification';
import { StudentClasses } from './pages/student/StudentClasses';
import { StudentHistory } from './pages/student/StudentHistory';
import { StudentProfileSettings } from './pages/student/StudentProfileSettings';

// Public pages
import { StudentRegistrationPage } from './pages/public/StudentRegistrationPage';
import { StudentAttendanceSessionPage } from './pages/public/StudentAttendanceSessionPage';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Direct Token Handlers (from URL or Teacher Link Previewers)
  const [activeRegistrationToken, setActiveRegistrationToken] = useState<string | null>(null);
  const [activeAttendanceSessionToken, setActiveAttendanceSessionToken] = useState<string | null>(null);

  // Check URL query params on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const regToken = params.get('registerToken');
    const attToken = params.get('sessionToken');
    if (regToken) {
      setActiveRegistrationToken(regToken);
    } else if (attToken) {
      setActiveAttendanceSessionToken(attToken);
    }
  }, []);

  // Set default tab based on user role when user changes
  useEffect(() => {
    if (user) {
      if (user.role === 'ADMIN') {
        setCurrentTab('admin-dashboard');
      } else if (user.role === 'TEACHER') {
        setCurrentTab('teacher-dashboard');
      } else if (user.role === 'STUDENT') {
        setCurrentTab('student-dashboard');
      }
    }
  }, [user?.role]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-700">Connecting to Samar State University Attendance System...</p>
        </div>
      </div>
    );
  }

  // 1. Direct Public Student Registration Link Screen
  if (activeRegistrationToken) {
    return (
      <StudentRegistrationPage
        token={activeRegistrationToken}
        onCancel={() => {
          setActiveRegistrationToken(null);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // 2. Direct Public Attendance Session Link Screen
  if (activeAttendanceSessionToken) {
    return (
      <StudentAttendanceSessionPage
        token={activeAttendanceSessionToken}
        onClose={() => {
          setActiveAttendanceSessionToken(null);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // 3. If Not Logged In
  if (!user) {
    return <LoginPage />;
  }

  // Render appropriate content based on role and tab
  const renderContent = () => {
    // Admin Views
    if (user.role === 'ADMIN') {
      switch (currentTab) {
        case 'admin-dashboard':
          return <AdminDashboard onNavigate={setCurrentTab} />;
        case 'admin-teachers':
          return <AdminTeachers />;
        case 'admin-students':
          return <AdminStudents />;
        case 'admin-academic':
          return <AdminAcademicLocations />;
        case 'admin-subjects':
          return <AdminSubjectsSections />;
        case 'admin-monitoring':
          return <AdminAttendanceMonitor />;
        case 'admin-reports':
          return <AdminReports />;
        case 'admin-audit':
          return <AdminAuditLogs />;
        case 'admin-settings':
          return <AdminSettings />;
        default:
          return <AdminDashboard onNavigate={setCurrentTab} />;
      }
    }

    // Teacher Views
    if (user.role === 'TEACHER') {
      switch (currentTab) {
        case 'teacher-dashboard':
          return <TeacherDashboard onNavigate={setCurrentTab} />;
        case 'teacher-classes':
          return <TeacherClasses />;
        case 'teacher-registration-links':
          return (
            <TeacherRegistrationLinks
              onOpenPublicRegistration={token => setActiveRegistrationToken(token)}
            />
          );
        case 'teacher-approvals':
          return <TeacherPendingApprovals />;
        case 'teacher-sessions':
          return (
            <TeacherAttendanceSessions
              onOpenPublicSession={token => setActiveAttendanceSessionToken(token)}
            />
          );
        case 'teacher-reports':
          return <AdminReports />;
        case 'teacher-profile':
          return <TeacherProfileSettings />;
        default:
          return <TeacherDashboard onNavigate={setCurrentTab} />;
      }
    }

    // Student Views
    if (user.role === 'STUDENT') {
      switch (currentTab) {
        case 'student-dashboard':
          return (
            <StudentDashboard
              onNavigate={(tab, params) => {
                if (params?.sessionToken) {
                  setActiveAttendanceSessionToken(params.sessionToken);
                } else {
                  setCurrentTab(tab);
                }
              }}
              onLaunchSessionVerification={token => setActiveAttendanceSessionToken(token)}
            />
          );
        case 'student-attendance':
          return <StudentAttendanceVerification onDone={() => setCurrentTab('student-dashboard')} />;
        case 'student-classes':
          return <StudentClasses />;
        case 'student-history':
          return <StudentHistory />;
        case 'student-profile':
          return <StudentProfileSettings />;
        default:
          return (
            <StudentDashboard
              onNavigate={(tab, params) => {
                if (params?.sessionToken) {
                  setActiveAttendanceSessionToken(params.sessionToken);
                } else {
                  setCurrentTab(tab);
                }
              }}
            />
          );
      }
    }

    return <div>Welcome to Samar State University</div>;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <Header
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        currentPageTitle={currentTab}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
