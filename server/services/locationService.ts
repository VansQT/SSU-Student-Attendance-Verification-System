import { db, AllowedLocation } from '../db';

export interface LocationValidationResult {
  valid: boolean;
  distanceMeters: number;
  allowedRadiusMeters: number;
  locationName: string;
  accuracyMeters: number;
  message: string;
}

export class LocationService {
  /**
   * Haversine formula to calculate the great-circle distance between two points in meters.
   */
  public static calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth radius in meters
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

  /**
   * Validates student's claimed GPS coordinates against the attendance session's allowed classroom location.
   */
  public static validateLocation(
    locationId: string,
    studentLat: number,
    studentLon: number,
    accuracyMeters: number = 20
  ): LocationValidationResult {
    const targetLoc = db.allowedLocations.find(l => l.id === locationId);
    if (!targetLoc) {
      return {
        valid: false,
        distanceMeters: 999999,
        allowedRadiusMeters: 0,
        locationName: 'Unknown Location',
        accuracyMeters,
        message: 'Assigned classroom location not found in system.',
      };
    }

    // Check GPS accuracy reliability
    if (accuracyMeters > 200) {
      return {
        valid: false,
        distanceMeters: 999999,
        allowedRadiusMeters: targetLoc.radiusMeters,
        locationName: targetLoc.name,
        accuracyMeters,
        message: `GPS accuracy estimate is too coarse (±${Math.round(accuracyMeters)}m). Please enable High Accuracy GPS or step near an open window/door.`,
      };
    }

    const distance = this.calculateHaversineDistance(
      studentLat,
      studentLon,
      targetLoc.latitude,
      targetLoc.longitude
    );

    const allowedRadius = targetLoc.radiusMeters || db.settings.maxLocationDistanceMeters;
    // Allow slight GPS jitter tolerance based on reported accuracy
    const effectiveRadius = allowedRadius + Math.min(accuracyMeters * 0.5, 30);
    const isWithinBounds = distance <= effectiveRadius;

    return {
      valid: isWithinBounds,
      distanceMeters: distance,
      allowedRadiusMeters: allowedRadius,
      locationName: targetLoc.name,
      accuracyMeters,
      message: isWithinBounds
        ? `Location verified within classroom geofence (${distance}m from ${targetLoc.name}).`
        : `Location verification failed: You are ${distance}m away from ${targetLoc.name} (Maximum allowed: ${allowedRadius}m).`,
    };
  }
}
