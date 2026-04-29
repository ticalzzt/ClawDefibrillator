#!/bin/bash
#
# OpenClaw Safe Launcher
# 
# Wraps OpenClaw with automatic hang detection and recovery.
# Usage: ./openclaw-safe.sh [openclaw-args...]
#

set -euo pipefail

# Configuration
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-5000}"  # ms
WATCHDOG_MISSED="${WATCHDOG_MISSED:-3}"
MAX_SESSION_MB="${MAX_SESSION_MB:-10}"
GRACEFUL_TIMEOUT="${GRACEFUL_TIMEOUT:-10}"  # seconds
FORCE_TIMEOUT="${FORCE_TIMEOUT:-15}"  # seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[SafeLauncher]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[SafeLauncher]${NC} WARNING: $1"
}

error() {
    echo -e "${RED}[SafeLauncher]${NC} ERROR: $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_CMD="${OPENCLAW_CMD:-npx openclaw@latest}"

# Cleanup function
cleanup_session_files() {
    log "Cleaning up session files..."
    
    local session_dir="${HOME}/.openclaw/sessions"
    if [[ -d "$session_dir" ]]; then
        # Remove backup files
        find "$session_dir" -name "*.bak.*" -delete 2>/dev/null || true
        find "$session_dir" -name "*.tmp" -delete 2>/dev/null || true
        find "$session_dir" -name "*.lock" -delete 2>/dev/null || true
        
        # Truncate oversized session files
        find "$session_dir" -name "*.json" -size +${MAX_SESSION_MB}M | while read -r file; do
            warn "Truncating oversized session file: $file"
            # Keep file but truncate content
            echo '[]' > "$file" 2>/dev/null || true
        done
    fi
}

# Check if OpenClaw is responding
check_heartbeat() {
    local pid=$1
    local last_activity_file="/tmp/openclaw_last_activity_${pid}"
    
    if [[ -f "$last_activity_file" ]]; then
        local last_activity=$(cat "$last_activity_file")
        local now=$(date +%s%N | cut -b1-13)
        local elapsed=$((now - last_activity))
        
        if [[ $elapsed -gt $((WATCHDOG_INTERVAL * WATCHDOG_MISSED)) ]]; then
            return 1  # Not responding
        fi
    fi
    
    return 0  # Responding
}

# Update activity timestamp
update_activity() {
    local pid=$1
    echo "$(date +%s%N | cut -b1-13)" > "/tmp/openclaw_last_activity_${pid}"
}

# Kill process tree
kill_tree() {
    local pid=$1
    local signal=$2
    
    # Get all child processes
    local children=$(pgrep -P "$pid" 2>/dev/null || true)
    
    # Kill children first
    for child in $children; do
        kill_tree "$child" "$signal" 2>/dev/null || true
    done
    
    # Kill the process itself
    kill -"$signal" "$pid" 2>/dev/null || true
}

# Main launcher
launch_with_watchdog() {
    log "Starting OpenClaw with Anti-Freeze protection..."
    log "Watchdog interval: ${WATCHDOG_INTERVAL}ms, Max missed: ${WATCHDOG_MISSED}"
    
    # Cleanup before start
    cleanup_session_files
    
    # Start OpenClaw in background
    log "Launching: $OPENCLAW_CMD $*"
    
    # Create a wrapper that monitors activity
    (
        # Monitor stdout for activity
        exec stdbuf -oL $OPENCLAW_CMD "$@" 2>&1 | while IFS= read -r line; do
            echo "$line"
            # Update activity on any output
            if [[ -n "${OPENCLAW_PID:-}" ]]; then
                update_activity "$OPENCLAW_PID"
            fi
        done
    ) &
    
    OPENCLAW_PID=$!
    log "OpenClaw PID: $OPENCLAW_PID"
    
    # Initialize activity file
    update_activity "$OPENCLAW_PID"
    
    # Watchdog loop
    local missed_heartbeats=0
    
    while kill -0 "$OPENCLAW_PID" 2>/dev/null; do
        sleep $((WATCHDOG_INTERVAL / 1000))
        
        if ! check_heartbeat "$OPENCLAW_PID"; then
            missed_heartbeats=$((missed_heartbeats + 1))
            warn "Missed heartbeat #$missed_heartbeats"
            
            if [[ $missed_heartbeats -ge $WATCHDOG_MISSED ]]; then
                error "Max missed heartbeats reached. Initiating recovery..."
                
                # Try graceful shutdown
                log "Sending SIGTERM..."
                kill_tree "$OPENCLAW_PID" "TERM"
                
                sleep "$GRACEFUL_TIMEOUT"
                
                # Force kill if still running
                if kill -0 "$OPENCLAW_PID" 2>/dev/null; then
                    error "Process still running, sending SIGKILL..."
                    kill_tree "$OPENCLAW_PID" "KILL"
                    sleep 2
                fi
                
                # Cleanup and restart
                cleanup_session_files
                missed_heartbeats=0
                
                log "Restarting OpenClaw..."
                (
                    exec stdbuf -oL $OPENCLAW_CMD "$@" 2>&1 | while IFS= read -r line; do
                        echo "$line"
                        if [[ -n "${OPENCLAW_PID:-}" ]]; then
                            update_activity "$OPENCLAW_PID"
                        fi
                    done
                ) &
                
                OPENCLAW_PID=$!
                update_activity "$OPENCLAW_PID"
                log "New OpenClaw PID: $OPENCLAW_PID"
            fi
        else
            missed_heartbeats=0
        fi
    done
    
    # Wait for process to finish
    wait "$OPENCLAW_PID" 2>/dev/null || true
    local exit_code=$?
    
    log "OpenClaw exited with code $exit_code"
    return $exit_code
}

# Alternative: Use the TypeScript watchdog if available
launch_with_ts_watchdog() {
    local watchdog_script="${SCRIPT_DIR}/watchdog.ts"
    
    if [[ -f "$watchdog_script" ]] && command -v ts-node &>/dev/null; then
        log "Using TypeScript watchdog..."
        
        export WATCHDOG_INTERVAL="$WATCHDOG_INTERVAL"
        export WATCHDOG_MISSED="$WATCHDOG_MISSED"
        export WATCHDOG_MAX_SESSION_MB="$MAX_SESSION_MB"
        export OPENCLAW_CMD="$OPENCLAW_CMD"
        
        ts-node "$watchdog_script"
    else
        # Fall back to bash implementation
        launch_with_watchdog "$@"
    fi
}

# Main
main() {
    log "OpenClaw Safe Launcher v1.0"
    log "Anti-Freeze protection enabled"
    
    # Check dependencies
    if ! command -v pgrep &>/dev/null; then
        error "pgrep is required but not installed"
        exit 1
    fi
    
    # Trap signals
    trap 'log "Received interrupt, shutting down..."; kill_tree "${OPENCLAW_PID:-}" TERM; exit 0' INT TERM
    
    # Launch
    launch_with_watchdog "$@"
}

main "$@"
