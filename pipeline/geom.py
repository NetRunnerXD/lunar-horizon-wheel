"""Shared geometry: SPICE kernels, frames, finite solar disk with limb darkening, ray-marched horizons.
Mirrors src/physics.ts (keep the two in sync; tests cross-check the tables)."""
import os, numpy as np, spiceypy as sp
from dem import R, RAW, Raster

FRAME = "MOON_ME_DE440_ME421"
R_SUN_KM, R_EARTH_KM = 695700.0, 6371.0          # IAU 2015 nominal solar radius; Earth mean radius
MAST_M = 2.0
# Linear limb darkening I(mu)/I(1) = 1 - u(1-mu), u = 0.56 at 600 nm (Allen's Astrophysical Quantities; Tatum, Stellar Atmospheres ch.6)
LD_U = 0.56

def kernels():
    for k in ["naif0012.tls", "pck00011.tpc", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]:
        sp.furnsh(os.path.join(RAW, k))

def cart(lat, lon, r):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], -1)

def enu(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    U = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    E = np.array([-np.sin(lo), np.cos(lo), 0.0])
    return E, np.cross(U, E), U

def azel(v, E, N, U):
    e, n, u = v @ E, v @ N, v @ U
    return np.degrees(np.arctan2(e, n)) % 360, np.degrees(np.arctan2(u, np.hypot(e, n)))

def body_vectors(ets, body, corr="LT+S"):
    """Apparent position of body w.r.t. Moon centre in the Moon ME frame (km), shape (n,3)."""
    v, _ = sp.spkpos(body, list(ets), FRAME, corr, "MOON")
    return np.asarray(v)

# ---------------- solar disk model ----------------
def _ld_I(mu, u=LD_U):
    return 1 - u * (1 - mu)

def disk_table(n=401, limb=True):
    """Visible flux fraction vs d = (centre elevation - horizon)/angular radius, d in [-1,1].
    Horizon treated as a straight horizontal line across the disk."""
    m = 2000
    y = (np.arange(m) + 0.5) / m * 2 - 1                 # strip centres, disk-radius units
    x = (np.arange(m) + 0.5) / m * 2 - 1
    X, Y = np.meshgrid(x, y)
    r2 = X * X + Y * Y
    inside = r2 < 1
    w = np.where(inside, _ld_I(np.sqrt(np.clip(1 - r2, 0, 1))) if limb else 1.0, 0.0).sum(1)  # flux per strip
    cum = np.concatenate([[0], np.cumsum(w)]) / w.sum()   # flux below y
    yy = np.linspace(-1, 1, m + 1)
    d = np.linspace(-1, 1, n)
    # visible part is y > -d  -> fraction = 1 - cum(-d)
    return d, 1 - np.interp(-d, yy, cum)

def uniform_fraction(d):
    d = np.clip(d, -1, 1)
    return 1 - (np.arccos(d) - d * np.sqrt(1 - d * d)) / np.pi

_LD = disk_table()
def sun_fraction(el, hz, rad, model="limb"):
    d = (np.asarray(el) - hz) / rad
    if model == "point": return (d > 0).astype(float)
    if model == "linear": return np.clip((d + 1) / 2, 0, 1)
    if model == "uniform": return uniform_fraction(d)
    return np.interp(np.clip(d, -1, 1), *_LD)

# ---------------- ray-marched horizon (grid / custom sites / sensitivity) ----------------
def ray_horizon(fine, coarse, lat, lon, nbins=180, ndir=None, rmax=300e3, nstep=260, rmin=None, mast=MAST_M, fine_ok=True):
    """Max terrain elevation angle per true-azimuth bin, by marching rays across the DEM(s).
    Uses the 40 m DEM inside its footprint and the 240 m DEM beyond (or 240 m only if fine_ok=False)."""
    ndir = ndir or nbins * 2
    x0, y0 = Raster.xy_from_ll(lat, lon)
    use_fine = fine_ok and bool(fine.contains(x0, y0))
    base = fine if use_fine else coarse
    h0 = float(base.bilinear(x0, y0))
    E, N, U = enu(lat, lon)
    P = cart(lat, lon, R + h0 + mast)
    rmin = rmin or 1.5 * base.scale
    s = np.geomspace(rmin, rmax, nstep)
    th = np.radians((np.arange(ndir) + 0.5) * 360 / ndir)
    X = x0 + np.sin(th)[:, None] * s[None]; Y = y0 + np.cos(th)[:, None] * s[None]
    h = coarse.bilinear(X, Y)
    if use_fine:
        m = fine.contains(X, Y)
        h = np.where(m, fine.bilinear(X, Y), h)
    la, lo = Raster.ll_from_xy(X, Y)
    Q = cart(la, lo, R + h) - P
    az, el = azel(Q.reshape(-1, 3), E, N, U)
    b = (az / (360 / nbins)).astype(int) % nbins
    hz = np.full(nbins, -90.0); np.maximum.at(hz, b, el)
    # fill any empty bins by circular interpolation
    bad = hz < -89
    if bad.any():
        i = np.arange(nbins); hz[bad] = np.interp(i[bad], i[~bad], hz[~bad], period=nbins)
    return h0, hz

def horizon_at(hz, az):
    n = len(hz); step = 360 / n
    x = (np.asarray(az) % 360) / step - 0.5
    i0 = np.floor(x).astype(int); f = x - i0
    return hz[i0 % n] * (1 - f) + hz[(i0 + 1) % n] * f

def topo(vecs_km, lat, lon, h0, mast=MAST_M):
    """Topocentric az, el, distance from Moon-centred body vectors (parallax included)."""
    E, N, U = enu(lat, lon)
    obs = cart(lat, lon, (R + h0 + mast) / 1000.0)
    v = vecs_km - obs
    az, el = azel(v, E, N, U)
    return az, el, np.linalg.norm(v, axis=1)
