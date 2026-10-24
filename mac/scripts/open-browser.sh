#!/bin/bash
# Opens Aetheris in Google Chrome, falling back to the default browser.
# Called by "Start Aetheris.command" once the dev server answers.

URL="${1:-http://localhost:5173}"

if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "Google Chrome" "$URL"
elif [ -d "$HOME/Applications/Google Chrome.app" ]; then
  open -a "$HOME/Applications/Google Chrome.app" "$URL"
elif command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$URL" >/dev/null 2>&1 &
else
  open "$URL"
fi
