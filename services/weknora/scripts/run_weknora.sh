#!/usr/bin/env bash
set -euo pipefail

cd /srv/oMyTree/services/weknora

test -f ./config/config.yaml

echo "Starting WeKnora..."

if [ -x ./bin/weknora ]; then
	exec ./bin/weknora
fi

if [ -x ./WeKnora ]; then
	exec ./WeKnora
fi

echo "No WeKnora binary found (expected ./bin/weknora or ./WeKnora)" >&2
exit 1
