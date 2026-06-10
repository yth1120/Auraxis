#!/usr/bin/env bash
# Auraxis macOS native sandbox — Seatbelt via sandbox-exec.
#
# Project root read-only, scratch write directory writable, network denied.
# Fails closed when sandbox-exec is unavailable (removed on newer macOS).
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

if ! command -v sandbox-exec >/dev/null 2>&1; then
  echo "SANDBOX_LAUNCH_ERROR: sandbox-exec not found (not available on this macOS version)" >&2
  exit 126
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "SANDBOX_LAUNCH_ERROR: python3 required to parse argv" >&2
  exit 126
fi

mkdir -p "$write_dir"

# Parse argv (NUL-delimited; bash 3.2 compatible — no mapfile).
IFS=$'\n' read -r -d '' -a args < <(python3 -c 'import json,sys; print("\0".join(json.loads(sys.argv[1])))' "$argv_json" && printf '\0')

quoted=""
for a in "${args[@]}"; do
  quoted="$quoted $(printf '%q' "$a")"
done

WRITE_ROOT_LINE=""
if [ "$mode" = "workspace-write" ]; then
  WRITE_ROOT_LINE="(allow file-write* (subpath \"$project_root\"))"
fi

PROFILE="(version 1)
(deny default)
(import \"system.sb\")
(allow file-read* (subpath \"$project_root\"))
(allow file-read* (subpath \"$write_dir\"))
(allow file-write* (subpath \"$write_dir\"))
$WRITE_ROOT_LINE
(deny network*)"

cd "$cwd"
exec sandbox-exec -p "$PROFILE" /bin/bash -c "$quoted"
