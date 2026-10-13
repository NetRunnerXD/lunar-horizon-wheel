#!/usr/bin/env bash
# Download the real input data (~190 MB) into ../raw (outside the repo by default; override with LHW_RAW).
set -euo pipefail
RAW="${LHW_RAW:-$(dirname "$0")/../../raw}"; mkdir -p "$RAW"; cd "$RAW"
L=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
K=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
for f in ldem_85s_40m.img ldem_85s_40m.lbl ldem_75s_240m.img ldem_75s_240m.lbl; do curl -fsSLO "$L/$f"; done
for f in lsk/naif0012.tls pck/pck00011.tpc spk/planets/de440s.bsp pck/moon_pa_de440_200625.bpc fk/satellites/moon_de440_250416.tf; do curl -fsSLO "$K/$f"; done
ls -la
