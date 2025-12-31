/**
 * Working Hours Utility Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isWithinWorkingHours, getWorkingHoursInfo } from '../working-hours';
import type { AdminConfig } from '../../api/config';

// Mock Intl.DateTimeFormat for consistent testing
const mockFormatter = vi.fn();

describe('working-hours', () => {
  let originalDateTimeFormat: typeof Intl.DateTimeFormat;
  let mockCurrentHour: number;

  beforeEach(() => {
    // Mock Intl.DateTimeFormat to control returned hour
    originalDateTimeFormat = Intl.DateTimeFormat;
    mockCurrentHour = 15; // Default to 3 PM
    
    global.Intl.DateTimeFormat = vi.fn(() => ({
      format: () => String(mockCurrentHour),
    })) as any;
  });

  afterEach(() => {
    global.Intl.DateTimeFormat = originalDateTimeFormat;
    vi.clearAllMocks();
  });

  describe('isWithinWorkingHours', () => {
    it('should return true when working hours feature is disabled', () => {
      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: false,
          startHour: 10,
          endHour: 23,
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(true);
    });

    it('should return true when workingHours is undefined', () => {
      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(true);
    });

    it('should return true when current hour is within working hours (normal case)', () => {
      mockCurrentHour = 15; // 3 PM

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 10,
          endHour: 23,
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(true);
    });

    it('should return false when current hour is before start hour', () => {
      mockCurrentHour = 8; // 8 AM

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 10,
          endHour: 23,
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(false);
    });

    it('should return false when current hour is after end hour', () => {
      // Note: endHour 23 means up to and including 23:59, so 23 should be within hours
      // Let's test with hour 0 (midnight) which is after 23
      mockCurrentHour = 0; // Midnight

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 10,
          endHour: 23,
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(false);
    });

    it('should handle overnight working hours (startHour > endHour)', () => {
      mockCurrentHour = 23; // 11 PM - should be within hours for 22-6 range

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 22, // 10 PM
          endHour: 6,    // 6 AM (next day)
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(true);
    });

    it('should handle overnight working hours - early morning', () => {
      mockCurrentHour = 3; // 3 AM - should be within hours for 22-6 range

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 22, // 10 PM
          endHour: 6,    // 6 AM (next day)
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(true);
    });

    it('should handle overnight working hours - outside range', () => {
      mockCurrentHour = 8; // 8 AM - should be outside hours for 22-6 range

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 22, // 10 PM
          endHour: 6,    // 6 AM (next day)
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(false);
    });

    it('should return true for invalid hours (fallback)', () => {
      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 25, // Invalid hour
          endHour: 23,
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(true);
    });

    it('should work with different timezones', () => {
      mockCurrentHour = 15; // 3 PM

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 10,
          endHour: 23,
          timezone: 'America/New_York',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      expect(isWithinWorkingHours(config)).toBe(true);
    });
  });

  describe('getWorkingHoursInfo', () => {
    it('should return correct info when within working hours', () => {
      mockCurrentHour = 15; // 3 PM

      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: true,
          startHour: 10,
          endHour: 23,
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      const info = getWorkingHoursInfo(config);
      expect(info.isWithinHours).toBe(true);
      expect(info.currentHour).toBe(15);
      expect(info.timezone).toBe('Europe/Madrid');
      expect(info.startHour).toBe(10);
      expect(info.endHour).toBe(23);
      expect(info.enabled).toBe(true);
    });

    it('should return correct info when working hours disabled', () => {
      const config: AdminConfig = {
        pollingIntervalSec: 30,
        kvWriteIntervalSec: 3600,
        primaryProvider: 'alpha-feed',
        backupProvider: 'beta-feed',
        alertThrottle: { maxAlerts: 100, windowSeconds: 60 },
        workingHours: {
          enabled: false,
          startHour: 10,
          endHour: 23,
          timezone: 'Europe/Madrid',
        },
        featureFlags: {
          alerting: true,
          sandboxMode: false,
          simulateProviderFailure: false,
        },
      };

      const info = getWorkingHoursInfo(config);
      expect(info.isWithinHours).toBe(true); // Should return true when disabled
      expect(info.enabled).toBe(false);
    });
  });
});

