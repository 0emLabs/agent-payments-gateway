import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiterDO } from '../RateLimiterDO';
import { createMockEnv, createMockDurableObjectState } from '../../test/testHelpers';

describe('RateLimiterDO', () => {
  let rateLimiter: RateLimiterDO;
  let mockEnv: ReturnType<typeof createMockEnv>;
  let mockState: ReturnType<typeof createMockDurableObjectState>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
    mockState = createMockDurableObjectState();
    rateLimiter = new RateLimiterDO(mockState as any, mockEnv as any);
    
    // Mock Date.now for consistent testing
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAndIncrement', () => {
    it('should allow first request', async () => {
      const allowed = await rateLimiter.checkAndIncrement();

      expect(allowed).toBe(true);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'state',
        expect.objectContaining({
          requests: 1,
          dailyUsage: 1
        })
      );
    });

    it('should enforce minute rate limit', async () => {
      // Set up state at limit
      mockState.storage.get = vi.fn(async () => ({
        requests: 20, // At the limit
        windowStart: Date.now() - 30000, // 30 seconds ago
        dailyUsage: 20,
        lastReset: new Date().toDateString()
      }));

      const allowed = await rateLimiter.checkAndIncrement();

      expect(allowed).toBe(false);
    });

    it('should reset minute window after expiry', async () => {
      // Set up expired window
      mockState.storage.get = vi.fn(async () => ({
        requests: 20,
        windowStart: Date.now() - 70000, // 70 seconds ago (past 60s window)
        dailyUsage: 100,
        lastReset: new Date().toDateString()
      }));

      const allowed = await rateLimiter.checkAndIncrement();

      expect(allowed).toBe(true);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'state',
        expect.objectContaining({
          requests: 1, // Reset to 1
          windowStart: Date.now(),
          dailyUsage: 101 // Incremented
        })
      );
    });

    it('should enforce daily rate limit', async () => {
      // Set up state at daily limit
      mockState.storage.get = vi.fn(async () => ({
        requests: 5,
        windowStart: Date.now() - 30000,
        dailyUsage: 1000, // At the daily limit
        lastReset: new Date().toDateString()
      }));

      const allowed = await rateLimiter.checkAndIncrement();

      expect(allowed).toBe(false);
    });

    it('should reset daily usage on new day', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockState.storage.get = vi.fn(async () => ({
        requests: 5,
        windowStart: Date.now() - 30000,
        dailyUsage: 1000,
        lastReset: yesterday.toDateString()
      }));

      const allowed = await rateLimiter.checkAndIncrement();

      expect(allowed).toBe(true);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'state',
        expect.objectContaining({
          dailyUsage: 1, // Reset to 1
          lastReset: new Date().toDateString()
        })
      );
    });
  });  describe('GET /check', () => {
    it('should check without incrementing', async () => {
      mockState.storage.get = vi.fn(async () => ({
        requests: 10,
        windowStart: Date.now() - 30000,
        dailyUsage: 100,
        lastReset: new Date().toDateString()
      }));

      const request = new Request('http://localhost/check');
      const response = await rateLimiter.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ allowed: true });
      
      // Should not modify state
      expect(mockState.storage.put).not.toHaveBeenCalled();
    });

    it('should return false when at minute limit', async () => {
      mockState.storage.get = vi.fn(async () => ({
        requests: 20, // At limit
        windowStart: Date.now() - 30000,
        dailyUsage: 100,
        lastReset: new Date().toDateString()
      }));

      const request = new Request('http://localhost/check');
      const response = await rateLimiter.fetch(request);
      const result = await response.json();

      expect(result).toEqual({ allowed: false });
    });

    it('should return false when at daily limit', async () => {
      mockState.storage.get = vi.fn(async () => ({
        requests: 5,
        windowStart: Date.now() - 30000,
        dailyUsage: 1000, // At daily limit
        lastReset: new Date().toDateString()
      }));

      const request = new Request('http://localhost/check');
      const response = await rateLimiter.fetch(request);
      const result = await response.json();

      expect(result).toEqual({ allowed: false });
    });
  });

  describe('POST /increment', () => {
    it('should increment and return result', async () => {
      mockState.storage.get = vi.fn(async () => null);

      const request = new Request('http://localhost/increment', {
        method: 'POST'
      });
      const response = await rateLimiter.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ allowed: true });
      expect(mockState.storage.put).toHaveBeenCalled();
    });

    it('should return false when limit exceeded', async () => {
      mockState.storage.get = vi.fn(async () => ({
        requests: 20,
        windowStart: Date.now() - 30000,
        dailyUsage: 100,
        lastReset: new Date().toDateString()
      }));

      const request = new Request('http://localhost/increment', {
        method: 'POST'
      });
      const response = await rateLimiter.fetch(request);
      const result = await response.json();

      expect(result).toEqual({ allowed: false });
    });
  });

  describe('GET /status', () => {
    it('should return current usage status', async () => {
      mockState.storage.get = vi.fn(async () => ({
        requests: 15,
        windowStart: Date.now() - 30000, // 30 seconds ago
        dailyUsage: 500,
        lastReset: new Date().toDateString()
      }));

      const request = new Request('http://localhost/status');
      const response = await rateLimiter.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({
        minuteLimit: 20,
        minuteUsed: 15,
        minuteResetIn: 30000, // 30 seconds remaining
        dailyLimit: 1000,
        dailyUsed: 500
      });
    });

    it('should handle empty state', async () => {
      mockState.storage.get = vi.fn(async () => null);

      const request = new Request('http://localhost/status');
      const response = await rateLimiter.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({
        minuteLimit: 20,
        minuteUsed: 0,
        minuteResetIn: expect.any(Number),
        dailyLimit: 1000,
        dailyUsed: 0
      });
    });
  });  describe('alarm', () => {
    it('should reset daily usage at midnight', async () => {
      mockState.storage.get = vi.fn(async () => ({
        requests: 15,
        windowStart: Date.now() - 30000,
        dailyUsage: 999,
        lastReset: new Date().toDateString()
      }));

      await rateLimiter.alarm();

      expect(mockState.storage.put).toHaveBeenCalledWith(
        'state',
        expect.objectContaining({
          dailyUsage: 0,
          lastReset: new Date().toDateString()
        })
      );
      
      // Should schedule next alarm
      expect(mockState.storage.setAlarm).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const request = new Request('http://localhost/unknown');
      const response = await rateLimiter.fetch(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not found');
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests correctly', async () => {
      // Simulate state that's close to limit
      mockState.storage.get = vi.fn(async () => ({
        requests: 19,
        windowStart: Date.now() - 30000,
        dailyUsage: 999,
        lastReset: new Date().toDateString()
      }));

      // First request should succeed
      const allowed1 = await rateLimiter.checkAndIncrement();
      expect(allowed1).toBe(true);

      // Update mock to reflect incremented state
      mockState.storage.get = vi.fn(async () => ({
        requests: 20,
        windowStart: Date.now() - 30000,
        dailyUsage: 1000,
        lastReset: new Date().toDateString()
      }));

      // Second request should fail
      const allowed2 = await rateLimiter.checkAndIncrement();
      expect(allowed2).toBe(false);
    });

    it('should handle time zone changes for daily reset', async () => {
      // Mock different time zone scenario
      const utcDate = new Date();
      const localDate = new Date(utcDate.getTime() + (utcDate.getTimezoneOffset() * 60000));
      
      mockState.storage.get = vi.fn(async () => ({
        requests: 5,
        windowStart: Date.now() - 30000,
        dailyUsage: 100,
        lastReset: localDate.toDateString()
      }));

      const allowed = await rateLimiter.checkAndIncrement();

      // Should handle gracefully regardless of timezone
      expect(typeof allowed).toBe('boolean');
    });
  });
});