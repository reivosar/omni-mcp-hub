import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { MonitoringServer } from '../../src/monitoring/monitoring-server.js';
import http from 'http';

// Mock external dependencies  
vi.mock('../../src/utils/logger.js', () => ({
  SilentLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

describe('MonitoringServer Route Handler Tests', () => {
  let server: MonitoringServer;
  let mockRequest: Partial<http.IncomingMessage>;
  let mockResponse: Partial<http.ServerResponse>;
  let mockEnd: MockedFunction<any>;
  let mockWrite: MockedFunction<any>;

  beforeEach(() => {
    server = new MonitoringServer({ port: 3001 });
    
    // Mock HTTP response methods
    mockEnd = vi.fn();
    mockWrite = vi.fn();
    
    mockResponse = {
      writeHead: vi.fn(),
      end: mockEnd,
      write: mockWrite,
      setHeader: vi.fn()
    };

    mockRequest = {
      url: '/',
      method: 'GET',
      headers: {}
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Route Pattern Implementation Tests', () => {
    it('should verify route pattern is used instead of switch statement', () => {
      const routeRequestCode = (server as any).routeRequest.toString();
      
      // Verify no switch statement is present
      expect(routeRequestCode).not.toContain('switch');
      expect(routeRequestCode).not.toContain('case ');
      
      // Verify route pattern elements are present
      expect(routeRequestCode).toContain('routeHandlers');
      expect(routeRequestCode).toContain('const handler = routeHandlers[path]');
      expect(routeRequestCode).toContain('if (handler)');
    });

    it('should have proper route handler mappings', () => {
      const routeRequestCode = (server as any).routeRequest.toString();
      
      // Verify all expected route options are mapped (parameters may be renamed in transpiled code)
      const expectedRoutes = [
        '"metrics":', '"health":', '"health/ready":', '"health/live":', 
        '"stats":', '"dashboard":', '"":', '"/":' 
      ];
      
      const expectedMethods = [
        'this.handleMetrics', 'this.handleHealth', 'this.handleReadiness',
        'this.handleLiveness', 'this.handleStats', 'this.handleDashboard', 'this.handleRoot'
      ];
      
      expectedRoutes.forEach(route => {
        expect(routeRequestCode).toContain(route);
      });
      
      expectedMethods.forEach(method => {
        expect(routeRequestCode).toContain(method);
      });
    });

    it('should handle 404 errors for unknown routes', () => {
      const routeRequestCode = (server as any).routeRequest.toString();
      
      // Verify 404 handling
      expect(routeRequestCode).toContain('404');
      expect(routeRequestCode).toContain('Endpoint not found');
      expect(routeRequestCode).toContain('available');
    });
  });

  describe('Individual Route Handler Tests', () => {
    it('should have all required route handler methods available', () => {
      const methodNames = [
        'handleMetrics',
        'handleHealth', 
        'handleReadiness',
        'handleLiveness',
        'handleStats',
        'handleDashboard',
        'handleRoot'
      ];

      methodNames.forEach(methodName => {
        expect(typeof (server as any)[methodName]).toBe('function');
      });
    });

    it('should test method spying works correctly', async () => {
      // Test that we can spy on individual route handlers
      const handleMetricsSpy = vi.spyOn(server as any, 'handleMetrics').mockResolvedValue(undefined);
      const handleHealthSpy = vi.spyOn(server as any, 'handleHealth').mockResolvedValue(undefined);
      
      // Call methods directly
      await (server as any).handleMetrics(mockRequest, mockResponse);
      await (server as any).handleHealth(mockRequest, mockResponse);
      
      expect(handleMetricsSpy).toHaveBeenCalledTimes(1);
      expect(handleHealthSpy).toHaveBeenCalledTimes(1);
    });

    it('should test routeRequest calls correct handlers', async () => {
      // Spy on sendResponse to prevent actual HTTP responses
      const sendResponseSpy = vi.spyOn(server as any, 'sendResponse').mockImplementation(() => {});
      
      // Test metrics route
      const handleMetricsSpy = vi.spyOn(server as any, 'handleMetrics').mockResolvedValue(undefined);
      await (server as any).routeRequest('metrics', mockRequest, mockResponse);
      expect(handleMetricsSpy).toHaveBeenCalledTimes(1);

      // Test health route  
      const handleHealthSpy = vi.spyOn(server as any, 'handleHealth').mockResolvedValue(undefined);
      await (server as any).routeRequest('health', mockRequest, mockResponse);
      expect(handleHealthSpy).toHaveBeenCalledTimes(1);

      // Test unknown route returns 404
      await (server as any).routeRequest('unknown', mockRequest, mockResponse);
      expect(sendResponseSpy).toHaveBeenCalledWith(
        mockResponse, 
        404, 
        'application/json', 
        expect.stringContaining('Endpoint not found')
      );
    });
  });

  describe('Route Mapping Coverage Tests', () => {
    it('should handle all defined routes without errors', async () => {
      const sendResponseSpy = vi.spyOn(server as any, 'sendResponse').mockImplementation(() => {});
      
      const routes = [
        'metrics', 'health', 'health/ready', 'health/live', 
        'stats', 'dashboard', '', '/'
      ];

      for (const route of routes) {
        // Spy on the specific handler to prevent actual execution
        const handlerName = route === 'metrics' ? 'handleMetrics' :
                           route === 'health' ? 'handleHealth' :
                           route === 'health/ready' ? 'handleReadiness' :
                           route === 'health/live' ? 'handleLiveness' :
                           route === 'stats' ? 'handleStats' :
                           route === 'dashboard' ? 'handleDashboard' :
                           'handleRoot';
        
        const handlerSpy = vi.spyOn(server as any, handlerName).mockResolvedValue(undefined);
        
        await (server as any).routeRequest(route, mockRequest, mockResponse);
        
        expect(handlerSpy).toHaveBeenCalledTimes(1);
        expect(handlerSpy).toHaveBeenCalledWith(mockRequest, mockResponse);
      }
    });
  });

  describe('Complexity Reduction Verification', () => {
    it('should have low cyclomatic complexity after refactoring', () => {
      const routeRequestCode = (server as any).routeRequest.toString();
      
      // Count complexity indicators (if, for, while, case, catch, &&, ||, ?, :)
      const complexityIndicators = [
        /\bif\s*\(/g,
        /\bfor\s*\(/g, 
        /\bwhile\s*\(/g,
        /\bcase\s+/g,
        /\bcatch\s*\(/g,
        /&&/g,
        /\|\|/g,
        /\?/g,
        /:/g
      ];
      
      let totalComplexity = 1; // Base complexity
      complexityIndicators.forEach(pattern => {
        const matches = routeRequestCode.match(pattern);
        if (matches) {
          totalComplexity += matches.length;
        }
      });
      
      // After refactoring from switch to route mapping, complexity should be low
      expect(totalComplexity).toBeLessThan(15); // Reasonable threshold
    });

    it('should verify no duplicate route handling logic', () => {
      const routeRequestCode = (server as any).routeRequest.toString();
      
      // Should not contain break statements (switch pattern)
      expect(routeRequestCode).not.toContain('break;');
      
      // Should not contain fall-through logic
      expect(routeRequestCode).not.toContain('default:');
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle missing route handler gracefully', async () => {
      const sendResponseSpy = vi.spyOn(server as any, 'sendResponse').mockImplementation(() => {});
      
      await (server as any).routeRequest('nonexistent', mockRequest, mockResponse);
      
      expect(sendResponseSpy).toHaveBeenCalledWith(
        mockResponse,
        404,
        'application/json',
        expect.stringContaining('Endpoint not found')
      );
    });

    it('should list available endpoints in 404 response', async () => {
      const sendResponseSpy = vi.spyOn(server as any, 'sendResponse').mockImplementation(() => {});
      
      await (server as any).routeRequest('invalid', mockRequest, mockResponse);
      
      const response = sendResponseSpy.mock.calls[0][3]; // Fourth argument (response body)
      expect(response).toContain('/metrics');
      expect(response).toContain('/health');
      expect(response).toContain('/stats');
      expect(response).toContain('/dashboard');
    });
  });

  describe('HTTP Method and Response Tests', () => {
    it('should properly handle sendResponse method', () => {
      const sendResponseCode = (server as any).sendResponse.toString();
      
      // Verify sendResponse handles status codes, content types, and response bodies
      expect(sendResponseCode).toContain('writeHead');
      expect(sendResponseCode).toContain('end');
    });

    it('should call sendResponse with correct parameters', () => {
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn()
      };
      
      (server as any).sendResponse(mockRes, 200, 'application/json', '{"test": true}');
      
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json',
        'Content-Length': 14,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      expect(mockRes.end).toHaveBeenCalledWith('{"test": true}');
    });
  });
});