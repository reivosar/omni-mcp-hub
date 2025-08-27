#!/usr/bin/env node

/**
 * CLI for secrets scanning
 * Usage: npx secrets-scan [options] [path]
 */

import { Command } from "commander";
import * as path from "path";
import * as fs from "fs/promises";
import { execSync } from "child_process";
import {
  SecretsScanner,
  type ScanResult,
  type SecretFinding,
} from "../security/secrets-scanner.js";

interface CLIOptions {
  output?: string;
  format?: "json" | "markdown" | "html";
  includeTests?: boolean;
  exclude?: string[];
  severity?: string;
  quiet?: boolean;
  failOn?: string;
  preCommit?: boolean;
}

async function main() {
  const program = new Command();
  program
    .name("secrets-scan")
    .description(
      "Scan files and directories for hardcoded secrets and credentials",
    )
    .version("1.0.0")
    .argument("[path]", "Path to scan (file or directory)", process.cwd())
    .option("-o, --output <file>", "Output report to file")
    .option(
      "-f, --format <format>",
      "Report format (json, markdown, html)",
      "json",
    )
    .option("--include-tests", "Include test files in scan", false)
    .option("--exclude <paths...>", "Additional paths to exclude")
    .option(
      "--severity <level>",
      "Minimum severity to report (critical, high, medium, low)",
      "low",
    )
    .option("-q, --quiet", "Suppress console output", false)
    .option(
      "--fail-on <level>",
      "Exit with error if secrets of this severity or higher are found",
    )
    .option(
      "--pre-commit",
      "Run in pre-commit mode (scans staged files)",
      false,
    )
    .parse(process.argv);

  const scanPath = program.args[0] || process.cwd();
  const options: CLIOptions = program.opts();

  try {
    const scanner = new SecretsScanner({
      includeTests: options.includeTests,
      excludePaths: options.exclude || [],
      blockOnDetection: !!options.failOn,
      enableContextAnalysis: true,
    });

    let result;

    if (options.preCommit) {
      const stagedFiles = await getStagedFiles();
      if (stagedFiles.length === 0) {
        if (!options.quiet) {
          console.log("No staged files to scan");
        }
        return;
      }

      if (!options.quiet) {
        console.log(`Scanning ${stagedFiles.length} staged files...`);
      }

      result = await scanner.preCommitScan(stagedFiles);
    } else {
      const stats = await fs.stat(scanPath);

      if (stats.isFile()) {
        if (!options.quiet) {
          console.log(`Scanning file: ${scanPath}`);
        }
        const findings = await scanner.scanFile(scanPath);
        result = {
          findings,
          filesScanned: 1,
          timeElapsed: 0,
          blocked: false,
        };
      } else {
        if (!options.quiet) {
          console.log(`Scanning directory: ${scanPath}`);
        }
        result = await scanner.scanDirectory(scanPath);
      }
    }

    if (options.severity && options.severity !== "low") {
      const severityLevels = ["low", "medium", "high", "critical"];
      const minLevel = severityLevels.indexOf(options.severity);

      result.findings = result.findings.filter((finding) => {
        const level = severityLevels.indexOf(finding.severity);
        return level >= minLevel;
      });
    }

    const report = scanner.generateReport(result.findings, options.format);

    if (options.output) {
      await fs.writeFile(options.output, report, "utf-8");
      if (!options.quiet) {
        console.log(`Report saved to: ${options.output}`);
      }
    } else if (!options.quiet) {
      if (options.format === "json") {
        console.log(report);
      } else {
        displayConsoleSummary(result);
      }
    }

    if (!options.quiet && !options.output) {
      displayConsoleSummary(result);
    }

    if (options.failOn && result.findings.length > 0) {
      const severityLevels = ["low", "medium", "high", "critical"];
      const failLevel = severityLevels.indexOf(options.failOn);

      const hasFailures = result.findings.some((finding) => {
        const level = severityLevels.indexOf(finding.severity);
        return level >= failLevel;
      });

      if (hasFailures) {
        console.error(
          `\nFound secrets with severity ${options.failOn} or higher`,
        );
        process.exit(1);
      }
    }

    if (result.blocked) {
      console.error("\nCritical secrets detected - operation blocked");
      process.exit(1);
    }

    if (!options.quiet) {
      if (result.findings.length === 0) {
        console.log("\nNo secrets detected");
      } else {
        console.log(`\nFound ${result.findings.length} potential secrets`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

function displayConsoleSummary(result: ScanResult) {
  console.log("\n=== Scan Summary ===");
  console.log(`Files scanned: ${result.filesScanned}`);
  console.log(`Time elapsed: ${result.timeElapsed}ms`);
  console.log(`Total findings: ${result.findings.length}`);

  if (result.findings.length > 0) {
    const grouped = groupBySeverity(result.findings);

    console.log("\n=== Findings by Severity ===");

    if (grouped.critical?.length > 0) {
      console.log(`CRITICAL: ${grouped.critical.length}`);
      grouped.critical.slice(0, 3).forEach((f) => {
        console.log(`  - ${f.type} in ${formatPath(f.file)}:${f.line}`);
      });
      if (grouped.critical.length > 3) {
        console.log(`  ... and ${grouped.critical.length - 3} more`);
      }
    }

    if (grouped.high?.length > 0) {
      console.log(`HIGH: ${grouped.high.length}`);
      grouped.high.slice(0, 3).forEach((f) => {
        console.log(`  - ${f.type} in ${formatPath(f.file)}:${f.line}`);
      });
      if (grouped.high.length > 3) {
        console.log(`  ... and ${grouped.high.length - 3} more`);
      }
    }

    if (grouped.medium?.length > 0) {
      console.log(`MEDIUM: ${grouped.medium.length}`);
      grouped.medium.slice(0, 2).forEach((f) => {
        console.log(`  - ${f.type} in ${formatPath(f.file)}:${f.line}`);
      });
      if (grouped.medium.length > 2) {
        console.log(`  ... and ${grouped.medium.length - 2} more`);
      }
    }

    if (grouped.low?.length > 0) {
      console.log(`LOW: ${grouped.low.length}`);
    }
  }
}

function groupBySeverity(
  findings: SecretFinding[],
): Record<string, SecretFinding[]> {
  return findings.reduce<Record<string, SecretFinding[]>>((acc, finding) => {
    if (!acc[finding.severity]) {
      acc[finding.severity] = [];
    }
    acc[finding.severity].push(finding);
    return acc;
  }, {});
}

function formatPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  return relative.length < filePath.length ? relative : filePath;
}

async function getStagedFiles(): Promise<string[]> {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    });

    return output
      .split("\n")
      .filter((file) => file.length > 0)
      .map((file) => path.resolve(process.cwd(), file));
  } catch (_error) {
    console.error("Error getting staged files. Are you in a git repository?");
    return [];
  }
}

export async function run(args: string[]): Promise<void> {
  const originalArgv = process.argv;
  const originalExit = process.exit;

  try {
    process.exit = ((code?: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as typeof process.exit;

    process.argv = ["node", "secrets-scan-cli", ...args];
    await main();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("process.exit called with code")
    ) {
      return;
    }
    throw error;
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
