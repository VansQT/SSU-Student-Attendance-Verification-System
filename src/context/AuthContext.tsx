import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role, StudentProfile, TeacherProfile } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  profile: any;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchRoleDemo: (role: Role) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('ssu_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = async () => {
    try {
      const data = await api.get<{ user: User; profile: any }>('/auth/me');
      setUser(data.user);
      setProfile(data.profile);
    } catch (err) {
      // Not logged in or expired
      setUser(null);
      setProfile(null);
      localStorage.removeItem('ssu_token');
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (username: string, password: string = 'Password123!') => {
    setIsLoading(true);
    try {
      const data = await api.post<{ token: string; user: User; profile: any }>('/auth/login', {
        username,
        password,
      });
      localStorage.setItem('ssu_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setProfile(data.profile);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('ssu_token');
      setToken(null);
      setUser(null);
      setProfile(null);
    }
  };

  const switchRoleDemo = async (role: Role) => {
    if (role === 'ADMIN') {
      await login('admin', 'Password123!');
    } else if (role === 'TEACHER') {
      await login('jdelacruz', 'Password123!');
    } else if (role === 'STUDENT') {
      await login('2301492', 'Password123!');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        token,
        isLoading,
        login,
        logout,
        switchRoleDemo,
        refresh: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
