#!/usr/bin/env bash
# Same as `make all` for systems without make.
set -euo pipefail
cd "$(dirname "$0")/.."
test -x .venv/bin/python || (python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt)
bash pipeline/fetch_data.sh
.venv/bin/python pipeline/precompute.py
.venv/bin/python pipeline/products.py
.venv/bin/python pipeline/validate.py
npm ci && npm test && npm run build
