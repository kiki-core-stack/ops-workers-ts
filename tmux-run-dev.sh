#!/bin/bash

set -euo pipefail

SCRIPTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "${SCRIPTS_DIR}"

SESSION_NAME='kiki-core-stack-ops-workers-ts'

if ! tmux ls | grep -q "^${SESSION_NAME}:"; then
    tmux new-session -ds "${SESSION_NAME}"
    tmux send-keys -t "${SESSION_NAME}" 'bun run dev' C-m
fi
