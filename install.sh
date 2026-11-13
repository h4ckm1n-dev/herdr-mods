#!/bin/sh
# Install Herdr mods from this repo into your Herdr home.
#   ./install.sh                 pick interactively
#   ./install.sh git help-crew   install these
#   ./install.sh --all           everything but the opt-in dialogs, with the crew layout
#   ./install.sh --update        update what is already installed, nothing new
#   ./install.sh --list          list the mods
#   -y                           answer yes to every question
# Mods are COPIED, not symlinked: Herdr hot-reloads only files under its own home
# (its watcher drops paths outside it). Run --update after a `git pull`; anything
# replaced is saved first under <home>/backup/<time>/.
set -eu
cd "$(dirname "$0")"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
[ -d "$APP" ] || { echo "No Herdr home at $APP (open Herdr once, or set HERDR_APP_HOME)" >&2; exit 1; }

exec python3 -I install.py "$APP" "$@"
