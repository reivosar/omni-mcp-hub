import Ajv from 'ajv';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { YamlConfig } from '../config/yaml-config.js';
import { ILogger } from '../utils/logger.js';

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  suggestedFix?: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  config?: YamlConfig;
}

export interface DryRunResult extends ValidationResult {
  changes: ConfigChange[];
  impact: {
    newProfiles: string[];
    removedProfiles: string[];
    externalServerChanges: ExternalServerChange[];
    configFileChanges: string[];
  };
}

export interface ConfigChange {
  type: 'added' | 'removed' | 'modified';
  section: string;
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
}

export interface ExternalServerChange {
  type: 'added' | 'removed' | 'modified';
  serverName: string;
  changes: string[];
}

export class SchemaValidator {
  private ajv: Ajv;
  private schema: unknown;
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.ajv = new Ajv({ 
      allErrors: true, 
      verbose: true,
      strict: false,
      removeAdditional: false,
      useDefaults: true,  // P1-4: Enable default value assignment
      coerceTypes: true,  // Auto-coerce types when possible
      messages: false     // Use custom error messages
    });
    
    // Add custom formats
    this.ajv.addFormat('profile-name', /^[a-zA-Z0-9-_]+$/);
    
    // Add error message localization
    this.setupErrorMessages();
  }

  /**
   * Setup Japanese error messages for better UX
   */
  private setupErrorMessages(): void {
    // Custom error message keywords for better Japanese support
    this.ajv.addKeyword({
      keyword: 'errorMessage',
      schemaType: ['object', 'string'],
      compile: () => () => true
    });
  }

  /**
   * Initialize the validator with schema
   */
  async initialize(): Promise<void> {
    try {
      // Try multiple possible schema locations
      const possiblePaths = [
        path.resolve('./schemas/omni-config.schema.json'),
        path.resolve(process.cwd(), 'schemas/omni-config.schema.json'),
        path.resolve(__dirname, '../../schemas/omni-config.schema.json')
      ];
      
      let schemaContent: string | undefined;
      let schemaPath: string | undefined;
      
      for (const tryPath of possiblePaths) {
        try {
          schemaContent = await fs.readFile(tryPath, 'utf-8');
          schemaPath = tryPath;
          break;
        } catch {
          // Try next path
        }
      }
      
      if (!schemaContent) {
        throw new Error('Schema file not found in any of the expected locations');
      }
      
      this.schema = JSON.parse(schemaContent);
      this.ajv.addSchema(this.schema as Record<string, unknown>, 'omni-config');
      this.logger.debug(`Schema validator initialized successfully from: ${schemaPath}`);
    } catch (error) {
      this.logger.error('Failed to initialize schema validator:', error);
      throw new Error('Schema initialization failed');
    }
  }

  /**
   * Validate YAML configuration against schema
   */
  async validateConfig(configPath: string): Promise<ValidationResult> {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(configContent) as YamlConfig;
      
      const validate = this.ajv.getSchema('omni-config');
      if (!validate) {
        throw new Error('Schema not loaded');
      }

      const isValid = validate(config) as boolean;
      const errors: ValidationError[] = [];
      const warnings: ValidationError[] = [];

      if (!isValid && validate.errors) {
        for (const error of validate.errors) {
          const validationError = this.formatAjvError(error as unknown as Record<string, unknown>, configContent);
          errors.push(validationError);
        }
      }

      // Add semantic warnings
      const semanticWarnings = await this.performSemanticValidation(config, configPath);
      warnings.push(...semanticWarnings);

      return {
        valid: isValid,
        errors,
        warnings,
        config: isValid ? config : undefined
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          field: 'root',
          message: error instanceof Error ? error.message : 'Unknown validation error'
        }],
        warnings: []
      };
    }
  }

  /**
   * Perform dry-run validation comparing with current configuration
   */
  async dryRun(configPath: string, currentConfig?: YamlConfig): Promise<DryRunResult> {
    const validationResult = await this.validateConfig(configPath);
    
    if (!validationResult.valid || !validationResult.config) {
      return {
        ...validationResult,
        changes: [],
        impact: {
          newProfiles: [],
          removedProfiles: [],
          externalServerChanges: [],
          configFileChanges: []
        }
      };
    }

    const newConfig = validationResult.config;
    const changes: ConfigChange[] = [];
    const impact = {
      newProfiles: [] as string[],
      removedProfiles: [] as string[],
      externalServerChanges: [] as ExternalServerChange[],
      configFileChanges: [] as string[]
    };

    if (currentConfig) {
      // Compare profiles
      this.compareProfiles(currentConfig, newConfig, changes, impact);
      
      // Compare external servers
      this.compareExternalServers(currentConfig, newConfig, changes, impact);
      
      // Compare other settings
      this.compareSettings(currentConfig, newConfig, changes, impact);
    }

    return {
      ...validationResult,
      changes,
      impact
    };
  }

  /**
   * Format AJV validation error into user-friendly format with Japanese messages
   */
  private formatAjvError(error: Record<string, unknown>, configContent: string): ValidationError {
    const field = (error.instancePath as string) || (error.schemaPath as string) || 'root';
    let message = (error.message as string) || 'Validation error';
    let suggestedFix = '';
    
    const params = error.params as Record<string, unknown>;
    const data = error.data;

    // Provide Japanese error messages and suggestions
    switch (error.keyword) {
      case 'required':
        message = `必須項目が不足しています: ${params.missingProperty}`;
        suggestedFix = `設定に "${params.missingProperty}" を追加してください`;
        break;
      case 'enum':
        message = `不正な値 "${data}" です。次の値のいずれかを使用してください: ${(params.allowedValues as string[]).join(', ')}`;
        suggestedFix = `許可された値を使用してください: ${(params.allowedValues as string[]).join(', ')}`;
        break;
      case 'pattern':
        message = `値 "${data}" が必要なパターンに一致しません: ${params.pattern}`;
        if (field && field.includes('name')) {
          suggestedFix = '名前には英数字、ハイフン、アンダースコアのみ使用してください';
        } else {
          suggestedFix = '正しい形式で値を入力してください';
        }
        break;
      case 'type':
        message = `型が一致しません。期待値: ${params.type}、実際の値: ${typeof data}`;
        suggestedFix = `値を ${params.type} 型に変更してください`;
        break;
      case 'additionalProperties':
        message = `未知のプロパティです: "${params.additionalProperty}"`;
        suggestedFix = 'このプロパティを削除するか、スペルを確認してください';
        break;
      case 'not':
        // Handle mode restrictions
        if ((field && field.includes('mode')) || (typeof error.schemaPath === 'string' && error.schemaPath.includes('allOf'))) {
          message = `設定モードの制限に違反しています`;
          suggestedFix = this.getModeRestrictionSuggestion(data as Record<string, unknown>);
        } else {
          message = `設定の制約に違反しています`;
          suggestedFix = '設定を確認し、制約に従って修正してください';
        }
        break;
      case 'maxItems':
        message = `配列の要素数が上限を超えています（最大: ${params.limit}）`;
        suggestedFix = `要素数を ${params.limit} 以下に減らしてください`;
        break;
      case 'minLength':
        message = `文字列が短すぎます（最小: ${params.limit} 文字）`;
        suggestedFix = `${params.limit} 文字以上で入力してください`;
        break;
      case 'format':
        message = `フォーマットが正しくありません（期待フォーマット: ${params.format}）`;
        suggestedFix = '正しいフォーマットで値を入力してください';
        break;
      default:
        message = `設定エラー: ${error.message || '詳細不明'}`;
        suggestedFix = '設定値を確認し、修正してください';
    }

    // Try to find line number in YAML content
    const { line, column } = this.findLineNumber(configContent, field, data);

    return {
      field: field.replace(/^\//, '').replace(/\//g, '.') || 'root',
      message,
      value: data,
      suggestedFix,
      line,
      column
    };
  }

  /**
   * Get mode-specific restriction suggestion
   */
  private getModeRestrictionSuggestion(config: Record<string, unknown>): string {
    const mode = config.mode as string || 'minimal';
    
    switch (mode) {
      case 'minimal':
        return 'mode=minimal では externalServers、fileSettings、directoryScanning、profileManagement は使用できません。mode=standard または mode=advanced に変更してください。';
      case 'standard':
        return 'mode=standard では一部の高度な機能に制限があります。すべての機能を使用するには mode=advanced に変更してください。';
      default:
        return '設定モードを確認し、適切な値に変更してください。';
    }
  }

  /**
   * Perform semantic validation beyond schema
   */
  private async performSemanticValidation(config: YamlConfig, configPath: string): Promise<ValidationError[]> {
    const warnings: ValidationError[] = [];
    const basePath = path.dirname(configPath);

    // Check if profile paths exist
    if (config.autoLoad?.profiles) {
      for (const profile of config.autoLoad.profiles) {
        try {
          const profilePath = path.resolve(basePath, profile.path);
          await fs.access(profilePath);
        } catch {
          warnings.push({
            field: `autoLoad.profiles.${profile.name}.path`,
            message: `Profile file not found: ${profile.path}`,
            suggestedFix: 'Create the profile file or update the path'
          });
        }
      }
    }

    // Check for duplicate profile names
    if (config.autoLoad?.profiles) {
      const names = config.autoLoad.profiles.map(p => p.name);
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      for (const duplicate of [...new Set(duplicates)]) {
        warnings.push({
          field: 'autoLoad.profiles',
          message: `Duplicate profile name: ${duplicate}`,
          suggestedFix: 'Use unique names for each profile'
        });
      }
    }

    // Check for duplicate external server names
    if (config.externalServers?.servers) {
      const names = config.externalServers.servers.map(s => s.name);
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      for (const duplicate of [...new Set(duplicates)]) {
        warnings.push({
          field: 'externalServers.servers',
          message: `Duplicate server name: ${duplicate}`,
          suggestedFix: 'Use unique names for each server'
        });
      }
    }

    // Warn if external servers are enabled but no servers defined
    if (config.externalServers?.enabled && (!config.externalServers.servers || config.externalServers.servers.length === 0)) {
      warnings.push({
        field: 'externalServers',
        message: 'External servers are enabled but no servers are configured',
        suggestedFix: 'Add at least one server or set enabled to false'
      });
    }

    return warnings;
  }

  /**
   * Find line number in YAML content for error location
   */
  private findLineNumber(content: string, field: string, value?: unknown): { line?: number; column?: number } {
    const lines = content.split('\n');
    const fieldParts = field.split('/').filter(p => p);
    
    if (fieldParts.length === 0) return {};

    // Simple heuristic to find the line
    const searchKey = fieldParts[fieldParts.length - 1];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(searchKey) && (value === undefined || line.includes(String(value)))) {
        return { line: i + 1, column: line.indexOf(searchKey) + 1 };
      }
    }

    return {};
  }

  /**
   * Compare profiles between configurations
   */
  private compareProfiles(current: YamlConfig, newConfig: YamlConfig, changes: ConfigChange[], impact: DryRunResult['impact']): void {
    const currentProfiles = current.autoLoad?.profiles || [];
    const newProfiles = newConfig.autoLoad?.profiles || [];

    const currentNames = new Set(currentProfiles.map(p => p.name));
    const newNames = new Set(newProfiles.map(p => p.name));

    // Find new profiles
    for (const profile of newProfiles) {
      if (!currentNames.has(profile.name)) {
        impact.newProfiles.push(profile.name);
        changes.push({
          type: 'added',
          section: 'autoLoad.profiles',
          field: profile.name,
          newValue: profile,
          description: `Added profile "${profile.name}"`
        });
      }
    }

    // Find removed profiles
    for (const profile of currentProfiles) {
      if (!newNames.has(profile.name)) {
        impact.removedProfiles.push(profile.name);
        changes.push({
          type: 'removed',
          section: 'autoLoad.profiles',
          field: profile.name,
          oldValue: profile,
          description: `Removed profile "${profile.name}"`
        });
      }
    }

    // Find modified profiles
    for (const newProfile of newProfiles) {
      const currentProfile = currentProfiles.find(p => p.name === newProfile.name);
      if (currentProfile && JSON.stringify(currentProfile) !== JSON.stringify(newProfile)) {
        changes.push({
          type: 'modified',
          section: 'autoLoad.profiles',
          field: newProfile.name,
          oldValue: currentProfile,
          newValue: newProfile,
          description: `Modified profile "${newProfile.name}"`
        });
      }
    }
  }

  /**
   * Compare external servers between configurations
   */
  private compareExternalServers(current: YamlConfig, newConfig: YamlConfig, changes: ConfigChange[], impact: DryRunResult['impact']): void {
    const currentServers = current.externalServers?.servers || [];
    const newServers = newConfig.externalServers?.servers || [];

    const currentNames = new Set(currentServers.map(s => s.name));
    const newNames = new Set(newServers.map(s => s.name));

    // Find changes
    for (const server of newServers) {
      if (!currentNames.has(server.name)) {
        impact.externalServerChanges.push({
          type: 'added',
          serverName: server.name,
          changes: [`Added server "${server.name}"`]
        });
      }
    }

    for (const server of currentServers) {
      if (!newNames.has(server.name)) {
        impact.externalServerChanges.push({
          type: 'removed',
          serverName: server.name,
          changes: [`Removed server "${server.name}"`]
        });
      }
    }
  }

  /**
   * Compare other settings between configurations
   */
  private compareSettings(current: YamlConfig, newConfig: YamlConfig, changes: ConfigChange[], impact: DryRunResult['impact']): void {
    // Compare logging settings
    if (JSON.stringify(current.logging) !== JSON.stringify(newConfig.logging)) {
      changes.push({
        type: 'modified',
        section: 'logging',
        field: 'settings',
        oldValue: current.logging,
        newValue: newConfig.logging,
        description: 'Modified logging configuration'
      });
    }

    // Compare file settings
    if (JSON.stringify(current.fileSettings) !== JSON.stringify(newConfig.fileSettings)) {
      changes.push({
        type: 'modified',
        section: 'fileSettings',
        field: 'settings',
        oldValue: current.fileSettings,
        newValue: newConfig.fileSettings,
        description: 'Modified file scanning settings'
      });
      impact.configFileChanges.push('File scanning patterns updated');
    }
  }

  /**
   * Format validation result for display
   */
  formatValidationResult(result: ValidationResult | DryRunResult): string {
    let output = '';
    
    if (result.valid) {
      output += '✅ Configuration is valid\n';
    } else {
      output += '❌ Configuration validation failed\n\n';
    }

    // Show errors
    if (result.errors.length > 0) {
      output += 'Errors:\n';
      for (const error of result.errors) {
        output += `  • ${error.field}: ${error.message}\n`;
        if (error.line) {
          output += `    Line ${error.line}${error.column ? `, Column ${error.column}` : ''}\n`;
        }
        if (error.suggestedFix) {
          output += `    💡 ${error.suggestedFix}\n`;
        }
        output += '\n';
      }
    }

    // Show warnings
    if (result.warnings.length > 0) {
      output += 'Warnings:\n';
      for (const warning of result.warnings) {
        output += `  ⚠️ ${warning.field}: ${warning.message}\n`;
        if (warning.suggestedFix) {
          output += `    💡 ${warning.suggestedFix}\n`;
        }
      }
    }

    // Show dry-run results
    if ('changes' in result && result.changes.length > 0) {
      output += '\nConfiguration Changes:\n';
      for (const change of result.changes) {
        const icon = change.type === 'added' ? '➕' : change.type === 'removed' ? '➖' : '📝';
        output += `  ${icon} ${change.description}\n`;
      }

      output += '\nImpact Summary:\n';
      if (result.impact.newProfiles.length > 0) {
        output += `  • New profiles: ${result.impact.newProfiles.join(', ')}\n`;
      }
      if (result.impact.removedProfiles.length > 0) {
        output += `  • Removed profiles: ${result.impact.removedProfiles.join(', ')}\n`;
      }
      if (result.impact.externalServerChanges.length > 0) {
        output += `  • External server changes: ${result.impact.externalServerChanges.length}\n`;
      }
    }

    return output;
  }
}