# Lunar Horizon Wheel 🌗

**Live demo:** https://netrunnerxd.github.io/lunar-horizon-wheel/

A NASA Space Apps 2026 prototype for the **"CLPS Lunar Mission Browser"** challenge. It lets mission planners, educators, and the public compare Moon south-pole landing sites and dates by showing where the **Sun** and **Earth** sit relative to each site's **real terrain horizon**. That tells you how much solar power a site gets and when it can talk directly to Earth.

## What it does
- **Horizon wheel** per site: a polar sky plot with the LOLA terrain silhouette, the Sun and Earth tracks for the chosen dates (lit or hidden), and their positions at the scrubbed time.
- **Metrics** for any date range: % sunlit (solar-disk fraction), **longest dark stretch** (battery sizing), % Earth in view, **direct-to-Earth (DTE) contact windows**, % with Sun and Earth together, and a relative power proxy.
- **Side-by-side comparison** of 2–4 sites, with the best value per metric highlighted ★.
- **Timeline** (Gantt-style) of sunlight and Earth visibility for all selected sites. Click it to move the time cursor.
- **Date range picker** (2026–2028) with presets (14 d, 1 lunar day, 90 d, 1 yr) and a time scrubber.
- **Export**: summary CSV, JSON with every DTE window, and hourly CSV (az/el, terrain height, visibility). Shareable URLs keep the selected sites and dates.
- **Methods & data** page with the validation table, assumptions, and citations.

12 sites: USGS-Gazetteer centres of Shackleton, de Gerlache, Haworth, Faustini, Nobile, Shoemaker, Mons Malapert, and Mons Mouton (the IM-2 CLPS target region), plus 4 derived high points (Shackleton and de Gerlache rim highs, Malapert and Mouton summits) found from the DEM. Derived sites are illustrative, **not** official landing sites.

## Data sources (all real, all free)
| Data | Source |
|---|---|
| Terrain: LOLA polar DEMs `LDEM_85S_40M` (40 m) and `LDEM_75S_240M` (240 m) | NASA LRO LOLA, PDS Geosciences Node: https://pds-geosciences.wustl.edu/missions/lro/lola.htm |
| Sun/Earth ephemerides: DE440 (`de440s.bsp`), `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc` | NAIF SPICE generic kernels: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ |
| Validation of Sun/Earth az/el | JPL Horizons API: https://ssd.jpl.nasa.gov/api/horizons.api |
| Feature coordinates | USGS Gazetteer of Planetary Nomenclature: https://planetarynames.wr.usgs.gov/ |

## Methods (short; full version on the in-app Methods page)
1. **Sun and Earth positions**: SpiceyPy `spkcpo` from a fixed surface observer (2 m above the LOLA surface) in `MOON_ME_DE440_ME421`, with LT+S aberration. Hourly, 2026-01-01 to 2028-12-31, rotated into local East-North-Up to get azimuth and elevation. **Validated against JPL Horizons: max error 0.005° across 10 checks** (`public/data/validation.json`).
2. **Terrain horizon**: every DEM pixel within 400 km (40 m DEM ≤25 km, 240 m DEM beyond; 240 m only for sites north of 85.2°S) is placed in 3-D on the 1737.4 km sphere plus its height (so curvature is exact). The maximum elevation angle in each 0.5° azimuth bin gives the horizon.
3. **Visibility**: Sun disk fraction = linear approximation across its 0.53° diameter relative to the horizon at its azimuth. Earth is visible when its centre is above the horizon. All metrics are computed in the browser for whatever range you pick.

**Sanity check (2027):** Shackleton rim high point is 86% sunlit (literature: about 80–90%), the Shackleton, Haworth, and Faustini floors are 0% (known permanently shadowed regions), and Mons Malapert keeps Earth in view 100% of the time.

### Approximations and limits
40 m and 240 m terrain (no boulder-scale features), no terrain beyond 400 km, hourly sampling (±1 h), linear Sun-disk model, Earth treated as a point, geometric line-of-sight only (no DSN scheduling or link budget). Not yet cross-validated against PGDA illumination maps. Custom sites need a pipeline rerun.

## Run it
```bash
# front end (precomputed data is already in public/data)
npm ci
npm test         # unit tests + checks on the real data
npm run dev      # http://localhost:5173/lunar-horizon-wheel/
npm run build    # static site in dist/

# regenerate the data (~190 MB download, ~1 min compute)
pip install -r pipeline/requirements.txt
./pipeline/fetch_data.sh                 # into ../raw (set LHW_RAW to change)
python3 pipeline/precompute.py           # writes public/data/
python3 pipeline/validate_horizons.py    # JPL Horizons spot checks
```
Add a site by editing `GAZ` or `derived` in `pipeline/precompute.py`. Deployment: GitHub Actions → GitHub Pages (`.github/workflows/pages.yml`).

Stack: Python (SpiceyPy, NumPy) precompute → static JSON → React + TypeScript + Vite + D3. No backend, no paid services.

## AI-use disclosure
This prototype's code, data pipeline, and documentation were written with the help of AI assistants (Grok Bot agents) directed by the team. All data and numbers come from the NASA/JPL/USGS sources above, processed by the code in this repo. No AI-generated imagery or data is used.

## License
MIT (see `LICENSE`). Input data are NASA/USGS public-domain products. This is not an official NASA product.
