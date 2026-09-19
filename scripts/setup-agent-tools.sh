#!/usr/bin/env bash
set -e

# Caveman — CLI (launcher)
command -v caveman >/dev/null 2>&1 || npm install -g @caveman-ai/cli

# Caveman — binarios reales (proxy, engine, mcp, etc. — ~170 MB, este es el que faltaba)
[ -f "$HOME/.caveman/bin/caveman-proxy" ] || caveman setup --install

# Caveman — skill (global, se reinstala cada Codespace nuevo)
[ -d "$HOME/.claude/skills/caveman" ] || npx -y skills add JuliusBrussee/caveman -g --yes

# Caveman — hook persistente (NO "caveman claude", eso lanza el agente)
caveman hooks install claude || true

# CodeGraph — el binario
command -v codegraph >/dev/null 2>&1 || npm install -g @colbymchenry/codegraph

# graphify — el binario
command -v graphify >/dev/null 2>&1 || pip install graphifyy --break-system-packages --quiet