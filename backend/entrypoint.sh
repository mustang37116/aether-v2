#!/usr/bin/env bash
set -e

# Clean up stale tsx IPC pipes to prevent EADDRINUSE on container restarts
rm -rf /tmp/tsx-* || true

# Start dev watcher
exec npm run dev
