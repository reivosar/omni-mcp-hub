/**
 * Fail-fast configuration validation for startup
 */

import { SchemaValidator, ValidationResult } from './schema-validator.js';
import { ILogger, Logger } from '../utils/logger.js';
import chalk from 'chalk';
import * as process from 'process';

export interface FailFastOptions {
  configPath?: string;
  exitOnError?: boolean;
  logger?: ILogger;
  showWarnings?: boolean;
  detailedOutput?: boolean;
}

export class FailFastValidator {
  private validator: SchemaValidator;
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger || Logger.getInstance();
    this.validator = new SchemaValidator(this.logger);
  }

  /**
   * Perform startup validation with immediate exit on failure
   */
  async validateStartup(options: FailFastOptions = {}): Promise<ValidationResult> {
    const {
      configPath = 'omni-config.yaml',
      exitOnError = true,
      showWarnings = true,
      detailedOutput = true
    } = options;

    try {
      // Initialize validator
      await this.validator.initialize();
      
      // Perform validation
      const result = await this.validator.validateConfig(configPath);

      // Handle validation results
      if (!result.valid) {
        this.displayErrors(result, detailedOutput);
        
        if (exitOnError) {
          this.logger.error(chalk.red('❌ Configuration validation failed. Application cannot start.'));
          process.exit(1);
        }
        
        return result;
      }

      // Show warnings if requested
      if (showWarnings && result.warnings.length > 0) {
        this.displayWarnings(result, detailedOutput);
      }

      // Show success message
      if (detailedOutput) {
        this.logger.info(chalk.green('✅ Configuration validation passed'));
        this.displayConfigSummary(result);
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(chalk.red(`💥 Fatal configuration error: ${errorMessage}`));
      
      if (exitOnError) {
        process.exit(1);
      }
      
      return {
        valid: false,
        errors: [{
          field: 'startup',
          message: errorMessage,
          suggestedFix: 'Check configuration file path and format'
        }],
        warnings: []
      };
    }
  }

  /**
   * Display validation errors in a user-friendly format
   */
  private displayErrors(result: ValidationResult, detailed: boolean): void {
    this.logger.error(chalk.red.bold('\n🚨 Configuration Validation Errors:'));
    this.logger.error(chalk.red('━'.repeat(50)));

    result.errors.forEach((error, index) => {
      this.logger.error(chalk.red(`\n${index + 1}. ${error.field}:`));
      this.logger.error(chalk.red(`   ${error.message}`));
      
      if (error.line) {
        this.logger.error(chalk.yellow(`   📍 Line ${error.line}${error.column ? `, Column ${error.column}` : ''}`));
      }
      
      if (error.suggestedFix) {
        this.logger.error(chalk.cyan(`   💡 修正案: ${error.suggestedFix}`));
      }

      if (detailed && error.value !== undefined) {
        this.logger.error(chalk.gray(`   現在の値: ${JSON.stringify(error.value)}`));
      }
    });

    this.logger.error(chalk.red('\n━'.repeat(50)));
    this.logger.error(chalk.red(`Found ${result.errors.length} error(s) that must be fixed before startup.`));
  }

  /**
   * Display validation warnings
   */
  private displayWarnings(result: ValidationResult, _detailed: boolean): void {
    this.logger.warn(chalk.yellow.bold('\n⚠️  Configuration Warnings:'));
    
    result.warnings.forEach((warning, index) => {
      this.logger.warn(chalk.yellow(`${index + 1}. ${warning.field}: ${warning.message}`));
      
      if (warning.suggestedFix) {
        this.logger.warn(chalk.cyan(`   💡 推奨: ${warning.suggestedFix}`));
      }
    });
  }

  /**
   * Display configuration summary after successful validation
   */
  private displayConfigSummary(result: ValidationResult): void {
    if (!result.config) return;

    const config = result.config;
    this.logger.info(chalk.blue('\n📋 Configuration Summary:'));
    
    // Show mode and preset
    if (config.mode) {
      this.logger.info(chalk.blue(`   Mode: ${config.mode}`));
    }
    if (config.preset) {
      this.logger.info(chalk.blue(`   Preset: ${config.preset}`));
    }

    // Show profiles count
    const profilesCount = config.autoLoad?.profiles?.length || 0;
    if (profilesCount > 0) {
      this.logger.info(chalk.blue(`   Profiles: ${profilesCount} configured`));
    }

    // Show external servers count
    const serversCount = config.externalServers?.servers?.length || 0;
    if (config.externalServers?.enabled && serversCount > 0) {
      this.logger.info(chalk.blue(`   External Servers: ${serversCount} configured`));
    }

    // Show logging level
    if (config.logging?.level) {
      this.logger.info(chalk.blue(`   Log Level: ${config.logging.level}`));
    }
  }

  /**
   * Validate configuration without exiting (for testing)
   */
  async validateOnly(configPath: string): Promise<ValidationResult> {
    return this.validateStartup({
      configPath,
      exitOnError: false,
      detailedOutput: false
    });
  }

  /**
   * Generate configuration doctor report
   */
  async generateDoctorReport(configPath: string): Promise<string> {
    try {
      await this.validator.initialize();
      const result = await this.validator.validateConfig(configPath);
      
      let report = '';
      
      // Header
      report += chalk.blue.bold('🔍 Omni MCP Hub Configuration Doctor\n');
      report += '='.repeat(40) + '\n\n';

      // Overall status
      if (result.valid) {
        report += chalk.green('✅ Status: HEALTHY\n');
      } else {
        report += chalk.red('❌ Status: REQUIRES ATTENTION\n');
      }

      report += '\n';

      // Errors section
      if (result.errors.length > 0) {
        report += chalk.red.bold('🚨 Critical Issues:\n');
        result.errors.forEach((error, index) => {
          report += `${index + 1}. ${error.field}: ${error.message}\n`;
          if (error.suggestedFix) {
            report += `   💊 Treatment: ${error.suggestedFix}\n`;
          }
          report += '\n';
        });
      }

      // Warnings section
      if (result.warnings.length > 0) {
        report += chalk.yellow.bold('⚠️  Recommendations:\n');
        result.warnings.forEach((warning, index) => {
          report += `${index + 1}. ${warning.field}: ${warning.message}\n`;
          if (warning.suggestedFix) {
            report += `   💡 Suggestion: ${warning.suggestedFix}\n`;
          }
          report += '\n';
        });
      }

      // Health summary
      if (result.valid && result.warnings.length === 0) {
        report += chalk.green('🎉 Your configuration is in perfect health!\n');
      } else if (result.valid) {
        report += chalk.yellow('✨ Configuration is valid but could be optimized.\n');
      } else {
        report += chalk.red('🔧 Configuration needs immediate attention.\n');
      }

      return report;

    } catch (error) {
      return chalk.red(`💥 Doctor failed to analyze configuration: ${error}`);
    }
  }
}

/**
 * Convenience function for startup validation
 */
export async function validateConfigOnStartup(options: FailFastOptions = {}): Promise<ValidationResult> {
  const validator = new FailFastValidator(options.logger);
  return validator.validateStartup(options);
}

/**
 * Convenience function for config doctor
 */
export async function runConfigDoctor(configPath = 'omni-config.yaml', logger?: ILogger): Promise<void> {
  const validator = new FailFastValidator(logger);
  const report = await validator.generateDoctorReport(configPath);
  console.log(report);
}