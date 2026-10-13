# Lunar Horizon Wheel 🌗

**Live demo:** https://netrunnerxd.github.io/lunar-horizon-wheel/

A NASA Space Apps 2026 prototype for the **"CLPS Lunar Mission Browser"** challenge. It lets mission planners, educators, and the public compare Moon south-pole landing sites and dates by showing where the **Sun** and **Earth** sit relative to each site's **real terrain horizon**. That tells you how much solar power a site gets and when it can talk directly to Earth.

## What it does (v2, research grade)
- **Horizon wheel** per site: the LOLA terrain silhouette (40 m, with the 240 m-DEM horizon dashed as an uncertainty cue), plus Sun and Earth tracks at a **10-minute step**. Press ▶ to animate.
- **Metrics with error ranges**: sunlit % (finite **limb-darkened** solar disk), longest dark, Earth in view, **DSN contact** (Goldstone/Madrid/Canberra ≥10° *and* Earth above the terrain), Sun + Earth, and a power index. Each range spans time step × Sun-disk model × DEM resolution.
- **Map & custom site**: a south-pole map with NASA Goddard (PGDA/LOLA) average-illumination and Earth-visibility heatmaps and a PSR overlay. Click anywhere (or use the arrow keys + Enter) to analyse a custom point in the browser from a shipped 5 km horizon grid.
- **3D terrain** (Three.js, LOLA 40 m resampled), lit by the real Sun direction at the time cursor, with switchable PGDA/PSR textures.
- **Rank** sites by mission goal (solar power, comms, PSR/ice access, balanced).
- **Power & comms**: battery sizing from the actual light/dark sequence, and an X/S-band link budget with every assumption labelled, giving data rate and data volume over DSN contacts.
- **CLPS mission catalog** (past and planned landers, with sources).
- **ISRO Chandrayaan-3 layers**: Shiv Shakti point as a full site (240 m DEM), ChaSTE/APXS/LIBS/RAMBHA results, and LRO Diviner temperatures near ChaSTE, all attributed.
- **Exports**: PDF report, summary CSV, JSON with all DTE/DSN windows, a 10-minute CSV, and share links (including custom points).
- **Accessible and responsive**: ARIA tabs with arrow-key navigation, keyboard map picker, skip link, focus rings, high-contrast dark theme, reduced-motion support, mobile layout.

## Validation (headline numbers; details in [docs/validation.md](docs/validation.md))
| Check | Result |
|---|---|
| vs NASA GSFC PGDA 18.6-yr avg Sun visibility, 3,721-node grid | bias −0.87 pp, RMSE 4.55 pp, r = 0.955 |
| vs PGDA avg Earth visibility, grid | bias −0.91 pp, RMSE 6.63 pp, r = 0.962 |
| vs PGDA 60 m Sun at sites (best pixel ≤150 m) | bias +1.23 pp, RMSE 3.54 pp, r = 0.997 |
| Geometry vs JPL Horizons (10 epochs) | ≤ 2.3×10⁻⁵° elevation, ≤ 5.6×10⁻⁷° azimuth |
| 10-min interpolation vs direct SPICE | ≤ 1.9×10⁻⁶° |
| TS (browser) vs Python reference, 2027, all sites | < 0.3 pp (enforced in tests) |

Uncertainty is dominated by DEM resolution (up to ~26 pp on steep slopes); time step and Sun-disk model contribute ≤ 0.2 pp.

## Sites
Gazetteer centres of Shackleton, de Gerlache, Haworth, Faustini, Nobile, Shoemaker, Mons Malapert and Mons Mouton; 4 DEM-derived high points (**illustrative, not official landing sites**); and the Chandrayaan-3 Shiv Shakti point. Users can add their own points on the map.

## Data sources (all real, all free)
| Data | Source |
|---|---|
| LOLA DEMs `LDEM_80S_40M`, `LDEM_60S_240M` | NASA PDS Geosciences Node (public domain) |
| Avg. Sun/Earth visibility + PSR maps (`AVGVISIB_*_201608`, `LPSR_65S_240M_201608`) | NASA GSFC PGDA product 69 / LOLA PDS (public domain) |
| DE440 + lunar orientation + frames kernels | NASA JPL NAIF SPICE |
| Geometry check | JPL Horizons API |
| DSN station coordinates (approx.) | DSN 810-005 |
| CLPS catalog | NASA CLPS page, provider pages, NASA statements (Sep 2026) |
| Chandrayaan-3 values | ISRO releases; Durga Prasad et al. 2025 (CC BY-NC-ND 4.0); Vadawale et al. 2024 (cited values); MNRAS 542:2647. LRO Diviner temperatures via Durga Prasad et al. Suppl. Data 1 |

Chandrayaan-2 OHRC/TMC-2/DFSAR and Chandrayaan-3 instrument L1/L2 data need an ISSDC PRADAN login, so they are not included (see `docs/isro-layers.md`).

## Methods
See **[METHODS.md](METHODS.md)** (paper-style write-up with references) and the in-app *Methods & validation* tab.

## Limitations
Line-of-sight geometry only (no scattered light or thermal model). DEM resolution limits near-field horizons (40 m; 240 m-only for Shiv Shakti). Custom sites use 5 km / 2° grid horizons. Derived crest sites are single pixels and fragile (see validation §A). The link budget and power sizing are screening tools with representative assumptions. DSN scheduling is ignored. The CLPS statuses change often.

## AI-use disclosure
This project was built with substantial help from AI assistants: code generation, data-source research, and drafting of the documentation, directed and reviewed by the team. All data comes from the real sources listed above via the reproducible pipeline. No values are AI-generated.

## Run it
```bash
npm ci && npm test && npm run dev        # front end; precomputed data is in public/data
make all                                 # full pipeline (or pipeline/run_all.sh): pinned venv, ~1.3 GB data, ~3 min compute
```
Pipeline: `fetch_data.sh` → `precompute.py` (site horizons) → `products.py` (ephemeris, DSN, grid, terrain, overlays, PSR stats) → `validate.py` (PGDA comparison, interpolation, sensitivity → `docs/validation.md`). Deployment: GitHub Actions → GitHub Pages.
