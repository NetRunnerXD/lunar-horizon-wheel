# Lunar Horizon Wheel: methods

*Terrain-resolved Sun and Earth visibility, DSN contact and power screening for lunar south-pole sites, cross-validated against NASA Goddard illumination maps.*

NetRunnerXD team, NASA Space Apps Challenge 2026 ("CLPS Lunar Mission Browser"). Version 2 (research grade), October 2026.

---

## Abstract
We compute when the Sun and the Earth are visible above the real local terrain at candidate lunar south-pole sites for 2026–2028. The inputs are Lunar Reconnaissance Orbiter (LRO) Lunar Orbiter Laser Altimeter (LOLA) digital elevation models and the JPL DE440 planetary ephemeris. Each site gets a 0.5°-resolution terrain horizon from an exhaustive DEM scan out to 400 km. Sun and Earth positions are evaluated every 10 minutes. The Sun is modelled as a finite, limb-darkened disk. From these we derive the illuminated fraction, the longest darkness, direct-to-Earth (DTE) visibility, and Deep Space Network (DSN) contact windows, and the app adds a labelled link-budget and battery-sizing screen.

To validate, we recompute 18.6-year average visibilities on a 3,721-node, 5 km grid and compare them with the LOLA team's published average Sun and Earth visibility maps (NASA GSFC PGDA). Area-wide agreement has a bias of −0.9 percentage points (pp), an RMSE of 4.5 pp and r = 0.955 for the Sun, and a bias of −0.9 pp, an RMSE of 6.6 pp and r = 0.962 for the Earth. At the curated sites, against the best PGDA 60 m pixel within 150 m, the bias is +1.2 pp and the RMSE 3.5 pp. Our geometry matches JPL Horizons to better than 3×10⁻⁵° in elevation. Of the model choices we vary, the resolution of the near-field DEM contributes the most uncertainty. The full numbers are in [docs/validation.md](docs/validation.md).

## 1. Data
| Data | Product | Use | Source / licence |
|---|---|---|---|
| Terrain (near field) | LOLA `LDEM_80S_40M` (40 m/px, polar stereographic, to ~80°S) | horizon within 25 km, terrain mesh, hillshade | NASA PDS Geosciences Node, public domain |
| Terrain (far field) | LOLA `LDEM_60S_240M` (240 m/px, to 60°S) | horizon 25–400 km; whole horizon for Shiv Shakti | same |
| Reference illumination | LOLA GDR `AVGVISIB_65S_240M_201608`, `AVGVISIB_65S_240M_201608_EARTH`, `AVGVISIB_85S_060M_201608` | validation, map and 3D overlays | NASA GSFC PGDA product 69 / LOLA PDS node, public domain |
| Permanent shadow | LOLA `LPSR_65S_240M_201608` | PSR overlay, PSR-distance ranking criterion | same |
| Ephemeris | NAIF `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls` | Sun, Earth, Moon geometry; DSN station frames | NASA JPL NAIF, public |
| Geometry check | JPL Horizons API | independent az/el check | NASA JPL |
| DSN stations | DSS-14, DSS-63, DSS-43 approximate geodetic coordinates | DSN visibility | DSN 810-005, module 301 (approximate) |
| ISRO layers | Chandrayaan-3 site, ChaSTE, APXS, LIBS, RAMBHA-LP values; LRO Diviner temperatures near ChaSTE | info layers | see §8 |

## 2. Terrain horizons
The observer is placed 2 m above the DEM surface. Every DEM pixel within 400 km is converted from polar stereographic coordinates (sphere *R* = 1737.4 km, true scale at the pole) to body-fixed Cartesian coordinates at radius *R* + *h*, so lunar curvature is included exactly. Each pixel is then rotated into the site's east-north-up (ENU) frame. The horizon *H*(α) is the maximum elevation angle among pixels in each 0.5° azimuth bin. Pixels within 25 km come from the 40 m DEM and the rest from the 240 m DEM. For DEM-resolution sensitivity we also store *H*₂₄₀(α), the same scan using the 240 m DEM only. This is the approach of Mazarico et al. (2011), except that we scan exhaustively rather than casting rays.

**Custom sites and the grid.** For in-browser custom sites we ray-march 360 directions × 260 log-spaced samples (60 m–300 km, bilinear DEM interpolation) on a 61 × 61 grid with 5 km spacing (±150 km around the pole), stored in 2° bins. The browser blends the four surrounding horizons bilinearly. Compared with the exhaustive horizons at the sites, the RMS difference is 0.06–1.6° (validation.md §C).

## 3. Ephemeris and time sampling
We take apparent (light time + stellar aberration, `LT+S`) Sun and Earth position vectors relative to the Moon's centre in `MOON_ME_DE440_ME421` from SPICE, sampled every hour from 2026-01-01 to 2029-01-01, and ship them as float32. The browser interpolates them with a Catmull-Rom spline to a **10-minute step** and subtracts the observer's position, which includes Earth's topocentric parallax of up to about 0.26°.

Over 31 days, the interpolation error compared with direct SPICE evaluation at 10-minute offsets is at most 1.9×10⁻⁶° for the Sun and 1.7×10⁻⁶° for the Earth. JPL Horizons spot checks over 10 epochs at 2 sites agree to 5.6×10⁻⁷° in azimuth and 2.3×10⁻⁵° in elevation (`public/data/validation.json`).

## 4. Finite, limb-darkened solar disk
Let *d* = (*e* − *H*(α)) / *r*☉ be the height of the Sun's centre above the local horizon in units of the apparent solar radius *r*☉ = asin(695 700 km / *D*), where *D* is the Sun distance. We treat the horizon as a straight line across the disk, which holds because the disk spans only 0.53°.

- **Uniform disk:** visible fraction *f* = 1 − [acos *d* − *d*√(1 − *d*²)]/π.
- **Limb-darkened disk (default):** *I*(μ)/*I*(1) = 1 − *u*(1 − μ) with *u* = 0.56 at 600 nm (Allen's *Astrophysical Quantities*; Tatum, *Stellar Atmospheres*, ch. 6). The visible flux fraction is the integral of *I* over the part of the disk above the horizon. It is tabulated by numerical strip integration in both Python and TypeScript, and unit tests check symmetry, monotonicity and *f*(0.5) = 0.8225.
- For sensitivity we also run a point Sun (*f* = 1 if *d* > 0) and the linear ramp used in v1.

"Sunlit %" is the time-mean of *f*. "Longest dark" is the longest run with *f* < 0.5. The power index is mean[*f* · cos *e* · (1 AU / *D*)²], which corresponds to a vertical panel tracking the Sun in azimuth.

## 5. Earth visibility and DSN contact
Earth is "in view" when its centre clears *H*(α). This is slightly conservative compared with PGDA's "any part of the disk"; the validation uses PGDA's definition. For DSN contact we take the Moon's elevation as seen from DSS-14 (Goldstone), DSS-63 (Madrid) and DSS-43 (Canberra), with station positions from `georec` on the IAU Earth ellipsoid and the `IAU_EARTH` frame, sampled hourly and interpolated linearly. A contact needs the Earth in view from the site and at least one station with the Moon ≥ 10° above its horizon. We do not model DSN scheduling or antenna availability.

## 6. Link budget (screening only)
*C*/*N*₀ = EIRP − *L* − FSPL + *G*ᵣ − 10 log₁₀ *k* − 10 log₁₀ *T*ₛ, with FSPL = 20 log₁₀(4π*Df*/*c*). The maximum rate is *R* = *C*/*N*₀ − (*E*b/*N*₀)req − margin. The defaults are X band at 8.42 GHz, 10 W, 12 dBi, 3 dB losses, a 34 m BWG dish (68.2 dBi, *T*ₛ = 33 K), 2.5 dB required *E*b/*N*₀ and a 3 dB margin. The DSN receive values are representative, chosen in the spirit of DSN 810-005; they are not quoted specifications. The *D* used is the Earth distance at each 10-minute sample, and data volume is summed over DSN contact. At 384,400 km in X band the free-space loss is 222.6 dB; a unit test checks this.

## 7. Power and battery sizing (screening only)
Panel power is *P* = 1361 W m⁻² (Kopp & Lean 2011) · (1 AU/*D*)² · *f* · cos *e* · *A* · η. The battery starts full; we integrate the net power (with charge efficiency) and take capacity = (largest cumulative deficit) / depth of discharge. Thermal, degradation, dust and pointing losses are excluded.

## 8. ISRO Chandrayaan layers
These come from a separate worker; details are in `docs/isro-layers.md`.
- **Shiv Shakti point** (69.3733°S, 32.3186°E; ISRO) is a full site. Its horizon uses `LDEM_60S_240M` only, because the 40 m DEM does not reach 69°S, so it has no DEM-resolution error term.
- **ChaSTE, APXS, LIBS and RAMBHA-LP** values come from the cited publications (Durga Prasad et al. 2025; Vadawale et al. 2024; ISRO releases; MNRAS 542, 2647). They are shown as an attributed info card.
- **193 temperature points** near ChaSTE are **LRO Diviner (orbital)** values. Durga Prasad et al. (2025) state that absolute temperatures were "derived from Diviner brightness temperatures provided in Supplementary Data 1". They are CC BY-NC-ND 4.0 and shown unmodified.
- Chandrayaan-2 OHRC, TMC-2 and DFSAR rasters and Chandrayaan-3 L1/L2 instrument data need an ISSDC PRADAN account and are **not** included.

## 9. Validation (summary; full tables in docs/validation.md)
**A. PGDA cross-validation.** We average over 18.6 years at a 6-hour step from 2026-01-01, matching the averaging-window length of Mazarico et al.
| Comparison | N | Bias (pp) | RMSE (pp) | r |
|---|---|---|---|---|
| Grid, Sun (any part of disk) vs PGDA 240 m | 3721 | −0.87 | 4.55 | 0.955 |
| Grid, Earth (any part) vs PGDA 240 m | 3721 | −0.91 | 6.63 | 0.962 |
| Sites, Sun vs PGDA 60 m, best pixel ≤150 m | 12 | +1.23 | 3.54 | 0.997 |
| Sites, Earth vs PGDA 240 m | 13 | +0.90 | 3.30 | 0.997 |

Crest sites compared with only the *nearest* PGDA pixel disagree strongly: for the Shackleton rim high point we get 90.0% against 48.2% at 240 m and 6.3% at 60 m. The PGDA 60 m values within 150 m of that point range from 0 to 85.5%. Single-pixel high points are inherently fragile, so app users should treat derived crest sites as illustrative.

**B. Time step.** Moving from a 2-minute to a 10-minute step changes sunlit % by ≤ 0.01 pp; a 60-minute step changes it by ≤ 0.2 pp and changes the longest dark by up to about a day at some sites.
**C. Sun-disk model.** Point, linear, uniform and limb-darkened models agree within 0.2 pp.
**D. DEM resolution.** Using the 240 m horizon instead of 40 m changes sunlit % by up to 26 pp (Mons Malapert centre) and Earth % by up to 19 pp (Malapert summit). This is the dominant uncertainty and is shown in the UI as the error range and the dashed horizon.

## 10. Reproducibility
```
make all            # or: pipeline/run_all.sh
#  venv (pinned pipeline/requirements.txt) -> fetch_data.sh (~1.3 GB) -> precompute.py -> products.py -> validate.py -> npm test -> build
```
Python 3.11–3.13 with `spiceypy==6.0.0`, `numpy==2.1.3`, `matplotlib==3.9.2` and `pillow==11.0.0`; Node 20+. The full run takes about 3 minutes of compute on 8 cores. `pipeline/validate_horizons.py` (needs network) refreshes the JPL Horizons checks. Vitest checks that the TypeScript implementation reproduces the Python reference (2-minute step, direct SPICE) to within 0.3 pp for every site in 2027.

## 11. Limitations
- The model is geometric line of sight only: no scattered light, Earthshine or thermal model.
- Horizons are limited by DEM resolution (40 m near field, 240 m far field). Boulders and sub-pixel crests are missed.
- Derived "high point" sites are single DEM pixels and are illustrative.
- DSN station coordinates are approximate and the `IAU_EARTH` frame is low-precision (adequate for a 10° mask, not for pointing).
- The link budget and power sizing are screening tools with labelled assumptions.
- The CLPS catalog reflects public statements as of mid-September 2026.

## References
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. *Icarus* 211, 1066–1081. doi:10.1016/j.icarus.2010.10.030
- Smith, D. E. et al. (2010). The Lunar Orbiter Laser Altimeter investigation on the Lunar Reconnaissance Orbiter mission. *Space Sci. Rev.* 150, 209–241.
- Park, R. S., Folkner, W. M., Williams, J. G., Boggs, D. H. (2021). The JPL planetary and lunar ephemerides DE440 and DE441. *AJ* 161, 105.
- Acton, C. H. (1996). Ancillary data services of NASA's Navigation and Ancillary Information Facility. *Planet. Space Sci.* 44, 65–70.
- Annex, A. M. et al. (2020). SpiceyPy: a Pythonic wrapper for the SPICE toolkit. *JOSS* 5(46), 2050.
- Cox, A. N. (ed.) (2000). *Allen's Astrophysical Quantities*, 4th ed. Springer. (Solar limb darkening.)
- Tatum, J. B. *Stellar Atmospheres*, ch. 6 (limb darkening), University of Victoria lecture notes.
- Kopp, G., Lean, J. L. (2011). A new, lower value of total solar irradiance. *GRL* 38, L01706.
- Jet Propulsion Laboratory. *DSN Telecommunications Link Design Handbook* 810-005 (modules 101, 104, 301).
- Bussey, D. B. J. et al. (2010). Illumination conditions of the south pole of the Moon derived using Kaguya topography. *Icarus* 208, 558–564.
- Durga Prasad, K. et al. (2025). *Commun. Earth Environ.* 6, doi:10.1038/s43247-025-02114-6 (ChaSTE).
- Vadawale, S. V. et al. (2024). *Nature* 634, doi:10.1038/s41586-024-07870-7 (APXS).
- NASA GSFC PGDA, *Lunar Polar Illumination* (product 69): https://pgda.gsfc.nasa.gov/products/69
