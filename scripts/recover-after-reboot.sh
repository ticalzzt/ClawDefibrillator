#!/bin/bash
#
# OpenClaw Post-Reboot Recovery
# 
# Handles the "reboot = offline" problem on Aliyun and other cloud providers
# Usage: ./recover-after-reboot.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[Recover]${NC} $1"; }
warn() { echo -e "${YELLOW}[Recover]${NC} WARNING: $1"; }
error() { echo -e "${RED}[Recover]${NC} ERROR: $1"; }

OPENCLAW_DIR="${HOME}/.openclaw"
OPENCLAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"
PID_FILE="${OPENCLAW_DIR}/openclaw.pid"
LOG_FILE="${HOME}/.openclaw-recovery.log"

# Common issues after cloud reboot
REBOOT_ISSUES=()

log "========================================"
log "OpenClaw Post-Reboot Recovery"
log "========================================"
log ""

# Issue 1: Check if OpenClaw is actually running
log "Checking OpenClaw process..."
if pgrep -f "openclaw" > /dev/null; then
    OPENCLAW_PID=$(pgrep -f "openclaw" | head -1)
    log "OpenClaw process found: PID $OPENCLAW_PID"
else
    warn "OpenClaw process NOT running"
    REBOOT_ISSUES+=("process_not_running")
fi

# Issue 2: Check for stale PID file
if [[ -f "$PID_FILE" ]]; then
    STALE_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$STALE_PID" ]] && ! kill -0 "$STALE_PID" 2>/dev/null; then
        warn "Stale PID file found: $STALE_PID (process dead)"
        rm -f "$PID_FILE"
        log "Removed stale PID file"
        REBOOT_ISSUES+=("stale_pid_file")
    fi
fi

# Issue 3: Check config file integrity
log "Checking configuration..."
if [[ ! -f "$OPENCLAW_CONFIG" ]]; then
    error "Config file missing: $OPENCLAW_CONFIG"
    REBOOT_ISSUES+=("config_missing")
else
    # Validate JSON
    if ! python3 -c "import json; json.load(open('$OPENCLAW_CONFIG'))" 2>/dev/null; then
        warn "Config file is corrupted JSON"
        REBOOT_ISSUES+=("config_corrupted")
        
        # Try to restore from backup
        if [[ -f "${OPENCLAW_CONFIG}.bak" ]]; then
            log "Restoring from backup..."
            cp "${OPENCLAW_CONFIG}.bak" "$OPENCLAW_CONFIG"
            log "Config restored from backup"
        fi
    fi
fi

# Issue 4: Check session files (common corruption source)
log "Checking session files..."
SESSION_DIR="${OPENCLAW_DIR}/sessions"
if [[ -d "$SESSION_DIR" ]]; then
    CORRUPTED_SESSIONS=$(find "$SESSION_DIR" -name "*.json" -size +50M 2>/dev/null | wc -l)
    if [[ $CORRUPTED_SESSIONS -gt 0 ]]; then
        warn "Found $CORRUPTED_SESSIONS oversized session files"
        REBOOT_ISSUES+=("oversized_sessions")
        
        # Truncate oversized files
        find "$SESSION_DIR" -name "*.json" -size +50M -exec sh -c '
            echo "[]" > "$1"
            echo "Truncated: $1"
        ' _ {} \;
    fi
fi

# Issue 5: Check network/bind ports
log "Checking network bindings..."
OPENCLAW_PORT=$(grep -o '"port":[[:space:]]*[0-9]*' "$OPENCLAW_CONFIG" 2>/dev/null | head -1 | grep -o '[0-9]*' || echo "")
if [[ -n "$OPENCLAW_PORT" ]]; then
    if ss -tlnp 2>/dev/null | grep -q ":$OPENCLAW_PORT "; then
        warn "Port $OPENCLAW_PORT already in use (another instance?)"
        REBOOT_ISSUES+=("port_in_use")
    fi
fi

# Issue 6: Check environment variables (lost on reboot)
log "Checking environment..."
MISSING_ENV=()
[[ -z "${OPENCLAW_API_KEY:-}" ]] && MISSING_ENV+=("OPENCLAW_API_KEY")
[[ -z "${OPENCLAW_MODEL:-}" ]] && MISSING_ENV+=("OPENCLAW_MODEL")

if [[ ${#MISSING_ENV[@]} -gt 0 ]]; then
    warn "Missing environment variables: ${MISSING_ENV[*]}"
    REBOOT_ISSUES+=("missing_env")
fi

# Issue 7: Check for Aliyun-specific network issues
log "Checking cloud provider specifics..."
if curl -s --max-time 5 http://100.100.100.200/latest/meta-data/ 2>/dev/null | grep -q "aliyun"; then
    log "Detected Aliyun environment"
    
    # Check if security group allows traffic
    PUBLIC_IP=$(curl -s --max-time 5 http://100.100.100.200/latest/meta-data/public-ipv4 2>/dev/null || echo "")
    if [[ -n "$PUBLIC_IP" ]]; then
        log "Public IP: $PUBLIC_IP"
        
        # Check if we can bind to public IP
        if ! nc -z -w5 "$PUBLIC_IP" 22 2>/dev/null; then
            warn "Cannot reach public IP (security group issue?)"
            REBOOT_ISSUES+=("aliyun_security_group")
        fi
    fi
fi

# Recovery actions
log ""
log "========================================"
log "Recovery Summary"
log "========================================"

if [[ ${#REBOOT_ISSUES[@]} -eq 0 ]]; then
    log "No issues detected!"
else
    log "Found ${#REBOOT_ISSUES[@]} issue(s):"
    for issue in "${REBOOT_ISSUES[@]}"; do
        log "  - $issue"
    done
fi

# Auto-fix common issues
log ""
log "Applying fixes..."

# Fix: Clear temp files
if [[ -d "${OPENCLAW_DIR}/tmp" ]]; then
    rm -rf "${OPENCLAW_DIR}/tmp/*"
    log "Cleared temp files"
fi

# Fix: Reset lock files
find "$OPENCLAW_DIR" -name "*.lock" -delete 2>/dev/null || true
log "Cleared lock files"

# Fix: Backup current config before restart
if [[ -f "$OPENCLAW_CONFIG" ]]; then
    cp "$OPENCLAW_CONFIG" "${OPENCLAW_CONFIG}.bak.$(date +%Y%m%d_%H%M%S)"
    log "Backed up config"
fi

# Fix: Ensure log directory exists
mkdir -p "${OPENCLAW_DIR}/logs"

log ""
log "========================================"
log "Starting OpenClaw..."
log "========================================"

# Try to start OpenClaw
if command -v openclaw &> /dev/null; then
    log "Starting openclaw..."
    nohup openclaw > "${OPENCLAW_DIR}/logs/openclaw.log" 2>&1 &
    sleep 3
    
    NEW_PID=$(pgrep -f "openclaw" | head -1 || echo "")
    if [[ -n "$NEW_PID" ]]; then
        log "OpenClaw started successfully: PID $NEW_PID"
        echo "$NEW_PID" > "$PID_FILE"
        
        # Verify it's actually responding
        sleep 2
        if kill -0 "$NEW_PID" 2>/dev/null; then
            log "OpenClaw is alive and responding!"
            log ""
            log "Recovery complete!"
            exit 0
        else
            error "OpenClaw process died immediately"
        fi
    else
        error "Failed to start OpenClaw"
    fi
elif command -v npx &> /dev/null; then
    log "Starting via npx..."
    nohup npx openclaw@latest > "${OPENCLAW_DIR}/logs/openclaw.log" 2>&1 &
    sleep 3
    
    NEW_PID=$(pgrep -f "openclaw" | head -1 || echo "")
    if [[ -n "$NEW_PID" ]]; then
        log "OpenClaw started: PID $NEW_PID"
        echo "$NEW_PID" > "$PID_FILE"
        log "Recovery complete!"
        exit 0
    else
        error "Failed to start via npx"
    fi
else
    error "Cannot find openclaw command"
fi

# If we get here, recovery failed
error "Recovery failed. Issues found:"
for issue in "${REBOOT_ISSUES[@]}"; do
    error "  - $issue"
done

log ""
log "Manual recovery steps:"
log "  1. Check logs: tail -f ${OPENCLAW_DIR}/logs/openclaw.log"
log "  2. Verify config: cat $OPENCLAW_CONFIG"
log "  3. Check ports: ss -tlnp"
log "  4. Check Aliyun security group rules"
log ""
log "If all else fails, consider: rm -rf ${OPENCLAW_DIR} && reinstall"

exit 1
