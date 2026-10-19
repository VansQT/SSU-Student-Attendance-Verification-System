import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AttendanceSession, AllowedLocation } from '../../types';
import { ClassroomLocationMap } from '../../components/location/ClassroomLocationMap';
import {
  Clock,
  Plus,
  Play,
  Square,
  Copy,
  Check,
  MapPin,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  XCircle,
  Search,
} from 'lucide-react';

interface TeacherAttendanceSessionsProps {
  onOpenPublicSession?: (token: string) => void;
}

export const TeacherAttendanceSessions: React.FC<TeacherAttendanceSessionsProps> = ({
  onOpenPublicSession,
}) => {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [locations, setLocations] = useState<AllowedLocation[]>([]);
  const [locationError, setLocationError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // New Session Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [locationSearch, setLocationSearch] = useState<string>('');
  const [locationSearchOpen, setLocationSearchOpen] = useState<boolean>(false);
  const [locationSelectionError, setLocationSelectionError] = useState<string>('');
  const [showAddLocation, setShowAddLocation] = useState<boolean>(false);
  const [newLocation, setNewLocation] = useState({
    name: '',
    building: 'SSU Main Building',
    roomNumber: '',
    position: [11.771049, 124.885942] as [number, number],
    radiusMeters: 80,
    description: '',
  });
  const [savingLocation, setSavingLocation] = useState<boolean>(false);
  const [newLocationError, setNewLocationError] = useState<string>('');
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState<number>(15);
  const [creating, setCreating] = useState<boolean>(false);

  // Live Monitor Modal
  const [activeMonitorSessionId, setActiveMonitorSessionId] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<any | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Manual Override Modal
  const [overrideModalOpen, setOverrideModalOpen] = useState<boolean>(false);
  const [targetStudentForOverride, setTargetStudentForOverride] = useState<any | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<'PRESENT' | 'LATE' | 'EXCUSED'>('PRESENT');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [submittingOverride, setSubmittingOverride] = useState<boolean>(false);

  const activeLocations = Array.isArray(locations) ? locations : [];
  const filteredLocations = activeLocations.filter(location => {
    const searchText = `${location.name} ${location.building} ${location.roomNumber}`.toLowerCase();
    return searchText.includes(locationSearch.trim().toLowerCase());
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sessionsData, classesData] = await Promise.all([
        api.get<AttendanceSession[]>('/teacher/attendance-sessions'),
        api.get<any[]>('/teacher/my-classes'),
      ]);
      setSessions(sessionsData);
      setClasses(classesData);

      try {
        const locationsData: unknown = await api.get<unknown>('/teacher/locations');
        if (!Array.isArray(locationsData)) {
          throw new Error('The server returned an invalid campus location list. Refresh the page and try again.');
        }

        setLocations(locationsData);
        setLocationError('');
        const currentLocation = locationsData.find(location => location.id === selectedLocationId);
        if (currentLocation) {
          setLocationSearch(`${currentLocation.name} (${currentLocation.building} - ${currentLocation.roomNumber})`);
        } else if (locationsData.length > 0) {
          setSelectedLocationId(locationsData[0].id);
          setLocationSearch(`${locationsData[0].name} (${locationsData[0].building} - ${locationsData[0].roomNumber})`);
        } else {
          setSelectedLocationId('');
          setLocationSearch('');
        }
      } catch (err) {
        console.error('Error fetching teacher campus locations:', err);
        setLocations([]);
        setLocationError(err instanceof Error ? err.message : 'Unable to load campus locations.');
      }
      if (classesData.length > 0 && !selectedAssignmentId) {
        setSelectedAssignmentId(classesData[0].assignmentId);
      }
    } catch (err) {
      console.error('Error fetching teacher session data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Poll live data if monitor modal is open
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeMonitorSessionId) {
      fetchLiveSession(activeMonitorSessionId);
      interval = setInterval(() => {
        fetchLiveSession(activeMonitorSessionId);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [activeMonitorSessionId]);

  const fetchLiveSession = async (sessionId: string) => {
    try {
      const data = await api.get<any>(`/teacher/attendance-sessions/${sessionId}/live`);
      setLiveData(data);
    } catch (err) {
      console.error('Error fetching live session data:', err);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignmentId) return;
    if (!selectedLocationId) {
      setLocationSelectionError('Choose a classroom from the search results.');
      setLocationSearchOpen(true);
      return;
    }
    setCreating(true);
    try {
      const newSession = await api.post<AttendanceSession>('/teacher/attendance-sessions', {
        teacherAssignmentId: selectedAssignmentId,
        locationId: selectedLocationId,
        title: sessionTitle.trim(),
        durationMinutes,
        lateThresholdMinutes,
      });
      setShowCreateModal(false);
      setSessionTitle('');
      await fetchData();
      // Auto open live monitor for newly created session
      setActiveMonitorSessionId(newSession.id);
    } catch (err: any) {
      alert(err.message || 'Failed to start attendance session.');
    } finally {
      setCreating(false);
    }
  };

  const handleAddLocation = async () => {
    setSavingLocation(true);
    setNewLocationError('');
    try {
      const location = await api.post<AllowedLocation>('/teacher/locations', {
        name: newLocation.name.trim(),
        building: newLocation.building.trim(),
        roomNumber: newLocation.roomNumber.trim(),
        latitude: newLocation.position[0],
        longitude: newLocation.position[1],
        radiusMeters: newLocation.radiusMeters,
        description: newLocation.description.trim(),
      });
      setLocations(current => [...current, location]);
      setSelectedLocationId(location.id);
      setLocationSearch(`${location.name} (${location.building} - ${location.roomNumber})`);
      setLocationSearchOpen(false);
      setLocationSelectionError('');
      setNewLocation({
        name: '',
        building: 'SSU Main Building',
        roomNumber: '',
        position: [11.771049, 124.885942],
        radiusMeters: 80,
        description: '',
      });
      setShowAddLocation(false);
    } catch (err: any) {
      setNewLocationError(err.message || 'Unable to add classroom location.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!confirm('Ending this session will finalize all records. Any student not yet recorded will be marked ABSENT automatically. Continue?')) {
      return;
    }
    try {
      const res = await api.post<any>(`/teacher/attendance-sessions/${sessionId}/close`);
      alert(res.message);
      await fetchData();
      if (activeMonitorSessionId === sessionId) {
        fetchLiveSession(sessionId);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to close attendance session.');
    }
  };

  const copySessionLink = (token: string) => {
    const fullUrl = `${window.location.origin}?sessionToken=${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleOpenOverride = (student: any) => {
    setTargetStudentForOverride(student);
    setOverrideStatus('PRESENT');
    setOverrideReason('');
    setOverrideModalOpen(true);
  };

  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMonitorSessionId || !targetStudentForOverride || !overrideReason.trim()) return;
    setSubmittingOverride(true);
    try {
      await api.post(`/teacher/attendance-sessions/${activeMonitorSessionId}/override`, {
        studentId: targetStudentForOverride.studentId,
        attendanceStatus: overrideStatus,
        reason: overrideReason.trim(),
      });
      setOverrideModalOpen(false);
      setTargetStudentForOverride(null);
      await fetchLiveSession(activeMonitorSessionId);
    } catch (err: any) {
      alert(err.message || 'Failed to apply override.');
    } finally {
      setSubmittingOverride(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-800 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Class Attendance Sessions</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Initiate geofenced attendance sessions, monitor live verification outcomes, and automatically finalize absent students.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-sm transition"
        >
          <Play className="w-4 h-4" />
          Start New Attendance Session
        </button>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Attendance Sessions</h2>
          <span className="text-xs text-slate-500">{sessions.length} sessions recorded</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No attendance sessions created yet. Click "Start New Attendance Session" above.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map(s => (
              <div key={s.id} className="p-6 hover:bg-slate-50/70 transition flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-900 text-sm">{s.title}</span>
                    {s.status === 'ACTIVE' && (
                      <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-300 animate-pulse">
                        LIVE & ACTIVE
                      </span>
                    )}
                    {s.status === 'CLOSED' && (
                      <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-slate-300">
                        FINALIZED & CLOSED
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Class: {s.subjectCode} ({s.sectionName})</span>
                    <span className="flex items-center gap-1 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                      {s.locationName}
                    </span>
                    <span className="text-slate-500">Date: {s.sessionDate}</span>
                    <span className="text-slate-500">
                      Window: {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Summary Counters */}
                  {s.stats && (
                    <div className="flex items-center gap-3 pt-1 text-xs">
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {s.stats.presentCount} Present
                      </span>
                      <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {s.stats.lateCount} Late
                      </span>
                      <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        {s.stats.absentCount} Absent
                      </span>
                      <span className="text-slate-500">
                        out of {s.stats.totalEnrolled} enrolled
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
                  <button
                    type="button"
                    onClick={() => setActiveMonitorSessionId(s.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl border border-indigo-200 transition"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Live Monitor
                  </button>

                  <button
                    type="button"
                    onClick={() => copySessionLink(s.sessionToken)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                    title="Copy student attendance session link"
                  >
                    {copiedToken === s.sessionToken ? (
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

                  {onOpenPublicSession && s.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => onOpenPublicSession(s.sessionToken)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs rounded-xl transition"
                      title="Open student attendance verification flow"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Student View</span>
                    </button>
                  )}

                  {s.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => handleCloseSession(s.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                    >
                      <Square className="w-3.5 h-3.5" />
                      End & Mark Absent
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-h-[90vh] overflow-y-auto max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Start New Attendance Session</h3>
            <p className="text-xs text-slate-500 mb-4">
              Configure session parameters. Students will verify through printed QR, live face matching, and room geofencing.
            </p>

            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Class / Section *</label>
                <select
                  value={selectedAssignmentId}
                  onChange={e => setSelectedAssignmentId(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  required
                >
                  {classes.map(c => (
                    <option key={c.assignmentId} value={c.assignmentId}>
                      {c.subjectCode} - {c.subjectTitle} ({c.sectionName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Session Title / Topic</label>
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={e => setSessionTitle(e.target.value)}
                  placeholder="e.g. Laboratory Session 5 - Secure REST API"
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-600 outline-hidden"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-700">Classroom / Building Geofence *</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewLocationError('');
                      setShowAddLocation(value => !value);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Classroom Location
                  </button>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={locationSearchOpen}
                    aria-controls="classroom-location-options"
                    value={locationSearch}
                    onChange={event => {
                      setLocationSearch(event.target.value);
                      setSelectedLocationId('');
                      setLocationSelectionError('');
                      setLocationSearchOpen(true);
                    }}
                    onFocus={() => setLocationSearchOpen(true)}
                    onKeyDown={event => {
                      if (event.key === 'Escape') setLocationSearchOpen(false);
                      if (event.key === 'Enter' && filteredLocations.length === 1) {
                        event.preventDefault();
                        const location = filteredLocations[0];
                        setSelectedLocationId(location.id);
                        setLocationSearch(`${location.name} (${location.building} - ${location.roomNumber})`);
                        setLocationSearchOpen(false);
                        setLocationSelectionError('');
                      }
                    }}
                    placeholder={activeLocations.length ? 'Search classroom or building...' : 'No active classroom locations'}
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-xs outline-hidden focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100"
                    required
                    disabled={activeLocations.length === 0}
                  />
                  {locationSearchOpen && locationSearch.trim() && !selectedLocationId && activeLocations.length > 0 && (
                    <div
                      id="classroom-location-options"
                      role="listbox"
                      className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                    >
                      {filteredLocations.length > 0 ? filteredLocations.map(location => (
                        <button
                          key={location.id}
                          type="button"
                          role="option"
                          aria-selected={selectedLocationId === location.id}
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => {
                            setSelectedLocationId(location.id);
                            setLocationSearch(`${location.name} (${location.building} - ${location.roomNumber})`);
                            setLocationSearchOpen(false);
                            setLocationSelectionError('');
                          }}
                          className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-blue-50"
                        >
                          <span className="text-xs font-semibold text-slate-800">{location.name}</span>
                          <span className="text-[10px] text-slate-500">
                            {location.building}{location.roomNumber ? ` · ${location.roomNumber}` : ''} · ±{location.radiusMeters}m
                          </span>
                        </button>
                      )) : (
                        <p className="px-3 py-2 text-xs text-slate-500">No matching classroom locations.</p>
                      )}
                    </div>
                  )}
                </div>
                {locationSelectionError && (
                  <p className="mt-1 text-xs text-rose-700">{locationSelectionError}</p>
                )}
                {activeLocations.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    {locationError || 'Add a classroom location here to use it for this attendance session.'}
                  </p>
                )}
                {showAddLocation && (
                  <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                    <h4 className="text-xs font-bold text-slate-800">Add Classroom Location</h4>
                    <input
                      value={newLocation.name}
                      onChange={event => setNewLocation({ ...newLocation, name: event.target.value })}
                      placeholder="Location name (e.g. CITC Computer Lab 4)"
                      maxLength={200}
                      className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newLocation.building}
                        onChange={event => setNewLocation({ ...newLocation, building: event.target.value })}
                        placeholder="Building"
                        maxLength={200}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
                      />
                      <input
                        value={newLocation.roomNumber}
                        onChange={event => setNewLocation({ ...newLocation, roomNumber: event.target.value })}
                        placeholder="Room number"
                        maxLength={80}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
                      />
                    </div>
                    <div className="h-48 overflow-hidden rounded-lg border border-slate-300">
                      <ClassroomLocationMap
                        position={newLocation.position}
                        radiusMeters={newLocation.radiusMeters}
                        onPositionChange={position => setNewLocation(current => ({ ...current, position }))}
                      />
                    </div>
                    <p className="text-[10px] font-mono text-slate-600">
                      {newLocation.position[0].toFixed(6)}, {newLocation.position[1].toFixed(6)}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Geofence radius (meters)
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={newLocation.radiusMeters}
                          onChange={event => setNewLocation({ ...newLocation, radiusMeters: Number(event.target.value) })}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
                          required
                        />
                      </label>
                      <label className="text-[11px] font-semibold text-slate-700">
                        Description (optional)
                        <input
                          value={newLocation.description}
                          onChange={event => setNewLocation({ ...newLocation, description: event.target.value })}
                          maxLength={500}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
                        />
                      </label>
                    </div>
                    {newLocationError && (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{newLocationError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleAddLocation}
                      disabled={savingLocation || !newLocation.name.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {savingLocation ? 'Saving Location...' : 'Save and Select Location'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Session Duration</label>
                  <select
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(Number(e.target.value))}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  >
                    <option value={15}>15 Minutes (Quick Attendance)</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>60 Minutes (1 Hour)</option>
                    <option value={90}>90 Minutes (1.5 Hours)</option>
                    <option value={120}>120 Minutes (2 Hours)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Late Cutoff Threshold</label>
                  <select
                    value={lateThresholdMinutes}
                    onChange={e => setLateThresholdMinutes(Number(e.target.value))}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  >
                    <option value={5}>First 5 Minutes</option>
                    <option value={10}>First 10 Minutes</option>
                    <option value={15}>First 15 Minutes</option>
                    <option value={20}>First 20 Minutes</option>
                  </select>
                </div>
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
                  disabled={creating || activeLocations.length === 0 || classes.length === 0}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                >
                  {creating ? 'Starting Session...' : 'Start Session & Generate Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Attendance Monitor Modal */}
      {activeMonitorSessionId && liveData && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{liveData.session.title}</h3>
                  {liveData.session.status === 'ACTIVE' && (
                    <span className="bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full text-[10px] border border-emerald-500/40">
                      LIVE MONITOR
                    </span>
                  )}
                  {liveData.session.status === 'CLOSED' && (
                    <span className="bg-slate-700 text-slate-300 font-bold px-2 py-0.5 rounded-full text-[10px]">
                      FINALIZED
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Class: {liveData.subject?.code} ({liveData.section?.name}) • Room: {liveData.location?.name}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchLiveSession(activeMonitorSessionId)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="Refresh Live Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMonitorSessionId(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Quick Status Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Enrolled Students</div>
                  <div className="text-xl font-bold text-slate-800">{liveData.studentStatuses.length}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <div className="text-[11px] font-semibold text-emerald-700">Present (On-Time)</div>
                  <div className="text-xl font-bold text-emerald-800">
                    {liveData.studentStatuses.filter((s: any) => s.status === 'PRESENT').length}
                  </div>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <div className="text-[11px] font-semibold text-amber-700">Late</div>
                  <div className="text-xl font-bold text-amber-800">
                    {liveData.studentStatuses.filter((s: any) => s.status === 'LATE').length}
                  </div>
                </div>
                <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <div className="text-[11px] font-semibold text-rose-700">
                    {liveData.session.status === 'CLOSED' ? 'Absent' : 'Not Yet Recorded'}
                  </div>
                  <div className="text-xl font-bold text-rose-800">
                    {liveData.studentStatuses.filter((s: any) => s.status === 'NOT_YET_RECORDED' || s.status === 'ABSENT').length}
                  </div>
                </div>
              </div>

              {/* Enrolled Students Live Status Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700">Student Attendance Roster</h4>
                  <span className="text-[11px] text-slate-500">Auto-updating every 5 seconds</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/60 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Student</th>
                        <th className="px-4 py-2.5">School ID</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Verification Details</th>
                        <th className="px-4 py-2.5">Timestamp</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {liveData.studentStatuses.map((st: any) => (
                        <tr key={st.studentId} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3 font-bold text-slate-900">{st.fullName}</td>
                          <td className="px-4 py-3 font-mono text-slate-600">{st.schoolId}</td>
                          <td className="px-4 py-3">
                            {st.status === 'PRESENT' && (
                              <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                                PRESENT
                              </span>
                            )}
                            {st.status === 'LATE' && (
                              <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px] border border-amber-300">
                                LATE
                              </span>
                            )}
                            {st.status === 'ABSENT' && (
                              <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px] border border-rose-300">
                                ABSENT
                              </span>
                            )}
                            {st.status === 'NOT_YET_RECORDED' && (
                              <span className="bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded text-[10px]">
                                Pending
                              </span>
                            )}
                            {st.isOverridden && (
                              <span className="ml-1 bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded text-[9px] border border-purple-200" title={`Override Reason: ${st.overrideReason}`}>
                                OVERRIDDEN
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {st.verificationMethod === 'AUTOMATED_BIOMETRIC' ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>QR + Face ({(st.faceConfidenceScore * 100).toFixed(0)}%) • {st.distanceFromLocationMeters}m</span>
                              </div>
                            ) : st.isOverridden ? (
                              <span className="text-[11px] text-purple-700 font-medium">
                                Override: {st.overrideReason}
                              </span>
                            ) : (
                              <span className="text-slate-400">Not verified yet</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[11px]">
                            {st.timestamp ? new Date(st.timestamp).toLocaleTimeString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenOverride(st)}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              Override Status
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Verification Attempts & Failures Log */}
              {liveData.attempts && liveData.attempts.length > 0 && (
                <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Real-Time Verification Issues / Failure Alerts</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-amber-900">
                    {liveData.attempts.map((att: any) => (
                      <div key={att.id} className="bg-white/80 p-2 rounded-lg border border-amber-200/80 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-amber-950 font-mono text-[11px]">[{att.stepFailed}] </span>
                          <span>{att.details}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {new Date(att.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copySessionLink(liveData.session.sessionToken)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Session Link
                </button>
              </div>

              {liveData.session.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => handleCloseSession(liveData.session.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
                >
                  <Square className="w-4 h-4" />
                  End Session & Finalize All Absent
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Override Modal */}
      {overrideModalOpen && targetStudentForOverride && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Manual Attendance Override</h3>
            <p className="text-xs text-slate-500 mb-4">
              Apply documented instructor override for <span className="font-bold text-slate-800">{targetStudentForOverride.fullName}</span> ({targetStudentForOverride.schoolId}).
            </p>

            <form onSubmit={handleSubmitOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Override Status *</label>
                <select
                  value={overrideStatus}
                  onChange={e => setOverrideStatus(e.target.value as any)}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-600 outline-hidden"
                >
                  <option value="PRESENT">PRESENT (Verified in Class)</option>
                  <option value="LATE">LATE</option>
                  <option value="EXCUSED">EXCUSED (Official University Absence)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mandatory Justification / Reason *</label>
                <textarea
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="e.g. Student physically presented in class; device had hardware camera sensor malfunction."
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 h-24 focus:ring-2 focus:ring-blue-600 outline-hidden"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride || !overrideReason.trim()}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
                >
                  {submittingOverride ? 'Saving...' : 'Confirm Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
