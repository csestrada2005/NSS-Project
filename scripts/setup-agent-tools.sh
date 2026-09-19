#!/usr/bin/env bash
set -e

# Caveman — CLI
command -v caveman >/dev/null 2>&1 || npm install -g @caveman-ai/cli

# Caveman — skill (global, se reinstala cada Codespace nuevo)
[ -d "$HOME/.claude/skills/caveman" ] || npx -y skills add JuliusBrussee/caveman -g --yes

# Caveman — hook persistente (NO "caveman claude", eso lanza el agente)
caveman hooks install claude || true

# CodeGraph — el binario, la config ya vive en el repo
command -v codegraph >/dev/null 2>&1 || npm install -g @colbymchenry/codegraph

# graphify — el binario, necesita --break-system-packages en Debian/Ubuntu (base de Codespaces)
command -v graphify >/dev/null 2>&1 || pip install graphifyy --break-system-packages --quiet