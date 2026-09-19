#!/usr/bin/env bash
set -e

# Caveman — CLI
if ! command -v caveman >/dev/null 2>&1; then
  echo "Instalando Caveman CLI..."
  npm install -g @caveman-ai/cli
fi

# Caveman — skill (rule file, no lanza nada)
if [ ! -d "$HOME/.claude/skills/caveman" ]; then
  echo "Instalando skill de Caveman..."
  npx -y skills add JuliusBrussee/caveman -g --yes
fi

# Caveman — hook de compresión persistente (NO usar "caveman claude", eso LANZA el agente)
caveman hooks install claude || true

# UI/UX Pro Max
if ! command -v uipro >/dev/null 2>&1; then
  echo "Instalando UI/UX Pro Max CLI..."
  npm install -g uipro-cli
fi
if [ ! -f "$HOME/.claude/.uipro-initialized" ]; then
  uipro init --ai claude --global && touch "$HOME/.claude/.uipro-initialized"
fi