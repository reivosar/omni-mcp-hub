import { Request, Response } from 'express';
import { BaseClientHandler } from './base-handler';
import { ClientType, ProtocolType } from '../types/client-types';

export class LSPHandler extends BaseClientHandler {
  constructor() {
    super(ClientType.CURSOR, ProtocolType.LSP);
  }

  async process(req: Request, res: Response): Promise<void> {
    // TODO: Implement LSP protocol for Cursor
    res.status(501).json({ error: 'LSP handler not implemented yet' });
  }

  getSupportedMethods(): string[] {
    return [
      'textDocument/completion',
      'textDocument/hover',
      'workspace/symbol'
    ];
  }
}