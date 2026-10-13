"""Stage 2: global browser products.
  ephem.bin   Float32 [n,6] apparent Sun & Earth position (km) w.r.t. Moon centre, MOON_ME_DE440_ME421, hourly
  dsn.bin     Int16  [n,3] Moon elevation (0.01 deg) at DSS-14 Goldstone, DSS-63 Madrid, DSS-43 Canberra, hourly
  grid.bin    Int16  [ny,nx,180] ray-marched horizon (0.01 deg) on a 5 km polar-stereographic grid (custom sites)
  terrain.bin Int16  [256,256] LOLA heights (m) for the 3D view;  *.png overlays (PGDA illumination / Earth / PSR)
"""
import json, os, sys, time
import numpy as np, spiceypy as sp
from multiprocessing import Pool
from dem import load, pgda, Raster
from geom import kernels, body_vectors, ray_horizon

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data")
START, END = "2026-01-01T00:00:00", "2029-01-01T00:00:00"
# DSN 70 m antennas, approximate geodetic coordinates (DSN Telecommunications Link Design Handbook 810-005, module 301)
DSN = [("DSS-14 Goldstone", 35.4259, -116.8895, 1002.0), ("DSS-63 Madrid", 40.4313, -4.2480, 865.0),
       ("DSS-43 Canberra", -35.4024, 148.9813, 689.0)]
GRID_HALF_KM, GRID_STEP_KM, GRID_BINS = 150, 5, 180
BOX_KM, TER_N, IMG_N = 150, 256, 512

def ephem():
    et0, et1 = sp.str2et(START), sp.str2et(END)
    ets = np.arange(et0, et1, 3600.0)
    sun, earth = body_vectors(ets, "SUN"), body_vectors(ets, "EARTH")
    np.concatenate([sun, earth], 1).astype("<f4").tofile(os.path.join(OUT, "ephem.bin"))
    # DSN: Moon elevation from each station (IAU_EARTH body-fixed frame; adequate to ~0.01 deg for elevation masks)
    _, radii = sp.bodvrd("EARTH", "RADII", 3)
    re, rp = radii[0], radii[2]; f = (re - rp) / re
    els = np.empty((len(ets), 3))
    for j, (_, la, lo, alt) in enumerate(DSN):
        p = np.array(sp.georec(np.radians(lo), np.radians(la), alt / 1000, re, f))
        up = np.array(sp.surfnm(re, re, rp, p))
        for i, et in enumerate(ets):
            v, _ = sp.spkcpo("MOON", et, "IAU_EARTH", "OBSERVER", "LT+S", p, "EARTH", "IAU_EARTH")
            v = np.array(v[:3]); els[i, j] = 90 - np.degrees(np.arccos(v @ up / np.linalg.norm(v)))
    np.round(els * 100).astype("<i2").tofile(os.path.join(OUT, "dsn.bin"))
    return dict(start=START + "Z", step_s=3600, n=len(ets), frame="MOON_ME_DE440_ME421", corr="LT+S",
                stations=[dict(name=n, lat=a, lon=b, alt_m=c) for n, a, b, c in DSN])

_F = None
def _init():
    global _F; _F = load()
def _hz(xy):
    la, lo = Raster.ll_from_xy(*xy)
    h0, hz = ray_horizon(*_F, la, lo, nbins=GRID_BINS)
    return h0, hz

def grid():
    ax = np.arange(-GRID_HALF_KM, GRID_HALF_KM + 1e-9, GRID_STEP_KM) * 1e3
    pts = [(x, y) for y in ax[::-1] for x in ax]
    t = time.time()
    with Pool(os.cpu_count(), initializer=_init) as p:
        res = p.map(_hz, pts, chunksize=16)
    h0 = np.array([r[0] for r in res]); hz = np.array([r[1] for r in res])
    np.round(hz * 100).astype("<i2").tofile(os.path.join(OUT, "grid.bin"))
    print(f"grid {len(pts)} nodes in {time.time()-t:.0f}s", flush=True)
    return dict(nx=len(ax), ny=len(ax), x0=float(ax[0]), y0=float(ax[-1]), step_m=GRID_STEP_KM * 1e3, bins=GRID_BINS,
                note="Row 0 is the northernmost map row (y = y0); x increases with column. Polar stereographic, R=1737.4 km.",
                elev_m=[round(float(v), 1) for v in h0])

def resample(r, n, half_km, how="bilinear"):
    ax = (np.arange(n) + 0.5) / n * 2 * half_km * 1e3 - half_km * 1e3
    X, Y = np.meshgrid(ax, ax[::-1])
    return r.bilinear(X, Y) if how == "bilinear" else r.nearest(X, Y)

def overlays():
    from PIL import Image
    import matplotlib; matplotlib.use("Agg"); from matplotlib import cm
    fine, coarse = load(); P = pgda()
    h = resample(fine, TER_N, BOX_KM)
    np.round(h).astype("<i2").tofile(os.path.join(OUT, "terrain.bin"))
    def png(a, cmap, name, alpha=None):
        rgba = (cm.get_cmap(cmap)(np.clip(a, 0, 1)) * 255).astype(np.uint8)
        if alpha is not None: rgba[..., 3] = (alpha * 255).astype(np.uint8)
        Image.fromarray(rgba).save(os.path.join(OUT, name), optimize=True)
    sun = resample(P["sun240"], IMG_N, BOX_KM, "nearest"); png(sun, "inferno", "pgda_sun.png")
    earth = resample(P["earth240"], IMG_N, BOX_KM, "nearest"); png(earth, "viridis", "pgda_earth.png")
    psr = resample(P["psr240"], IMG_N, BOX_KM, "nearest") > 0.5
    rgba = np.zeros((IMG_N, IMG_N, 4), np.uint8); rgba[psr] = (80, 170, 255, 210)
    Image.fromarray(rgba).save(os.path.join(OUT, "psr.png"), optimize=True)
    # hillshade base
    gy, gx = np.gradient(resample(fine, IMG_N, BOX_KM), 2 * BOX_KM * 1e3 / IMG_N)
    shade = np.clip(0.5 + (-gx * 0.6 + gy * 0.6) / np.hypot(1, np.hypot(gx, gy)), 0, 1)
    Image.fromarray((shade * 255).astype(np.uint8)).save(os.path.join(OUT, "hillshade.png"), optimize=True)
    return dict(half_km=BOX_KM, terrain_n=TER_N, img_n=IMG_N, h_min=float(h.min()), h_max=float(h.max()),
                psr_area_km2_in_box=float(psr.mean() * (2 * BOX_KM) ** 2))

def site_psr():
    """Distance from each site to the nearest PSR pixel and PSR area within 10 km (LOLA LPSR_65S_240M_201608)."""
    psr = pgda()["psr240"]; out = {}
    for s in json.load(open(os.path.join(OUT, "sites.json")))["sites"]:
        x, y = Raster.xy_from_ll(s["lat"], s["lon"])
        if not psr.contains(x, y): out[s["id"]] = dict(nearest_psr_km=None, psr_km2_within_10km=None); continue
        ax = np.arange(-30e3, 30e3 + 1, 240.0); X, Y = np.meshgrid(ax, ax); d = np.hypot(X, Y)
        m = psr.nearest(x + X, y + Y) > 0.5
        out[s["id"]] = dict(nearest_psr_km=round(float(d[m].min() / 1e3), 2) if m.any() else None,
                            psr_km2_within_10km=round(float((m & (d <= 10e3)).sum() * 0.0576), 1))
    return out

if __name__ == "__main__":
    kernels(); os.makedirs(OUT, exist_ok=True)
    meta_p = os.path.join(OUT, "products.json")
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    want = sys.argv[1:] or ["ephem", "overlays", "grid", "psr"]
    if "ephem" in want: meta["ephem"] = ephem(); print("ephem done", flush=True)
    if "overlays" in want: meta["overlays"] = overlays(); print("overlays done", flush=True)
    if "grid" in want: meta["grid"] = grid()
    if "psr" in want or not sys.argv[1:]: meta["site_psr"] = site_psr(); print("psr done", flush=True)
    json.dump(meta, open(meta_p, "w"), indent=1)
