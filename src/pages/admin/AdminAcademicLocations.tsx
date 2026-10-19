import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ClassroomLocationMap } from '../../components/location/ClassroomLocationMap';
import { MapPin, Plus, Compass, Pencil } from 'lucide-react';

const campusCoordinates: [number, number] = [11.77662, 124.88142];

export const AdminAcademicLocations: React.FC = () => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // New Location Modal
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [building, setBuilding] = useState<string>('SSU College of Computing');
  const [roomNumber, setRoomNumber] = useState<string>('Lab 4');
  const [position, setPosition] = useState<[number, number]>(campusCoordinates);
  const [radiusMeters, setRadiusMeters] = useState<number>(80);
  const [description, setDescription] = useState<string>('');
  const [savingLocation, setSavingLocation] = useState<boolean>(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get<any>('/admin/academic-data');
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLocation(true);
    try {
      const payload = {
        name: name.trim(),
        building: building.trim(),
        roomNumber: roomNumber.trim(),
        latitude: position[0],
        longitude: position[1],
        radiusMeters: Number(radiusMeters),
        description: description.trim(),
      };
      if (editingLocationId) {
        await api.put(`/admin/locations/${encodeURIComponent(editingLocationId)}`, payload);
      } else {
        await api.post('/admin/locations', payload);
      }
      setShowLocationModal(false);
      setEditingLocationId(null);
      setName('');
      setBuilding('SSU College of Computing');
      setRoomNumber('Lab 4');
      setPosition(campusCoordinates);
      setRadiusMeters(80);
      setDescription('');
      await fetchData();
    } catch (err: any) {
      alert(err.message || `Failed to ${editingLocationId ? 'update' : 'create'} location.`);
    } finally {
      setSavingLocation(false);
    }
  };

  const handleEditLocation = (location: any) => {
    setEditingLocationId(location.id);
    setName(location.name);
    setBuilding(location.building);
    setRoomNumber(location.roomNumber);
    setPosition([location.latitude, location.longitude]);
    setRadiusMeters(location.radiusMeters);
    setDescription(location.description || '');
    setShowLocationModal(true);
  };

  const closeLocationModal = () => {
    setShowLocationModal(false);
    setEditingLocationId(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-800 rounded-xl">
              <Compass className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Academic & Location Management</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Define authorized classroom/laboratory GPS boundaries and review institutional academic structures.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingLocationId(null);
            setName('');
            setBuilding('SSU College of Computing');
            setRoomNumber('Lab 4');
            setPosition(campusCoordinates);
            setRadiusMeters(80);
            setDescription('');
            setShowLocationModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          Add Classroom Location
        </button>
      </div>

      {/* Classroom GPS Geofence Locations */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Authorized Campus Classroom Geofences ({data?.allowedLocations?.length || 0})
          </h2>
          <span className="text-xs text-slate-500">Haversine GPS Radius</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading locations...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {data?.allowedLocations?.map((loc: any) => (
              <div key={loc.id} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{loc.name}</h4>
                      <p className="text-[11px] text-slate-500">{loc.building} • {loc.roomNumber}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ±{loc.radiusMeters}m
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 text-xs font-mono space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Latitude:</span>
                    <span>{loc.latitude}° N</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Longitude:</span>
                    <span>{loc.longitude}° E</span>
                  </div>
                </div>

                {loc.description && (
                  <p className="text-[11px] text-slate-500 italic pt-1">{loc.description}</p>
                )}
                <div className="border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => handleEditLocation(loc)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit Room
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {editingLocationId ? 'Edit Classroom GPS Location' : 'Add Classroom GPS Location'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Click the map or drag the pin to set the classroom location. The circle shows the attendance radius.
            </p>

            <form onSubmit={handleCreateLocation} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Location Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. SSU Main - CITC Computer Lab 4"
                  className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Building</label>
                  <input
                    type="text"
                    value={building}
                    onChange={e => setBuilding(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Room Number</label>
                  <input
                    type="text"
                    value={roomNumber}
                    onChange={e => setRoomNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Pin classroom location on map</label>
                <div className="h-64 overflow-hidden rounded-xl border border-slate-300">
                  <ClassroomLocationMap
                    position={position}
                    radiusMeters={radiusMeters}
                    onPositionChange={setPosition}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600">
                  <span>Latitude: {position[0].toFixed(6)}</span>
                  <span>Longitude: {position[1].toFixed(6)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Radius (m)</label>
                  <input
                    type="number"
                    min={1}
                    value={radiusMeters}
                    onChange={e => setRadiusMeters(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 p-2.5 outline-hidden focus:ring-2 focus:ring-blue-600 font-mono"
                    required
                  />
                </div>
                <p className="self-end pb-2.5 text-[11px] text-slate-500">
                  Drag or click to move the pin. Coordinates update automatically.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Third floor laboratory, high wireless accuracy."
                  className="w-full rounded-xl border border-slate-300 p-2.5 h-16 outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeLocationModal}
                  className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLocation}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl shadow-xs transition"
                >
                  {savingLocation ? 'Saving...' : editingLocationId ? 'Save Changes' : 'Add Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
