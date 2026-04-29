#!/usr/bin/env node
/**
 * OpenClaw Anti-Freeze CLI
 * 
 * Usage:
 *   openclaw-watchdog [options]
 *   openclaw-watchdog --help
 */

import { OpenClawWatchdog, WatchdogConfig } from './watchdog';

function showHelp() {
  console.log(`
OpenClaw Anti-Freeze Guardian

Usage: openclaw-watchdog [options]

Options:
  -i, --interval <ms>       Heartbeat interval in milliseconds (default: 5000)
  -m, --missed <count>      Max missed heartbeats before recovery (default: 3)
  -s, --session-size <mb>   Max session file size in MB (default: 10)
  -c, --command <cmd>       Command to run OpenClaw (default: npx openclaw@latest)
  -d, --directory <path>    Working directory (default: $HOME)
  -h, --help               Show this help message

Environment Variables:
  WATCHDOG_INTERVAL         Same as --interval
  WATCHDOG_MISSED           Same as --missed
  WATCHDOG_MAX_SESSION_MB   Same as --session-size
  OPENCLAW_CMD              Same as --command

Examples:
  openclaw-watchdog
  openclaw-watchdog --interval 10000 --missed 5
  openclaw-watchdog --command "npx openclaw@beta"
`);
}

function parseArgs(): Partial<WatchdogConfig> {
  const args = process.argv.slice(2);
  const config: Partial<WatchdogConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
        break;
      case '-i':
      case '--interval':
        config.heartbeatIntervalMs = parseInt(args[++i]);
        break;
      case '-m':
      case '--missed':
        config.maxMissedHeartbeats = parseInt(args[++i]);
        break;
      case '-s':
      case '--session-size':
        config.sessionMaxSizeMB = parseInt(args[++i]);
        break;
      case '-c':
      case '--command':
        config.openclawCommand = args[++i].split(' ');
        break;
      case '-d':
      case '--directory':
        config.workingDirectory = args[++i];
        break;
    }
  }

  // Override with environment variables
  if (process.env.WATCHDOG_INTERVAL) {
    config.heartbeatIntervalMs = parseInt(process.env.WATCHDOG_INTERVAL);
  }
  if (process.env.WATCHDOG_MISSED) {
    config.maxMissedHeartbeats = parseInt(process.env.WATCHDOG_MISSED);
  }
  if (process.env.WATCHDOG_MAX_SESSION_MB) {
    config.sessionMaxSizeMB = parseInt(process.env.WATCHDOG_MAX_SESSION_MB);
  }
  if (process.env.OPENCLAW_CMD) {
    config.openclawCommand = process.env.OPENCLAW_CMD.split(' ');
  }

  return config;
}

async function main() {
  const config = parseArgs();
  
  console.log('🔧 OpenClaw Anti-Freeze Guardian');
  console.log('================================\n');
  
  const watchdog = new OpenClawWatchdog(config);
  
  try {
    await watchdog.start();
  } catch (error) {
    console.error('Failed to start watchdog:', error);
    process.exit(1);
  }
}

main();
