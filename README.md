# OpenClaw Anti-Freeze Guardian 🛡️

**Prevent OpenClaw from hanging/freezing. No more reinstalling your system.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-18+-green.svg)](https://nodejs.org/)

## The Problem

OpenClaw is a powerful AI coding assistant, but it has a critical flaw: **it can hang indefinitely**, forcing users to reinstall their system or manually kill processes. Common hang scenarios:

- **Session cleanup deadlock** - When session files grow >15MB, `rotateSessionFile` enters an infinite loop
- **Gateway event loop blocking** - Synchronous file I/O blocks the main thread
- **Memory pressure** - Active-Memory and Dreaming features compete for resources
- **Uncaught async errors** - Promise rejections not handled properly
- **Plugin failures** - Misbehaving plugins freeze the entire system

## The Solution

This project implements a **multi-layer defense** against OpenClaw hangs:

| Layer | Mechanism | Recovery |
|-------|-----------|----------|
| **Watchdog** | Process-level heartbeat monitoring | Automatic restart |
| **Timeouts** | Every async operation has a deadline | Cancel & retry |
| **Session Guard** | Prevents session file bloat | Auto-truncate |
| **Plugin Isolation** | Workers for plugin execution | Kill & reload |
| **Memory Guard** | Monitors heap usage | GC & cleanup |

## Quick Start

### Option 1: Bash Wrapper (Recommended)

```bash
# Download
wget https://raw.githubusercontent.com/tical/openclaw-anti-freeze/main/scripts/openclaw-safe.sh
chmod +x openclaw-safe.sh

# Run OpenClaw with protection
./openclaw-safe.sh
```

### Option 2: TypeScript Watchdog

```bash
# Install
npm install -g @tical/openclaw-anti-freeze

# Run
openclaw-watchdog
```

### Option 3: Manual Integration

```typescript
import { OpenClawWatchdog } from '@tical/openclaw-anti-freeze';

const watchdog = new OpenClawWatchdog({
  heartbeatIntervalMs: 5000,
  maxMissedHeartbeats: 3,
  sessionMaxSizeMB: 10
});

watchdog.start();
```

## Configuration

Environment variables:

```bash
WATCHDOG_INTERVAL=5000        # Heartbeat check interval (ms)
WATCHDOG_MISSED=3             # Max missed heartbeats before recovery
WATCHDOG_MAX_SESSION_MB=10    # Max session file size (MB)
GRACEFUL_TIMEOUT=10           # Seconds to wait for graceful shutdown
OPENCLAW_CMD="npx openclaw"   # Command to launch OpenClaw
```

Or create `~/.openclaw/anti-freeze.json`:

```json
{
  "watchdog": {
    "enabled": true,
    "heartbeatIntervalMs": 5000,
    "maxMissedHeartbeats": 3
  },
  "session": {
    "maxFileSizeMB": 10,
    "autoTruncate": true
  },
  "recovery": {
    "autoRestart": true,
    "preserveContext": true
  }
}
```

## How It Works

### Architecture

```
┌─────────────────┐     Heartbeat      ┌─────────────────┐
│   Watchdog      │◄───────────────────│    OpenClaw     │
│   (Parent)      │    every 5s        │   (Child)       │
└────────┬────────┘                     └─────────────────┘
         │
         │ Missed 3 heartbeats
         ▼
┌─────────────────┐
│   Recovery      │
│  1. SIGTERM     │
│  2. SIGKILL     │
│  3. Cleanup     │
│  4. Restart     │
└─────────────────┘
```

### Recovery Levels

1. **Soft** - Cancel pending operations, clear queues
2. **Medium** - Restart gateway, preserve session state
3. **Hard** - Kill process, cleanup files, full restart
4. **Nuclear** - Clear all state (last resort)

## Features

- ✅ **Process Isolation** - OpenClaw runs as child process
- ✅ **Heartbeat Monitoring** - Detects hangs within 15 seconds
- ✅ **Session Protection** - Prevents file bloat that causes hangs
- ✅ **Auto Recovery** - Restarts automatically after hang
- ✅ **Context Preservation** - Keeps last 100 messages after recovery
- ✅ **Zero Config** - Works out of the box
- ✅ **Cross Platform** - Linux, macOS, Windows (WSL)

## Comparison

| Aspect | OpenClaw Default | With Anti-Freeze |
|--------|-----------------|------------------|
| Hang Detection | ❌ None | ✅ 15s timeout |
| Auto Recovery | ❌ Manual reinstall | ✅ Automatic |
| Session Limit | ❌ Unlimited (crashes) | ✅ 10MB limit |
| Plugin Safety | ❌ Shared memory | ✅ Worker isolation |
| Event Loop | ❌ Can block | ✅ Monitored |

## Troubleshooting

### OpenClaw still hangs

Check the logs:
```bash
./openclaw-safe.sh 2>&1 | tee openclaw.log
```

Increase verbosity:
```bash
DEBUG=anti-freeze ./openclaw-safe.sh
```

### Session files keep growing

The watchdog auto-truncates, but you can manually clean:
```bash
rm ~/.openclaw/sessions/*.bak.*
rm ~/.openclaw/sessions/*.tmp
```

### High CPU usage

Adjust the heartbeat interval:
```bash
WATCHDOG_INTERVAL=10000 ./openclaw-safe.sh
```

## Contributing

Contributions welcome! Areas needing help:

- [ ] Windows native support (PowerShell)
- [ ] Plugin isolation via Worker Threads
- [ ] GUI for monitoring/recovery
- [ ] Integration tests

## License

MIT © tiCal zzt

## Acknowledgments

- OpenClaw team for the amazing base project
- Hermes Agent for the robust process model inspiration
- All users who reported hang issues

---

**Made with ❤️ to save you from reinstalling your system.**
