import { Request, Response } from 'express';
import { ClientType, ProtocolType } from '../types/client-types';

export abstract class BaseClientHandler {
  protected clientType: ClientType;
  protected protocolType: ProtocolType;

  constructor(clientType: ClientType, protocolType: ProtocolType) {
    this.clientType = clientType;
    this.protocolType = protocolType;
  }

  abstract process(req: Request, res: Response): Promise<void>;

  abstract getSupportedMethods(): string[];

  getClientType(): ClientType {
    return this.clientType;
  }

  getProtocolType(): ProtocolType {
    return this.protocolType;
  }
}