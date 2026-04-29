#!/bin/bash
#
# ClawDefibrillator Auto-Start Installer
# 
# Makes ClawDefibrillator persist across reboots
# Usage: ./install-persistent.sh
#

set -e

DEFIB_DIR="${HOME}/ClawDefibrillator"
DEFIB_SCRIPT="${DEFIB_DIR}/scripts/defib.sh"
SERVICE_NAME="claw-defibrillator"

log() {
    echo "[Defib-Installer] $1"
}

# Check if running as root (we don't want that)
if [[ $EUID -eq 0 ]]; then
   log "ERROR: Do not run as root. Run as the user who runs OpenClaw."
   exit 1
fi

# Check if defib.sh exists
if [[ ! -f "$DEFIB_SCRIPT" ]]; then
    log "ERROR: defib.sh not found at $DEFIB_SCRIPT"
    log "Please clone ClawDefibrillator first:"
    log "  git clone https://github.com/ticalzzt/ClawDefibrillator.git ~/ClawDefibrillator"
    exit 1
fi

log "Installing ClawDefibrillator as persistent service..."

# Create systemd user service directory
mkdir -p "${HOME}/.config/systemd/user"

# Create systemd service file
cat > "${HOME}/.config/systemd/user/${SERVICE_NAME}.service" << EOF
[Unit]
Description=ClawDefibrillator - OpenClaw Defibrillation Service
Documentation=https://github.com/ticalzzt/ClawDefibrillator
After=network.target

[Service]
Type=simple
ExecStart=${DEFIB_SCRIPT}
Restart=always
RestartSec=10
Environment="DEFIB_INTERVAL=5000"
Environment="DEFIB_THRESHOLD=3"
Environment="DEFIB_MAX_SESSION_MB=10"
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

[Install]
WantedBy=default.target
EOF

log "Created systemd user service"

# Create cron backup (in case systemd fails)
log "Setting up cron backup..."
(crontab -l 2>/dev/null || true) | grep -v "defib.sh" > /tmp/crontab.tmp || true
echo "@reboot sleep 30 && ${DEFIB_SCRIPT} >> ${HOME}/.claw-defibrillator.log 2>&1" >> /tmp/crontab.tmp
crontab /tmp/crontab.tmp
rm /tmp/crontab.tmp

log "Added cron backup"

# Enable and start systemd service (if systemd is available)
if command -v systemctl &> /dev/null; then
    log "Enabling systemd service..."
    systemctl --user daemon-reload
    systemctl --user enable "${SERVICE_NAME}.service"
    
    log "Starting ClawDefibrillator..."
    systemctl --user start "${SERVICE_NAME}.service" || {
        log "WARNING: Failed to start via systemd, cron backup is active"
    }
    
    log ""
    log "========================================"
    log "ClawDefibrillator installed successfully!"
    log ""
    log "Commands:"
    log "  systemctl --user status ${SERVICE_NAME}  # Check status"
    log "  systemctl --user stop ${SERVICE_NAME}    # Stop"
    log "  systemctl --user start ${SERVICE_NAME}   # Start"
    log "  systemctl --user restart ${SERVICE_NAME} # Restart"
    log ""
    log "Logs: journalctl --user -u ${SERVICE_NAME} -f"
    log "========================================"
else
    log ""
    log "========================================"
    log "ClawDefibrillator installed (cron mode)!"
    log ""
    log "Systemd not available, using cron."
    log "Service will start on next reboot."
    log ""
    log "To start now: ${DEFIB_SCRIPT}"
    log "Logs: ${HOME}/.claw-defibrillator.log"
    log "========================================"
fi

# Create auto-healing script
cat > "${HOME}/.claw-defib-heal.sh" << 'HEALSCRIPT'
#!/bin/bash
# Auto-healing script - runs if defibrillator itself dies

DEFIB_PID=$(pgrep -f "defib.sh" | head -1)

if [[ -z "$DEFIB_PID" ]]; then
    echo "[$(date)] ClawDefibrillator not running, restarting..."
    ${HOME}/ClawDefibrillator/scripts/defib.sh >> ${HOME}/.claw-defibrillator.log 2>&1 &
fi
HEALSCRIPT

chmod +x "${HOME}/.claw-defib-heal.sh"

# Add healing cron every minute
(crontab -l 2>/dev/null || true) | grep -v "claw-defib-heal" > /tmp/crontab2.tmp || true
echo "* * * * * ${HOME}/.claw-defib-heal.sh >> ${HOME}/.claw-defib-heal.log 2>&1" >> /tmp/crontab2.tmp
crontab /tmp/crontab2.tmp
rm /tmp/crontab2.tmp

log ""
log "Auto-healing enabled (checks every minute)"
log "ClawDefibrillator will survive:"
log "  - System reboots"
log "  - Service crashes"
log "  - Defibrillator itself dying"
log ""
log "Your OpenClaw is now protected 24/7!"
