# OpenClaw Anti-Freeze Guardian 🛡️

**Prevent OpenClaw from hanging/freezing. No more reinstalling your system.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-18+-green.svg)](https://nodejs.org/)
[![CI](https://github.com/ticalzzt/openclaw-anti-freeze/actions/workflows/ci.yml/badge.svg)](https://github.com/ticalzzt/openclaw-anti-freeze/actions)

> 🦞 **OpenClaw** is an amazing AI coding assistant, but it can hang indefinitely. This tool fixes that.

## The Problem

OpenClaw users frequently experience **system-freezing hangs** that require:
- ❌ Manual process killing
- ❌ Session file deletion
- ❌ **Full system reinstall** (worst case)

Common hang scenarios:
- **Session cleanup deadlock** - When session files grow >15MB, `rotateSessionFile` enters an infinite loop ([OpenClaw Issue #73924](https://github.com/openclaw/openclaw/issues/73924))
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

### Option 1: Bash Wrapper (Recommended - Zero Dependencies)

```bash
# Download and run
wget https://raw.githubusercontent.com/ticalzzt/openclaw-anti-freeze/main/scripts/openclaw-safe.sh
chmod +x openclaw-safe.sh
./openclaw-safe.sh
```

### Option 2: Clone and Run

```bash
git clone https://github.com/ticalzzt/openclaw-anti-freeze.git
cd openclaw-anti-freeze
./scripts/openclaw-safe.sh
```

### Option 3: NPM (Coming Soon)

```bash
npm install -g @tical/openclaw-anti-freeze
openclaw-watchdog
```

## How It Works

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

## Configuration

Environment variables:

```bash
WATCHDOG_INTERVAL=5000        # Heartbeat check interval (ms)
WATCHDOG_MISSED=3             # Max missed heartbeats before recovery
WATCHDOG_MAX_SESSION_MB=10    # Max session file size (MB)
GRACEFUL_TIMEOUT=10           # Seconds to wait for graceful shutdown
OPENCLAW_CMD="npx openclaw"   # Command to launch OpenClaw
```

## Recovery Levels

1. **Soft** - Cancel pending operations, clear queues
2. **Medium** - Restart gateway, preserve session state
3. **Hard** - Kill process, cleanup files, full restart
4. **Nuclear** - Clear all state (last resort)

## Comparison

| Aspect | OpenClaw Default | With Anti-Freeze |
|--------|-----------------|------------------|
| Hang Detection | ❌ None | ✅ 15s timeout |
| Auto Recovery | ❌ Manual reinstall | ✅ Automatic |
| Session Limit | ❌ Unlimited (crashes) | ✅ 10MB limit |
| Plugin Safety | ❌ Shared memory | ✅ Worker isolation |
| Event Loop | ❌ Can block | ✅ Monitored |

## Why This Works

Unlike OpenClaw's monolithic design where one stuck operation blocks everything, this tool uses:

- **Process isolation** - OpenClaw runs as a child process
- **Heartbeat monitoring** - Detects hangs within 15 seconds
- **Automatic recovery** - Restarts without manual intervention
- **Context preservation** - Keeps last 100 messages after recovery

## Troubleshooting

### OpenClaw still hangs

Check the logs:
```bash
./openclaw-safe.sh 2>&1 | tee openclaw.log
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

## Related

- [OpenClaw](https://github.com/openclaw/openclaw) - The AI coding assistant this tool protects
- [OpenClaw Issue #73924](https://github.com/openclaw/openclaw/issues/73924) - Session cleanup hang bug

## License

MIT © tiCal zzt

---

**Made with ❤️ to save you from reinstalling your system.**

If this tool saved you time, please ⭐ the repo!
