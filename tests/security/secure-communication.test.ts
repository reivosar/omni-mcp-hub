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
} from '../../src/security/secure-communication.js';

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

  describe('CertificateManager - Extended Coverage', () => {
    let certificateManager: CertificateManager;
    const mockReadFile = vi.mocked(fs.readFile);

    beforeEach(() => {
      certificateManager = new CertificateManager();
      vi.clearAllMocks();
    });

    afterEach(() => {
      certificateManager.destroy();
    });

    it('should watch certificate files', async () => {
      const watchStartedSpy = vi.fn();
      certificateManager.on('certificate-watch-started', watchStartedSpy);
      
      await certificateManager.watchCertificate('test-cert', '/path/to/cert.pem');
      
      expect(watchStartedSpy).toHaveBeenCalledWith({
        name: 'test-cert',
        path: '/path/to/cert.pem'
      });
    });

    it('should not watch same file twice', async () => {
      await certificateManager.watchCertificate('cert1', '/same/path.pem');
      await certificateManager.watchCertificate('cert2', '/same/path.pem');
      
      // Should only watch once
      expect(certificateManager.watchedFiles?.size || 0).toBe(1);
    });

    it('should validate certificate chain with CA', async () => {
      const mockCertContent = 'mock-cert-content';
      const mockCaContent = 'mock-ca-content';
      
      mockReadFile
        .mockResolvedValueOnce(mockCertContent)
        .mockResolvedValueOnce(mockCaContent);

      const mockX509Certificate = vi.mocked(crypto.X509Certificate);
      const mockVerify = vi.fn().mockReturnValue(true);
      
      mockX509Certificate
        .mockImplementationOnce(() => ({
          subject: 'CN=test.example.com',
          issuer: 'CN=Test CA',
          fingerprint256: 'fingerprint',
          serialNumber: '12345',
          validFrom: '2024-01-01T00:00:00.000Z',
          validTo: '2025-12-31T23:59:59.000Z',
          verify: mockVerify,
          publicKey: 'mock-public-key'
        }))
        .mockImplementationOnce(() => ({
          subject: 'CN=Test CA',
          issuer: 'CN=Root CA',
          fingerprint256: 'ca-fingerprint',
          serialNumber: '67890',
          validFrom: '2020-01-01T00:00:00.000Z',
          validTo: '2030-12-31T23:59:59.000Z',
          verify: vi.fn(),
          publicKey: 'ca-public-key'
        }));

      const isValid = await certificateManager.validateCertificateChain('/cert.pem', '/ca.pem');
      expect(isValid).toBe(true);
      expect(mockVerify).toHaveBeenCalled();
    });

    it('should validate certificate chain without CA (basic validation)', async () => {
      const mockCertContent = 'mock-cert-content';
      mockReadFile.mockResolvedValue(mockCertContent);

      const mockX509Certificate = vi.mocked(crypto.X509Certificate);
      mockX509Certificate.mockImplementation(() => ({
        subject: 'CN=test.example.com',
        issuer: 'CN=Test CA',
        fingerprint256: 'fingerprint',
        serialNumber: '12345',
        validFrom: '2024-01-01T00:00:00.000Z',
        validTo: '2025-12-31T23:59:59.000Z',
        verify: vi.fn(),
        publicKey: 'mock-public-key'
      }));

      const isValid = await certificateManager.validateCertificateChain('/cert.pem');
      expect(isValid).toBe(true);
    });

    it('should handle certificate chain validation errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File read error'));

      const isValid = await certificateManager.validateCertificateChain('/invalid.pem');
      expect(isValid).toBe(false);
    });

    it('should detect certificates expiring soon', async () => {
      const mockCertContent = 'mock-cert-content';
      mockReadFile.mockResolvedValue(mockCertContent);
      
      // Mock certificate expiring in 15 days
      const expiryDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const mockX509Certificate = vi.mocked(crypto.X509Certificate);
      mockX509Certificate.mockImplementation(() => ({
        subject: 'CN=expiring.example.com',
        issuer: 'CN=Test CA',
        fingerprint256: 'expiring-fingerprint',
        serialNumber: '11111',
        validFrom: '2024-01-01T00:00:00.000Z',
        validTo: expiryDate.toISOString(),
        verify: vi.fn().mockReturnValue(true),
        publicKey: 'mock-public-key'
      }));

      return new Promise<void>((resolve) => {
        certificateManager.on('certificate-expiring', (data) => {
          expect(data.name).toBe('expiring-cert');
          expect(data.info.isExpiringSoon).toBe(true);
          resolve();
        });

        certificateManager.loadCertificate('expiring-cert', '/expiring.pem');
      });
    });

    it('should check certificate expiration in monitoring', () => {
      // Load an expired certificate first
      const expiredInfo: CertificateInfo = {
        subject: 'CN=expired.com',
        issuer: 'CN=CA',
        fingerprint: 'fingerprint',
        serialNumber: '12345',
        validFrom: new Date('2020-01-01'),
        validTo: new Date('2021-01-01'),
        isExpired: true,
        isExpiringSoon: false
      };
      
      certificateManager.certificates?.set('expired-cert', expiredInfo);
      
      return new Promise<void>((resolve) => {
        certificateManager.on('certificate-expired', (data) => {
          expect(data.name).toBe('expired-cert');
          resolve();
        });

        // Trigger manual check
        (certificateManager as any).checkCertificateExpiration();
      });
    });
  });

  describe('TLSServer - Extended Coverage', () => {
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
    });

    afterEach(async () => {
      if (tlsServer && tlsServer.isRunning()) {
        await tlsServer.stop();
      }
    });

    it('should build TLS options with all optional parameters', async () => {
      const fullConfig: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        caPath: '/ca.pem',
        dhparam: '/dhparam.pem',
        passphrase: 'secret',
        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        requireClientCert: true
      };

      tlsServer = new TLSServer(fullConfig);
      
      mockServer.listen.mockImplementation((port: number, host: string, callback: () => void) => {
        setImmediate(callback);
      });

      await tlsServer.start(8443);

      const createServerCall = mockCreateServer.mock.calls[0];
      const options = createServerCall[0];

      expect(options.passphrase).toBe('secret');
      expect(options.ciphers).toBe('ECDHE-RSA-AES256-GCM-SHA384');
      expect(options.minVersion).toBe('TLSv1.2');
      expect(options.maxVersion).toBe('TLSv1.3');
      expect(mockReadFile).toHaveBeenCalledWith('/ca.pem');
      expect(mockReadFile).toHaveBeenCalledWith('/dhparam.pem');
    });

    it('should validate client certificates with allowed subjects', () => {
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: true,
        allowedSubjects: ['allowed.example.com']
      };

      tlsServer = new TLSServer(config);

      const validCert = { subject: { CN: 'allowed.example.com' } } as tls.PeerCertificate;
      const invalidCert = { subject: { CN: 'forbidden.example.com' } } as tls.PeerCertificate;

      expect((tlsServer as any).validateClientCertificate(validCert)).toBe(true);
      expect((tlsServer as any).validateClientCertificate(invalidCert)).toBe(false);
    });

    it('should validate client certificates with allowed fingerprints', () => {
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: true,
        allowedFingerprints: ['valid-fingerprint']
      };

      tlsServer = new TLSServer(config);

      const validCert = { fingerprint256: 'valid-fingerprint' } as tls.PeerCertificate;
      const invalidCert = { fingerprint256: 'invalid-fingerprint' } as tls.PeerCertificate;

      expect((tlsServer as any).validateClientCertificate(validCert)).toBe(true);
      expect((tlsServer as any).validateClientCertificate(invalidCert)).toBe(false);
    });

    it('should use custom client verification function', () => {
      const customVerify = vi.fn().mockReturnValue(true);
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: true,
        verifyClient: customVerify
      };

      tlsServer = new TLSServer(config);

      const cert = { subject: { CN: 'test.com' } } as tls.PeerCertificate;
      const result = (tlsServer as any).validateClientCertificate(cert);

      expect(customVerify).toHaveBeenCalledWith(cert);
      expect(result).toBe(true);
    });

    it('should handle empty client certificate', () => {
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: true
      };

      tlsServer = new TLSServer(config);

      const emptyCert = {} as tls.PeerCertificate;
      expect((tlsServer as any).validateClientCertificate(emptyCert)).toBe(false);
    });

    it('should handle server and TLS client errors', async () => {
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: false
      };

      tlsServer = new TLSServer(config);

      const serverErrorSpy = vi.fn();
      const tlsErrorSpy = vi.fn();
      
      tlsServer.on('server-error', serverErrorSpy);
      tlsServer.on('tls-error', tlsErrorSpy);

      const serverError = new Error('Server error');
      const tlsError = new Error('TLS error');
      const mockSocket = {} as tls.TLSSocket;

      (tlsServer as any).handleServerError(serverError);
      (tlsServer as any).handleTLSClientError(tlsError, mockSocket);

      expect(serverErrorSpy).toHaveBeenCalledWith(serverError);
      expect(tlsErrorSpy).toHaveBeenCalledWith(tlsError, mockSocket);
      
      const metrics = tlsServer.getMetrics();
      expect(metrics.connectionsFailed).toBe(1);
      expect(metrics.tlsHandshakeFailures).toBe(1);
    });

    it('should get active sessions count', () => {
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: false
      };

      tlsServer = new TLSServer(config);
      expect(tlsServer.getActiveSessionsCount()).toBe(0);
    });

    it('should handle connection with client certificate validation failure', () => {
      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: true,
        allowedSubjects: ['allowed.com']
      };

      tlsServer = new TLSServer(config);
      
      // Test the validation method directly
      const forbiddenCert = { subject: { CN: 'forbidden.com' } } as tls.PeerCertificate;
      const result = (tlsServer as any).validateClientCertificate(forbiddenCert);
      
      expect(result).toBe(false);
    });
  });

  describe('TLSClient - Extended Coverage', () => {
    let tlsClient: TLSClient;
    let mockSocket: any;
    const mockConnect = vi.mocked(tls.connect);
    const mockReadFile = vi.mocked(fs.readFile);

    beforeEach(() => {
      mockSocket = {
        on: vi.fn(),
        emit: vi.fn(),
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
    });

    afterEach(async () => {
      if (tlsClient && tlsClient.isConnected()) {
        await tlsClient.disconnect();
      }
    });

    it('should build connection options with all parameters', async () => {
      const fullTlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/client-key.pem',
        certPath: '/client-cert.pem',
        caPath: '/ca.pem',
        passphrase: 'secret',
        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      };

      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443,
        timeout: 5000,
        retryAttempts: 3,
        retryDelay: 100,
        keepAlive: true,
        keepAliveInitialDelay: 1000
      };

      tlsClient = new TLSClient(fullTlsConfig, connectionConfig);

      mockConnect.mockImplementation((options, callback) => {
        expect(options.passphrase).toBe('secret');
        expect(options.ciphers).toBe('ECDHE-RSA-AES256-GCM-SHA384');
        expect(options.minVersion).toBe('TLSv1.2');
        expect(options.maxVersion).toBe('TLSv1.3');
        setImmediate(callback);
        return mockSocket;
      });

      await tlsClient.connect();
      
      expect(mockReadFile).toHaveBeenCalledWith('/client-key.pem');
      expect(mockReadFile).toHaveBeenCalledWith('/client-cert.pem');
      expect(mockReadFile).toHaveBeenCalledWith('/ca.pem');
      expect(mockSocket.setKeepAlive).toHaveBeenCalledWith(true, 1000);
    });

    it('should handle connection retries', async () => {
      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443,
        retryAttempts: 2,
        retryDelay: 1 // Very short delay for test
      };

      const tlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem'
      };

      tlsClient = new TLSClient(tlsConfig, connectionConfig);

      let connectAttempts = 0;
      mockConnect.mockImplementation((options, callback) => {
        connectAttempts++;
        
        if (connectAttempts < 3) {
          // Fail first two attempts by throwing immediately
          throw new Error('Connection failed');
        } else {
          // Succeed on third attempt
          setImmediate(callback);
        }
        return mockSocket;
      });

      await tlsClient.connect();
      expect(connectAttempts).toBe(3);
    });

    it('should handle connection timeout', async () => {
      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443,
        timeout: 100
      };

      const tlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem'
      };

      tlsClient = new TLSClient(tlsConfig, connectionConfig);

      // Mock a socket that immediately times out
      mockConnect.mockImplementation(() => {
        // Simulate timeout by throwing immediately
        throw new Error('Connection timeout');
      });

      await expect(tlsClient.connect()).rejects.toThrow('Connection timeout');
    });

    it('should validate server identity', async () => {
      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443
      };

      const tlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem'
      };

      tlsClient = new TLSClient(tlsConfig, connectionConfig);

      const validCert = {
        subject: { CN: 'server.example.com' },
        valid_from: '2024-01-01',
        valid_to: '2025-12-31',
        subjectaltname: 'DNS:server.example.com'
      } as tls.PeerCertificate;

      const result = (tlsClient as any).checkServerIdentity('server.example.com', validCert);
      expect(result).toBeUndefined();

      const invalidCert = {
        subject: { CN: 'wrong.example.com' },
        valid_from: '2024-01-01',
        valid_to: '2025-12-31'
      } as tls.PeerCertificate;

      const error = (tlsClient as any).checkServerIdentity('server.example.com', invalidCert);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('does not match hostname');
    });

    it('should get peer certificate and cipher info', async () => {
      const tlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem'
      };

      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443
      };

      tlsClient = new TLSClient(tlsConfig, connectionConfig);

      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      await tlsClient.connect();

      const peerCert = tlsClient.getPeerCertificate();
      const cipher = tlsClient.getCipher();

      expect(peerCert?.subject.CN).toBe('server.example.com');
      expect(cipher?.name).toBe('AES256');
    });
  });

  describe('SecureCommunicationManager - Extended Coverage', () => {
    let secureManager: SecureCommunicationManager;
    const mockReadFile = vi.mocked(fs.readFile);
    const mockCreateServer = vi.mocked(tls.createServer);
    const mockConnect = vi.mocked(tls.connect);

    beforeEach(() => {
      secureManager = new SecureCommunicationManager();
      vi.clearAllMocks();
      mockReadFile.mockResolvedValue(Buffer.from('mock-cert-content'));
    });

    afterEach(async () => {
      try {
        await Promise.race([
          secureManager.destroy(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Destroy timeout')), 2000))
        ]);
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    });

    it('should start TLS server and forward events', async () => {
      const mockServer = {
        listen: vi.fn().mockImplementation((port, host, callback) => setImmediate(callback)),
        close: vi.fn().mockImplementation((callback) => setImmediate(callback)),
        on: vi.fn(),
        listening: true
      };

      mockCreateServer.mockReturnValue(mockServer);

      const config: mTLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem',
        requireClientCert: false
      };

      const connectionSpy = vi.fn();
      const closedSpy = vi.fn();
      const dataSpy = vi.fn();
      
      secureManager.on('server-connection', connectionSpy);
      secureManager.on('server-connection-closed', closedSpy);
      secureManager.on('server-data', dataSpy);

      await secureManager.startTLSServer(config, 8443, '0.0.0.0');
      
      expect(mockCreateServer).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(8443, '0.0.0.0', expect.any(Function));
    });

    it('should create TLS client and forward events', async () => {
      const mockSocket = {
        on: vi.fn(),
        emit: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
        destroyed: false,
        setKeepAlive: vi.fn(),
        getPeerCertificate: vi.fn().mockReturnValue({}),
        getCipher: vi.fn().mockReturnValue({})
      };

      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      const tlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/client-key.pem',
        certPath: '/client-cert.pem'
      };

      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443
      };

      const connectedSpy = vi.fn();
      const disconnectedSpy = vi.fn();
      const clientDataSpy = vi.fn();
      const errorSpy = vi.fn();
      
      secureManager.on('client-connected', connectedSpy);
      secureManager.on('client-disconnected', disconnectedSpy);
      secureManager.on('client-data', clientDataSpy);
      secureManager.on('client-error', errorSpy);

      const client = await secureManager.createTLSClient('test-client', tlsConfig, connectionConfig);
      
      expect(client).toBeDefined();
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should handle client disconnect errors in destroy', async () => {
      const mockSocket = {
        on: vi.fn(),
        emit: vi.fn(),
        write: vi.fn(),
        end: vi.fn().mockImplementation((callback) => {
          setImmediate(() => callback(new Error('Disconnect failed')));
        }),
        destroy: vi.fn(),
        destroyed: false,
        setKeepAlive: vi.fn(),
        getPeerCertificate: vi.fn(),
        getCipher: vi.fn()
      };

      mockConnect.mockImplementation((options, callback) => {
        setImmediate(callback);
        return mockSocket;
      });

      const tlsConfig: TLSConfig = {
        enabled: true,
        keyPath: '/key.pem',
        certPath: '/cert.pem'
      };

      const connectionConfig: SecureConnectionConfig = {
        host: 'server.example.com',
        port: 8443
      };

      await secureManager.createTLSClient('failing-client', tlsConfig, connectionConfig);
      
      // Should not throw even if client disconnect fails
      await expect(secureManager.destroy()).resolves.toBeUndefined();
    });
  });
});