/**
 * geofence.js
 * Server-side GPS coordinate validation and workplace boundary verification.
 * Prevents client-side coordinate spoofing by evaluating against company configuration.
 * Adheres to a strict fail-closed security architecture.
 */

import { query } from "../config/db.js";

/**
 * Validates latitude range (-90 to +90).
 */
export function isValidLatitude(lat) {
  return typeof lat === "number" && !isNaN(lat) && isFinite(lat) && lat >= -90 && lat <= 90;
}

/**
 * Validates longitude range (-180 to +180).
 */
export function isValidLongitude(lon) {
  return typeof lon === "number" && !isNaN(lon) && isFinite(lon) && lon >= -180 && lon <= 180;
}

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

export const HR_CONFIG_ERROR = "Workplace geofencing is enabled but not correctly configured. Please contact HR or your administrator.";

/**
 * Validates a submitted location against company geofencing rules.
 * Strict fail-closed policy: If geofencing is enabled, any missing or malformed configuration
 * rejects attendance with a safe error directing the employee to HR.
 *
 * @param {Object} params
 * @param {string} params.companyId - Authenticated company ID
 * @param {Object} params.location - { latitude, longitude }
 * @param {Object} [params.user] - Authenticated user record
 * @returns {Promise<{ allowed: boolean, reason?: string, gpsResult: string, distance?: number, allowedRadius?: number }>}
 */
export async function validateServerGeofence({ companyId, location, user }) {
  // Check user manual check-in exemption
  if (user?.metadata?.allowManualCheckIn || user?.allowManualCheckIn) {
    return { allowed: true, gpsResult: "not_required" };
  }

  if (!companyId) {
    return {
      allowed: false,
      reason: HR_CONFIG_ERROR,
      gpsResult: "invalid_config"
    };
  }

  // Fetch company geofence settings from environment_settings scoped strictly by companyId
  const settingsRes = await query(
    `SELECT key, value FROM environment_settings
     WHERE company_id = $1 AND key IN ('geofence_settings', 'general')`,
    [companyId]
  );

  let geofenceSettingsRow = null;
  let generalGeoSettings = null;

  for (const row of settingsRes.rows) {
    if (row.key === "geofence_settings" && row.value && typeof row.value === "object") {
      geofenceSettingsRow = row.value;
    }
    if (row.key === "general" && row.value?.geolocationSettings && typeof row.value.geolocationSettings === "object") {
      generalGeoSettings = row.value.geolocationSettings;
    }
  }

  let geofenceConfig = null;
  if (geofenceSettingsRow || generalGeoSettings) {
    geofenceConfig = {
      ...(geofenceSettingsRow || {}),
      ...(generalGeoSettings || {})
    };
    if (geofenceSettingsRow?.enable_geofencing === true || geofenceSettingsRow?.enabled === true || generalGeoSettings?.enabled === true) {
      geofenceConfig.enabled = true;
      geofenceConfig.enable_geofencing = true;
    } else if (geofenceSettingsRow?.enable_geofencing === false || geofenceSettingsRow?.enabled === false || generalGeoSettings?.enabled === false) {
      geofenceConfig.enabled = false;
      geofenceConfig.enable_geofencing = false;
    }
  }

  // Check company master record for office lat/lon and allowed radius
  const compRes = await query(
    `SELECT latitude, longitude, allowed_radius_meters FROM companies WHERE id = $1`,
    [companyId]
  );
  const compRow = compRes.rows[0];

  // If geofencing is explicitly disabled by an authorized company setting, preserve the policy
  const explicitlyDisabled =
    geofenceConfig?.enable_geofencing === false ||
    geofenceConfig?.enabled === false;

  if (explicitlyDisabled) {
    return { allowed: true, gpsResult: "not_required" };
  }

  // Determine if geofencing is enabled
  const isGeofenceEnabled = Boolean(
    geofenceConfig?.enable_geofencing === true ||
    geofenceConfig?.enabled === true ||
    (compRow && (compRow.latitude != null || compRow.longitude != null || compRow.allowed_radius_meters != null))
  );

  if (!isGeofenceEnabled) {
    return { allowed: true, gpsResult: "not_required" };
  }

  // Geofencing IS ENABLED: Strict Fail-Closed Verification

  // 1. Validate employee submitted coordinates
  const rawEmpLat = location?.latitude ?? location?.lat;
  const rawEmpLon = location?.longitude ?? location?.lng ?? location?.lon;
  const empLat = rawEmpLat !== null && rawEmpLat !== undefined && rawEmpLat !== "" ? Number(rawEmpLat) : NaN;
  const empLon = rawEmpLon !== null && rawEmpLon !== undefined && rawEmpLon !== "" ? Number(rawEmpLon) : NaN;

  if (!isValidLatitude(empLat) || !isValidLongitude(empLon) || (empLat === 0 && empLon === 0)) {
    return {
      allowed: false,
      reason: "Accurate GPS coordinates are required when workplace geofencing is enabled.",
      gpsResult: "outside"
    };
  }

  // 2. Polygon boundary geofencing
  if (geofenceConfig?.type === "polygon") {
    const polygonCoords = geofenceConfig.polygonCoords || geofenceConfig.polygon || geofenceConfig.coordinates;
    if (!Array.isArray(polygonCoords) || polygonCoords.length < 3) {
      return {
        allowed: false,
        reason: HR_CONFIG_ERROR,
        gpsResult: "invalid_config"
      };
    }

    const arePointsValid = polygonCoords.every(pt => {
      const pLat = Number(pt?.lat ?? pt?.latitude);
      const pLon = Number(pt?.lng ?? pt?.lon ?? pt?.longitude);
      return isValidLatitude(pLat) && isValidLongitude(pLon) && (pLat !== 0 || pLon !== 0);
    });

    if (!arePointsValid) {
      return {
        allowed: false,
        reason: HR_CONFIG_ERROR,
        gpsResult: "invalid_config"
      };
    }

    const inside = isPointInPolygon({ latitude: empLat, longitude: empLon }, polygonCoords);
    if (!inside) {
      return {
        allowed: false,
        reason: "You are outside the permitted company workplace polygon area.",
        gpsResult: "outside"
      };
    }

    return { allowed: true, gpsResult: "inside" };
  }

  // 3. Circular radius geofencing (default mode)
  const rawTargetLat = geofenceConfig?.latitude ?? compRow?.latitude;
  const rawTargetLon = geofenceConfig?.longitude ?? compRow?.longitude;
  const targetLat = rawTargetLat !== null && rawTargetLat !== undefined && rawTargetLat !== "" ? Number(rawTargetLat) : NaN;
  const targetLon = rawTargetLon !== null && rawTargetLon !== undefined && rawTargetLon !== "" ? Number(rawTargetLon) : NaN;

  if (!isValidLatitude(targetLat) || !isValidLongitude(targetLon) || (targetLat === 0 && targetLon === 0)) {
    return {
      allowed: false,
      reason: HR_CONFIG_ERROR,
      gpsResult: "invalid_config"
    };
  }

  const rawRadius = geofenceConfig?.allowed_radius_meters ?? geofenceConfig?.radiusMeters ?? compRow?.allowed_radius_meters;
  const radius = rawRadius !== null && rawRadius !== undefined && rawRadius !== "" ? Number(rawRadius) : NaN;

  if (isNaN(radius) || radius <= 0) {
    return {
      allowed: false,
      reason: HR_CONFIG_ERROR,
      gpsResult: "invalid_config"
    };
  }

  const distance = getDistanceFromLatLonInMeters(empLat, empLon, targetLat, targetLon);
  if (distance > radius) {
    return {
      allowed: false,
      reason: `Location is outside authorized workplace. Distance: ${Math.round(distance)}m (Allowed: ${radius}m).`,
      distance: Math.round(distance),
      allowedRadius: radius,
      gpsResult: "outside"
    };
  }

  return {
    allowed: true,
    gpsResult: "inside",
    distance: Math.round(distance),
    allowedRadius: radius
  };
}

export default {
  isValidLatitude,
  isValidLongitude,
  getDistanceFromLatLonInMeters,
  isPointInPolygon,
  validateServerGeofence,
  HR_CONFIG_ERROR
};
