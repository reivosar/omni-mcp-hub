import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { performance } from 'perf_hooks';
import { OmniMCPServer } from '../../src/index.js';

describe('Performance and Load Tests', () => {
  let server: OmniMCPServer;
  let httpServer: http.Server;
  const PORT = 3456;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    // Start test server
    server = new OmniMCPServer();
    httpServer = http.createServer((req, res) => {
      // Simple mock server for testing
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    });
    
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe('Load Testing', () => {
    it('should handle 100 concurrent requests', async () => {
      const concurrentRequests = 100;
      const results: number[] = [];
      
      const makeRequest = async (): Promise<number> => {
        const start = performance.now();
        
        return new Promise((resolve, reject) => {
          http.get(BASE_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              const duration = performance.now() - start;
              resolve(duration);
            });
          }).on('error', reject);
        });
      };

      const promises = Array(concurrentRequests).fill(null).map(() => makeRequest());
      const durations = await Promise.all(promises);
      
      // Calculate metrics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      
      console.log(`
        Load Test Results (${concurrentRequests} concurrent requests):
        - Average: ${avgDuration.toFixed(2)}ms
        - Min: ${minDuration.toFixed(2)}ms
        - Max: ${maxDuration.toFixed(2)}ms
      `);
      
      // Performance assertions
      expect(avgDuration).toBeLessThan(1000); // Average should be under 1 second
      expect(maxDuration).toBeLessThan(5000); // Max should be under 5 seconds
    });

    it('should maintain performance under sustained load', async () => {
      const duration = 5000; // 5 seconds
      const requestsPerSecond = 20;
      const results: number[] = [];
      let totalRequests = 0;
      let errors = 0;
      
      const startTime = Date.now();
      
      const makeRequest = async (): Promise<void> => {
        try {
          const start = performance.now();
          await new Promise((resolve, reject) => {
            http.get(BASE_URL, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                results.push(performance.now() - start);
                totalRequests++;
                resolve(undefined);
              });
            }).on('error', reject);
          });
        } catch (error) {
          errors++;
        }
      };

      // Generate load for specified duration
      const interval = setInterval(() => {
        for (let i = 0; i < requestsPerSecond; i++) {
          makeRequest();
        }
      }, 1000);

      await new Promise(resolve => setTimeout(resolve, duration));
      clearInterval(interval);
      
      // Wait for pending requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Calculate metrics
      const avgLatency = results.reduce((a, b) => a + b, 0) / results.length;
      const p95Latency = results.sort((a, b) => a - b)[Math.floor(results.length * 0.95)];
      const p99Latency = results.sort((a, b) => a - b)[Math.floor(results.length * 0.99)];
      const errorRate = (errors / totalRequests) * 100;
      
      console.log(`
        Sustained Load Test Results (${requestsPerSecond} req/s for ${duration/1000}s):
        - Total Requests: ${totalRequests}
        - Average Latency: ${avgLatency.toFixed(2)}ms
        - P95 Latency: ${p95Latency.toFixed(2)}ms
        - P99 Latency: ${p99Latency.toFixed(2)}ms
        - Error Rate: ${errorRate.toFixed(2)}%
      `);
      
      // Performance assertions
      expect(avgLatency).toBeLessThan(500);
      expect(p99Latency).toBeLessThan(2000);
      expect(errorRate).toBeLessThan(1);
    });

    it('should handle request spikes gracefully', async () => {
      const normalLoad = 10;
      const spikeLoad = 100;
      const results: { normal: number[], spike: number[], recovery: number[] } = {
        normal: [],
        spike: [],
        recovery: []
      };
      
      const makeRequest = async (): Promise<number> => {
        const start = performance.now();
        return new Promise((resolve, reject) => {
          http.get(BASE_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(performance.now() - start));
          }).on('error', reject);
        });
      };

      // Normal load phase
      for (let i = 0; i < normalLoad; i++) {
        results.normal.push(await makeRequest());
      }
      
      // Spike phase
      const spikePromises = Array(spikeLoad).fill(null).map(() => makeRequest());
      results.spike = await Promise.all(spikePromises);
      
      // Recovery phase
      await new Promise(resolve => setTimeout(resolve, 1000));
      for (let i = 0; i < normalLoad; i++) {
        results.recovery.push(await makeRequest());
      }
      
      // Calculate metrics
      const avgNormal = results.normal.reduce((a, b) => a + b, 0) / results.normal.length;
      const avgSpike = results.spike.reduce((a, b) => a + b, 0) / results.spike.length;
      const avgRecovery = results.recovery.reduce((a, b) => a + b, 0) / results.recovery.length;
      
      console.log(`
        Spike Test Results:
        - Normal Load Avg: ${avgNormal.toFixed(2)}ms
        - Spike Load Avg: ${avgSpike.toFixed(2)}ms
        - Recovery Load Avg: ${avgRecovery.toFixed(2)}ms
        - Spike Impact: ${((avgSpike / avgNormal - 1) * 100).toFixed(2)}%
        - Recovery Time: ${((avgRecovery / avgNormal - 1) * 100).toFixed(2)}% deviation
      `);
      
      // Performance assertions
      expect(avgSpike).toBeLessThan(avgNormal * 10); // Spike shouldn't degrade more than 10x
      expect(avgRecovery).toBeLessThan(avgNormal * 2); // Should recover to near normal
    });
  });

  describe('Memory Performance', () => {
    it('should not leak memory under load', async () => {
      const iterations = 1000;
      const memorySnapshots: number[] = [];
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < iterations; i++) {
        // Simulate work
        await new Promise((resolve, reject) => {
          http.get(BASE_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', resolve);
          }).on('error', reject);
        });
        
        if (i % 100 === 0) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;
      
      console.log(`
        Memory Test Results:
        - Initial Memory: ${(initialMemory / 1024 / 1024).toFixed(2)}MB
        - Final Memory: ${(finalMemory / 1024 / 1024).toFixed(2)}MB
        - Memory Growth: ${memoryGrowthMB.toFixed(2)}MB
      `);
      
      // Memory assertions
      expect(memoryGrowthMB).toBeLessThan(50); // Should not grow more than 50MB
    });
  });

  describe('Throughput Testing', () => {
    it('should achieve minimum throughput requirements', async () => {
      const testDuration = 10000; // 10 seconds
      let requestCount = 0;
      let errorCount = 0;
      const startTime = Date.now();
      
      const makeRequest = async (): Promise<void> => {
        try {
          await new Promise((resolve, reject) => {
            http.get(BASE_URL, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                requestCount++;
                resolve(undefined);
              });
            }).on('error', reject);
          });
        } catch (error) {
          errorCount++;
        }
      };

      // Generate continuous load
      const promises: Promise<void>[] = [];
      while (Date.now() - startTime < testDuration) {
        promises.push(makeRequest());
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between requests
      }
      
      await Promise.all(promises);
      
      const actualDuration = (Date.now() - startTime) / 1000;
      const throughput = requestCount / actualDuration;
      const errorRate = (errorCount / (requestCount + errorCount)) * 100;
      
      console.log(`
        Throughput Test Results:
        - Total Requests: ${requestCount}
        - Duration: ${actualDuration.toFixed(2)}s
        - Throughput: ${throughput.toFixed(2)} req/s
        - Error Rate: ${errorRate.toFixed(2)}%
      `);
      
      // Throughput assertions
      expect(throughput).toBeGreaterThan(50); // At least 50 req/s
      expect(errorRate).toBeLessThan(1); // Less than 1% errors
    });
  });
});