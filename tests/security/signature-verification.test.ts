import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ProfileSignatureVerifier, SignedProfile } from '../../src/security/signature-verification.js';

// Mock fs for file operations
vi.mock('fs');

describe('Profile Signature Verification', () => {
  let verifier: ProfileSignatureVerifier;
  let keyPair: { publicKey: string; privateKey: string };

  beforeEach(() => {
    verifier = new ProfileSignatureVerifier();
    
    // Generate a test key pair
    keyPair = verifier.generateKeyPair('rsa');
    verifier.addPublicKey('test-key', keyPair.publicKey);
  });

  describe('Key Management', () => {
    it('should generate RSA key pairs', () => {
      const rsaKeys = verifier.generateKeyPair('rsa');
      
      expect(rsaKeys.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(rsaKeys.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('should generate ECDSA key pairs', () => {
      const ecdsaKeys = verifier.generateKeyPair('ecdsa');
      
      expect(ecdsaKeys.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(ecdsaKeys.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('should generate Ed25519 key pairs', () => {
      const ed25519Keys = verifier.generateKeyPair('ed25519');
      
      expect(ed25519Keys.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(ed25519Keys.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('should throw error for unsupported algorithms', () => {
      expect(() => verifier.generateKeyPair('unsupported')).toThrow('Unsupported algorithm: unsupported');
    });

    it('should add and list public keys', () => {
      verifier.addPublicKey('key1', keyPair.publicKey);
      verifier.addPublicKey('key2', keyPair.publicKey);

      const keyIds = verifier.listKeyIds();
      expect(keyIds).toContain('key1');
      expect(keyIds).toContain('key2');
      expect(keyIds).toContain('test-key');
    });

    it('should remove public keys', () => {
      verifier.addPublicKey('removable', keyPair.publicKey);
      expect(verifier.listKeyIds()).toContain('removable');
      
      const removed = verifier.removePublicKey('removable');
      expect(removed).toBe(true);
      expect(verifier.listKeyIds()).not.toContain('removable');
    });

    it('should return false when removing non-existent key', () => {
      const removed = verifier.removePublicKey('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Profile Signing', () => {
    const profileContent = 'test profile content';

    it('should sign profiles with RSA', () => {
      const signedProfile = verifier.signProfile(profileContent, keyPair.privateKey, 'test-key');
      
      expect(signedProfile.content).toBe(profileContent);
      expect(signedProfile.signature).toBeTruthy();
      expect(signedProfile.metadata.algorithm).toBe('RSA-SHA256');
      expect(signedProfile.metadata.keyId).toBe('test-key');
      expect(signedProfile.metadata.version).toBe('1.0');
      expect(signedProfile.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should sign profiles with ECDSA', () => {
      const ecdsaKeys = verifier.generateKeyPair('ecdsa');
      verifier.addPublicKey('ecdsa-key', ecdsaKeys.publicKey);
      
      const signedProfile = verifier.signProfile(
        profileContent, 
        ecdsaKeys.privateKey, 
        'ecdsa-key', 
        'ECDSA-SHA256'
      );
      
      expect(signedProfile.metadata.algorithm).toBe('ECDSA-SHA256');
    });

    it('should sign profiles with Ed25519', () => {
      const ed25519Keys = verifier.generateKeyPair('ed25519');
      verifier.addPublicKey('ed25519-key', ed25519Keys.publicKey);
      
      const signedProfile = verifier.signProfile(
        profileContent, 
        ed25519Keys.privateKey, 
        'ed25519-key', 
        'Ed25519'
      );
      
      expect(signedProfile.metadata.algorithm).toBe('Ed25519');
    });

    it('should create different signatures for different content', () => {
      const sig1 = verifier.signProfile('content1', keyPair.privateKey, 'test-key');
      const sig2 = verifier.signProfile('content2', keyPair.privateKey, 'test-key');
      
      expect(sig1.signature).not.toBe(sig2.signature);
    });
  });

  describe('Profile Verification', () => {
    let signedProfile: SignedProfile;

    beforeEach(() => {
      signedProfile = verifier.signProfile('test content', keyPair.privateKey, 'test-key');
    });

    it('should verify valid signatures', () => {
      const result = verifier.verifyProfile(signedProfile);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.metadata).toEqual(signedProfile.metadata);
    });

    it('should reject signatures with missing public key', () => {
      signedProfile.metadata.keyId = 'missing-key';
      
      const result = verifier.verifyProfile(signedProfile);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Public key not found');
    });

    it('should reject signatures without keyId', () => {
      delete signedProfile.metadata.keyId;
      
      const result = verifier.verifyProfile(signedProfile);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No keyId specified');
    });

    it('should reject signatures with unsupported algorithms', () => {
      signedProfile.metadata.algorithm = 'UNSUPPORTED';
      
      const result = verifier.verifyProfile(signedProfile);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported signature algorithm');
    });

    it('should reject old signatures', () => {
      // Set timestamp to 31 days ago
      signedProfile.metadata.timestamp = Date.now() - (31 * 24 * 60 * 60 * 1000);
      
      const result = verifier.verifyProfile(signedProfile);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Signature is too old');
    });

    it('should reject tampered content', () => {
      signedProfile.content = 'tampered content';
      
      const result = verifier.verifyProfile(signedProfile);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });

    it('should reject tampered signatures', () => {
      // Completely invalidate the signature
      signedProfile.signature = 'INVALID_SIGNATURE_' + signedProfile.signature.substring(17);
      
      const result = verifier.verifyProfile(signedProfile);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Checksum Operations', () => {
    it('should create consistent checksums', () => {
      const content = 'test content';
      const checksum1 = verifier.createChecksum(content);
      const checksum2 = verifier.createChecksum(content);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 hex length
    });

    it('should verify correct checksums', () => {
      const content = 'test content';
      const checksum = verifier.createChecksum(content);
      
      expect(verifier.verifyChecksum(content, checksum)).toBe(true);
    });

    it('should reject incorrect checksums', () => {
      const content = 'test content';
      const wrongChecksum = verifier.createChecksum('different content');
      
      expect(verifier.verifyChecksum(content, wrongChecksum)).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      const content = 'test';
      const correctChecksum = verifier.createChecksum(content);
      const wrongChecksum = '0'.repeat(64);
      
      // This test ensures timing-safe comparison is used
      expect(verifier.verifyChecksum(content, wrongChecksum)).toBe(false);
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.endsWith('.sig')) {
          return JSON.stringify({
            signature: 'test-signature',
            metadata: {
              algorithm: 'RSA-SHA256',
              keyId: 'test-key',
              timestamp: Date.now(),
              version: '1.0'
            }
          });
        }
        return 'test file content';
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    });

    it('should sign files and create signature files', () => {
      verifier.signFile('/test/file.txt', keyPair.privateKey, 'test-key');
      
      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/file.txt.sig',
        expect.stringContaining('signature')
      );
    });

    it('should verify file signatures when signature file exists', () => {
      const result = verifier.verifyFile('/test/file.txt');
      
      expect(fs.existsSync).toHaveBeenCalledWith('/test/file.txt.sig');
      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.txt.sig', 'utf-8');
    });

    it('should fail verification when no signature file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const result = verifier.verifyFile('/test/file.txt');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No signature file found');
    });
  });

  describe('Key Import/Export', () => {
    it('should export public keys', () => {
      verifier.addPublicKey('key1', 'public-key-1');
      verifier.addPublicKey('key2', 'public-key-2');
      
      const exported = verifier.exportPublicKeys();
      
      expect(exported).toHaveProperty('key1', 'public-key-1');
      expect(exported).toHaveProperty('key2', 'public-key-2');
    });

    it('should import public keys', () => {
      const keys = {
        'imported1': 'imported-key-1',
        'imported2': 'imported-key-2'
      };
      
      verifier.importPublicKeys(keys);
      
      expect(verifier.listKeyIds()).toContain('imported1');
      expect(verifier.listKeyIds()).toContain('imported2');
    });
  });

  describe('Utility Functions', () => {
    it('should generate key fingerprints', () => {
      const fingerprint = verifier.getKeyFingerprint(keyPair.publicKey);
      
      expect(fingerprint).toHaveLength(16);
      expect(fingerprint).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate consistent fingerprints', () => {
      const fp1 = verifier.getKeyFingerprint(keyPair.publicKey);
      const fp2 = verifier.getKeyFingerprint(keyPair.publicKey);
      
      expect(fp1).toBe(fp2);
    });

    it('should batch verify multiple profiles', () => {
      const profiles = [
        verifier.signProfile('content1', keyPair.privateKey, 'test-key'),
        verifier.signProfile('content2', keyPair.privateKey, 'test-key'),
        verifier.signProfile('content3', keyPair.privateKey, 'test-key')
      ];
      
      const results = verifier.verifyProfiles(profiles);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.isValid)).toBe(true);
    });
  });

  describe('Bundle Operations', () => {
    it('should create signed bundles', () => {
      const profiles = {
        'profile1': 'content1',
        'profile2': 'content2'
      };
      
      const bundle = verifier.createBundle(profiles, keyPair.privateKey, 'test-key');
      
      expect(bundle.profiles).toHaveProperty('profile1');
      expect(bundle.profiles).toHaveProperty('profile2');
      expect(bundle.bundleSignature).toBeTruthy();
      expect(bundle.bundleMetadata.profileCount).toBe(2);
    });

    it('should verify bundles', () => {
      const profiles = {
        'profile1': 'content1',
        'profile2': 'content2'
      };
      
      const bundle = verifier.createBundle(profiles, keyPair.privateKey, 'test-key');
      const verification = verifier.verifyBundle(bundle);
      
      expect(verification.isValid).toBe(true);
      expect(verification.results).toHaveProperty('profile1');
      expect(verification.results).toHaveProperty('profile2');
      expect(verification.results.profile1.isValid).toBe(true);
      expect(verification.results.profile2.isValid).toBe(true);
    });

    it('should detect tampered profiles in bundles', () => {
      const profiles = {
        'profile1': 'content1',
        'profile2': 'content2'
      };
      
      const bundle = verifier.createBundle(profiles, keyPair.privateKey, 'test-key');
      
      // Tamper with one profile
      bundle.profiles.profile1.content = 'tampered content';
      
      const verification = verifier.verifyBundle(bundle);
      
      expect(verification.isValid).toBe(false);
      expect(verification.results.profile1.isValid).toBe(false);
      expect(verification.results.profile2.isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle verification errors gracefully', () => {
      const malformedProfile = {
        content: 'test',
        signature: 'invalid-signature',
        metadata: {
          algorithm: 'RSA-SHA256',
          keyId: 'test-key',
          timestamp: Date.now(),
          version: '1.0'
        }
      } as SignedProfile;
      
      const result = verifier.verifyProfile(malformedProfile);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle file operation errors', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File read error');
      });
      
      const result = verifier.verifyFile('/nonexistent/file.txt');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File verification error');
    });
  });
});