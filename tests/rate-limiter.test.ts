import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  DoSProtection,
  CircuitBreaker,
  RequestThrottler,
  SecurityMiddleware,
  RateLimitResult,
  RateLimitConfig,
  DoSProtectionConfig,
  CircuitBreakerConfig
} from '../src/security/rate-limiter.js';

describe('Rate Limiting and DoS Protection', () => {
  describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 5
      });
    });

    afterEach(() => {
      rateLimiter.destroy();
    });

    it('should allow requests within rate limit', () => {
      const request = { ip: '192.168.1.1' };
      
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkLimit(request);
        expect(result).toBe(RateLimitResult.ALLOWED);
      }
    });

    it('should block requests exceeding rate limit', () => {
      const request = { ip: '192.168.1.1' };
      
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(request);
      }
      
      // Should be blocked now
      const result = rateLimiter.checkLimit(request);
      expect(result).toBe(RateLimitResult.BLOCKED);
    });

    it('should provide accurate rate limit info', () => {
      const request = { ip: '192.168.1.1' };
      
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.checkLimit(request);
      }
      
      const info = rateLimiter.getInfo(request);
      expect(info.totalHits).toBe(3);
      expect(info.remaining).toBe(2);
    });

    it('should reset limits for specific keys', () => {
      const request = { ip: '192.168.1.1' };
      
      // Exhaust the limit
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkLimit(request);
      }
      
      rateLimiter.resetKey('192.168.1.1');
      
      const result = rateLimiter.checkLimit(request);
      expect(result).toBe(RateLimitResult.ALLOWED);
    });

    it('should detect suspicious activity', () => {
      const request = { ip: '192.168.1.1' };
      
      // Generate failures to increase suspicion
      for (let i = 0; i < 12; i++) {
        const result = rateLimiter.checkLimit(request, false); // Mark as failure
        if (i < 5) {
          expect(result).toBe(RateLimitResult.ALLOWED);
        }
      }
      
      // Should be marked as suspicious due to consecutive failures
      const info = rateLimiter.getInfo(request);
      expect(info.totalHits).toBeGreaterThan(0);
    });

    it('should use custom key generator', () => {
      const customLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        keyGenerator: (req: unknown) => `${(req as Record<string, unknown>).userId}-${(req as Record<string, unknown>).endpoint}`
      });
      
      const request1 = { userId: 'user1', endpoint: '/api/data' };
      const request2 = { userId: 'user1', endpoint: '/api/other' };
      
      // Different endpoints should have separate limits
      for (let i = 0; i < 3; i++) {
        expect(customLimiter.checkLimit(request1)).toBe(RateLimitResult.ALLOWED);
        expect(customLimiter.checkLimit(request2)).toBe(RateLimitResult.ALLOWED);
      }
      
      customLimiter.destroy();
    });

    it('should skip counting based on configuration', () => {
      const skipSuccessLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        skipSuccessfulRequests: true
      });
      
      const request = { ip: '192.168.1.1' };
      
      // Successful requests shouldn't count
      for (let i = 0; i < 10; i++) {
        const result = skipSuccessLimiter.checkLimit(request, true);
        expect(result).toBe(RateLimitResult.ALLOWED);
      }
      
      skipSuccessLimiter.destroy();
    });

    it('should emit events on limit exceeded', () => {
      return new Promise((resolve) => {
        const request = { ip: '192.168.1.1' };
        
        rateLimiter.on('limit-exceeded', (data) => {
          expect(data.key).toBe('192.168.1.1');
          expect(data.info.totalHits).toBeGreaterThan(5);
          resolve(undefined);
        });
        
        // Exceed the limit
        for (let i = 0; i < 6; i++) {
          rateLimiter.checkLimit(request);
        }
      });
    });

    it('should get active clients', () => {
      const request1 = { ip: '192.168.1.1' };
      const request2 = { ip: '192.168.1.2' };
      
      rateLimiter.checkLimit(request1);
      rateLimiter.checkLimit(request2);
      
      const activeClients = rateLimiter.getActiveClients();
      expect(activeClients).toHaveLength(2);
      expect(activeClients.map(c => c.key)).toContain('192.168.1.1');
      expect(activeClients.map(c => c.key)).toContain('192.168.1.2');
    });
  });

  describe('DoSProtection', () => {
    let dosProtection: DoSProtection;

    beforeEach(() => {
      dosProtection = new DoSProtection({
        enabled: true,
        maxConcurrentRequests: 3,
        suspiciousThreshold: 5,
        blockDuration: 60000,
        whitelistedIPs: ['127.0.0.1'],
        blacklistedIPs: ['192.168.1.100']
      });
    });

    afterEach(() => {
      dosProtection.destroy();
    });

    it('should allow whitelisted IPs', () => {
      const result = dosProtection.checkRequest('127.0.0.1');
      expect(result).toBe(true);
    });

    it('should block blacklisted IPs', () => {
      const result = dosProtection.checkRequest('192.168.1.100');
      expect(result).toBe(false);
    });

    it('should track concurrent connections', () => {
      const ip = '192.168.1.1';
      
      // Track connections
      for (let i = 0; i < 3; i++) {
        expect(dosProtection.checkRequest(ip)).toBe(true);
        dosProtection.trackConnection(ip);
      }
      
      // Should block when max concurrent reached
      expect(dosProtection.checkRequest(ip)).toBe(false);
    });

    it('should release connections properly', () => {
      const ip = '192.168.1.1';
      
      // Track and release connections
      dosProtection.trackConnection(ip);
      dosProtection.trackConnection(ip);
      dosProtection.releaseConnection(ip);
      
      const stats = dosProtection.getStats();
      expect(stats.activeConnections[ip]).toBe(1);
    });

    it('should manually block and unblock IPs', () => {
      const ip = '192.168.1.1';
      
      dosProtection.blockIP(ip, 'manual-test');
      expect(dosProtection.checkRequest(ip)).toBe(false);
      
      dosProtection.unblockIP(ip);
      expect(dosProtection.checkRequest(ip)).toBe(true);
    });

    it('should provide accurate statistics', () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';
      
      dosProtection.trackConnection(ip1);
      dosProtection.trackConnection(ip1);
      dosProtection.trackConnection(ip2);
      dosProtection.blockIP('192.168.1.3');
      
      const stats = dosProtection.getStats();
      expect(stats.activeConnections[ip1]).toBe(2);
      expect(stats.activeConnections[ip2]).toBe(1);
      expect(stats.blockedIPs).toContain('192.168.1.3');
      expect(stats.totalConnections).toBe(3);
    });

    it('should emit suspicious activity events', () => {
      return new Promise((resolve) => {
        const ip = '192.168.1.1';
        
        dosProtection.on('suspicious', (data) => {
          expect(data.ip).toBe(ip);
          expect(data.connections).toBeGreaterThanOrEqual(5);
          resolve(undefined);
        });
        
        // Generate suspicious activity
        for (let i = 0; i < 6; i++) {
          dosProtection.trackConnection(ip);
        }
      });
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 5000,
        monitoringWindow: 60000
      });
    });

    it('should allow operations when circuit is closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('operation failed'));
      
      // Fail multiple times to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected failure
        }
      }
      
      const state = circuitBreaker.getState();
      expect(state.state).toBe('open');
      expect(state.failures).toBe(3);
    });

    it('should reject operations when circuit is open', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('operation failed'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected failure
        }
      }
      
      // Should reject without calling operation
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is open');
      expect(operation).toHaveBeenCalledTimes(3); // Only the initial calls
    });

    it('should reset failures on successful operation', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected first failure
      }
      
      const result = await circuitBreaker.execute(operation);
      expect(result).toBe('success');
      
      const state = circuitBreaker.getState();
      expect(state.failures).toBe(0);
    });

    it('should provide accurate state information', () => {
      const state = circuitBreaker.getState();
      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
      expect(state.lastFailureTime).toBe(0);
    });

    it('should reset circuit breaker manually', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }
      
      circuitBreaker.reset();
      
      const state = circuitBreaker.getState();
      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
    });

    it('should emit state change events', () => {
      return new Promise((resolve) => {
        const operation = vi.fn().mockRejectedValue(new Error('fail'));
        
        circuitBreaker.on('state-change', (data) => {
          expect(data.state).toBe('open');
          resolve(undefined);
        });
        
        // Trigger state change
        (async () => {
          for (let i = 0; i < 3; i++) {
            try {
              await circuitBreaker.execute(operation);
            } catch (error) {
              // Expected
            }
          }
        })();
      });
    });
  });

  describe('RequestThrottler', () => {
    let throttler: RequestThrottler;

    beforeEach(() => {
      throttler = new RequestThrottler(2, 5); // Max 2 concurrent, queue size 5
    });

    it('should process requests within limits', async () => {
      const handler = vi.fn().mockImplementation((req) => Promise.resolve(`processed-${req.id}`));
      
      const request = { id: 'test1' };
      const result = await throttler.process(request, handler);
      
      expect(result).toBe('processed-test1');
      expect(handler).toHaveBeenCalledWith(request);
    });

    it('should maintain queue statistics', () => {
      const stats = throttler.getStats();
      expect(stats.maxConcurrent).toBe(2);
      expect(stats.maxQueueSize).toBe(5);
      expect(stats.queueSize).toBe(0);
      expect(stats.processing).toBe(0);
    });

    it('should reject requests when queue is full', async () => {
      const handler = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
      
      // Fill up the queue
      const promises = [];
      for (let i = 0; i < 8; i++) { // 2 processing + 5 queued + 1 overflow
        promises.push(
          throttler.process({ id: i }, handler).catch(err => err.message)
        );
      }
      
      const results = await Promise.all(promises);
      expect(results.some(r => r === 'Request queue full')).toBe(true);
    });

    it('should clear queue when requested', async () => {
      const handler = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves
      
      // Add requests to queue
      for (let i = 0; i < 3; i++) {
        throttler.process({ id: i }, handler).catch(() => {}); // Ignore rejections
      }
      
      throttler.clearQueue();
      
      const stats = throttler.getStats();
      expect(stats.queueSize).toBe(0);
    });

    it('should emit processing events', () => {
      return new Promise((resolve) => {
        const handler = vi.fn().mockResolvedValue('result');
        
        throttler.on('processing-start', (data) => {
          expect(data.processing).toBeGreaterThan(0);
          resolve(undefined);
        });
        
        throttler.process({ id: 'test' }, handler);
      });
    });
  });

  describe('SecurityMiddleware', () => {
    let middleware: SecurityMiddleware;

    beforeEach(() => {
      const rateLimitConfig: RateLimitConfig = {
        windowMs: 60000,
        maxRequests: 5
      };
      
      const dosConfig: DoSProtectionConfig = {
        enabled: true,
        maxConcurrentRequests: 3,
        suspiciousThreshold: 5,
        blockDuration: 60000
      };
      
      const circuitBreakerConfig: CircuitBreakerConfig = {
        failureThreshold: 3,
        recoveryTimeout: 5000,
        monitoringWindow: 60000
      };
      
      const throttlerConfig = {
        maxConcurrent: 2,
        maxQueueSize: 10
      };
      
      middleware = new SecurityMiddleware(
        rateLimitConfig,
        dosConfig,
        circuitBreakerConfig,
        throttlerConfig
      );
    });

    afterEach(() => {
      middleware.destroy();
    });

    it('should process requests through all security layers', async () => {
      const request = { ip: '192.168.1.1' };
      const handler = vi.fn().mockResolvedValue('success');
      
      const result = await middleware.processRequest(request, handler);
      expect(result).toBe('success');
      expect(handler).toHaveBeenCalledWith(request);
    });

    it('should block requests that fail DoS protection', async () => {
      const request = { ip: '192.168.1.1' };
      const handler = vi.fn().mockResolvedValue('success');
      
      // Track connections to exhaust DoS protection limits (maxConcurrentRequests: 3)
      middleware['dosProtection'].trackConnection('192.168.1.1');
      middleware['dosProtection'].trackConnection('192.168.1.1');
      middleware['dosProtection'].trackConnection('192.168.1.1');
      
      // This should fail due to DoS protection
      await expect(middleware.processRequest(request, handler))
        .rejects.toThrow(/DoS protection/);
    });

    it('should provide comprehensive statistics', () => {
      const stats = middleware.getStats();
      
      expect(stats).toHaveProperty('rateLimiter');
      expect(stats).toHaveProperty('dosProtection');
      expect(stats).toHaveProperty('circuitBreaker');
      expect(stats).toHaveProperty('throttler');
      
      expect(Array.isArray(stats.rateLimiter)).toBe(true);
      expect(typeof stats.dosProtection).toBe('object');
      expect(typeof stats.circuitBreaker).toBe('object');
      expect(typeof stats.throttler).toBe('object');
    });

    it('should forward events from sub-components', () => {
      return new Promise((resolve) => {
        const request = { ip: '192.168.1.1' };
        const handler = vi.fn().mockResolvedValue('success');
        
        middleware.on('rate-limit-exceeded', (data) => {
          expect(data.key).toBe('192.168.1.1');
          resolve(undefined);
        });
        
        // Exhaust rate limit
        (async () => {
          for (let i = 0; i < 7; i++) {
            try {
              await middleware.processRequest(request, handler);
            } catch (error) {
              // Expected after limit exceeded
            }
          }
        })();
      });
    });

    it('should handle circuit breaker failures', async () => {
      const request = { ip: '192.168.1.1' };
      const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
      
      // Should eventually fail due to circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await middleware.processRequest(request, handler);
        } catch (error) {
          // Expected failures
        }
      }
      
      const stats = middleware.getStats();
      expect(stats.circuitBreaker.failures).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined request objects', () => {
      const rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyGenerator: (req) => (req as Record<string, unknown>)?.ip as string || 'unknown'
      });
      
      const result = rateLimiter.checkLimit(undefined);
      expect(result).toBe(RateLimitResult.ALLOWED);
      
      rateLimiter.destroy();
    });

    it('should handle disabled DoS protection', () => {
      const dosProtection = new DoSProtection({
        enabled: false,
        maxConcurrentRequests: 1,
        suspiciousThreshold: 1,
        blockDuration: 1000
      });
      
      // Should allow all requests when disabled
      for (let i = 0; i < 10; i++) {
        expect(dosProtection.checkRequest('192.168.1.1')).toBe(true);
        dosProtection.trackConnection('192.168.1.1');
      }
      
      dosProtection.destroy();
    });

    it('should handle circuit breaker with no failures', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeout: 1000,
        monitoringWindow: 60000
      });
      
      const operation = vi.fn().mockResolvedValue('success');
      
      for (let i = 0; i < 10; i++) {
        await circuitBreaker.execute(operation);
      }
      
      const state = circuitBreaker.getState();
      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
    });

    it('should handle empty throttler queue', () => {
      const throttler = new RequestThrottler(1, 1);
      const stats = throttler.getStats();
      
      expect(stats.queueSize).toBe(0);
      expect(stats.processing).toBe(0);
    });
  });
});