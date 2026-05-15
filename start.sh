#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -f server.pid ] && kill -0 "$(cat server.pid)" 2>/dev/null; then
  exit 0
fi
PORT=${PORT:-8790} nohup node server.js >> server.log 2>&1 &
echo $! > server.pid
