#!/usr/bin/env sh
set -eu

if command -v compact >/dev/null 2>&1; then
  exec compact "$@"
fi

if [ -n "${COMPACT_BIN:-}" ] && [ -x "$COMPACT_BIN" ]; then
  exec "$COMPACT_BIN" "$@"
fi

default_compact="${HOME}/.local/bin/compact"
if [ -x "$default_compact" ]; then
  exec "$default_compact" "$@"
fi

echo "Compact compiler not found. Install 0.31.1 or set COMPACT_BIN." >&2
exit 127
