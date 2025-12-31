/**
 * Working Hours Utility
 * Checks if current time is within configured working hours
 */

import type { AdminConfig } from '../api/config';

/**
 * Get current hour in the specified timezone
 * @param timezone IANA timezone string (e.g., "Europe/Madrid")
 * @returns Current hour (0-23) in the specified timezone
 */
function getCurrentHourInTimezone(timezone: string): number {
  try {
    // Use Intl.DateTimeFormat to get current time in specified timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    
    const now = new Date();
    const hourStr = formatter.format(now);
    return parseInt(hourStr, 10);
  } catch (error) {
    // Fallback to UTC if timezone is invalid
    console.warn(`Invalid timezone "${timezone}", falling back to UTC:`, error);
    return new Date().getUTCHours();
  }
}

/**
 * Check if current time is within working hours
 * @param config AdminConfig with workingHours configuration
 * @returns true if within working hours or if feature is disabled, false otherwise
 */
export function isWithinWorkingHours(config: AdminConfig): boolean {
  const workingHours = config.workingHours;
  
  // If working hours feature is disabled, always return true (no restrictions)
  if (!workingHours || workingHours.enabled === false) {
    return true;
  }

  const { startHour, endHour, timezone } = workingHours;
  
  // Validate hours
  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
    console.warn('Invalid working hours configuration, allowing all hours');
    return true;
  }

  // Get current hour in the configured timezone
  const currentHour = getCurrentHourInTimezone(timezone || 'Europe/Madrid');

  // Handle normal case: startHour <= endHour (e.g., 10 AM - 11 PM)
  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour <= endHour;
  }

  // Handle overnight case: startHour > endHour (e.g., 22 - 6, meaning 10 PM - 6 AM)
  // This means working hours span midnight
  return currentHour >= startHour || currentHour <= endHour;
}

/**
 * Get current time information in the configured timezone
 * Useful for logging and debugging
 */
export function getWorkingHoursInfo(config: AdminConfig): {
  isWithinHours: boolean;
  currentHour: number;
  timezone: string;
  startHour: number;
  endHour: number;
  enabled: boolean;
} {
  const workingHours = config.workingHours || {
    enabled: false,
    startHour: 10,
    endHour: 23,
    timezone: 'Europe/Madrid',
  };

  const timezone = workingHours.timezone || 'Europe/Madrid';
  const currentHour = getCurrentHourInTimezone(timezone);

  return {
    isWithinHours: isWithinWorkingHours(config),
    currentHour,
    timezone,
    startHour: workingHours.startHour || 10,
    endHour: workingHours.endHour || 23,
    enabled: workingHours.enabled !== false,
  };
}

