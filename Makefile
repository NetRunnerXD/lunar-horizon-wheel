# Reproducible pipeline: make all   (needs python3, node 20+, ~1.3 GB free disk)
PY ?= .venv/bin/python
RAW ?= ../raw
export LHW_RAW := $(abspath $(RAW))

.PHONY: all venv data sites products validate test build
all: venv data sites products validate test build

venv:
	test -x $(PY) || (python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt)
data:
	LHW_RAW=$(LHW_RAW) bash pipeline/fetch_data.sh
sites:      ## LOLA horizons per site (40 m + 240 m)
	$(PY) pipeline/precompute.py
products:   ## ephemeris, DSN elevations, horizon grid, terrain, overlays
	$(PY) pipeline/products.py
validate:   ## PGDA cross-validation, interpolation check, sensitivity -> docs/validation.md
	$(PY) pipeline/validate.py
test:
	npm ci && npm test
build:
	npm run build
