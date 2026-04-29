/**
 * Memory Guard
 * 
 * Monitors memory usage and triggers cleanup when pressure is high.
 */

import { EventEmitter } from 'events';
import * as os from 'os';

interface MemoryGuardConfig {
  checkIntervalMs: number;
  warningThreshold: number; // 0-1 ratio
  criticalThreshold: number; // 0-1 ratio
}

const DEFAULT_CONFIG: MemoryGuardConfig = {
  checkIntervalMs: 5000,
  warningThreshold: 0.85, // 85% - early warning line
  criticalThreshold: 0.95, // 95% - critical
};

export class MemoryGuard extends EventEmitter {
  private config: MemoryGuardConfig;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<MemoryGuardConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start() {
    if (this.checkTimer) return;
    
    this.checkTimer = setInterval(
      () => this.checkMemory(),
      this.config.checkIntervalMs
    );
    
    this.emit('started');
  }

  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.emit('stopped');
  }

  private checkMemory() {
    const used = process.memoryUsage();
    const total = os.totalmem();
    const usageRatio = used.heapUsed / total;

    if (usageRatio > this.config.criticalThreshold) {
      this.emit('critical', usageRatio, used);
      this.emergencyCleanup();
    } else if (usageRatio > this.config.warningThreshold) {
      this.emit('warning', usageRatio, used);
      this.gentleCleanup();
    }
  }

  private gentleCleanup() {
    // Clear non-essential caches
    if (global.gc) {
      global.gc();
    }
    this.emit('gentleCleanup');
  }

  private emergencyCleanup() {
    // Aggressive cleanup
    this.gentleCleanup();
    
    // Clear module cache (careful!)
    // Drop pending operations
    // Flush and truncate logs
    
    this.emit('emergencyCleanup');
  }

  getMemoryUsage() {
    return {
      ...process.memoryUsage(),
      systemTotal: os.totalmem(),
      systemFree: os.freemem(),
    };
  }
}
