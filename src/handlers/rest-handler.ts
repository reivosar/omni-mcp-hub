import { Request, Response } from 'express';
import { BaseClientHandler } from './base-handler';
import { ClientType, ProtocolType } from '../types/client-types';

export class RESTHandler extends BaseClientHandler {
  constructor() {
    super(ClientType.CHATGPT, ProtocolType.REST);
  }

  async process(req: Request, res: Response): Promise<void> {
    // TODO: Implement REST API for ChatGPT and others
    res.status(501).json({ error: 'REST handler not implemented yet' });
  }

  getSupportedMethods(): string[] {
    return [
      'GET /api/v1/documentation',
      'GET /api/v1/sources',
      'GET /api/v1/files/:filename'
    ];
  }
}