#!/bin/bash

set -euo pipefail

SCRIPTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "${SCRIPTS_DIR}"

. ./.env.development.local
export NPM_CONFIG_REGISTRY

[[ " $@ " =~ ' -c ' ]] && rm -rf ./bun.lock ./node_modules

bun update --latest
./modify-files-permissions.sh
