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

# graphify — el binario (vía pip; "pip" a secas no está en el PATH en Windows
# nativo, sólo "python3 -m pip" — por eso el comando de abajo usa -m)
command -v graphify >/dev/null 2>&1 || python3 -m pip install graphifyy --break-system-packages --quiet

# En Windows nativo, pip deja graphify.exe en la carpeta Scripts de Python, que
# no está en el PATH que ven Git Bash/PowerShell (a diferencia de Codespaces/
# Linux, donde el pip install de arriba ya lo deja usable). Shim en la carpeta
# global de npm, que SÍ está siempre en PATH — ahí ya viven caveman y codegraph.
if ! command -v graphify >/dev/null 2>&1; then
  NPM_GLOBAL="$(npm prefix -g 2>/dev/null)"
  if [ -n "$NPM_GLOBAL" ] && command -v python3 >/dev/null 2>&1; then
    # .cmd — resuelto por PowerShell/cmd.exe.
    printf '@echo off\r\npython -m graphify %%*\r\n' > "$NPM_GLOBAL/graphify.cmd"
    # Sin extensión — el que resuelve Git Bash (mismo patrón que los shims que
    # npm ya deja junto a caveman/codegraph para ese mismo propósito).
    printf '#!/bin/sh\nexec python -m graphify "$@"\n' > "$NPM_GLOBAL/graphify"
    chmod +x "$NPM_GLOBAL/graphify"
  fi
fi