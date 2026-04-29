/**
 * Session Guard
 * 
 * Prevents session file bloat that causes OpenClaw to hang.
 */

import { EventEmitter } from 'events';
import { withTimeout, SAFE_TIMEOUTS } from './timeout-wrapper';
import * as fs from 'fs/promises';

interface SessionGuardConfig {
  maxQueueSize: number;
  maxFileSizeBytes: number;
  truncateToMessages: number;
}

const DEFAULT_CONFIG: SessionGuardConfig = {
  maxQueueSize: 10,
  maxFileSizeBytes: 8 * 1024 * 1024, // 8MB - below danger zone
  truncateToMessages: 100,
};

export class SafeSessionStore extends EventEmitter {
  private writeQueue: Array<() => Promise<void>> = [];
  private isWriting: boolean = false;
  private config: SessionGuardConfig;

  constructor(config: Partial<SessionGuardConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async enqueueWrite(writeFn: () => Promise<void>): Promise<void> {
    if (this.writeQueue.length >= this.config.maxQueueSize) {
      // Drop oldest writes to prevent memory bloat
      this.writeQueue.shift();
      this.emit('droppedWrite');
    }

    return new Promise((resolve, reject) => {
      this.writeQueue.push(async () => {
        try {
          await writeFn();
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isWriting || this.writeQueue.length === 0) return;

    this.isWriting = true;
    const write = this.writeQueue.shift()!;

    try {
      await withTimeout(
        write(),
        SAFE_TIMEOUTS.sessionWrite,
        'sessionWrite'
      );
    } catch (e) {
      console.error('Session write failed:', e);
      this.emit('writeError', e);
    } finally {
      this.isWriting = false;
      // Schedule next with yield to prevent event loop starvation
      setImmediate(() => this.processQueue());
    }
  }

  // Pre-emptive size checking
  async checkSize(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.config.maxFileSizeBytes) {
        this.emit('sizeLimitExceeded', stats.size);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  // Truncate session file to last N messages
  async truncateSessionFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (
        Array.isArray(data.messages) &&
        data.messages.length > this.config.truncateToMessages
      ) {
        data.messages = data.messages.slice(-this.config.truncateToMessages);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        this.emit('truncated', data.messages.length);
      }
    } catch (e) {
      this.emit('truncateError', e);
    }
  }
}
