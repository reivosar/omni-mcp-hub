import * as path from "path";
import * as fs from "fs";

/**
 * Security utilities for safe path operations
 * Prevents path traversal attacks and unauthorized filesystem access
 */

export interface PathSecurityOptions {
  allowedRoots?: string[];
  maxDepth?: number;
  followSymlinks?: boolean;
  allowAbsolutePaths?: boolean;
}

const DEFAULT_OPTIONS: Required<PathSecurityOptions> = {
  allowedRoots: [process.cwd(), "/tmp", "/var/folders", "/private/var/folders"], // Include common temp directories
  maxDepth: 20,
  followSymlinks: false,
  allowAbsolutePaths: false,
};

/**
 * Safely join paths preventing directory traversal attacks
 * Equivalent to path.join() but with security checks
 */
export function safeJoin(basePath: string, ...segments: string[]): string {
  // Normalize base path
  const normalizedBase = path.resolve(basePath);

  // Join all segments
  const joinedPath = path.join(basePath, ...segments);

  // Resolve the final path
  const resolvedPath = path.resolve(joinedPath);

  // Security check: ensure the resolved path is within the base path
  if (
    !resolvedPath.startsWith(normalizedBase + path.sep) &&
    resolvedPath !== normalizedBase
  ) {
    throw new Error(
      `Path traversal attempt detected: ${joinedPath} resolves outside of ${basePath}`,
    );
  }

  return resolvedPath;
}

/**
 * Safely resolve a path with security constraints
 */
export function safeResolve(
  inputPath: string,
  options?: PathSecurityOptions,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const providedRoots =
    options?.allowedRoots && options.allowedRoots.length > 0
      ? options.allowedRoots
      : undefined;
  const allowedRoots = providedRoots ?? DEFAULT_OPTIONS.allowedRoots;

  // Determine base:
  // - Prefer a root that equals current CWD (handling macOS alias and Windows case-insensitivity)
  // - Otherwise use the first provided root, or CWD if none provided
  const cwd = process.cwd();
  const normalizeWin = (p: string) => p.replace(/\\/g, "\\").toLowerCase();
  const isWinPath = (p: string) =>
    /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");
  const canon = (p: string) =>
    p.replace(/^\/private\/var\/folders/, "/var/folders");

  let base: string;
  // Prefer exact CWD match first
  const exactMatch = allowedRoots.find((r) => r === cwd);
  const match = exactMatch
    ? exactMatch
    : allowedRoots.find((r) => {
        if (isWinPath(r) || isWinPath(cwd)) {
          return normalizeWin(r) === normalizeWin(cwd);
        }
        return canon(path.resolve(r)) === canon(path.resolve(cwd));
      });

  const isExplicitRelative = normalizedInputStartsExplicit(inputPath);
  base = isExplicitRelative
    ? cwd
    : match
      ? match
      : providedRoots
        ? allowedRoots[0]
        : cwd;

  function normalizedInputStartsExplicit(p: string) {
    const np = p.replace(/\\/g, "/");
    return (
      np.startsWith("./") || np.startsWith("../") || np === "." || np === ".."
    );
  }

  // Absolute path detection should be cross-platform
  const isAbsolute =
    path.isAbsolute(inputPath) ||
    (isWinPath(inputPath) && path.win32.isAbsolute(inputPath));

  // Resolve the input path - allow relative traversals but validate final bounds
  let resolvedPath: string;
  if (isAbsolute) {
    if (!opts.allowAbsolutePaths) {
      throw new Error(`Absolute paths are not allowed: ${inputPath}`);
    }
    resolvedPath = isWinPath(inputPath)
      ? path.win32.resolve(inputPath)
      : path.resolve(inputPath);
  } else {
    // Resolve from selected base (supports Windows-style bases in POSIX envs)
    resolvedPath = isWinPath(base)
      ? path.win32.resolve(base, inputPath)
      : path.resolve(base, inputPath);
  }

  // Check for dangerous patterns (but NOT ../../ - that's allowed!)
  if (containsDangerousPatterns(inputPath)) {
    throw new Error(`Path contains dangerous patterns: ${inputPath}`);
  }

  // CRITICAL BOUNDARY CHECK: Ensure resolved path is within allowed roots
  const isWithinBounds = allowedRoots.some((root) => {
    if (isWinPath(resolvedPath) || isWinPath(root)) {
      const r = normalizeWin(resolvedPath);
      const a = normalizeWin(root);
      return r === a || r.startsWith(a.endsWith("\\") ? a : a + "\\");
    } else {
      const normalizedAllowedRoot = path.resolve(root);
      const canonicalResolvedPath = canon(resolvedPath);
      const canonicalAllowedRoot = canon(normalizedAllowedRoot);
      return (
        canonicalResolvedPath === canonicalAllowedRoot ||
        canonicalResolvedPath.startsWith(canonicalAllowedRoot + path.sep)
      );
    }
  });

  if (!isWithinBounds) {
    throw new Error(
      `Path resolves outside allowed boundaries: ${inputPath} → ${resolvedPath}`,
    );
  }

  // Check path depth based on input segments (include file)
  const normalizedInput = inputPath.replace(/\\/g, "/");
  const inputSegments = normalizedInput
    .split("/")
    .filter((segment) => segment && segment !== ".");
  if (inputSegments.filter((s) => !s.startsWith("..")).length > opts.maxDepth) {
    throw new Error(
      `Path depth exceeds maximum allowed (${opts.maxDepth}): ${inputPath}`,
    );
  }

  return resolvedPath;
}

/**
 * Check if a path contains dangerous patterns
 */
export function containsDangerousPatterns(inputPath: string): boolean {
  const dangerousPatterns = [
    /^(?:\\\\|\/\/)/, // UNC paths
    /%(2f|5c)/i, // Percent-encoded slashes
    /~[/\\]/, // Home directory access
    /[<>:"|?*]/, // Invalid filename characters
    /\0/, // Null byte
    /\s+$/, // Trailing whitespace
  ];

  // Check for dangerous patterns first
  if (dangerousPatterns.some((pattern) => pattern.test(inputPath))) {
    return true;
  }

  // Check for specific dangerous system paths
  const dangerousSystemPaths = [
    /^\/etc\/(passwd|shadow|sudoers)/,
    /^\/sys\//,
    /^\/proc\//,
    /^\/dev\//,
    /^\/boot\//,
    /^\\windows\\system32/i,
    /^[A-Z]:\\Windows\\System32\\/i,
    /^[A-Z]:\\Program Files\\/i,
  ];

  return dangerousSystemPaths.some((pattern) => pattern.test(inputPath));
}

/**
 * Sanitize a filename/path segment
 */
export function sanitizePathSegment(segment: string): string {
  // Remove dangerous characters and patterns
  return segment
    .replace(/[<>:"|?*\0]/g, "") // Remove invalid characters
    .replace(/^\.+/, "") // Remove leading dots
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[/\\]/g, "_") // Replace path separators
    .substring(0, 255); // Limit length
}

/**
 * Validate that a path exists and is accessible
 */
export async function validatePathExists(
  inputPath: string,
  options?: PathSecurityOptions,
): Promise<boolean> {
  try {
    const safePath = safeResolve(inputPath, options);

    // Check if the path exists
    const stats = await fs.promises.stat(safePath);

    // If symlinks are not allowed, ensure this is not a symlink
    if (!options?.followSymlinks && stats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed: ${inputPath}`);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get safe path information
 */
export interface SafePathInfo {
  originalPath: string;
  resolvedPath: string;
  isAbsolute: boolean;
  isWithinRoot: boolean;
  depth: number;
  segments: string[];
  hasDangerousPatterns: boolean;
}

export function getPathInfo(
  inputPath: string,
  options?: PathSecurityOptions,
): SafePathInfo {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const resolvedPath = safeResolve(inputPath, options);

    // Calculate path segments from the input path (not relative to root)
    const inputSegments = inputPath
      .split(/[/\\]/)
      .filter(
        (segment) => segment && segment !== "." && !segment.startsWith(".."),
      );

    // Check if the resolved path is within allowed roots
    const isWithinRoot = opts.allowedRoots.some((root) => {
      const normalizedRoot = path.resolve(root);
      // Handle macOS path aliasing: /var/folders and /private/var/folders are the same
      const canonicalResolvedPath = resolvedPath.replace(
        /^\/private\/var\/folders/,
        "/var/folders",
      );
      const canonicalRoot = normalizedRoot.replace(
        /^\/private\/var\/folders/,
        "/var/folders",
      );

      return (
        canonicalResolvedPath.startsWith(canonicalRoot + path.sep) ||
        canonicalResolvedPath === canonicalRoot ||
        resolvedPath.startsWith(normalizedRoot + path.sep) ||
        resolvedPath === normalizedRoot
      );
    });

    return {
      originalPath: inputPath,
      resolvedPath,
      isAbsolute: path.isAbsolute(inputPath),
      isWithinRoot,
      depth: inputSegments.length,
      segments: inputSegments,
      hasDangerousPatterns: containsDangerousPatterns(inputPath),
    };
  } catch {
    return {
      originalPath: inputPath,
      resolvedPath: "",
      isAbsolute: path.isAbsolute(inputPath),
      isWithinRoot: false,
      depth: -1,
      segments: [],
      hasDangerousPatterns: containsDangerousPatterns(inputPath),
    };
  }
}

/**
 * Create a path validator for a specific context
 */
export class PathValidator {
  private options: Required<PathSecurityOptions>;

  constructor(options?: PathSecurityOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Validate and resolve a path safely
   */
  validatePath(inputPath: string): string {
    return safeResolve(inputPath, this.options);
  }

  /**
   * Join paths safely
   */
  joinPaths(basePath: string, ...segments: string[]): string {
    const safePath = safeJoin(basePath, ...segments);
    return safeResolve(safePath, {
      ...this.options,
      allowAbsolutePaths: true,
    });
  }

  /**
   * Check if a path is safe
   */
  isPathSafe(inputPath: string): boolean {
    try {
      this.validatePath(inputPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get sanitized version of a path
   */
  sanitizePath(inputPath: string): string {
    const segments = inputPath
      .split(/[/\\]/)
      .map(sanitizePathSegment)
      .filter((s) => s);
    return segments.join("_");
  }
}

// Default validator instance
export const defaultPathValidator = new PathValidator();
