// OpenClaw Bridge — WebSocket client for communicating with OpenClaw Gateway
// Connects to OpenClaw's WebSocket gateway to send/receive messages

import { EventEmitter } from 'events';
import { logger } from './logger.js';

export interface ClawMessage {
  id: string;
  text: string;
  from: 'gaca-core' | 'claw';
  timestamp: Date;
  target?: string;
}

export interface BridgeHealth {
  connected: boolean;
  gatewayUrl: string | null;
  connectedSince: Date | null;
  messagesSent: number;
  messagesReceived: number;
  lastError: string | null;
}

export class OpenClawBridge extends EventEmitter {
  private ws: any = null;
  private gatewayUrl: string | null = null;
  private token: string | null = null;
  private connected: boolean = false;
  private connectedSince: Date | null = null;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private lastError: string | null = null;
  private history: ClawMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private maxHistory: number = 100;

  async connect(gatewayUrl: string, token: string): Promise<void> {
    if (this.ws) {
      this.disconnect();
    }

    this.gatewayUrl = gatewayUrl;
    this.token = token;

    return new Promise((resolve, reject) => {
      import('ws').then(({ default: WebSocket }) => {
        this.ws = new WebSocket(gatewayUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        this.ws.on('open', () => {
          this.connected = true;
          this.connectedSince = new Date();
          this.lastError = null;
          logger.info({ gatewayUrl }, '[OpenClawBridge] Connected');
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());
            this.messagesReceived++;

            const clawMessage: ClawMessage = {
              id: `claw-${Date.now()}-${this.messagesReceived}`,
              text: msg.text || msg.content || msg.message || JSON.stringify(msg),
              from: 'claw',
              timestamp: new Date(),
            };

            this.history.push(clawMessage);
            if (this.history.length > this.maxHistory) {
              this.history.shift();
            }

            this.emit('message', clawMessage);
          } catch (err) {
            logger.error({ err }, '[OpenClawBridge] Failed to parse message');
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.connected = false;
          logger.info({ code }, '[OpenClawBridge] Disconnected');
          this.emit('disconnected', { code, reason: reason.toString() });

          if (this.gatewayUrl && this.token) {
            this.reconnectTimer = setTimeout(() => {
              logger.info('[OpenClawBridge] Attempting reconnect...');
              this.connect(this.gatewayUrl!, this.token!).catch((err) => {
                this.lastError = err.message;
              });
            }, 5000);
          }
        });

        this.ws.on('error', (err: Error) => {
          this.lastError = err.message;
          logger.error({ err }, '[OpenClawBridge] WebSocket error');
          this.emit('error', err);
          if (!this.connected) reject(err);
        });
      }).catch((err) => {
        this.lastError = `ws module not available: ${err.message}`;
        reject(new Error(this.lastError));
      });
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connectedSince = null;
    this.gatewayUrl = null;
    this.token = null;
  }

  async sendMessage(text: string, target?: string): Promise<ClawMessage> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to OpenClaw Gateway');
    }

    const message: ClawMessage = {
      id: `gaca-${Date.now()}-${this.messagesSent + 1}`,
      text,
      from: 'gaca-core',
      timestamp: new Date(),
      target,
    };

    this.ws.send(JSON.stringify({ type: 'message', text, target, source: 'gaca-core' }));
    this.messagesSent++;

    this.history.push(message);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return message;
  }

  getHealth(): BridgeHealth {
    return {
      connected: this.connected,
      gatewayUrl: this.gatewayUrl,
      connectedSince: this.connectedSince,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      lastError: this.lastError,
    };
  }

  getHistory(): ClawMessage[] {
    return [...this.history];
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
let bridgeInstance: OpenClawBridge | null = null;

export function getOpenClawBridge(): OpenClawBridge {
  if (!bridgeInstance) {
    bridgeInstance = new OpenClawBridge();
  }
  return bridgeInstance;
}
