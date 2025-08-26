#!/usr/bin/env node

/**
 * Configuration Doctor CLI - Diagnose configuration issues
 */

import { program } from "commander";
import { runConfigDoctor, FailFastValidator } from "../validation/fail-fast.js";
import { PathResolver } from "../utils/path-resolver.js";
import { Logger } from "../utils/logger.js";
import chalk from "chalk";

program
  .name("omni-config-doctor")
  .description("Diagnose and validate Omni MCP Hub configuration")
  .version("1.0.0");

program
  .command("check")
  .description("Run configuration health check")
  .option("-c, --config <path>", "Configuration file path")
  .option("--verbose", "Enable verbose output")
  .option("--json", "Output results in JSON format")
  .action(async (options) => {
    try {
      const logger = Logger.getInstance();

      // Determine config path
      let configPath = options.config;
      if (!configPath) {
        const pathResolver = PathResolver.getInstance();
        configPath = pathResolver.getAbsoluteYamlConfigPath();
      }

      logger.info(`INSIGHTS Analyzing configuration: ${configPath}`);

      const validator = new FailFastValidator(logger);

      if (options.json) {
        // JSON output mode
        const result = await validator.validateOnly(configPath);
        console.log(
          JSON.stringify(
            {
              valid: result.valid,
              errors: result.errors,
              warnings: result.warnings,
              timestamp: new Date().toISOString(),
              configPath,
            },
            null,
            2,
          ),
        );
      } else {
        // Human-readable report
        await runConfigDoctor(configPath, logger);
      }

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`CRITICAL Doctor failed: ${error}`));
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate configuration without doctor report")
  .option("-c, --config <path>", "Configuration file path")
  .option("--exit-on-error", "Exit with error code on validation failure", true)
  .option("--no-warnings", "Hide warnings")
  .option("--minimal", "Minimal output")
  .action(async (options) => {
    try {
      const logger = Logger.getInstance();

      // Determine config path
      let configPath = options.config;
      if (!configPath) {
        const pathResolver = PathResolver.getInstance();
        configPath = pathResolver.getAbsoluteYamlConfigPath();
      }

      const validator = new FailFastValidator(logger);
      const result = await validator.validateStartup({
        configPath,
        exitOnError: options.exitOnError,
        showWarnings: options.warnings,
        detailedOutput: !options.minimal,
      });

      if (result.valid) {
        console.log(chalk.green("SUCCESS Configuration is valid"));
        process.exit(0);
      } else {
        console.log(
          chalk.red(`ERROR Configuration has ${result.errors.length} error(s)`),
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`CRITICAL Validation failed: ${error}`));
      process.exit(1);
    }
  });

program
  .command("interactive")
  .description("Interactive configuration diagnosis")
  .action(async () => {
    try {
      const logger = Logger.getInstance();
      const pathResolver = PathResolver.getInstance();
      const configPath = pathResolver.getAbsoluteYamlConfigPath();

      console.log(chalk.blue.bold("🩺 Omni MCP Hub Configuration Doctor"));
      console.log(chalk.blue("=====================================\n"));

      console.log(
        chalk.yellow("Running comprehensive configuration analysis...\n"),
      );

      const validator = new FailFastValidator(logger);
      const result = await validator.validateOnly(configPath);

      // Display results interactively
      if (result.valid) {
        console.log(chalk.green.bold(" DIAGNOSIS: HEALTHY"));
        console.log(chalk.green("Your configuration is working perfectly!\n"));

        if (result.warnings.length > 0) {
          console.log(chalk.yellow.bold("INFO RECOMMENDATIONS:"));
          result.warnings.forEach((warning, index) => {
            console.log(
              chalk.yellow(
                `${index + 1}. ${warning.field}: ${warning.message}`,
              ),
            );
            if (warning.suggestedFix) {
              console.log(chalk.cyan(`   💊 Fix: ${warning.suggestedFix}\n`));
            }
          });
        }
      } else {
        console.log(chalk.red.bold("ALERT DIAGNOSIS: NEEDS ATTENTION"));
        console.log(
          chalk.red(`Found ${result.errors.length} critical issue(s):\n`),
        );

        result.errors.forEach((error, index) => {
          console.log(chalk.red.bold(`${index + 1}. ${error.field}:`));
          console.log(chalk.red(`   Problem: ${error.message}`));
          if (error.line) {
            console.log(
              chalk.yellow(
                `   Location: Line ${error.line}${error.column ? `, Column ${error.column}` : ""}`,
              ),
            );
          }
          if (error.suggestedFix) {
            console.log(chalk.cyan(`   💊 Treatment: ${error.suggestedFix}`));
          }
          console.log();
        });
      }

      // Show configuration summary
      if (result.config) {
        console.log(chalk.blue.bold("LIST CONFIGURATION SUMMARY:"));
        console.log(chalk.blue(`   Mode: ${result.config.mode || "not set"}`));
        console.log(
          chalk.blue(`   Preset: ${result.config.preset || "not set"}`),
        );

        const profilesCount = result.config.autoLoad?.profiles?.length || 0;
        if (profilesCount > 0) {
          console.log(chalk.blue(`   AutoLoad Profiles: ${profilesCount}`));
        }

        const serversCount =
          result.config.externalServers?.servers?.length || 0;
        if (result.config.externalServers?.enabled && serversCount > 0) {
          console.log(chalk.blue(`   External Servers: ${serversCount}`));
        }

        console.log(
          chalk.blue(`   Log Level: ${result.config.logging?.level || "info"}`),
        );
      }

      console.log(chalk.gray(`\nConfiguration analyzed: ${configPath}`));
      console.log(
        chalk.gray(`Analysis completed at: ${new Date().toLocaleString()}`),
      );

      process.exit(result.valid ? 0 : 1);
    } catch (error) {
      console.error(
        chalk.red(`CRITICAL Interactive diagnosis failed: ${error}`),
      );
      process.exit(1);
    }
  });

export async function run(args: string[]): Promise<void> {
  // Override process.argv and process.exit for testing
  const originalArgv = process.argv;
  const originalExit = process.exit;

  try {
    // Mock process.exit to prevent actual exit during tests
    process.exit = ((code?: number) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as typeof process.exit;

    // Parse arguments without exiting process
    program.exitOverride();
    process.argv = ["node", "config-doctor", ...args];
    await program.parseAsync(process.argv, { from: "node" });
  } catch (error) {
    // Handle expected exit calls gracefully
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

// Handle errors gracefully when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  process.on("unhandledRejection", (error) => {
    console.error(chalk.red(`CRITICAL Unhandled error: ${error}`));
    process.exit(1);
  });

  program.parse();
}
