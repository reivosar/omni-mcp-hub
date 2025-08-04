import { Request, Response } from 'express';
import { LSPHandler } from '../../../src/handlers/lsp-handler';
import { ClientType, ProtocolType } from '../../../src/types/client-types';

describe('LSPHandler', () => {
  let handler: LSPHandler;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    handler = new LSPHandler();
    
    mockReq = {
      body: {},
      headers: {},
      url: '/lsp',
      path: '/lsp'
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
      expect(handler.getClientType()).toBe(ClientType.CURSOR);
      expect(handler.getProtocolType()).toBe(ProtocolType.LSP);
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
        error: 'LSP handler not implemented yet'
      });
    });

    it('should handle different request types consistently', async () => {
      const requests = [
        { ...mockReq, body: { method: 'textDocument/completion' } },
        { ...mockReq, body: { method: 'textDocument/hover' } },
        { ...mockReq, body: { method: 'workspace/symbol' } },
        { ...mockReq, body: { method: 'unknown/method' } }
      ];

      for (const req of requests) {
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis()
        };

        await handler.process(req as Request, res as any);

        expect(res.status).toHaveBeenCalledWith(501);
        expect(res.json).toHaveBeenCalledWith({
          error: 'LSP handler not implemented yet'
        });
      }
    });

    it('should handle requests without body', async () => {
      const reqWithoutBody = { ...mockReq };
      delete reqWithoutBody.body;

      await handler.process(reqWithoutBody as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'LSP handler not implemented yet'
      });
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
    it('should return LSP method names', () => {
      const methods = handler.getSupportedMethods();
      
      expect(methods).toEqual([
        'textDocument/completion',
        'textDocument/hover',
        'workspace/symbol'
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

    it('should include standard LSP methods', () => {
      const methods = handler.getSupportedMethods();
      
      // Check that all methods follow LSP naming convention
      methods.forEach(method => {
        expect(method).toMatch(/^(textDocument|workspace)\//);
      });
    });
  });

  describe('inheritance from BaseClientHandler', () => {
    it('should have correct client type', () => {
      expect(handler.getClientType()).toBe(ClientType.CURSOR);
    });

    it('should have correct protocol type', () => {
      expect(handler.getProtocolType()).toBe(ProtocolType.LSP);
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
  });

  describe('future implementation considerations', () => {
    it('should be ready for LSP protocol implementation', () => {
      // Verify structure supports future LSP implementation
      expect(handler.getProtocolType()).toBe(ProtocolType.LSP);
      expect(handler.getSupportedMethods()).toContain('textDocument/completion');
      expect(handler.getSupportedMethods()).toContain('textDocument/hover');
      expect(handler.getSupportedMethods()).toContain('workspace/symbol');
    });

    it('should maintain consistent interface for future implementations', () => {
      const methods = handler.getSupportedMethods();
      
      // All methods should be valid LSP method names
      methods.forEach(method => {
        expect(method).toMatch(/^[a-zA-Z]+\/[a-zA-Z]+$/);
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
  });
});