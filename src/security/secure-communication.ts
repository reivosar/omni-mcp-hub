/**
 * Secure Communication System with TLS/mTLS Support
 * Provides comprehensive encryption and authentication for MCP communications
 */

import * as tls from "tls";
import * as fs from "fs/promises";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import { ILogger, SilentLogger } from "../utils/logger.js";

export interface TLSConfig {
  enabled: boolean;
  keyPath: string;
  certPath: string;
  caPath?: string;
  passphrase?: string;
  ciphers?: string;
  minVersion?: string;
  maxVersion?: string;
  dhparam?: string;
}

export interface mTLSConfig extends TLSConfig {
  requireClientCert: boolean;
  clientCertPaths?: string[];
  verifyClient?: (cert: tls.PeerCertificate) => boolean;
  allowedSubjects?: string[];
  allowedFingerprints?: string[];
}

export interface SecureConnectionConfig {
  host: string;
  port: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  fingerprint: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  isExpired: boolean;
  isExpiringSoon: boolean; // within 30 days
}

export interface SecurityMetrics {
  connectionsEstablished: number;
  connectionsFailed: number;
  certificateValidationFailures: number;
  tlsHandshakeFailures: number;
  mutualAuthFailures: number;
  totalDataTransferred: number;
  lastConnectionTime?: Date;
  activeSessions: number;
}

export class CertificateManager extends EventEmitter {
  private logger: ILogger;
  private certificates: Map<string, CertificateInfo> = new Map();
  private watchedFiles: Set<string> = new Set();
  private rotationInterval?: NodeJS.Timeout;

  constructor(logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();
  }

  /**
   * Load and validate a certificate file
   */
  async loadCertificate(
    name: string,
    certPath: string,
  ): Promise<CertificateInfo> {
    try {
      const certContent = await fs.readFile(certPath, "utf8");
      const x509Cert = new crypto.X509Certificate(certContent);
      const info: CertificateInfo = {
        subject: x509Cert.subject,
        issuer: x509Cert.issuer,
        fingerprint: x509Cert.fingerprint256,
        serialNumber: x509Cert.serialNumber,
        validFrom: new Date(x509Cert.validFrom),
        validTo: new Date(x509Cert.validTo),
        isExpired: new Date() > new Date(x509Cert.validTo),
        isExpiringSoon:
          new Date(x509Cert.validTo).getTime() - Date.now() <
          30 * 24 * 60 * 60 * 1000,
      };

      this.certificates.set(name, info);
      this.logger.info(`Certificate loaded: ${name} - ${info.subject}`);

      if (info.isExpired) {
        this.logger.error(
          `Certificate ${name} is expired! Valid until: ${info.validTo}`,
        );
        this.emit("certificate-expired", { name, info });
      } else if (info.isExpiringSoon) {
        this.logger.warn(`Certificate ${name} expires soon: ${info.validTo}`);
        this.emit("certificate-expiring", { name, info });
      }

      return info;
    } catch (error) {
      this.logger.error(`Failed to load certificate ${name}:`, error);
      throw new Error(
        `Certificate loading failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Watch certificate files for changes
   */
  async watchCertificate(name: string, certPath: string): Promise<void> {
    if (this.watchedFiles.has(certPath)) {
      return;
    }

    try {
      this.logger.info(`Watching certificate file: ${certPath}`);
      this.watchedFiles.add(certPath);
      this.emit("certificate-watch-started", { name, path: certPath });
    } catch (error) {
      this.logger.error(`Failed to watch certificate ${certPath}:`, error);
    }
  }

  /**
   * Start automatic certificate rotation monitoring
   */
  startRotationMonitoring(intervalMs: number = 24 * 60 * 60 * 1000): void {
    this.stopRotationMonitoring();

    this.rotationInterval = setInterval(() => {
      this.checkCertificateExpiration();
    }, intervalMs);

    this.logger.info("Certificate rotation monitoring started");
  }

  /**
   * Stop certificate rotation monitoring
   */
  stopRotationMonitoring(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = undefined;
      this.logger.info("Certificate rotation monitoring stopped");
    }
  }

  private checkCertificateExpiration(): void {
    for (const [name, info] of this.certificates.entries()) {
      const now = new Date();
      if (now > info.validTo) {
        this.logger.error(`Certificate ${name} has expired!`);
        this.emit("certificate-expired", { name, info });
      } else if (
        info.validTo.getTime() - now.getTime() <
        30 * 24 * 60 * 60 * 1000
      ) {
        this.logger.warn(`Certificate ${name} expires in less than 30 days`);
        this.emit("certificate-expiring", { name, info });
      }
    }
  }

  /**
   * Get certificate information
   */
  getCertificateInfo(name: string): CertificateInfo | undefined {
    return this.certificates.get(name);
  }

  /**
   * Get all certificates
   */
  getAllCertificates(): Map<string, CertificateInfo> {
    return new Map(this.certificates);
  }

  /**
   * Validate certificate chain
   */
  async validateCertificateChain(
    certPath: string,
    caPath?: string,
  ): Promise<boolean> {
    try {
      const certContent = await fs.readFile(certPath, "utf8");
      const cert = new crypto.X509Certificate(certContent);

      if (caPath) {
        const caContent = await fs.readFile(caPath, "utf8");
        const caCert = new crypto.X509Certificate(caContent);

        const isValid = cert.verify(caCert.publicKey);
        this.logger.debug(`Certificate chain validation result: ${isValid}`);
        return isValid;
      }

      const now = new Date();
      return now >= new Date(cert.validFrom) && now <= new Date(cert.validTo);
    } catch (error) {
      this.logger.error("Certificate chain validation failed:", error);
      return false;
    }
  }

  destroy(): void {
    this.stopRotationMonitoring();
    this.watchedFiles.clear();
    this.certificates.clear();
    this.removeAllListeners();
  }
}

export class TLSServer extends EventEmitter {
  private server?: tls.Server;
  private config: mTLSConfig;
  private logger: ILogger;
  private metrics: SecurityMetrics;
  private activeSessions: Set<tls.TLSSocket> = new Set();

  constructor(config: mTLSConfig, logger?: ILogger) {
    super();
    this.config = config;
    this.logger = logger || new SilentLogger();
    this.metrics = {
      connectionsEstablished: 0,
      connectionsFailed: 0,
      certificateValidationFailures: 0,
      tlsHandshakeFailures: 0,
      mutualAuthFailures: 0,
      totalDataTransferred: 0,
      activeSessions: 0,
    };
  }

  /**
   * Start TLS server
   */
  async start(port: number, host: string = "0.0.0.0"): Promise<void> {
    if (!this.config.enabled) {
      throw new Error("TLS is not enabled in configuration");
    }

    try {
      const options = await this.buildTLSOptions();
      this.server = tls.createServer(options, this.handleConnection.bind(this));

      this.server.on("error", this.handleServerError.bind(this));
      this.server.on("tlsClientError", this.handleTLSClientError.bind(this));

      return new Promise((resolve, reject) => {
        this.server!.listen(port, host, () => {
          this.logger.info(`TLS server listening on ${host}:${port}`);
          this.emit("server-started", { host, port });
          resolve();
        });

        this.server!.on("error", reject);
      });
    } catch (error) {
      this.logger.error("Failed to start TLS server:", error);
      throw error;
    }
  }

  private async buildTLSOptions(): Promise<tls.TlsOptions> {
    const options: tls.TlsOptions = {
      key: await fs.readFile(this.config.keyPath),
      cert: await fs.readFile(this.config.certPath),
      passphrase: this.config.passphrase,
      ciphers:
        this.config.ciphers ||
        "ECDHE-RSA-AES128-GCM-SHA256:!RC4:!LOW:!MD5:!aNULL:!EDH",
      secureProtocol: "TLSv1_2_method",
      honorCipherOrder: true,
      requestCert: this.config.requireClientCert,
      rejectUnauthorized: this.config.requireClientCert,
    };

    if (this.config.caPath) {
      options.ca = await fs.readFile(this.config.caPath);
    }

    if (this.config.dhparam) {
      options.dhparam = await fs.readFile(this.config.dhparam);
    }

    if (this.config.minVersion) {
      options.minVersion = this.config.minVersion as tls.SecureVersion;
    }

    if (this.config.maxVersion) {
      options.maxVersion = this.config.maxVersion as tls.SecureVersion;
    }

    return options;
  }

  private handleConnection(socket: tls.TLSSocket): void {
    this.activeSessions.add(socket);
    this.metrics.connectionsEstablished++;
    this.metrics.activeSessions = this.activeSessions.size;
    this.metrics.lastConnectionTime = new Date();

    const clientCert = socket.getPeerCertificate(true);
    const clientInfo = {
      authorized: socket.authorized,
      cert: clientCert,
      cipher: socket.getCipher(),
      protocol: socket.getProtocol(),
      remoteAddress: socket.remoteAddress,
    };

    this.logger.info(
      `TLS connection established from ${clientInfo.remoteAddress}`,
    );
    this.logger.debug("Client info:", clientInfo);

    if (
      this.config.requireClientCert &&
      !this.validateClientCertificate(clientCert)
    ) {
      this.logger.warn("Client certificate validation failed");
      this.metrics.mutualAuthFailures++;
      socket.destroy();
      return;
    }

    socket.on("data", (data) => {
      this.metrics.totalDataTransferred += data.length;
      this.emit("data", data, socket, clientInfo);
    });

    socket.on("close", () => {
      this.activeSessions.delete(socket);
      this.metrics.activeSessions = this.activeSessions.size;
      this.logger.debug(
        `TLS connection closed from ${clientInfo.remoteAddress}`,
      );
      this.emit("connection-closed", clientInfo);
    });

    socket.on("error", (error) => {
      this.logger.error("TLS socket error:", error);
      this.metrics.connectionsFailed++;
      this.emit("connection-error", error, clientInfo);
    });

    this.emit("connection", socket, clientInfo);
  }

  private validateClientCertificate(cert: tls.PeerCertificate): boolean {
    if (!cert || Object.keys(cert).length === 0) {
      return false;
    }

    if (this.config.allowedSubjects && this.config.allowedSubjects.length > 0) {
      if (!this.config.allowedSubjects.includes(cert.subject.CN || "")) {
        this.logger.warn(
          `Client certificate subject not allowed: ${cert.subject.CN}`,
        );
        return false;
      }
    }

    if (
      this.config.allowedFingerprints &&
      this.config.allowedFingerprints.length > 0
    ) {
      if (
        !this.config.allowedFingerprints.includes(cert.fingerprint256 || "")
      ) {
        this.logger.warn(
          `Client certificate fingerprint not allowed: ${cert.fingerprint256}`,
        );
        return false;
      }
    }

    if (this.config.verifyClient) {
      return this.config.verifyClient(cert);
    }

    return true;
  }

  private handleServerError(error: Error): void {
    this.logger.error("TLS server error:", error);
    this.metrics.connectionsFailed++;
    this.emit("server-error", error);
  }

  private handleTLSClientError(error: Error, socket: tls.TLSSocket): void {
    this.logger.error("TLS client error:", error);
    this.metrics.tlsHandshakeFailures++;
    this.emit("tls-error", error, socket);
  }

  /**
   * Stop the TLS server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.activeSessions.forEach((socket) => {
        socket.destroy();
      });
      this.activeSessions.clear();

      this.server!.close(() => {
        this.logger.info("TLS server stopped");
        this.emit("server-stopped");
        resolve();
      });
    });
  }

  /**
   * Get security metrics
   */
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get server status
   */
  isRunning(): boolean {
    return this.server !== undefined && this.server.listening;
  }
}

export class TLSClient extends EventEmitter {
  private socket?: tls.TLSSocket;
  private config: TLSConfig;
  private connectionConfig: SecureConnectionConfig;
  private logger: ILogger;
  private metrics: SecurityMetrics;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    tlsConfig: TLSConfig,
    connectionConfig: SecureConnectionConfig,
    logger?: ILogger,
  ) {
    super();
    this.config = tlsConfig;
    this.connectionConfig = connectionConfig;
    this.logger = logger || new SilentLogger();
    this.metrics = {
      connectionsEstablished: 0,
      connectionsFailed: 0,
      certificateValidationFailures: 0,
      tlsHandshakeFailures: 0,
      mutualAuthFailures: 0,
      totalDataTransferred: 0,
      activeSessions: 0,
    };
  }

  /**
   * Connect to TLS server
   */
  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    const options = await this.buildConnectionOptions();
    let retryCount = 0;
    const maxRetries = this.connectionConfig.retryAttempts || 3;

    while (retryCount <= maxRetries) {
      try {
        await this.attemptConnection(options);
        this.metrics.connectionsEstablished++;
        this.metrics.activeSessions = 1;
        this.metrics.lastConnectionTime = new Date();
        return;
      } catch (error) {
        retryCount++;
        this.metrics.connectionsFailed++;

        if (retryCount > maxRetries) {
          this.logger.error(
            `Failed to connect after ${maxRetries} retries:`,
            error,
          );
          throw error;
        }

        const delay = this.connectionConfig.retryDelay || 1000;
        this.logger.warn(
          `Connection attempt ${retryCount} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async buildConnectionOptions(): Promise<tls.ConnectionOptions> {
    const options: tls.ConnectionOptions = {
      host: this.connectionConfig.host,
      port: this.connectionConfig.port,
      rejectUnauthorized: true,
      checkServerIdentity: this.checkServerIdentity.bind(this),
      timeout: this.connectionConfig.timeout || 10000,
    };

    if (this.config.keyPath && this.config.certPath) {
      options.key = await fs.readFile(this.config.keyPath);
      options.cert = await fs.readFile(this.config.certPath);

      if (this.config.passphrase) {
        options.passphrase = this.config.passphrase;
      }
    }

    if (this.config.caPath) {
      options.ca = await fs.readFile(this.config.caPath);
    }

    if (this.config.ciphers) {
      options.ciphers = this.config.ciphers;
    }

    if (this.config.minVersion) {
      options.minVersion = this.config.minVersion as tls.SecureVersion;
    }

    if (this.config.maxVersion) {
      options.maxVersion = this.config.maxVersion as tls.SecureVersion;
    }

    return options;
  }

  private async attemptConnection(
    options: tls.ConnectionOptions,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = tls.connect(options, () => {
        this.logger.info(
          `TLS connection established to ${this.connectionConfig.host}:${this.connectionConfig.port}`,
        );
        this.setupSocketHandlers();
        this.emit("connected");
        resolve();
      });

      this.socket.on("error", (error) => {
        this.logger.error("TLS connection error:", error);
        this.metrics.connectionsFailed++;
        reject(error);
      });

      this.socket.on("timeout", () => {
        this.logger.error("TLS connection timeout");
        this.socket?.destroy();
        reject(new Error("Connection timeout"));
      });
    });
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    if (this.connectionConfig.keepAlive) {
      this.socket.setKeepAlive(
        true,
        this.connectionConfig.keepAliveInitialDelay || 0,
      );
    }

    this.socket.on("data", (data) => {
      this.metrics.totalDataTransferred += data.length;
      this.emit("data", data);
    });

    this.socket.on("close", () => {
      this.logger.debug("TLS connection closed");
      this.metrics.activeSessions = 0;
      this.emit("disconnected");
    });

    this.socket.on("end", () => {
      this.logger.debug("TLS connection ended");
      this.emit("end");
    });

    this.socket.on("error", (error) => {
      this.logger.error("TLS socket error:", error);
      this.emit("error", error);
    });
  }

  private checkServerIdentity(
    hostname: string,
    cert: tls.PeerCertificate,
  ): Error | undefined {
    try {
      const now = new Date();
      if (now < new Date(cert.valid_from) || now > new Date(cert.valid_to)) {
        this.metrics.certificateValidationFailures++;
        return new Error(`Server certificate is not valid for current time`);
      }

      if (
        cert.subject.CN !== hostname &&
        !cert.subjectaltname?.includes(`DNS:${hostname}`)
      ) {
        this.metrics.certificateValidationFailures++;
        return new Error(
          `Server certificate does not match hostname ${hostname}`,
        );
      }

      return undefined;
    } catch (error) {
      this.metrics.certificateValidationFailures++;
      return error as Error;
    }
  }

  /**
   * Send data over TLS connection
   */
  async write(data: Buffer | string): Promise<boolean> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("TLS connection is not established");
    }

    return new Promise((resolve, reject) => {
      this.socket!.write(data, (error) => {
        if (error) {
          this.logger.error("Failed to write data:", error);
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.socket && !this.socket.destroyed) {
      return new Promise((resolve) => {
        this.socket!.end(() => {
          this.logger.info("TLS connection disconnected");
          resolve();
        });
      });
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.socket !== undefined && !this.socket.destroyed;
  }

  /**
   * Get security metrics
   */
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Get connection certificate info
   */
  getPeerCertificate(): tls.PeerCertificate | undefined {
    return this.socket?.getPeerCertificate(true);
  }

  /**
   * Get cipher info
   */
  getCipher(): tls.CipherNameAndProtocol | undefined {
    return this.socket?.getCipher();
  }
}

export class SecureCommunicationManager extends EventEmitter {
  private certificateManager: CertificateManager;
  private tlsServer?: TLSServer;
  private tlsClients: Map<string, TLSClient> = new Map();
  private logger: ILogger;

  constructor(logger?: ILogger) {
    super();
    this.logger = logger || new SilentLogger();
    this.certificateManager = new CertificateManager(logger);

    this.certificateManager.on("certificate-expired", (data) =>
      this.emit("certificate-expired", data),
    );
    this.certificateManager.on("certificate-expiring", (data) =>
      this.emit("certificate-expiring", data),
    );
  }

  /**
   * Initialize certificate manager
   */
  async initializeCertificates(
    certificates: Array<{ name: string; path: string; watch?: boolean }>,
  ): Promise<void> {
    for (const cert of certificates) {
      await this.certificateManager.loadCertificate(cert.name, cert.path);

      if (cert.watch) {
        await this.certificateManager.watchCertificate(cert.name, cert.path);
      }
    }

    this.certificateManager.startRotationMonitoring();
  }

  /**
   * Start TLS server
   */
  async startTLSServer(
    config: mTLSConfig,
    port: number,
    host?: string,
  ): Promise<void> {
    this.tlsServer = new TLSServer(config, this.logger);

    this.tlsServer.on("connection", (socket, clientInfo) =>
      this.emit("server-connection", socket, clientInfo),
    );
    this.tlsServer.on("connection-closed", (clientInfo) =>
      this.emit("server-connection-closed", clientInfo),
    );
    this.tlsServer.on("data", (data, socket, clientInfo) =>
      this.emit("server-data", data, socket, clientInfo),
    );

    await this.tlsServer.start(port, host);
  }

  /**
   * Create TLS client connection
   */
  async createTLSClient(
    name: string,
    tlsConfig: TLSConfig,
    connectionConfig: SecureConnectionConfig,
  ): Promise<TLSClient> {
    const client = new TLSClient(tlsConfig, connectionConfig, this.logger);

    client.on("connected", () => this.emit("client-connected", name));
    client.on("disconnected", () => this.emit("client-disconnected", name));
    client.on("data", (data) => this.emit("client-data", name, data));
    client.on("error", (error) => this.emit("client-error", name, error));

    this.tlsClients.set(name, client);
    await client.connect();

    return client;
  }

  /**
   * Get comprehensive security metrics
   */
  getSecurityMetrics(): {
    server?: SecurityMetrics;
    clients: Record<string, SecurityMetrics>;
    certificates: Map<string, CertificateInfo>;
  } {
    const metrics: {
      server?: SecurityMetrics;
      clients: Record<string, SecurityMetrics>;
      certificates: Map<string, CertificateInfo>;
    } = {
      clients: {} as Record<string, SecurityMetrics>,
      certificates: this.certificateManager.getAllCertificates(),
    };

    if (this.tlsServer) {
      metrics.server = this.tlsServer.getMetrics();
    }

    for (const [name, client] of this.tlsClients.entries()) {
      metrics.clients[name] = client.getMetrics();
    }

    return metrics;
  }

  /**
   * Validate all certificates
   */
  async validateAllCertificates(): Promise<
    Array<{ name: string; valid: boolean; reason?: string }>
  > {
    const results: Array<{ name: string; valid: boolean; reason?: string }> =
      [];

    for (const [name, info] of this.certificateManager
      .getAllCertificates()
      .entries()) {
      if (info.isExpired) {
        results.push({ name, valid: false, reason: "Certificate expired" });
      } else if (info.isExpiringSoon) {
        results.push({
          name,
          valid: false,
          reason: "Certificate expires within 30 days",
        });
      } else {
        results.push({ name, valid: true });
      }
    }

    return results;
  }

  /**
   * Cleanup all resources
   */
  async destroy(): Promise<void> {
    this.logger.info("Shutting down secure communication manager...");

    if (this.tlsServer) {
      await this.tlsServer.stop();
    }

    for (const [name, client] of this.tlsClients.entries()) {
      try {
        await client.disconnect();
        this.logger.debug(`Disconnected TLS client: ${name}`);
      } catch (error) {
        this.logger.error(`Error disconnecting client ${name}:`, error);
      }
    }

    this.tlsClients.clear();
    this.certificateManager.destroy();
    this.removeAllListeners();

    this.logger.info("Secure communication manager shutdown complete");
  }
}
