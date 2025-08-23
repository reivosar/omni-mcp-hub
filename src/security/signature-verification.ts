import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface SignatureMetadata {
  algorithm: string;
  keyId?: string;
  timestamp: number;
  version: string;
}

export interface SignedProfile {
  content: string;
  signature: string;
  metadata: SignatureMetadata;
}

export interface VerificationResult {
  isValid: boolean;
  error?: string;
  metadata?: SignatureMetadata;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export class ProfileSignatureVerifier {
  private publicKeys: Map<string, string> = new Map();
  private algorithms = ['RSA-SHA256', 'ECDSA-SHA256', 'Ed25519'];
  private currentAlgorithm = 'RSA-SHA256';

  constructor() {
    this.loadPublicKeys();
  }

  /**
   * Generate a new key pair for signing profiles
   */
  public generateKeyPair(algorithm: string = 'rsa'): KeyPair {
    let keyPair: crypto.KeyPairSyncResult<string, string>;

    switch (algorithm.toLowerCase()) {
      case 'rsa':
        keyPair = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        });
        break;
      case 'ecdsa':
        keyPair = crypto.generateKeyPairSync('ec', {
          namedCurve: 'P-256',
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        });
        break;
      case 'ed25519':
        keyPair = crypto.generateKeyPairSync('ed25519', {
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        });
        break;
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey
    };
  }

  /**
   * Add a public key for verification
   */
  public addPublicKey(keyId: string, publicKeyPem: string): void {
    this.publicKeys.set(keyId, publicKeyPem);
  }

  /**
   * Remove a public key
   */
  public removePublicKey(keyId: string): boolean {
    return this.publicKeys.delete(keyId);
  }

  /**
   * List all registered public key IDs
   */
  public listKeyIds(): string[] {
    return Array.from(this.publicKeys.keys());
  }

  /**
   * Sign a profile with a private key
   */
  public signProfile(
    profileContent: string, 
    privateKeyPem: string, 
    keyId?: string, 
    algorithm: string = this.currentAlgorithm
  ): SignedProfile {
    const metadata: SignatureMetadata = {
      algorithm,
      keyId,
      timestamp: Date.now(),
      version: '1.0'
    };

    const dataToSign = this.createSignaturePayload(profileContent, metadata);
    const signature = this.createSignature(dataToSign, privateKeyPem, algorithm);

    return {
      content: profileContent,
      signature,
      metadata
    };
  }

  /**
   * Verify a signed profile
   */
  public verifyProfile(signedProfile: SignedProfile): VerificationResult {
    try {
      const { content, signature, metadata } = signedProfile;

      // Check if we have the public key
      let publicKey: string;
      if (metadata.keyId) {
        const key = this.publicKeys.get(metadata.keyId);
        if (!key) {
          return {
            isValid: false,
            error: `Public key not found for keyId: ${metadata.keyId}`
          };
        }
        publicKey = key;
      } else {
        return {
          isValid: false,
          error: 'No keyId specified in signature metadata'
        };
      }

      // Check algorithm support
      if (!this.algorithms.includes(metadata.algorithm)) {
        return {
          isValid: false,
          error: `Unsupported signature algorithm: ${metadata.algorithm}`
        };
      }

      // Check timestamp (prevent replay attacks with old signatures)
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      if (Date.now() - metadata.timestamp > maxAge) {
        return {
          isValid: false,
          error: 'Signature is too old'
        };
      }

      // Verify signature
      const dataToVerify = this.createSignaturePayload(content, metadata);
      const isValid = this.verifySignature(dataToVerify, signature, publicKey, metadata.algorithm);

      return {
        isValid,
        metadata,
        error: isValid ? undefined : 'Invalid signature'
      };

    } catch (_error) {
      return {
        isValid: false,
        error: `Verification error: ${_error instanceof Error ? _error.message : String(_error)}`
      };
    }
  }

  /**
   * Create a checksum for a profile (alternative to signatures for integrity)
   */
  public createChecksum(profileContent: string): string {
    return crypto.createHash('sha256').update(profileContent).digest('hex');
  }

  /**
   * Verify a profile checksum
   */
  public verifyChecksum(profileContent: string, expectedChecksum: string): boolean {
    const actualChecksum = this.createChecksum(profileContent);
    return crypto.timingSafeEqual(
      Buffer.from(actualChecksum, 'hex'),
      Buffer.from(expectedChecksum, 'hex')
    );
  }

  /**
   * Sign a file and save the signature alongside it
   */
  public signFile(filePath: string, privateKeyPem: string, keyId?: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const signedProfile = this.signProfile(content, privateKeyPem, keyId);
    
    const signatureFile = `${filePath}.sig`;
    const signatureData = {
      signature: signedProfile.signature,
      metadata: signedProfile.metadata
    };
    
    fs.writeFileSync(signatureFile, JSON.stringify(signatureData, null, 2));
  }

  /**
   * Verify a file signature
   */
  public verifyFile(filePath: string): VerificationResult {
    const signatureFile = `${filePath}.sig`;
    
    if (!fs.existsSync(signatureFile)) {
      return {
        isValid: false,
        error: 'No signature file found'
      };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const signatureData = JSON.parse(fs.readFileSync(signatureFile, 'utf-8'));
      
      const signedProfile: SignedProfile = {
        content,
        signature: signatureData.signature,
        metadata: signatureData.metadata
      };

      return this.verifyProfile(signedProfile);
    } catch (error) {
      return {
        isValid: false,
        error: `File verification error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Load public keys from a directory or configuration
   */
  private loadPublicKeys(): void {
    const keysDir = path.join(process.cwd(), 'keys');
    
    if (!fs.existsSync(keysDir)) {
      return;
    }

    try {
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.pub'));
      
      for (const keyFile of keyFiles) {
        const keyId = path.basename(keyFile, '.pub');
        const publicKeyPath = path.join(keysDir, keyFile);
        const publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
        
        this.publicKeys.set(keyId, publicKey);
      }
    } catch (_error) {
      // Ignore errors during key loading - keys can be added manually
    }
  }

  /**
   * Create the payload that will be signed
   */
  private createSignaturePayload(content: string, metadata: SignatureMetadata): string {
    const payload = {
      content: crypto.createHash('sha256').update(content).digest('hex'),
      algorithm: metadata.algorithm,
      keyId: metadata.keyId,
      timestamp: metadata.timestamp,
      version: metadata.version
    };
    
    return JSON.stringify(payload, Object.keys(payload).sort());
  }

  /**
   * Create a signature using the specified algorithm
   */
  private createSignature(data: string, privateKeyPem: string, algorithm: string): string {
    // Ed25519 requires special handling
    if (algorithm === 'Ed25519') {
      const keyObject = crypto.createPrivateKey(privateKeyPem);
      const signature = crypto.sign(null, Buffer.from(data), keyObject);
      return signature.toString('base64');
    }
    
    let signAlgorithm: string;
    
    switch (algorithm) {
      case 'RSA-SHA256':
        signAlgorithm = 'RSA-SHA256';
        break;
      case 'ECDSA-SHA256':
        signAlgorithm = 'sha256';
        break;
      default:
        throw new Error(`Unsupported signature algorithm: ${algorithm}`);
    }

    const sign = crypto.createSign(signAlgorithm);
    sign.update(data);
    sign.end();
    
    return sign.sign(privateKeyPem, 'base64');
  }

  /**
   * Verify a signature using the specified algorithm
   */
  private verifySignature(data: string, signature: string, publicKeyPem: string, algorithm: string): boolean {
    // Ed25519 requires special handling
    if (algorithm === 'Ed25519') {
      const keyObject = crypto.createPublicKey(publicKeyPem);
      return crypto.verify(null, Buffer.from(data), keyObject, Buffer.from(signature, 'base64'));
    }
    
    let verifyAlgorithm: string;
    
    switch (algorithm) {
      case 'RSA-SHA256':
        verifyAlgorithm = 'RSA-SHA256';
        break;
      case 'ECDSA-SHA256':
        verifyAlgorithm = 'sha256';
        break;
      default:
        throw new Error(`Unsupported signature algorithm: ${algorithm}`);
    }

    const verify = crypto.createVerify(verifyAlgorithm);
    verify.update(data);
    verify.end();
    
    return verify.verify(publicKeyPem, signature, 'base64');
  }

  /**
   * Export public keys for backup or sharing
   */
  public exportPublicKeys(): Record<string, string> {
    return Object.fromEntries(this.publicKeys);
  }

  /**
   * Import public keys from backup
   */
  public importPublicKeys(keys: Record<string, string>): void {
    for (const [keyId, publicKey] of Object.entries(keys)) {
      this.addPublicKey(keyId, publicKey);
    }
  }

  /**
   * Generate a key fingerprint for identification
   */
  public getKeyFingerprint(publicKeyPem: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(publicKeyPem);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Batch verify multiple profiles
   */
  public verifyProfiles(signedProfiles: SignedProfile[]): VerificationResult[] {
    return signedProfiles.map(profile => this.verifyProfile(profile));
  }

  /**
   * Create a tamper-evident profile bundle
   */
  public createBundle(profiles: { [name: string]: string }, privateKeyPem: string, keyId?: string): { profiles: { [name: string]: SignedProfile }; bundleSignature: SignedProfile; bundleMetadata: { created: number; profileCount: number; version: string } } {
    const bundle = {
      profiles: {} as { [name: string]: SignedProfile },
      bundleSignature: {} as SignedProfile,
      bundleMetadata: {
        created: Date.now(),
        profileCount: Object.keys(profiles).length,
        version: '1.0'
      }
    };

    // Sign each profile
    for (const [name, content] of Object.entries(profiles)) {
      bundle.profiles[name] = this.signProfile(content, privateKeyPem, keyId);
    }

    // Sign the entire bundle
    const bundleContent = JSON.stringify(bundle.profiles, Object.keys(bundle.profiles).sort());
    const bundleSignature = this.signProfile(bundleContent, privateKeyPem, keyId);
    bundle.bundleSignature = bundleSignature;

    return bundle;
  }

  /**
   * Verify a profile bundle
   */
  public verifyBundle(bundle: { profiles: { [name: string]: SignedProfile }; bundleSignature?: SignedProfile }): { isValid: boolean; results: { [name: string]: VerificationResult }; bundleSignatureValid?: boolean } {
    const results: { [name: string]: VerificationResult } = {};
    let bundleValid = true;
    let bundleSignatureValid: boolean | undefined;

    // Verify each profile in the bundle
    for (const [name, signedProfile] of Object.entries(bundle.profiles) as [string, SignedProfile][]) {
      results[name] = this.verifyProfile(signedProfile);
      if (!results[name].isValid) {
        bundleValid = false;
      }
    }

    // Verify bundle signature if present
    if (bundle.bundleSignature) {
      try {
        // Reconstruct the bundle content that was signed
        const bundleContent = JSON.stringify(bundle.profiles, Object.keys(bundle.profiles).sort());
        
        // Verify that the bundleSignature content matches the reconstructed content
        if (bundle.bundleSignature.content === bundleContent) {
          const bundleVerificationResult = this.verifyProfile(bundle.bundleSignature);
          bundleSignatureValid = bundleVerificationResult.isValid;
        } else {
          bundleSignatureValid = false;
        }
        
        if (!bundleSignatureValid) {
          bundleValid = false;
        }
      } catch (_error) {
        bundleSignatureValid = false;
        bundleValid = false;
      }
    }

    return {
      isValid: bundleValid,
      results,
      bundleSignatureValid
    };
  }
}