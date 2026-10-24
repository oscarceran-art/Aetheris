#!/bin/bash
# Aetheris — double-click launcher for macOS.
# Installs dependencies on the first run, starts the dev server, and opens the
# app in Chrome (or your default browser) once the server is ready.
# Keep this Terminal window open while you use the app; Ctrl+C stops the server.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  [X] Node.js was not found."
  echo "      Install the LTS version from https://nodejs.org, then double-click again."
  echo "      (Using nvm? Start the app with: npm install && npm run dev)"
  echo
  read -r -p "  Press return to close…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo
  echo "  First run — installing dependencies (this takes a minute)…"
  echo
  if ! npm install; then
    echo
    echo "  [X] npm install failed. See the messages above."
    read -r -p "  Press return to close…"
    exit 1
  fi
fi

echo
echo "  Aetheris"
echo "  ----------------------------------------------------------"
echo "  Starting the local server…"
echo "  The browser will open http://localhost:5173 when it is up."
echo
echo "  Keep this window open while you use the app."
echo "  Press Ctrl+C here to stop the server."
echo

# Wait in the background for the app to answer, then open it. The server itself
# runs in the foreground below, so Ctrl+C reaches it directly.
(
  for _ in $(seq 1 900); do
    if curl -fsS -o /dev/null "http://localhost:5173" 2>/dev/null; then
      bash scripts/open-browser.sh "http://localhost:5173"
      exit 0
    fi
    sleep 0.4
  done
) &

npm run dev
status=$?

echo
echo "  Server stopped."
if [ "$status" -ne 0 ]; then
  echo "  (The dev server exited with code $status — see the messages above.)"
fi
read -r -p "  Press return to close…"
