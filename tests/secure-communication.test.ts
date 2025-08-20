import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as tls from 'tls';
import {
  CertificateManager,
  TLSServer,
  TLSClient,
  SecureCommunicationManager,
  TLSConfig,
  mTLSConfig,
  SecureConnectionConfig,
  CertificateInfo
} from '../src/security/secure-communication.js';

// Mock fs module
vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

// Mock crypto module
vi.mock('crypto', () => ({
  X509Certificate: vi.fn().mockImplementation(() => ({
    subject: 'CN=test.example.com',
    issuer: 'CN=Test CA',
    fingerprint256: 'sha256-fingerprint',
    serialNumber: '12345',
    validFrom: '2024-01-01T00:00:00.000Z',
    validTo: '2025-12-31T23:59:59.000Z',
    verify: vi.fn().mockReturnValue(true),
    publicKey: 'mock-public-key'
  }))
}));

// Mock tls module
vi.mock('tls', () => ({
  createServer: vi.fn(),
  connect: vi.fn()
}));

describe('Secure Communication System', () => {
  describe('CertificateManager', () => {
    let certificateManager: CertificateManager;
    const mockReadFile = vi.mocked(fs.readFile);

    beforeEach(() => {
      certificateManager = new CertificateManager();
      vi.clearAllMocks();
    });

    afterEach(() => {
      certificateManager.destroy();
    });

    it('should load and validate certificates', async () => {
      const mockCertContent = `-----BEGIN CERTIFICATE-----
MIICertificateContent
-----END CERTIFICATE-----`;

      mockReadFile.mockResolvedValue(mockCertContent);

      const info = await certificateManager.loadCertificate('test-cert', '/path/to/cert.pem');
      
      expect(mockReadFile).toHaveBeenCalledWith('/path/to/cert.pem', 'utf8');
      expect(info.subject).toBe('CN=test.example.com');
      expect(info.fingerprint).toBe('sha256-fingerprint');
    });

    it('should detect expired certificates', async () => {
      const mockCertContent = 'mock-cert-content';
      mockReadFile.mockResolvedValue(mockCertContent);
      
      // Mock expired certificate
      const mockX509Certificate = vi.mocked(crypto.X509Certificate);
      mockX509Certificate.mockImplementationOnce(() => ({
        subject: 'CN=expired.example.com',
        issuer: 'CN=Test CA',
        fingerprint256: 'expired-fingerprint',
        serialNumber: '54321',
        validFrom: '2020-01-01T00:00:00.000Z',
        validTo: '2021-12-31T23:59:59.000Z', // Expired
        verify: vi.fn().mockReturnValue(true),
        publicKey: 'mock-public-key'
      }));

      return new Promise<void>((resolve) => {
        certificateManager.on('certificate-expired', (data) => {
          expect(data.name).toBe('expired-cert');
          expect(data.info.isExpired).toBe(true);
          resolve();
        });

        certificateManager.loadCertificate('expired-cert', '/path/to/expired.pem');
      });
    });

    it('should start and stop rotation monitoring', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      certificateManager.startRotationMonitoring(1000);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

      certificateManager.stopRotationMonitoring();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should handle certificate loading errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(
        certificateManager.loadCertificate('error-cert', '/nonexistent.pem')
      ).rejects.toThrow('Certificate loading failed: File not found');
    });

    it('should manage multiple certificates', async () => {
      const mockCertContent = 'mock-cert-content';
      mockReadFile.mockResolvedValue(mockCertContent);

      await certificateManager.loadCertificate('cert1', '/cert1.pem');
      await certificateManager.loadCertificate('cert2', '/cert2.pem');

      const allCerts = certificateManager.getAllCertificates();
      expect(allCerts.size).toBe(2);
      expect(allCerts.has('cert1')).toBe(true);
      expect(allCerts.has('cert2')).toBe(true);

      const cert1Info = certificateManager.getCertificateInfo('cert1');
      expect(cert1Info).toBeDefined();
      expect(cert1Info?.subject).toBe('CN=test.example.com');
    });
  });

  describe('TLSServer', () => {
    let tlsServer: TLSServer;
    let mockServer: any;
    const mockCreateServer = vi.mocked(tls.createServer);
    const mockReadFile = vi.mocked(fs.readFile);

    beforeEach(() => {
      mockServer = {
        listen: vi.fn(),
        close: vi.fn().mockImplementation((callback) => {
          if (callback) setImmediate(callback);
        }),
        on: vi.fn(),
        listening: true
      };

      mockCreateServer.mockReturnValue(mockServer);
      mockReadFile.mockResolvedValue(Buffer.from('mock-file-content'));

      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: true
      };

      tlsServer = new TLSServer(config);
    });

    afterEach(async () => {
      if (tlsServer && tlsServer.isRunning()) {
        await tlsServer.stop();
      }
    });

    it('should start TLS server successfully', async () => {
      mockServer.listen.mockImplementation((port: number, host: string, callback: () => void) => {
        setImmediate(callback);
      });

      await tlsServer.start(8443, '0.0.0.0');

      expect(mockCreateServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(8443, '0.0.0.0', expect.any(Function));
      expect(tlsServer.isRunning()).toBe(true);
    });

    it('should build TLS options correctly', async () => {
      mockServer.listen.mockImplementation((port: number, host: string, callback: () => void) => {
        setImmediate(callback);
      });

      await tlsServer.start(8443);

      const createServerCall = mockCreateServer.mock.calls[0];
      const options = createServerCall[0];

      expect(options.key).toBeDefined();
      expect(options.cert).toBeDefined();
      expect(options.requestCert).toBe(true);
      expect(options.rejectUnauthorized).toBe(true);
    });

    it('should provide connection handler', async () => {
      mockServer.listen.mockImplementation((port: number, host: string, callback: () => void) => {
        setImmediate(callback);
      });

      await tlsServer.start(8443);

      // Verify that a connection handler was provided to createServer
      expect(mockCreateServer).toHaveBeenCalled();
      const createServerCall = mockCreateServer.mock.calls[0];
      const connectionHandler = createServerCall[1];
      
      expect(connectionHandler).toBeDefined();
      expect(typeof connectionHandler).toBe('function');
      
      // Verify metrics start at zero
      const metrics = tlsServer.getMetrics();
      expect(metrics.connectionsEstablished).toBe(0);
      expect(metrics.activeSessions).toBe(0);
    });

    it('should stop server gracefully', async () => {
      mockServer.close.mockImplementation((callback: () => void) => {
        setImmediate(callback);
      });

      mockServer.listen.mockImplementation((port: number, host: string, callback: () => void) => {
        setImmediate(callback);
      });

      await tlsServer.start(8443);
      await tlsServer.stop();

      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should throw error when TLS is not enabled', async () => {
      const disabledConfig: mTLSConfig = {
        enabled: false,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: false
      };

      const disabledServer = new TLSServer(disabledConfig);

      await expect(disabledServer.start(8443)).rejects.toThrow('TLS is not enabled in configuration');
    });
  });

  describe('TLSClient', () => {
    let tlsClient: TLSClient;
    let mockSocket: any;
    const mockConnect = vi.mocked(tls.connect);
    const mockReadFile = vi.mocked(fs.readFile);

    beforeEach(() => {
      mockSocket = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn().mockImplementation((callback) => {
          if (callback) setImmediate(callback);
        }),
        destroy: vi.fn(),
        destroyed: false,
        setKeepAlive: vi.fn(),
        getPeerCertificate: vi.fn().mockReturnValue({
          subject: { CN: 'server.example.com' },
          valid_from: '2024-01-01',
          valid_to: '2025-12-31',
          subjectaltname: 'DNS:server.example.com'
        }),
        getCipher: vi.fn().mockReturnValue({ name: 'AES256', version: 'TLSv1.3' })
      };

      mockConnect.mockReturnValue(mockSocket);
      mockReadFile.mockResolvedValue(Buffer.from('mock-file-content'));

      const tlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/client-key.pem',
        certPath: '/client-cert.pem'
      };

      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443,
        timeout: 5000,
        retryAttempts: 3,
        retryDelay: 100
      };

      tlsClient = new TLSClient(tlsConfig, connectionConfig);
    });

    afterEach(async () => {
      if (tlsClient && tlsClient.isConnected()) {
        await tlsClient.disconnect();
      }
    });

    it('should connect to TLS server successfully', async () => {
      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      await tlsClient.connect();

      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'server.example.com',
          port: 8443,
          timeout: 5000
        }),
        expect.any(Function)
      );

      expect(tlsClient.isConnected()).toBe(true);
    });

    it('should write data to connection', async () => {
      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      mockSocket.write.mockImplementation((data: any, callback: any) => {
        setImmediate(() => callback());
        return true;
      });

      await tlsClient.connect();
      const result = await tlsClient.write('test data');

      expect(result).toBe(true);
      expect(mockSocket.write).toHaveBeenCalledWith('test data', expect.any(Function));
    });

    it('should handle write errors', async () => {
      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      mockSocket.write.mockImplementation((data: any, callback: any) => {
        setImmediate(() => callback(new Error('Write failed')));
        return false;
      });

      await tlsClient.connect();

      await expect(tlsClient.write('test data')).rejects.toThrow('Write failed');
    });

    it('should disconnect gracefully', async () => {
      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      mockSocket.end.mockImplementation((callback: any) => {
        setImmediate(callback);
      });

      await tlsClient.connect();
      await tlsClient.disconnect();

      expect(mockSocket.end).toHaveBeenCalled();
    });

    it('should track security metrics', async () => {
      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      await tlsClient.connect();

      const metrics = tlsClient.getMetrics();
      expect(metrics.connectionsEstablished).toBe(1);
      expect(metrics.activeSessions).toBe(1);
      expect(metrics.lastConnectionTime).toBeInstanceOf(Date);
    });

    it('should throw error when writing to disconnected socket', async () => {
      mockSocket.destroyed = true;

      await expect(tlsClient.write('test data')).rejects.toThrow('TLS connection is not established');
    });
  });

  describe('SecureCommunicationManager', () => {
    let secureManager: SecureCommunicationManager;
    const mockReadFile = vi.mocked(fs.readFile);

    beforeEach(() => {
      secureManager = new SecureCommunicationManager();
      vi.clearAllMocks();
      mockReadFile.mockResolvedValue(Buffer.from('mock-cert-content'));
    });

    afterEach(async () => {
      await secureManager.destroy();
    });

    it('should initialize certificates', async () => {
      const certificates = [
        { name: 'server-cert', path: '/server.pem' },
        { name: 'client-cert', path: '/client.pem', watch: true }
      ];

      await secureManager.initializeCertificates(certificates);

      const metrics = secureManager.getSecurityMetrics();
      expect(metrics.certificates.size).toBe(2);
      expect(metrics.certificates.has('server-cert')).toBe(true);
      expect(metrics.certificates.has('client-cert')).toBe(true);
    });

    it('should validate all certificates', async () => {
      const certificates = [
        { name: 'valid-cert', path: '/valid.pem' },
        { name: 'expired-cert', path: '/expired.pem' }
      ];

      const mockX509Certificate = vi.mocked(crypto.X509Certificate);
      mockX509Certificate
        .mockImplementationOnce(() => ({
          subject: 'CN=valid.example.com',
          issuer: 'CN=Test CA',
          fingerprint256: 'valid-fingerprint',
          serialNumber: '12345',
          validFrom: '2024-01-01T00:00:00.000Z',
          validTo: '2025-12-31T23:59:59.000Z',
          verify: vi.fn().mockReturnValue(true),
          publicKey: 'mock-public-key'
        }))
        .mockImplementationOnce(() => ({
          subject: 'CN=expired.example.com',
          issuer: 'CN=Test CA',
          fingerprint256: 'expired-fingerprint',
          serialNumber: '54321',
          validFrom: '2020-01-01T00:00:00.000Z',
          validTo: '2021-12-31T23:59:59.000Z',
          verify: vi.fn().mockReturnValue(true),
          publicKey: 'mock-public-key'
        }));

      await secureManager.initializeCertificates(certificates);

      const validationResults = await secureManager.validateAllCertificates();

      expect(validationResults).toHaveLength(2);
      expect(validationResults[0]).toEqual({ name: 'valid-cert', valid: true });
      expect(validationResults[1]).toEqual({
        name: 'expired-cert',
        valid: false,
        reason: 'Certificate expired'
      });
    });

    it('should get comprehensive security metrics', async () => {
      // Initialize with certificates
      await secureManager.initializeCertificates([
        { name: 'test-cert', path: '/test.pem' }
      ]);

      const metrics = secureManager.getSecurityMetrics();

      expect(metrics.certificates).toBeInstanceOf(Map);
      expect(metrics.certificates.size).toBe(1);
      expect(metrics.clients).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing certificate files', async () => {
      const certificateManager = new CertificateManager();
      const mockReadFile = vi.mocked(fs.readFile);

      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(
        certificateManager.loadCertificate('missing-cert', '/nonexistent.pem')
      ).rejects.toThrow('Certificate loading failed: ENOENT: no such file or directory');

      certificateManager.destroy();
    });

    it('should handle server start failures', async () => {
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/nonexistent-key.pem',
        certPath: '/nonexistent-cert.pem',
        requireClientCert: false
      };

      const mockReadFile = vi.mocked(fs.readFile);
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const tlsServer = new TLSServer(config);

      await expect(tlsServer.start(8443)).rejects.toThrow('File not found');
    });
  });
});