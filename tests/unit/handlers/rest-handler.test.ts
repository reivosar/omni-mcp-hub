import { Request, Response } from 'express';
import { RESTHandler } from '../../../src/handlers/rest-handler';
import { ClientType, ProtocolType } from '../../../src/types/client-types';

describe('RESTHandler', () => {
  let handler: RESTHandler;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    handler = new RESTHandler();
    
    mockReq = {
      body: {},
      headers: {},
      url: '/api/v1/documentation',
      path: '/api/v1/documentation',
      method: 'GET'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
  });

  describe('constructor', () => {
    it('should initialize with correct client and protocol types', () => {
      expect(handler.getClientType()).toBe(ClientType.CHATGPT);
      expect(handler.getProtocolType()).toBe(ProtocolType.REST);
    });

    it('should extend BaseClientHandler', () => {
      expect(handler).toHaveProperty('getClientType');
      expect(handler).toHaveProperty('getProtocolType');
      expect(handler).toHaveProperty('getSupportedMethods');
    });
  });

  describe('process', () => {
    it('should return 501 Not Implemented status', async () => {
      await handler.process(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'REST handler not implemented yet'
      });
    });

    it('should handle GET requests for documentation', async () => {
      const getDocReq = {
        ...mockReq,
        method: 'GET',
        path: '/api/v1/documentation'
      };

      await handler.process(getDocReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'REST handler not implemented yet'
      });
    });

    it('should handle GET requests for sources', async () => {
      const getSourcesReq = {
        ...mockReq,
        method: 'GET',
        path: '/api/v1/sources'
      };

      await handler.process(getSourcesReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'REST handler not implemented yet'
      });
    });

    it('should handle GET requests for specific files', async () => {
      const getFileReq = {
        ...mockReq,
        method: 'GET',
        path: '/api/v1/files/README.md',
        params: { filename: 'README.md' }
      };

      await handler.process(getFileReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'REST handler not implemented yet'
      });
    });

    it('should handle POST requests consistently', async () => {
      const postReq = {
        ...mockReq,
        method: 'POST',
        body: { data: 'test' }
      };

      await handler.process(postReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'REST handler not implemented yet'
      });
    });

    it('should handle requests without body', async () => {
      const reqWithoutBody = { ...mockReq };
      delete reqWithoutBody.body;

      await handler.process(reqWithoutBody as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'REST handler not implemented yet'
      });
    });

    it('should handle requests with various content types', async () => {
      const requests = [
        { ...mockReq, headers: { 'content-type': 'application/json' } },
        { ...mockReq, headers: { 'content-type': 'application/xml' } },
        { ...mockReq, headers: { 'content-type': 'text/plain' } },
        { ...mockReq, headers: {} }
      ];

      for (const req of requests) {
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis()
        };

        await handler.process(req as Request, res as any);

        expect(res.status).toHaveBeenCalledWith(501);
        expect(res.json).toHaveBeenCalledWith({
          error: 'REST handler not implemented yet'
        });
      }
    });

    it('should handle async processing', async () => {
      const startTime = Date.now();
      await handler.process(mockReq as Request, mockRes as Response);
      const endTime = Date.now();

      // Should complete quickly since it's just returning an error
      expect(endTime - startTime).toBeLessThan(100);
      expect(mockRes.status).toHaveBeenCalledWith(501);
    });
  });

  describe('getSupportedMethods', () => {
    it('should return REST API endpoints', () => {
      const methods = handler.getSupportedMethods();
      
      expect(methods).toEqual([
        'GET /api/v1/documentation',
        'GET /api/v1/sources',
        'GET /api/v1/files/:filename'
      ]);
    });

    it('should return consistent methods across multiple calls', () => {
      const methods1 = handler.getSupportedMethods();
      const methods2 = handler.getSupportedMethods();
      
      expect(methods1).toEqual(methods2);
    });

    it('should return array of strings', () => {
      const methods = handler.getSupportedMethods();
      
      expect(Array.isArray(methods)).toBe(true);
      methods.forEach(method => {
        expect(typeof method).toBe('string');
      });
    });

    it('should include standard REST patterns', () => {
      const methods = handler.getSupportedMethods();
      
      // Check that all methods follow REST API convention
      methods.forEach(method => {
        expect(method).toMatch(/^(GET|POST|PUT|DELETE|PATCH) \/api\/v1\//);
      });
    });

    it('should include parameterized routes', () => {
      const methods = handler.getSupportedMethods();
      
      expect(methods.some(method => method.includes(':filename'))).toBe(true);
    });
  });

  describe('inheritance from BaseClientHandler', () => {
    it('should have correct client type', () => {
      expect(handler.getClientType()).toBe(ClientType.CHATGPT);
    });

    it('should have correct protocol type', () => {
      expect(handler.getProtocolType()).toBe(ProtocolType.REST);
    });

    it('should inherit base handler methods', () => {
      expect(typeof handler.getClientType).toBe('function');
      expect(typeof handler.getProtocolType).toBe('function');
      expect(typeof handler.process).toBe('function');
      expect(typeof handler.getSupportedMethods).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should handle response object without status method', async () => {
      const brokenRes = {
        json: jest.fn()
      } as any;

      // Should not throw error even if response is malformed
      await expect(handler.process(mockReq as Request, brokenRes)).rejects.toThrow();
    });

    it('should handle response object without json method', async () => {
      const brokenRes = {
        status: jest.fn().mockReturnThis()
      } as any;

      // Should not throw error even if response is malformed
      await expect(handler.process(mockReq as Request, brokenRes)).rejects.toThrow();
    });

    it('should handle null/undefined request', async () => {
      await expect(handler.process(null as any, mockRes as Response))
        .resolves.not.toThrow();
      
      expect(mockRes.status).toHaveBeenCalledWith(501);
    });

    it('should handle null/undefined response', async () => {
      await expect(handler.process(mockReq as Request, null as any))
        .rejects.toThrow();
    });

    it('should handle malformed request paths', async () => {
      const malformedReqs = [
        { ...mockReq, path: undefined },
        { ...mockReq, path: null },
        { ...mockReq, path: '' },
        { ...mockReq, url: undefined }
      ];

      for (const req of malformedReqs) {
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis()
        };

        await handler.process(req as any, res as any);
        expect(res.status).toHaveBeenCalledWith(501);
      }
    });
  });

  describe('future implementation considerations', () => {
    it('should be ready for REST API implementation', () => {
      // Verify structure supports future REST implementation
      expect(handler.getProtocolType()).toBe(ProtocolType.REST);
      expect(handler.getSupportedMethods()).toContain('GET /api/v1/documentation');
      expect(handler.getSupportedMethods()).toContain('GET /api/v1/sources');
      expect(handler.getSupportedMethods()).toContain('GET /api/v1/files/:filename');
    });

    it('should maintain consistent REST API interface', () => {
      const methods = handler.getSupportedMethods();
      
      // All methods should follow HTTP verb + path pattern
      methods.forEach(method => {
        expect(method).toMatch(/^(GET|POST|PUT|DELETE|PATCH) \/\S+$/);
      });
    });

    it('should support versioned API endpoints', () => {
      const methods = handler.getSupportedMethods();
      
      methods.forEach(method => {
        expect(method).toContain('/api/v1/');
      });
    });
  });

  describe('REST API patterns', () => {
    it('should follow RESTful naming conventions', () => {
      const methods = handler.getSupportedMethods();
      
      // Should have GET endpoints for resources
      expect(methods.some(m => m.includes('GET') && m.includes('documentation'))).toBe(true);
      expect(methods.some(m => m.includes('GET') && m.includes('sources'))).toBe(true);
      expect(methods.some(m => m.includes('GET') && m.includes('files'))).toBe(true);
    });

    it('should support resource-specific endpoints', () => {
      const methods = handler.getSupportedMethods();
      
      // Should have parameterized endpoint for specific files
      const fileEndpoint = methods.find(m => m.includes('files/:filename'));
      expect(fileEndpoint).toBeDefined();
      expect(fileEndpoint).toContain(':filename');
    });

    it('should maintain API version consistency', () => {
      const methods = handler.getSupportedMethods();
      
      methods.forEach(method => {
        // All endpoints should use the same API version
        expect(method).toContain('v1');
      });
    });
  });

  describe('performance', () => {
    it('should respond quickly with not implemented error', async () => {
      const start = performance.now();
      await handler.process(mockReq as Request, mockRes as Response);
      const end = performance.now();
      
      // Should be very fast since it's just returning an error
      expect(end - start).toBeLessThan(10);
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () => 
        handler.process(mockReq as Request, {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis()
        } as any)
      );

      await expect(Promise.all(requests)).resolves.toBeDefined();
    });

    it('should handle large request bodies without issues', async () => {
      const largeBodyReq = {
        ...mockReq,
        body: {
          data: 'x'.repeat(10000)
        }
      };

      await handler.process(largeBodyReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'REST handler not implemented yet'
      });
    });
  });
});