"""Stage 1: per-site terrain horizons from LOLA (exhaustive DEM-pixel scan, 0.5 deg bins) at two DEM resolutions.
Outputs ../public/data/sites.json and ../public/data/sites/<id>.json"""
import json, os, time
import numpy as np, spiceypy as sp
from dem import load, R, RAW, Raster
from geom import kernels, cart, enu, FRAME
import spiceypy as sp

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data")
START, END, STEP_H = "2026-01-01T00:00:00", "2029-01-01T00:00:00", 1
NBINS = 720              # 0.5 deg azimuth bins
MAST_M = 2.0             # observer height above DEM surface
NEAR_KM, FAR_KM = 25.0, 400.0

# name, lat, lon, kind, note   (gazetteer = USGS Gazetteer of Planetary Nomenclature centre coords)
GAZ = {
    "shackleton": ("Shackleton", -89.67, 129.78, 20.92), "de-gerlache": ("de Gerlache", -88.48, -88.34, 32.71),
    "haworth": ("Haworth", -87.45, -5.17, 51.42), "faustini": ("Faustini", -87.18, 84.31, 42.48),
    "nobile": ("Nobile", -85.28, 53.27, 79.27), "mons-malapert": ("Mons Malapert", -85.98, -1.67, 67.0),
    "mons-mouton": ("Mons Mouton", -84.60, 31.00, 130.0), "shoemaker": ("Shoemaker", -88.14, 45.91, 51.82),
}

def pick_dem(fine, coarse, lat, lon=0.0):
    x, y = Raster.xy_from_ll(lat, lon)
    # need the full 25 km near-field inside the fine DEM
    return fine if np.hypot(x, y) < fine.n * fine.scale / 2 - 30e3 else coarse

def max_in_disk(dem, lat, lon, r_in_m, r_out_m):
    x0, y0 = dem.xy_from_ll(lat, lon)
    r0, c0 = dem.rc_from_xy(x0, y0)
    k = int(r_out_m / dem.scale) + 1
    rr, cc = np.mgrid[int(r0) - k:int(r0) + k + 1, int(c0) - k:int(c0) + k + 1]
    x, y = dem.xy_from_rc(rr, cc)
    d = np.hypot(x - x0, y - y0)
    m = (d >= r_in_m) & (d <= r_out_m)
    h = np.where(m, dem.h[rr.clip(0, dem.n - 1), cc.clip(0, dem.n - 1)], -32768)
    i = np.unravel_index(np.argmax(h), h.shape)
    return dem.ll_from_xy(x[i], y[i])

def sites(fine, coarse):
    S = []
    for sid, (nm, la, lo, D) in GAZ.items():
        S.append(dict(id=sid, name=f"{nm} (centre)" if not nm.startswith("Mons") else f"{nm} (gazetteer centre)",
                      lat=la, lon=lo, kind="gazetteer",
                      note=f"USGS Gazetteer centre coordinate of {nm} (diameter {D} km)."))
    derived = [("shackleton-rim-high", "Shackleton rim high point", "shackleton", 0.40, 0.70),
               ("de-gerlache-rim-high", "de Gerlache rim high point", "de-gerlache", 0.40, 0.70),
               ("malapert-summit", "Mons Malapert summit (DEM max)", "mons-malapert", 0.0, 0.25),
               ("mouton-summit", "Mons Mouton summit (DEM max)", "mons-mouton", 0.0, 0.15)]
    for sid, nm, g, a, b in derived:
        _, la, lo, D = GAZ[g]
        dem = pick_dem(fine, coarse, la, lo)
        lat, lon = max_in_disk(dem, la, lo, a * D * 1000, b * D * 1000)
        S.append(dict(id=sid, name=nm, lat=round(float(lat), 4), lon=round(float(lon), 4), kind="derived",
                      note=f"Highest LOLA DEM pixel {a*D:.1f}-{b*D:.1f} km from the gazetteer centre of {GAZ[g][0]}; "
                           "an illustrative candidate, not an official landing site."))
    # ISRO Chandrayaan-3 landing point (Shiv Shakti); coordinates per ISRO (2023) as compiled in ../isro/manifest.json
    S.append(dict(id="shiv-shakti", name="Shiv Shakti point (Chandrayaan-3)", lat=-69.3733, lon=32.3186, kind="isro",
                  note="Chandrayaan-3 Vikram landing point (ISRO). Outside the 40 m DEM: horizon from LOLA LDEM_60S_240M only."))
    return S

def horizon(fine, coarse, lat, lon):
    E, N, U = enu(lat, lon)
    near_dem = pick_dem(fine, coarse, lat, lon)
    h0 = float(near_dem.height(lat, lon))
    P = cart(lat, lon, R + h0 + MAST_M)
    hz = np.full(NBINS, -90.0)
    layers = [(near_dem, 0.0, NEAR_KM * 1e3), (coarse, NEAR_KM * 1e3, FAR_KM * 1e3)] if near_dem is fine \
        else [(coarse, 0.0, FAR_KM * 1e3)]
    for dem, rin, rout in layers:
        x0, y0 = dem.xy_from_ll(lat, lon)
        r0, c0 = dem.rc_from_xy(x0, y0)
        k = int(rout / dem.scale) + 1
        r_lo, r_hi = max(0, int(r0) - k), min(dem.n, int(r0) + k + 1)
        c_lo, c_hi = max(0, int(c0) - k), min(dem.n, int(c0) + k + 1)
        for rs in range(r_lo, r_hi, 400):           # chunk rows
            rr, cc = np.mgrid[rs:min(rs + 400, r_hi), c_lo:c_hi]
            x, y = dem.xy_from_rc(rr, cc)
            d = np.hypot(x - x0, y - y0)
            m = (d > max(rin, 1.5 * dem.scale)) & (d <= rout)
            if not m.any(): continue
            hh = dem.h[rr[m], cc[m]].astype(np.float64) * 0.5
            la_, lo_ = dem.ll_from_xy(x[m], y[m])
            Q = cart(la_, lo_, R + hh) - P
            e, n, u = Q @ E, Q @ N, Q @ U
            el = np.degrees(np.arctan2(u, np.hypot(e, n)))
            az = np.degrees(np.arctan2(e, n)) % 360
            b = (az / (360 / NBINS)).astype(int) % NBINS
            np.maximum.at(hz, b, el)
    return h0, hz


def main():
    fine, coarse = load()
    os.makedirs(os.path.join(OUT, "sites"), exist_ok=True)
    index = []
    for s in sites(fine, coarse):
        t = time.time()
        h0, hz = horizon(fine, coarse, s["lat"], s["lon"])
        _, hzc = horizon(coarse, coarse, s["lat"], s["lon"])     # 240 m-only horizon for DEM-resolution sensitivity
        hz = np.where(hz < -89, 0.0, hz); hzc = np.where(hzc < -89, 0.0, hzc)
        s.update(elevation_m=round(h0, 1), dem="LDEM_80S_40M + LDEM_60S_240M" if pick_dem(fine, coarse, s["lat"], s["lon"]) is fine else "LDEM_60S_240M")
        rec = dict(s, horizon_step_deg=360 / NBINS, mast_m=MAST_M,
                   horizon=[round(float(v), 2) for v in hz], horizon_240m=[round(float(v), 2) for v in hzc])
        json.dump(rec, open(os.path.join(OUT, "sites", s["id"] + ".json"), "w"), separators=(",", ":"))
        index.append(s)
        print(f"{s['id']:24s} lat {s['lat']:.3f} lon {s['lon']:.3f} h {h0:7.0f} m  max hz {hz.max():.2f}  "
              f"rms(40m-240m) {np.sqrt(np.mean((hz-hzc)**2)):.2f} deg  {time.time()-t:.0f}s", flush=True)
    json.dump(dict(generated=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), sites=index),
              open(os.path.join(OUT, "sites.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
