#!/usr/bin/env bash
set -e

# Caveman — skill (rule file) + proxy CLI
if ! command -v caveman >/dev/null 2>&1; then
  echo "Instalando Caveman CLI..."
  npm install -g @caveman-ai/cli
fi
if [ ! -d "$HOME/.claude/skills/caveman" ]; then
  echo "Instalando skill de Caveman..."
  npx -y skills add JuliusBrussee/caveman -g --yes
fi
caveman claude >/dev/null 2>&1 || true   # activa el wrap del proxy, idempotente

# UI/UX Pro Max
if ! command -v uipro >/dev/null 2>&1; then
  echo "Instalando UI/UX Pro Max CLI..."
  npm install -g uipro-cli
fi
if [ ! -f "$HOME/.claude/.uipro-initialized" ]; then
  uipro init --ai claude --global && touch "$HOME/.claude/.uipro-initialized"
fi