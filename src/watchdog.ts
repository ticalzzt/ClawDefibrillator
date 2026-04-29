/**
 * OpenClaw Anti-Freeze Watchdog
 * 
 * Runs as a separate process to monitor OpenClaw health.
 * If OpenClaw hangs, this watchdog will kill and restart it.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface WatchdogConfig {
  heartbeatIntervalMs: number;
  maxMissedHeartbeats: number;
  gracefulShutdownTimeoutMs: number;
  sessionMaxSizeMB: number;
  openclawCommand: string[];
  workingDirectory: string;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  heartbeatIntervalMs: 5000,
  maxMissedHeartbeats: 3,
  gracefulShutdownTimeoutMs: 10000,
  sessionMaxSizeMB: 10,
  openclawCommand: ['npx', 'openclaw@latest'],
  workingDirectory: process.env.HOME || '/tmp',
};

class OpenClawWatchdog {
  private config: WatchdogConfig;
  private lastHeartbeat: number = Date.now();
  private missedHeartbeats: number = 0;
  private mainProcess: ChildProcess | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

  constructor(config: Partial<WatchdogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    console.log('[Watchdog] Starting OpenClaw Anti-Freeze Guardian...');
    console.log('[Watchdog] Config:', JSON.stringify(this.config, null, 2));

    // Setup signal handlers
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    // Create heartbeat IPC server
    this.setupHeartbeatServer();

    // Start initial OpenClaw process
    await this.spawnOpenClaw();

    // Start health check loop
    this.heartbeatTimer = setInterval(
      () => this.checkHealth(),
      this.config.heartbeatIntervalMs
    );

    console.log('[Watchdog] Watchdog is running. Press Ctrl+C to stop.');
  }

  private setupHeartbeatServer(): void {
    // Create a simple Unix socket or named pipe for heartbeat
    const heartbeatPath = this.getHeartbeatPath();
    
    // Remove old socket if exists
    try {
      fs.unlink(heartbeatPath);
    } catch {
      // Ignore if doesn't exist
    }

    // Use stdin/stdout for simple heartbeat
    process.stdin.on('data', (data) => {
      const message = data.toString().trim();
      if (message === 'HEARTBEAT') {
        this.recordHeartbeat();
      }
    });
  }

  private getHeartbeatPath(): string {
    return path.join(os.tmpdir(), 'openclaw-watchdog.sock');
  }

  private recordHeartbeat(): void {
    this.lastHeartbeat = Date.now();
    this.missedHeartbeats = 0;
  }

  private async checkHealth(): Promise<void> {
    if (this.isShuttingDown) return;

    const now = Date.now();
    const elapsed = now - this.lastHeartbeat;
    const threshold = this.config.heartbeatIntervalMs * 2;

    if (elapsed > threshold) {
      this.missedHeartbeats++;
      console.warn(
        `[Watchdog] Missed heartbeat #${this.missedHeartbeats} ` +
        `(elapsed: ${elapsed}ms, threshold: ${threshold}ms)`
      );

      if (this.missedHeartbeats >= this.config.maxMissedHeartbeats) {
        console.error('[Watchdog] Max missed heartbeats reached. Initiating recovery...');
        await this.recover();
      }
    }

    // Also check session file size
    await this.checkSessionSize();
  }

  private async checkSessionSize(): Promise<void> {
    try {
      const sessionDir = path.join(
        process.env.HOME || '',
        '.openclaw',
        'sessions'
      );
      
      const files = await fs.readdir(sessionDir).catch(() => []);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(sessionDir, file);
        const stats = await fs.stat(filePath).catch(() => null);
        
        if (stats && stats.size > this.config.sessionMaxSizeMB * 1024 * 1024) {
          console.warn(
            `[Watchdog] Session file ${file} is oversized (${
              Math.round(stats.size / 1024 / 1024)
            }MB). Truncating...`
          );
          await this.truncateSessionFile(filePath);
        }
      }
    } catch (e) {
      // Non-critical error
    }
  }

  private async truncateSessionFile(filePath: string): Promise<void> {
    try {
      // Read last N entries to preserve recent context
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (Array.isArray(data.messages) && data.messages.length > 100) {
        // Keep last 100 messages
        data.messages = data.messages.slice(-100);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log('[Watchdog] Session file truncated to last 100 messages');
      }
    } catch (e) {
      console.error('[Watchdog] Failed to truncate session:', e);
    }
  }

  private async spawnOpenClaw(): Promise<void> {
    console.log('[Watchdog] Spawning OpenClaw process...');

    return new Promise((resolve, reject) => {
      this.mainProcess = spawn(
        this.config.openclawCommand[0],
        this.config.openclawCommand.slice(1),
        {
          cwd: this.config.workingDirectory,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            OPENCLAW_WATCHDOG_PID: process.pid.toString(),
          },
        }
      );

      this.mainProcess.stdout?.on('data', (data) => {
        process.stdout.write(data);
        // Check for heartbeat signal in output
        if (data.toString().includes('WATCHDOG_HEARTBEAT')) {
          this.recordHeartbeat();
        }
      });

      this.mainProcess.stderr?.on('data', (data) => {
        process.stderr.write(data);
      });

      this.mainProcess.on('exit', (code) => {
        console.log(`[Watchdog] OpenClaw exited with code ${code}`);
        if (!this.isShuttingDown && code !== 0) {
          console.log('[Watchdog] Unexpected exit, restarting...');
          setTimeout(() => this.spawnOpenClaw(), 1000);
        }
      });

      this.mainProcess.on('error', (err) => {
        console.error('[Watchdog] Failed to spawn OpenClaw:', err);
        reject(err);
      });

      // Give it a moment to start
      setTimeout(resolve, 2000);
    });
  }

  private async recover(): Promise<void> {
    console.error('[Watchdog] === RECOVERY MODE ===');

    // Step 1: Graceful shutdown attempt
    if (this.mainProcess && !this.mainProcess.killed) {
      console.log('[Watchdog] Sending SIGTERM...');
      this.mainProcess.kill('SIGTERM');
      await this.sleep(this.config.gracefulShutdownTimeoutMs);

      // Step 2: Force kill if still running
      if (!this.mainProcess.killed) {
        console.log('[Watchdog] Sending SIGKILL...');
        this.mainProcess.kill('SIGKILL');
        await this.sleep(1000);
      }
    }

    // Step 3: Cleanup problematic files
    await this.cleanupSessionFiles();

    // Step 4: Reset state
    this.lastHeartbeat = Date.now();
    this.missedHeartbeats = 0;

    // Step 5: Restart
    console.log('[Watchdog] Restarting OpenClaw...');
    await this.spawnOpenClaw();

    console.log('[Watchdog] === RECOVERY COMPLETE ===');
  }

  private async cleanupSessionFiles(): Promise<void> {
    console.log('[Watchdog] Cleaning up session files...');

    try {
      const sessionDir = path.join(
        process.env.HOME || '',
        '.openclaw',
        'sessions'
      );

      const files = await fs.readdir(sessionDir).catch(() => []);

      for (const file of files) {
        const filePath = path.join(sessionDir, file);

        // Remove backup and temp files
        if (file.includes('.bak.') || file.includes('.tmp')) {
          await fs.unlink(filePath).catch(() => {});
          console.log(`[Watchdog] Removed: ${file}`);
        }

        // Remove lock files
        if (file.endsWith('.lock')) {
          await fs.unlink(filePath).catch(() => {});
          console.log(`[Watchdog] Removed lock: ${file}`);
        }
      }
    } catch (e) {
      console.error('[Watchdog] Cleanup error:', e);
    }
  }

  private async shutdown(): Promise<void> {
    console.log('[Watchdog] Shutting down...');
    this.isShuttingDown = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.mainProcess && !this.mainProcess.killed) {
      this.mainProcess.kill('SIGTERM');
      await this.sleep(2000);
      if (!this.mainProcess.killed) {
        this.mainProcess.kill('SIGKILL');
      }
    }

    process.exit(0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI entry point
if (require.main === module) {
  const config: Partial<WatchdogConfig> = {
    heartbeatIntervalMs: parseInt(process.env.WATCHDOG_INTERVAL || '5000'),
    maxMissedHeartbeats: parseInt(process.env.WATCHDOG_MISSED || '3'),
    sessionMaxSizeMB: parseInt(process.env.WATCHDOG_MAX_SESSION_MB || '10'),
    openclawCommand: process.env.OPENCLAW_CMD?.split(' ') || ['npx', 'openclaw@latest'],
  };

  const watchdog = new OpenClawWatchdog(config);
  watchdog.start().catch(console.error);
}

export { OpenClawWatchdog, WatchdogConfig };
