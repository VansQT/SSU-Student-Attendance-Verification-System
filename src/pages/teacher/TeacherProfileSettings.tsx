import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { AlertTriangle, Camera, CheckCircle2, LockKeyhole, Save, Trash2, UserRound } from 'lucide-react';

interface TeacherProfileForm {
  fullName: string;
  facultyId: string;
  title: string;
  department: string;
  contactNumber: string;
  username: string;
  email: string;
}

interface TeacherProfileResponse {
  profile: TeacherProfileForm & { profilePhoto?: string };
  account: { username: string; email: string };
}

const emptyProfile: TeacherProfileForm = {
  fullName: '',
  facultyId: '',
  title: '',
  department: '',
  contactNumber: '',
  username: '',
  email: '',
};

export const TeacherProfileSettings: React.FC = () => {
  const { refresh } = useAuth();
  const photoInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<TeacherProfileForm>(emptyProfile);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    api.get<TeacherProfileResponse>('/teacher/profile')
      .then(data => {
        setProfile({
          fullName: data.profile.fullName,
          facultyId: data.profile.facultyId,
          title: data.profile.title,
          department: data.profile.department,
          contactNumber: data.profile.contactNumber || '',
          username: data.account.username,
          email: data.account.email,
        });
        setProfilePhoto(data.profile.profilePhoto || null);
      })
      .catch(error => {
        console.error('Failed to load teacher profile settings:', error);
        setProfileMessage({ text: error.message || 'Unable to load your profile.', error: true });
      })
      .finally(() => setLoading(false));
  }, []);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileMessage({ text: 'Choose a JPEG, PNG, or WebP image.', error: true });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileMessage({ text: 'Profile photo must be 5 MB or smaller.', error: true });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfilePhoto(reader.result);
        setProfileMessage(null);
      } else {
        setProfileMessage({ text: 'Unable to read the selected profile photo.', error: true });
      }
    };
    reader.onerror = () => setProfileMessage({ text: 'Unable to read the selected profile photo.', error: true });
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const result = await api.put<TeacherProfileResponse>('/teacher/profile', {
        ...profile,
        profilePhoto,
      });
      setProfile({
        fullName: result.profile.fullName,
        facultyId: result.profile.facultyId,
        title: result.profile.title,
        department: result.profile.department,
        contactNumber: result.profile.contactNumber || '',
        username: result.account.username,
        email: result.account.email,
      });
      setProfilePhoto(result.profile.profilePhoto || null);
      await refresh();
      setProfileMessage({ text: 'Profile updated successfully.', error: false });
    } catch (error: any) {
      setProfileMessage({ text: error.message || 'Unable to update your profile.', error: true });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: 'New password and confirmation do not match.', error: true });
      return;
    }
    setSavingPassword(true);
    try {
      const result = await api.put<{ message: string }>('/teacher/profile/password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ text: result.message, error: false });
    } catch (error: any) {
      setPasswordMessage({ text: error.message || 'Unable to change your password.', error: true });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading profile settings...</div>;
  }

  const initials = profile.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Profile Settings</h1>
        <p className="mt-1 text-xs text-slate-500">Manage your faculty information, profile photo, account details, and password.</p>
      </div>

      {profileMessage && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${
          profileMessage.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {profileMessage.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {profileMessage.text}
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-5 border-b border-slate-200 bg-gradient-to-r from-blue-900 to-indigo-900 p-6 text-white sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-amber-300 bg-blue-700 text-2xl font-extrabold shadow-lg">
            {profilePhoto ? <img src={profilePhoto} alt="Teacher profile" className="h-full w-full object-cover" /> : initials || <UserRound />}
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Faculty profile</p>
            <h2 className="mt-1 text-lg font-bold">{profile.fullName || 'Teacher'}</h2>
            <p className="text-xs text-blue-200">{profile.title} · {profile.facultyId}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-[11px] font-semibold hover:bg-white/25"
              >
                <Camera className="h-3.5 w-3.5" /> Change Photo
              </button>
              {profilePhoto && (
                <button
                  type="button"
                  onClick={() => setProfilePhoto(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-2 text-[11px] font-semibold text-white hover:bg-rose-500/35"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove Photo
                </button>
              )}
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
            <p className="mt-2 text-[10px] text-blue-200">JPEG, PNG, or WebP up to 5 MB.</p>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Full name *
            <input required maxLength={200} value={profile.fullName} onChange={event => setProfile({ ...profile, fullName: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Faculty ID *
            <input required maxLength={80} value={profile.facultyId} onChange={event => setProfile({ ...profile, facultyId: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Academic title *
            <input required maxLength={100} value={profile.title} onChange={event => setProfile({ ...profile, title: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Department *
            <input required maxLength={200} value={profile.department} onChange={event => setProfile({ ...profile, department: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Contact number
            <input maxLength={40} value={profile.contactNumber} onChange={event => setProfile({ ...profile, contactNumber: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Username *
            <input required maxLength={80} value={profile.username} onChange={event => setProfile({ ...profile, username: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" />
          </label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
            Email address *
            <input type="email" required maxLength={254} value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" />
          </label>
          <div className="flex justify-end border-t border-slate-100 pt-4 sm:col-span-2">
            <button type="submit" disabled={savingProfile} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              <Save className="h-4 w-4" /> {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={handleChangePassword} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-blue-700" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Change Password</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Use your current password to set a new one (10–128 characters).</p>
          </div>
        </div>
        {passwordMessage && (
          <div className={`rounded-xl border px-4 py-3 text-xs ${
            passwordMessage.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}>{passwordMessage.text}</div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-700">
            Current password
            <input type="password" autoComplete="current-password" minLength={1} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" required />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            New password
            <input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" required />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Confirm new password
            <input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-normal" required />
          </label>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button type="submit" disabled={savingPassword} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            <LockKeyhole className="h-4 w-4" /> {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
};
