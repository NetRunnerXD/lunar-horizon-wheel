"""Precompute per-site terrain horizons (LOLA) and Sun/Earth topocentric az/el (SPICE DE440).
Outputs ../public/data/sites.json and ../public/data/sites/<id>.json"""
import json, os, time
import numpy as np, spiceypy as sp
from dem import load, R, RAW

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

def kernels():
    for k in ["naif0012.tls", "pck00011.tpc", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]:
        sp.furnsh(os.path.join(RAW, k))

def pick_dem(fine, coarse, lat):
    return fine if lat < -85.2 else coarse

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
        dem = pick_dem(fine, coarse, la)
        lat, lon = max_in_disk(dem, la, lo, a * D * 1000, b * D * 1000)
        S.append(dict(id=sid, name=nm, lat=round(float(lat), 4), lon=round(float(lon), 4), kind="derived",
                      note=f"Highest LOLA DEM pixel {a*D:.1f}-{b*D:.1f} km from the gazetteer centre of {GAZ[g][0]}; "
                           "an illustrative candidate, not an official landing site."))
    return S

def cart(lat, lon, r):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], -1)

def enu(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    U = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    E = np.array([-np.sin(lo), np.cos(lo), 0.0])
    N = np.cross(U, E)
    return E, N, U

def horizon(fine, coarse, lat, lon):
    E, N, U = enu(lat, lon)
    near_dem = pick_dem(fine, coarse, lat)
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

def ephem(lat, lon, h0, ets):
    E, N, U = enu(lat, lon)
    obs = cart(lat, lon, (R + h0 + MAST_M) / 1000.0)
    out = {}
    for body in ("SUN", "EARTH"):
        az, el = np.empty(len(ets)), np.empty(len(ets))
        for i, et in enumerate(ets):
            v, _ = sp.spkcpo(body, et, "MOON_ME_DE440_ME421", "OBSERVER", "LT+S", obs, "MOON", "MOON_ME_DE440_ME421")
            v = np.array(v[:3])
            e, n, u = v @ E, v @ N, v @ U
            el[i] = np.degrees(np.arctan2(u, np.hypot(e, n)))
            az[i] = np.degrees(np.arctan2(e, n)) % 360
        out[body] = (az, el)
    return out

def main():
    kernels()
    fine, coarse = load()
    os.makedirs(os.path.join(OUT, "sites"), exist_ok=True)
    et0, et1 = sp.str2et(START), sp.str2et(END)
    ets = np.arange(et0, et1, STEP_H * 3600.0)
    index = []
    for s in sites(fine, coarse):
        t = time.time()
        h0, hz = horizon(fine, coarse, s["lat"], s["lon"])
        hz = np.where(hz < -89, 0.0, hz)
        eph = ephem(s["lat"], s["lon"], h0, ets)
        s.update(elevation_m=round(h0, 1), dem="LDEM_85S_40M + LDEM_75S_240M" if s["lat"] < -85.2 else "LDEM_75S_240M")
        rec = dict(s, start=START + "Z", step_hours=STEP_H, n=len(ets), horizon_step_deg=360 / NBINS,
                   horizon=[round(float(v), 2) for v in hz],
                   sun_az=np.round(eph["SUN"][0] * 100).astype(int).tolist(), sun_el=np.round(eph["SUN"][1] * 100).astype(int).tolist(),
                   earth_az=np.round(eph["EARTH"][0] * 100).astype(int).tolist(), earth_el=np.round(eph["EARTH"][1] * 100).astype(int).tolist())
        json.dump(rec, open(os.path.join(OUT, "sites", s["id"] + ".json"), "w"), separators=(",", ":"))
        index.append(s)
        print(f"{s['id']:24s} lat {s['lat']:.3f} lon {s['lon']:.3f} h {h0:7.0f} m  max hz {hz.max():.2f}  {time.time()-t:.0f}s", flush=True)
    json.dump(dict(generated=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), start=START + "Z", end=END + "Z",
                   step_hours=STEP_H, sites=index), open(os.path.join(OUT, "sites.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
