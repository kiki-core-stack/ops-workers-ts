#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

. ./.env.development.local
export NPM_CONFIG_REGISTRY

[[ " $@ " =~ ' -c ' ]] && rm -rf ./bun.lock ./node_modules

bun update --latest
./modify-files-permissions.sh
