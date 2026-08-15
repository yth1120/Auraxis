#!/usr/bin/env bash
# Auraxis Linux native sandbox — bubblewrap backend.
#
# Semantics match the Windows AppContainer launcher: project root read-only,
# a scratch write directory fully writable, no network, no other namespaces.
# Fails closed with SANDBOX_LAUNCH_ERROR when bwrap is missing or user
# namespaces are unavailable.
set -euo pipefail

argv_json=""
cwd=""
project_root=""
write_dir=""
mode="read"

while [ $# -gt 0 ]; do
  case "$1" in
    --argv-json) argv_json="$2"; shift 2 ;;
    --cwd) cwd="$2"; shift 2 ;;
    --project-root) project_root="$2"; shift 2 ;;
    --write-dir) write_dir="$2"; shift 2 ;;
    --mode) mode="$2"; shift 2 ;;
    *) echo "SANDBOX_LAUNCH_ERROR: unknown arg $1" >&2; exit 126 ;;
  esac
done

if [ -z "$argv_json" ] || [ -z "$cwd" ] || [ -z "$write_dir" ]; then
  echo "SANDBOX_LAUNCH_ERROR: missing required args" >&2
  exit 126
fi

if [ "$mode" != "read" ] && [ "$mode" != "workspace-write" ]; then
  echo "SANDBOX_LAUNCH_ERROR: invalid mode $mode" >&2
  exit 126
fi

BWRAP="$(command -v bwrap || true)"
if [ -z "$BWRAP" ]; then
  echo "SANDBOX_LAUNCH_ERROR: bubblewrap (bwrap) not found — install bwrap or enable unprivileged user namespaces" >&2
  exit 126
fi

mkdir -p "$write_dir"

# Decode the JSON argv into a bash array.
if command -v python3 >/dev/null 2>&1; then
  mapfile -t args < <(python3 -c 'import json,sys; print("\n".join(json.loads(sys.argv[1])))' "$argv_json")
elif command -v node >/dev/null 2>&1; then
  mapfile -t args < <(node -e 'const a=JSON.parse(process.argv[1]); process.stdout.write(a.join("\n"))' "$argv_json")
else
  echo "SANDBOX_LAUNCH_ERROR: need python3 or node to parse argv" >&2
  exit 126
fi

if [ "$mode" = "workspace-write" ]; then
  exec "$BWRAP" \
  --die-with-parent \
  --unshare-all \
  --new-session \
  --ro-bind / / \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --bind "$write_dir" "$write_dir" \
  --bind "$project_root" "$project_root" \
  --chdir "$cwd" \
  --set-env TEMP "$write_dir" \
  --set-env TMP "$write_dir" \
  -- "${args[@]}"
fi

exec "$BWRAP" \
  --die-with-parent \
  --unshare-all \
  --new-session \
  --ro-bind / / \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --bind "$write_dir" "$write_dir" \
  --chdir "$cwd" \
  --set-env TEMP "$write_dir" \
  --set-env TMP "$write_dir" \
  -- "${args[@]}"
