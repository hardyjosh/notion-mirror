#!/bin/bash
# Install notion-mirror skill into OpenClaw workspace

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}/skills/notion-mirror"

mkdir -p "$SKILL_DIR"
cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"

echo "✅ Skill installed to $SKILL_DIR"
echo ""
echo "Next steps:"
echo "  1. Run 'node src/index.js init' to create a config"
echo "  2. Edit ~/.config/notion-mirror/config.json with your API keys"
echo "  3. Run 'node src/index.js sync --full' for first sync"
echo "  4. Add to system cron: */30 * * * * cd $SCRIPT_DIR && node src/index.js sync >> /tmp/notion-mirror.log 2>&1"
