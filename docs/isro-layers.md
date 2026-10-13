# ISRO Chandrayaan layers for Lunar Horizon Wheel (2026-10-13)

Output for the integrator: `manifest.json`, `layers/*.geojson`, build script `scripts/build_layers.py` (reads `raw/`). Projection is the same as the app's `pipeline/dem.py` (south polar stereographic, sphere R=1737400 m). Each feature has lon/lat plus `ps_x_m`/`ps_y_m`.

## Layers produced
| Layer | Contents | Licence |
|---|---|---|
| `ch3_sites.geojson` | Shiv Shakti point (69.3733 S, 32.3186 E) with ChaSTE (peak 355±0.5 K on a ~6° sunward slope, 332 K flat, Diviner prediction 330 K), APXS mean ± SD wt% of Si, Ti, Al, Fe, Mn, Mg, Ca, Na, K, Cr, Ni, S (22 obs, ObsID 15 excluded as in the paper), the elements LIBS detected (Al, S, Ca, Fe, Cr, Ti, Mn, Si, O; qualitative), RAMBHA-LP Ne 380–600 cm⁻³ and Te 3000–8000 K. Also the ISRO planned prime-site centre (69.367621 S, 32.348126 E; 4×2.4 km ellipse, orientation not published, so no polygon). | Facts with citations (see manifest) |
| `ch3_surface_temps_near_site.geojson` | 193 temperature points within ~350 m of ChaSTE (Supplementary Data, Durga Prasad et al. 2025). Probably orbital/Diviner comparison values: check the caption before labelling. | CC BY-NC-ND 4.0 |

**Coverage warning:** Shiv Shakti is at 69.37°S, which is outside the app's LOLA 75S and 85S DEMs. Horizon and illumination need a lower-latitude DEM (LOLA LDEM_64S or SLDEM2015). For now, show it as an info layer only.

## Dataset catalog
| Dataset | URL | Format / res | South-pole coverage | Login |
|---|---|---|---|---|
| CH-2 OHRC images & DEM | pradan.issdc.gov.in/ch2 | PDS4 IMG, ~0.25–0.3 m/px | Strip-wise, includes the CH-3 site and some PSRs | **Yes** |
| CH-2 TMC-2 ortho/DEM | pradan.issdc.gov.in/ch2 | PDS4, 5 m/px, DEM ~10 m | Near-global strips | **Yes** |
| CH-2 DFSAR L/S-band polarimetric (CPR) | pradan.issdc.gov.in/ch2 | PDS4 SLC/calibrated, ~2–20 m | Polar campaigns | **Yes** |
| CH-3 APXS/LIBS/ChaSTE/RAMBHA/ILSA L1/L2 | pradan.issdc.gov.in/ch3 | PDS4 | The site only | **Yes** |
| APXS abundances | Nature doi:10.1038/s41586-024-07870-7, Suppl. Data 1 (xlsx) | Table | Site | No (downloaded) |
| ChaSTE temps | Commun. Earth Environ. doi:10.1038/s43247-025-02114-6, Suppl. Data | xlsx | Site | No (downloaded) |
| ISRO press pages | isro.gov.in | HTML | Site | No |

Resolutions in the PRADAN rows come from mission documentation and could not be checked here, because the archive is behind login. Confirm them once logged in.

## Login required (no account created)
Every PRADAN product redirects to the ISSDC Keycloak login (idp.issdc.gov.in, clients `Pradan` for CH-2 and `ch3-pradan` for CH-3). Sounak would need to register one free **ISSDC PRADAN user account** at https://pradan.issdc.gov.in (Sign up: email, name, affiliation, purpose). It covers:
- Chandrayaan-2: OHRC (calibrated images + derived DEM over the Shiv Shakti / south-pole strips), TMC-2 (ortho + DEM), DFSAR (L-band polarimetric, CPR for ice/PSR).
- Chandrayaan-3: Lander (ChaSTE, RAMBHA-LP, ILSA) and Rover (APXS, LIBS) L1/L2 data.
ISSDC terms require acknowledging "ISRO/ISSDC" and generally ask users not to redistribute raw data. Read the terms when registering, before publishing derived PNG/COG overlays.

## Not produced / blockers
- No OHRC, TMC-2 or DFSAR rasters (PNG/COG), because they all need a login.
- No rover traverse or per-stop APXS positions: these are not in the open supplementary data.
- Licences: ISRO web content has no stated open licence (values used factually with attribution). The APXS Nature paper is subscription, so the raw xlsx in `raw/` must not be published, only cited values. ChaSTE data are CC BY-NC-ND.

## Update 2026-10-13: derived PRADAN layers (`layers/pradan/`, about 11 MB)
Raw downloads stay in `raw/pradan/` and are ignored via `.gitignore`. Build with `.venv/bin/python scripts/build_pradan.py && .venv/bin/python scripts/build_ch3.py`. Each layer in `manifest.json` carries the ISRO/ISSDC acknowledgement and a terms note: non-profit scientific use only, no raw redistribution, no selling of derived data.

| File | Size | Notes |
|---|---|---|
| tmc2_dtm_hillshade_100m.png / tmc2_dtm_slope_100m.png / .tif (COG) | 1.7 / 2.4 / 4.7 MB | TMC-2 DTM, 10 m data averaged to 100 m, in app polar stereo. Strip from 87.5°S to 59.9°S, median slope 6.7°, p99 25.9°. |
| ohrc_shiv_shakti_2m.png | 1.7 MB | ~2.6 × 2.7 km around the site, local azimuthal-equidistant projection. **Image taken 2023-05-06, before the landing.** |
| dfsar_L_sigma0_HH_100m.png, dfsar_L_xpol_ratio_100m.png/.tif | 87 / 94 / 143 KB | 3.6 km-wide swath near 84.17°S 33.41°E, in app polar stereo. Median σ0 HH −20.0 dB; cross-pol ratio median −7.9 dB (p5–p95 −13.2 to −5.2). |
| ch3_chaste_timeseries_30min.json | 32 KB | ChaSTE S1–S10, 2023-08-24 to 09-02 UTC; summary and LIBS/APXS inventories attached to the Shiv Shakti feature |

**Horizon at the 69°S site:** the TMC-2 DTM does **not** cover Shiv Shakti. Its polar-stereo y-range (29 to 126 km) is nowhere near the site (338, 534 km). This DTM can't give a horizon there. That needs a DTM covering about 69.4°S 32.3°E out to roughly 100–150 km, such as LOLA LDEM_64S or SLDEM2015, or a TMC-2 DTM ordered for that orbit.

Caveats: DFSAR σ0 calibration assumes DN²/10^(K/10). The ratio is **not** CPR, which needs the complex SLI data (1.2 GB, not processed). ChaSTE values are archive-calibrated without the paper's probe corrections: archive max ~353 K vs the paper's 355 K. The span includes commissioning data. OHRC absolute georeferencing comes from SPICE and can be off by km (arXiv:2602.14993).
