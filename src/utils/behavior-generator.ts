import { ClaudeConfig } from './claude-config.js';

export class BehaviorGenerator {
  /**
   * Generate behavior instructions from a Claude configuration
   */
  static generateInstructions(config: ClaudeConfig): string {
    const instructions: string[] = [];

    if (config.instructions) {
      instructions.push("# System Instructions");
      instructions.push(config.instructions);
      instructions.push("");
    }

    if (config.customInstructions && config.customInstructions.length > 0) {
      instructions.push("# Custom Instructions");
      config.customInstructions.forEach(instruction => {
        instructions.push(`- ${instruction}`);
      });
      instructions.push("");
    }

    if (config.rules && config.rules.length > 0) {
      instructions.push("# Rules to Follow");
      config.rules.forEach(rule => {
        instructions.push(`- ${rule}`);
      });
      instructions.push("");
    }

    if (config.context && config.context.length > 0) {
      instructions.push("# Context Information");
      config.context.forEach(ctx => {
        instructions.push(`- ${ctx}`);
      });
      instructions.push("");
    }

    if (config.knowledge && config.knowledge.length > 0) {
      instructions.push("# Knowledge Base");
      config.knowledge.forEach(knowledge => {
        instructions.push(`- ${knowledge}`);
      });
      instructions.push("");
    }

    if (config.memory) {
      instructions.push("# Memory Context");
      instructions.push(config.memory);
      instructions.push("");
    }

    if (config.tools && config.tools.length > 0) {
      instructions.push("# Available Tools");
      config.tools.forEach(tool => {
        instructions.push(`- ${tool}`);
      });
      instructions.push("");
    }

    return instructions.join('\n').trim();
  }
}