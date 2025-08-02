import express, { Request, Response } from 'express';
import cors from 'cors';
import { ClientTypeDetector } from '../handlers/client-detector';
import { HandlerFactory } from '../handlers/handler-factory';
import { ClientType } from '../types/client-types';

export class UniversalDocServer {
  private app: express.Application;
  private detector: ClientTypeDetector;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.detector = new ClientTypeDetector();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.all('*', this.handleRequest.bind(this));
  }

  private async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const clientType = this.detector.detect(req);
      
      if (clientType === ClientType.UNKNOWN) {
        res.status(400).json({ 
          error: 'Unknown client type',
          supportedClients: HandlerFactory.getSupportedTypes()
        });
        return;
      }

      const handler = HandlerFactory.create(clientType);
      await handler.process(req, res);
    } catch (error) {
      console.error('Request handling error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  start(): void {
    this.app.listen(this.port, () => {
      console.log(`Universal Doc Server running on port ${this.port}`);
      console.log(`Supported clients: ${HandlerFactory.getSupportedTypes().join(', ')}`);
    });
  }

  getApp(): express.Application {
    return this.app;
  }
}