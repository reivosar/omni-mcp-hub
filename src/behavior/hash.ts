/**
 * Hash computation utilities for profile idempotency
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProfileTarget } from './state.js';

/**
 * Compute SHA-256 hash of profile content for idempotency
 */
export async function computeProfileHash(target: ProfileTarget): Promise<string> {
  const hasher = crypto.createHash('sha256');
  
  try {
    // Hash main source file
    const sourceContent = await fs.readFile(target.source, 'utf-8');
    hasher.update(`source:${target.source}`);
    hasher.update(sourceContent);

    // Hash included files if any
    if (target.includes && target.includes.length > 0) {
      const sortedIncludes = [...target.includes].sort(); // Deterministic order
      
      for (const includePath of sortedIncludes) {
        try {
          const resolvedPath = path.resolve(path.dirname(target.source), includePath);
          const includeContent = await fs.readFile(resolvedPath, 'utf-8');
          hasher.update(`include:${includePath}`);
          hasher.update(includeContent);
        } catch (_error) {
          // Include file not found - include path in hash but not content
          hasher.update(`include:${includePath}:missing`);
        }
      }
    }

    // Hash options if any
    if (target.options) {
      const optionsStr = JSON.stringify(target.options, Object.keys(target.options).sort());
      hasher.update(`options:${optionsStr}`);
    }

    return hasher.digest('hex');
  } catch (error) {
    throw new Error(`Failed to compute profile hash: ${error}`);
  }
}

/**
 * Compute hash of string content
 */
export function computeStringHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute hash of multiple file paths
 */
export async function computeFilesHash(filePaths: string[]): Promise<string> {
  const hasher = crypto.createHash('sha256');
  const sortedPaths = [...filePaths].sort(); // Deterministic order
  
  for (const filePath of sortedPaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      hasher.update(`file:${filePath}`);
      hasher.update(content);
    } catch (_error) {
      // File not found - include path in hash
      hasher.update(`file:${filePath}:missing`);
    }
  }
  
  return hasher.digest('hex');
}

/**
 * Verify hash matches current content
 */
export async function verifyProfileHash(target: ProfileTarget, expectedHash: string): Promise<boolean> {
  try {
    const currentHash = await computeProfileHash(target);
    return currentHash === expectedHash;
  } catch {
    return false;
  }
}