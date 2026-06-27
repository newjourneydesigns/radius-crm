#!/bin/bash
set -e

RADIUS_URL="https://vccradius.netlify.app"
INSTALL_DIR="$HOME/.radius-companion"
LABEL="co.radius.imessage-companion"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PYTHON="$(which python3)"

echo ""
echo "Installing RADIUS iMessage Companion..."

mkdir -p "$INSTALL_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

echo "  Downloading..."
curl -fsSL "$RADIUS_URL/companion/server.py" -o "$INSTALL_DIR/server.py"
chmod +x "$INSTALL_DIR/server.py"

echo "  Setting up auto-start..."
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON</string>
        <string>$INSTALL_DIR/server.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/companion.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/companion.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "  Done! Auto Send is ready in RADIUS."
echo "  The companion will start automatically on every login."
echo ""
