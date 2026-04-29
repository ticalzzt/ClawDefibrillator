# 🚑 ClawDefibrillator

**When OpenClaw flatlines, shock it back to life.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-18+-green.svg)](https://nodejs.org/)

> *"Clear! ⚡ OpenClaw is now stable."*

## The Problem: OpenClaw Cardiac Arrest

OpenClaw is a powerful AI coding assistant, but it suffers from **sudden cardiac arrest**:

- 💔 **Session cleanup deadlock** - `rotateSessionFile` enters infinite loop when session > 15MB
- 💔 **Gateway event loop blocking** - Synchronous I/O blocks the main thread  
- 💔 **Status command flatline** - `openclaw status` hangs indefinitely
- 💔 **Plugin config mismatch** - Plugins in `plugins.allow` don't exist
- 💔 **SSL certificate failure** - Webhooks die silently

**Result:** Users forced to **reinstall their entire system** 💀

## The Solution: Defibrillation

```
     ⚡ CLEAR! ⚡
    
    OpenClaw was:  FLATLINED  →  Now:  STABLE
    
    [████████░░░░░░░░░░]  →  [██████████████████]
          0%                    100%
```

ClawDefibrillator monitors OpenClaw's vital signs and **automatically shocks it back to life** when it hangs.

## Features

| Vital Sign | Monitor | Action |
|-----------|---------|--------|
| 💓 Heartbeat | Process health check | Auto-restart if flatline |
| 🧠 Brain activity | Session file size | Truncate before explosion |
| 🫁 Breathing | Memory pressure | Emergency GC when choking |
| 🩺 Blood pressure | Config validation | Fix before startup crash |

## Quick Start

### One-Liner Install

```bash
curl -fsSL https://raw.githubusercontent.com/ticalzzt/ClawDefibrillator/main/scripts/defib.sh | bash
```

### Manual Install

```bash
git clone https://github.com/ticalzzt/ClawDefibrillator.git
cd ClawDefibrillator
./scripts/defib.sh
```

## How It Works

```
┌─────────────────┐
│  ClawDefibrillator │◄── You are here
│   (Monitoring)   │
└────────┬────────┘
         │
    Monitors every 5s
         │
         ▼
┌─────────────────┐
│    OpenClaw     │
│   (Patient)     │
└─────────────────┘
         │
    Flatlines? (no heartbeat)
         │
         ▼
    ⚡ DEFIBRILLATE ⚡
         │
    1. Kill process
    2. Clean session files
    3. Fix config issues
    4. Restart OpenClaw
         │
         ▼
┌─────────────────┐
│    OpenClaw     │
│  RESUSCITATED   │
└─────────────────┘
```

## Defibrillation Modes

| Mode | Trigger | Action |
|------|---------|--------|
| **CPR** | Missed 1 heartbeat | Log warning |
| **Defib** | Missed 3 heartbeats | Kill & restart |
| **Paddles** | Session > 10MB | Truncate & warn |
| **ICU** | Memory > 95% | Emergency cleanup |

## Configuration

```bash
# Vital signs check interval (ms)
DEFIB_INTERVAL=5000

# Flatline threshold (missed beats)
DEFIB_THRESHOLD=3

# Maximum session size before truncation (MB)
DEFIB_MAX_SESSION_MB=10

# Memory pressure warning (0-1)
DEFIB_MEMORY_WARNING=0.85
```

## Why "Defibrillator"?

Because that's exactly what this does:

- OpenClaw **flatlines** (hangs indefinitely)
- Users typically perform **system reinstall** (extreme measure)
- ClawDefibrillator delivers a **controlled shock** (restart)
- OpenClaw **returns to normal sinus rhythm** (works again)

No more reinstalls. Just **⚡ clear!**

## Comparison

| Scenario | Without Defibrillator | With Defibrillator |
|----------|------------------------|-------------------|
| Session cleanup hang | 😵 Reinstall system | ⚡ Auto-restart |
| Status command stuck | 😵 Force kill manually | ⚡ Detected & fixed |
| Plugin config error | 😵 Debug for hours | ⚡ Auto-corrected |
| Memory explosion | 😵 System unresponsive | ⚡ Emergency GC |

## Technical Details

### Multi-Layer Monitoring

```typescript
// 1. Process Watchdog
const heartbeat = monitorProcess(pid);
if (heartbeat.flatline) defibrillate();

// 2. Session File Guard
if (sessionFile.size > MAX_SIZE) {
  sessionFile.truncate(); // Prevent deadlock
}

// 3. Config Validator
const issues = validateConfig();
if (issues.missingPlugins) {
  config.removeMissingPlugins(); // Prevent startup crash
}

// 4. Memory Pressure Handler
if (memory.usage > CRITICAL) {
  emergencyCleanup(); // Prevent OOM
}
```

## Troubleshooting

### OpenClaw still flatlining?

```bash
# Increase defibrillation intensity
DEFIB_THRESHOLD=2 ./scripts/defib.sh

# Check vitals
./scripts/defib.sh --diagnose
```

### Session files keep growing?

```bash
# Aggressive truncation
DEFIB_MAX_SESSION_MB=5 ./scripts/defib.sh
```

## Contributing

Found a new way OpenClaw can flatline? 

```bash
# Add new vital sign monitor
vim src/monitors/your-monitor.ts

# Submit PR
git commit -m "Add monitor for [new flatline scenario]"
```

## License

MIT © tiCal zzt

---

<p align="center">
  <strong>Keep your OpenClaw alive. ⚡</strong><br>
  <em>No more reinstalls. Just defibrillation.</em>
</p>
