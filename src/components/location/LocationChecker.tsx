import React, { useState, useEffect } from 'react';
import { MapPin, CheckCircle2, AlertTriangle, RefreshCw, Compass } from 'lucide-react';

interface LocationCheckerProps {
  targetLatitude: number;
  targetLongitude: number;
  locationName: string;
  buildingName?: string;
  roomNumber?: string;
  allowedRadiusMeters: number;
  onLocationVerified: (coords: { latitude: number; longitude: number; accuracyMeters: number; distanceMeters: number }) => void;
}

export const LocationChecker: React.FC<LocationCheckerProps> = ({
  targetLatitude,
  targetLongitude,
  locationName,
  buildingName,
  roomNumber,
  allowedRadiusMeters,
  onLocationVerified,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [isWithinBounds, setIsWithinBounds] = useState<boolean>(false);

  function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c * 10) / 10;
  }

  const checkLocation = () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude, accuracy } = position.coords;
        setCurrentCoords({ latitude, longitude, accuracy });

        const d = calculateDistance(latitude, longitude, targetLatitude, targetLongitude);
        setDistance(d);

        // Effective allowed radius with accuracy buffer
        const effectiveRadius = allowedRadiusMeters + Math.min(accuracy * 0.5, 30);
        const within = d <= effectiveRadius;
        setIsWithinBounds(within);
        setLoading(false);

        if (within) {
          onLocationVerified({
            latitude,
            longitude,
            accuracyMeters: accuracy,
            distanceMeters: d,
          });
        }
      },
      err => {
        console.warn('Geolocation error:', err);
        setError(err.message || 'Unable to retrieve your location. Please enable location permissions.');
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  };

  useEffect(() => {
    checkLocation();
  }, [targetLatitude, targetLongitude]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white max-w-md w-full mx-auto shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Compass className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">Location Validation</h3>
            <p className="text-xs text-slate-400">Classroom Geofencing Verification</p>
          </div>
        </div>
        <button
          type="button"
          onClick={checkLocation}
          disabled={loading}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          title="Refresh GPS"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* Classroom Target Info Card */}
      <div className="bg-slate-800/80 rounded-xl p-3.5 mb-4 border border-slate-700/60">
        <div className="flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-slate-200">{locationName}</h4>
            <p className="text-[11px] text-slate-400">
              {buildingName} {roomNumber ? `• ${roomNumber}` : ''}
            </p>
            <p className="text-[10px] text-indigo-300 mt-1 font-mono">
              Allowed Radius: {allowedRadiusMeters} meters
            </p>
          </div>
        </div>
      </div>

      {/* Verification Status */}
      {loading ? (
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-xs text-slate-300">Acquiring High-Accuracy GPS Position...</p>
        </div>
      ) : isWithinBounds ? (
        <div className="bg-emerald-950/60 border border-emerald-600/60 rounded-xl p-4 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-1.5" />
          <h4 className="text-xs font-bold text-emerald-300">Location Verified</h4>
          <p className="text-[11px] text-emerald-200 mt-0.5">
            You are approximately <span className="font-bold">{distance}m</span> from the classroom geofence.
          </p>
        </div>
      ) : (
        <div className="bg-amber-950/60 border border-amber-600/60 rounded-xl p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-1.5" />
          <h4 className="text-xs font-bold text-amber-300">Outside Classroom Geofence</h4>
          <p className="text-[11px] text-amber-200 mt-0.5">
            {distance !== null
              ? `Current distance: ${distance}m (Maximum allowed: ${allowedRadiusMeters}m).`
              : error || 'Please allow GPS location permission in your browser.'}
          </p>
        </div>
      )}
    </div>
  );
};
