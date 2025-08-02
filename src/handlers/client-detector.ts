import { Request } from 'express';
import { ClientType, ClientDetectionRule, CLIENT_DETECTION_RULES } from '../types/client-types';

export class ClientTypeDetector {
  private rules: ClientDetectionRule[];

  constructor(rules: ClientDetectionRule[] = CLIENT_DETECTION_RULES) {
    this.rules = rules;
  }

  detect(req: Request): ClientType {
    for (const rule of this.rules) {
      if (this.matchesRule(req, rule)) {
        return rule.type;
      }
    }
    return ClientType.UNKNOWN;
  }

  private matchesRule(req: Request, rule: ClientDetectionRule): boolean {
    const { conditions } = rule;

    if (conditions.userAgent) {
      const userAgent = req.headers['user-agent']?.toLowerCase() || '';
      const hasUserAgent = conditions.userAgent.some(ua => 
        userAgent.includes(ua.toLowerCase())
      );
      if (!hasUserAgent) return false;
    }

    if (conditions.headers) {
      for (const [key, expectedValue] of Object.entries(conditions.headers)) {
        const headerValue = req.headers[key.toLowerCase()];
        if (headerValue !== expectedValue) return false;
      }
    }

    if (conditions.path) {
      const requestPath = req.path;
      const hasMatchingPath = conditions.path.some(pathPattern => 
        requestPath.startsWith(pathPattern)
      );
      if (!hasMatchingPath) return false;
    }

    if (conditions.contentType) {
      const contentType = req.headers['content-type']?.toLowerCase() || '';
      const hasContentType = conditions.contentType.some(ct => 
        contentType.includes(ct.toLowerCase())
      );
      if (!hasContentType) return false;
    }

    return true;
  }

  addRule(rule: ClientDetectionRule): void {
    this.rules.push(rule);
  }

  removeRule(type: ClientType): void {
    this.rules = this.rules.filter(rule => rule.type !== type);
  }

  getRules(): ClientDetectionRule[] {
    return [...this.rules];
  }
}