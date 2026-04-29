/**
 * OpenClaw Heartbeat Injector
 * 
 * Patches OpenClaw to send heartbeats to the watchdog.
 * Run this before starting OpenClaw.
 */

const fs = require('fs');
const path = require('path');

const OPENCLAW_DIR = path.join(process.env.HOME || '', '.openclaw');
const PATCH_MARKER = '// ANTI_FREEZE_PATCHED';

function findOpenClawSource() {
  // Common locations
  const candidates = [
    path.join(OPENCLAW_DIR, 'node_modules', 'openclaw', 'dist', 'index.js'),
    path.join(OPENCLAW_DIR, 'node_modules', 'openclaw', 'dist', 'gateway.js'),
    path.join(process.cwd(), 'node_modules', 'openclaw', 'dist', 'index.js'),
    '/usr/local/lib/node_modules/openclaw/dist/index.js',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Try to find via npm
  try {
    const result = require('child_process').execSync('npm root -g', { encoding: 'utf-8' });
    const globalRoot = result.trim();
    const globalPath = path.join(globalRoot, 'openclaw', 'dist', 'index.js');
    if (fs.existsSync(globalPath)) {
      return globalPath;
    }
  } catch {
    // Ignore
  }

  return null;
}

function injectHeartbeat(sourcePath) {
  console.log(`[Injector] Patching ${sourcePath}...`);

  let content = fs.readFileSync(sourcePath, 'utf-8');

  // Check if already patched
  if (content.includes(PATCH_MARKER)) {
    console.log('[Injector] Already patched, skipping');
    return true;
  }

  // Create backup
  const backupPath = sourcePath + '.original';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(sourcePath, backupPath);
    console.log('[Injector] Backup created at', backupPath);
  }

  // Inject heartbeat code at the beginning
  const heartbeatCode = `
${PATCH_MARKER}
// Anti-Freeze Heartbeat Patch
(function() {
  const watchdogPid = process.env.OPENCLAW_WATCHDOG_PID;
  if (watchdogPid) {
    console.log('[OpenClaw] Watchdog detected, enabling heartbeats');
    
    // Send heartbeat every 3 seconds
    setInterval(() => {
      console.log('WATCHDOG_HEARTBEAT');
    }, 3000);
    
    // Also hook into the event loop
    const originalSetImmediate = setImmediate;
    const originalSetTimeout = setTimeout;
    let lastActivity = Date.now();
    
    setImmediate = function(...args) {
      lastActivity = Date.now();
      return originalSetImmediate.apply(this, args);
    };
    
    setTimeout = function(...args) {
      lastActivity = Date.now();
      return originalSetTimeout.apply(this, args);
    };
    
    // Detect event loop blocking
    setInterval(() => {
      const blocked = Date.now() - lastActivity > 10000;
      if (blocked) {
        console.error('[OpenClaw] WARNING: Event loop appears blocked!');
      }
    }, 5000);
  }
})();
`;

  content = heartbeatCode + '\n' + content;
  fs.writeFileSync(sourcePath, content);

  console.log('[Injector] Patch applied successfully');
  return true;
}

function main() {
  console.log('[Injector] OpenClaw Anti-Freeze Heartbeat Injector');
  console.log('[Injector] Looking for OpenClaw installation...');

  const sourcePath = findOpenClawSource();

  if (!sourcePath) {
    console.error('[Injector] Could not find OpenClaw installation');
    console.error('[Injector] Please ensure OpenClaw is installed globally or locally');
    process.exit(1);
  }

  console.log('[Injector] Found:', sourcePath);

  try {
    injectHeartbeat(sourcePath);
    console.log('[Injector] Done! OpenClaw will now send heartbeats to the watchdog.');
  } catch (e) {
    console.error('[Injector] Failed to patch:', e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { findOpenClawSource, injectHeartbeat };
