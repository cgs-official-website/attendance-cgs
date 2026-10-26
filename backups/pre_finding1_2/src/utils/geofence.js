/**
 * geofence.js
 * Server-side GPS coordinate validation and workplace boundary verification.
 * Prevents client-side coordinate spoofing by evaluating against company configuration.
 */

import { query } from "../config/db.js";

/**
 * Calculates great-circle distance between two GPS coordinates in meters (Haversine formula).
 */
export function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks if a point (lat/lon) is inside a polygon using ray-casting algorithm.
 * @param {Object} point - { latitude, longitude }
 * @param {Array} polygon - Array of { lat, lng } or { latitude, longitude }
 * @returns {boolean} true if point is inside polygon
 */
export function isPointInPolygon(point, polygon) {
  if (!polygon || !Array.isArray(polygon) || polygon.length < 3) return false;

  const x = Number(point.longitude ?? point.lng ?? point.lon);
  const y = Number(point.latitude ?? point.lat);
  if (isNaN(x) || isNaN(y)) return false;

  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].lng ?? polygon[i].longitude);
    const yi = Number(polygon[i].lat ?? polygon[i].latitude);
    const xj = Number(polygon[j].lng ?? polygon[j].longitude);
    const yj = Number(polygon[j].lat ?? polygon[j].latitude);

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) isInside = !isInside;
  }

  return isInside;
}

/**
 * Validates a submitted location against company geofencing rules.
 * @param {Object} params
 * @param {string} params.companyId - Authenticated company ID
 * @param {Object} params.location - { latitude, longitude }
 * @param {Object} [params.user] - Authenticated user record
 * @returns {Promise<{ allowed: boolean, reason?: string, gpsResult: string, distance?: number }>}
 */
export async function validateServerGeofence({ companyId, location, user }) {
  // Check user manual check-in exemption
  if (user?.metadata?.allowManualCheckIn || user?.allowManualCheckIn) {
    return { allowed: true, gpsResult: "not_required" };
  }

  if (!companyId) {
    return { allowed: true, gpsResult: "not_configured" };
  }

  // Fetch company geofence settings from environment_settings
  const settingsRes = await query(
    `SELECT key, value FROM environment_settings
     WHERE company_id = $1 AND key IN ('geofence_settings', 'general')`,
    [companyId]
  );

  let geofenceConfig = null;
  for (const row of settingsRes.rows) {
    if (row.key === "geofence_settings" && row.value) {
      geofenceConfig = row.value;
      break;
    }
    if (row.key === "general" && row.value?.geolocationSettings) {
      geofenceConfig = row.value.geolocationSettings;
      break;
    }
  }

  // Also check company master record for office lat/lon if not in env settings
  const compRes = await query(
    `SELECT latitude, longitude, allowed_radius_meters FROM companies WHERE id = $1`,
    [companyId]
  );
  const compRow = compRes.rows[0];

  const isGeofenceEnabled = Boolean(
    geofenceConfig?.enable_geofencing ||
    geofenceConfig?.enabled ||
    (compRow?.latitude && compRow?.longitude && geofenceConfig?.enable_geofencing !== false)
  );

  if (!isGeofenceEnabled) {
    return { allowed: true, gpsResult: "not_required" };
  }

  // Geofencing is enabled: location must have valid numeric coordinates
  const lat = Number(location?.latitude ?? location?.lat);
  const lon = Number(location?.longitude ?? location?.lng ?? location?.lon);

  if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
    return {
      allowed: false,
      reason: "Accurate GPS coordinates are required when workplace geofencing is enabled.",
      gpsResult: "outside"
    };
  }

  // 1. Polygon boundary check
  if (
    geofenceConfig?.type === "polygon" &&
    Array.isArray(geofenceConfig.polygonCoords) &&
    geofenceConfig.polygonCoords.length > 2
  ) {
    const inside = isPointInPolygon({ latitude: lat, longitude: lon }, geofenceConfig.polygonCoords);
    if (!inside) {
      return {
        allowed: false,
        reason: "You are outside the permitted company workplace polygon area.",
        gpsResult: "outside"
      };
    }
    return { allowed: true, gpsResult: "inside" };
  }

  // 2. Circular radius check
  const targetLat = Number(geofenceConfig?.latitude ?? compRow?.latitude);
  const targetLon = Number(geofenceConfig?.longitude ?? compRow?.longitude);
  const radius = Number(
    geofenceConfig?.allowed_radius_meters ??
    geofenceConfig?.radiusMeters ??
    compRow?.allowed_radius_meters ??
    100
  );

  if (!isNaN(targetLat) && !isNaN(targetLon) && targetLat !== 0 && targetLon !== 0) {
    const distance = getDistanceFromLatLonInMeters(lat, lon, targetLat, targetLon);
    if (distance > radius) {
      return {
        allowed: false,
        reason: `Location is outside authorized workplace. Distance: ${Math.round(distance)}m (Allowed: ${radius}m).`,
        distance: Math.round(distance),
        allowedRadius: radius,
        gpsResult: "outside"
      };
    }
    return { allowed: true, gpsResult: "inside", distance: Math.round(distance) };
  }

  // If geofence was flagged as enabled but no office coordinates are configured:
  return { allowed: true, gpsResult: "not_configured" };
}

export default {
  getDistanceFromLatLonInMeters,
  isPointInPolygon,
  validateServerGeofence
};
