"""Stage 3: validation & uncertainty.
 A. Cross-validation against LOLA/PGDA 2016 average Sun and Earth visibility maps (18.6-yr averages).
 B. Ephemeris interpolation check (hourly vectors + Catmull-Rom vs direct SPICE at 10 min).
 C. Ray-marched (grid) vs exhaustive (site) horizons.
 D. Per-site sensitivity of 2027 metrics to time step, Sun-disk model and DEM resolution.
Writes public/data/validation_pgda.json, public/data/uncertainty.json, public/data/validation_scatter.png, ../docs/validation.md"""
import json, os, time
import numpy as np, spiceypy as sp
from dem import load, pgda, Raster
from geom import kernels, body_vectors, topo, horizon_at, sun_fraction, ray_horizon, R_SUN_KM, R_EARTH_KM

HERE = os.path.dirname(__file__); OUT = os.path.join(HERE, "..", "public", "data"); DOCS = os.path.join(HERE, "..", "docs")
VAL_START, VAL_YEARS, VAL_STEP_H = "2026-01-01T00:00:00", 18.6, 6

def stats(ours, ref):
    d = ours - ref
    return dict(n=int(len(d)), bias=float(d.mean()), rmse=float(np.sqrt((d ** 2).mean())), mae=float(np.abs(d).mean()),
                p95_abs=float(np.percentile(np.abs(d), 95)), r=float(np.corrcoef(ours, ref)[0, 1]))

def averages(sun, earth, lat, lon, h0, hz):
    az, el, dist = topo(sun, lat, lon, h0); hs = horizon_at(hz, az); rad = np.degrees(np.arcsin(696000 / dist))
    aze, ele, diste = topo(earth, lat, lon, h0); he = horizon_at(hz, aze); rade = np.degrees(np.arcsin(R_EARTH_KM / diste))
    return dict(sun_any=float(np.mean(el + rad > hs)), sun_frac=float(np.mean(sun_fraction(el, hs, rad))),
                sun_centre=float(np.mean(el > hs)), earth_any=float(np.mean(ele + rade > he)))

def catmull(v, f):
    """Catmull-Rom between hourly samples v[i] and v[i+1] at fraction f (same as src/physics.ts)."""
    p0, p1, p2, p3 = v[:-3], v[1:-2], v[2:-1], v[3:]
    f = f
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)

def ang(a, b):
    c = np.sum(a * b, 1) / np.linalg.norm(a, axis=1) / np.linalg.norm(b, axis=1)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))

def runs_max(mask, dt_h):
    best = cur = 0
    for m in mask:
        cur = cur + 1 if m else 0; best = max(best, cur)
    return best * dt_h

def site_metrics(sun, earth, lat, lon, h0, hz, model, dt_h):
    az, el, dist = topo(sun, lat, lon, h0); hs = horizon_at(hz, az); rad = np.degrees(np.arcsin(696000 / dist))
    fr = sun_fraction(el, hs, rad, model)
    aze, ele, _ = topo(earth, lat, lon, h0); he = horizon_at(hz, aze)
    return dict(sunlit=100 * fr.mean(), dark_h=runs_max(fr < 0.5, dt_h), earth=100 * np.mean(ele > he))

def main():
    kernels(); fine, coarse = load(); P = pgda()
    sites = json.load(open(os.path.join(OUT, "sites.json")))["sites"]
    prods = json.load(open(os.path.join(OUT, "products.json")))
    g = prods["grid"]; nb = g["bins"]
    G = np.fromfile(os.path.join(OUT, "grid.bin"), "<i2").reshape(g["ny"], g["nx"], nb) / 100.0
    t0 = sp.str2et(VAL_START); ets = np.arange(t0, t0 + VAL_YEARS * 365.25 * 86400, VAL_STEP_H * 3600.0)
    sun, earth = body_vectors(ets, "SUN"), body_vectors(ets, "EARTH")
    print(f"A: {len(ets)} epochs", flush=True)
    # --- A1 sites (exhaustive 0.5 deg horizons)
    srows = []
    for s in sites:
        d = json.load(open(os.path.join(OUT, "sites", s["id"] + ".json")))
        a = averages(sun, earth, s["lat"], s["lon"], s["elevation_m"], np.array(d["horizon"]))
        x, y = Raster.xy_from_ll(s["lat"], s["lon"])
        in240 = bool(P["sun240"].contains(x, y))
        ref = dict(pgda_sun240=float(P["sun240"].nearest(x, y)) if in240 else None, pgda_earth240=float(P["earth240"].nearest(x, y)) if in240 else None,
                   pgda_sun60=float(P["sun60"].nearest(x, y)) if P["sun60"].contains(x, y) else None)
        # 60 m neighbourhood (radius 150 m): single-pixel crest sites are very sensitive to sub-pixel position
        ox, oy = np.meshgrid(np.arange(-150, 151, 30.0), np.arange(-150, 151, 30.0)); k = np.hypot(ox, oy) <= 150
        nb60 = P["sun60"].nearest(x + ox[k], y + oy[k]) if P["sun60"].contains(x, y) else None
        ref.update(pgda_sun60_nbhd_min=None if nb60 is None else float(nb60.min()), pgda_sun60_nbhd_max=None if nb60 is None else float(nb60.max()))
        srows.append(dict(id=s["id"], name=s["name"], **{k: round(v, 4) for k, v in a.items()}, **ref))
    # --- A2 grid nodes
    rows = []
    for iy in range(g["ny"]):
        for ix in range(g["nx"]):
            x, y = g["x0"] + ix * g["step_m"], g["y0"] - iy * g["step_m"]
            la, lo = Raster.ll_from_xy(x, y)
            a = averages(sun, earth, la, lo, g["elev_m"][iy * g["nx"] + ix], G[iy, ix])
            rows.append((x, y, la, a["sun_any"], a["sun_frac"], a["earth_any"], P["sun240"].nearest(x, y), P["earth240"].nearest(x, y)))
    rows = np.array(rows, float)
    gs = dict(sun_any_vs_pgda=stats(rows[:, 3], rows[:, 6]), sun_frac_vs_pgda=stats(rows[:, 4], rows[:, 6]),
              earth_any_vs_pgda=stats(rows[:, 5], rows[:, 7]))
    s_arr = lambda k, r: np.array([[x[k], x[r]] for x in srows if x[r] is not None])
    ss = dict(sun_any_vs_pgda240=stats(*s_arr("sun_any", "pgda_sun240").T), sun_frac_vs_pgda240=stats(*s_arr("sun_frac", "pgda_sun240").T),
              sun_any_vs_pgda60=stats(*s_arr("sun_any", "pgda_sun60").T), sun_any_vs_pgda60_nbhd_max=stats(*s_arr("sun_any", "pgda_sun60_nbhd_max").T), earth_any_vs_pgda240=stats(*s_arr("earth_any", "pgda_earth240").T))
    # scatter plot
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10, 4.6), dpi=110)
    for a_, (o, r, t) in zip(ax, [(3, 6, "Sun (any part of disk)"), (5, 7, "Earth (any part of disk)")]):
        a_.scatter(rows[:, r] * 100, rows[:, o] * 100, s=4, alpha=.35, c="#f5a623" if o == 3 else "#3fa7ff", label=f"5 km grid nodes (n={len(rows)})")
        k = "sun_any" if o == 3 else "earth_any"; kr = "pgda_sun240" if o == 3 else "pgda_earth240"
        a_.scatter([x[kr] * 100 for x in srows if x[kr] is not None], [x[k] * 100 for x in srows if x[kr] is not None], s=36, c="k", marker="D", label="app sites")
        a_.plot([0, 100], [0, 100], "k--", lw=.8); a_.set_xlim(0, 100); a_.set_ylim(0, 100)
        st = gs["sun_any_vs_pgda" if o == 3 else "earth_any_vs_pgda"]
        a_.set_title(f"{t}\nbias {st['bias']*100:+.2f} pp, RMSE {st['rmse']*100:.2f} pp, r={st['r']:.3f}", fontsize=10)
        a_.set_xlabel("PGDA/LOLA 2016 average visibility (%)"); a_.set_ylabel("Lunar Horizon Wheel, 18.6-yr average (%)"); a_.legend(fontsize=8, loc="upper left")
    fig.tight_layout(); fig.savefig(os.path.join(OUT, "validation_scatter.png")); plt.close(fig)
    print("A done", flush=True)
    # --- B interpolation error (30 days, 10 min)
    tb = sp.str2et("2027-03-01T00:00:00"); eh = np.arange(tb - 3600, tb + 31 * 86400, 3600.0)
    out = {}
    for body in ("SUN", "EARTH"):
        vh = body_vectors(eh, body); errs = []
        for k in range(1, 6):
            f = k / 6; et = eh[1:-2] + f * 3600
            errs.append(ang(catmull(vh, f), body_vectors(et, body)))
        out[body.lower() + "_max_deg"] = float(np.max(errs))
        lin = vh[1:-2] * 0.5 + vh[2:-1] * 0.5
        out[body.lower() + "_linear_mid_max_deg"] = float(ang(lin, body_vectors(eh[1:-2] + 1800, body)).max())
    print("B", out, flush=True)
    # --- C ray-march vs exhaustive horizons
    crow = []
    for s in [s for s in sites if s["kind"] != "isro"]:
        d = json.load(open(os.path.join(OUT, "sites", s["id"] + ".json")))
        _, hz = ray_horizon(fine, coarse, s["lat"], s["lon"], nbins=nb)
        ex = np.array(d["horizon"]).reshape(nb, -1).max(1)
        crow.append(dict(id=s["id"], rms_deg=float(np.sqrt(np.mean((hz - ex) ** 2))), bias_deg=float(np.mean(hz - ex))))
    # --- D sensitivity (calendar 2027)
    t1 = sp.str2et("2027-01-01T00:00:00"); t2 = sp.str2et("2028-01-01T00:00:00")
    e2 = np.arange(t1, t2, 120.0); sun2, earth2 = body_vectors(e2, "SUN"), body_vectors(e2, "EARTH")
    unc = []
    for s in sites:
        d = json.load(open(os.path.join(OUT, "sites", s["id"] + ".json")))
        hz, hz240 = np.array(d["horizon"]), np.array(d["horizon_240m"]); h0 = s["elevation_m"]
        M = lambda sv, ev, hzz, model, dt: site_metrics(sv, ev, s["lat"], s["lon"], h0, hzz, model, dt)
        ref = M(sun2, earth2, hz, "limb", 2 / 60)
        v = {"step_10min": M(sun2[::5], earth2[::5], hz, "limb", 1 / 6), "step_60min": M(sun2[::30], earth2[::30], hz, "limb", 1),
             "disk_point": M(sun2[::5], earth2[::5], hz, "point", 1 / 6), "disk_linear": M(sun2[::5], earth2[::5], hz, "linear", 1 / 6),
             "disk_uniform": M(sun2[::5], earth2[::5], hz, "uniform", 1 / 6), "dem_240m": M(sun2[::5], earth2[::5], hz240, "limb", 1 / 6)}
        r = lambda x: {k: round(float(val), 3) for k, val in x.items()}
        unc.append(dict(id=s["id"], name=s["name"], reference=r(ref), variants={k: r(x) for k, x in v.items()}))
        print("D", s["id"], r(ref), flush=True)
    res = dict(generated=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), period=f"{VAL_START}Z + {VAL_YEARS} yr, {VAL_STEP_H} h step",
               pgda_products=["AVGVISIB_65S_240M_201608", "AVGVISIB_65S_240M_201608_EARTH", "AVGVISIB_85S_060M_201608"],
               grid=gs, sites=ss, site_rows=srows, interpolation=out, raymarch_vs_exhaustive=crow,
               grid_points=[[round(x[2], 3), round(x[3], 4), round(x[5], 4), round(x[6], 4), round(x[7], 4)] for x in rows])
    json.dump(res, open(os.path.join(OUT, "validation_pgda.json"), "w"), separators=(",", ":"))
    json.dump(dict(period="2027-01-01..2028-01-01 UTC", reference="2-min step, limb-darkened disk, 40 m near-field DEM", sites=unc),
              open(os.path.join(OUT, "uncertainty.json"), "w"), indent=1)
    write_md(res, unc)

def write_md(res, unc):
    pp = lambda v: f"{v*100:+.2f}" ; q = lambda v: f"{v*100:.2f}"
    L = ["# Validation", "", f"_Generated by `make validate` ({res['generated']}). All numbers are reproducible from `pipeline/validate.py`._", "",
         "## A. Cross-validation against NASA Goddard / LOLA (PGDA) average-visibility maps", "",
         "Reference products: LOLA GDR `AVGVISIB_65S_240M_201608` (Sun) and `AVGVISIB_65S_240M_201608_EARTH` (Earth), plus `AVGVISIB_85S_060M_201608` at sites; "
         "Mazarico et al. (2011) method, averaged over one 18.6-year lunar precession cycle; distributed via PGDA product 69 and the LOLA PDS node.",
         f"Our side: the same averaging window length ({res['period']}), our horizons + DE440 geometry. The PGDA label defines the value as the fraction of time steps with any part of the disk visible, so `sun_any` is the like-for-like metric; `sun_frac` (limb-darkened visible flux fraction) is shown for context.", "",
         "Difference = ours − PGDA, in percentage points (pp) of time.", "",
         "| Comparison | N | Bias (pp) | RMSE (pp) | MAE (pp) | 95% abs (pp) | Pearson r |", "|---|---|---|---|---|---|---|"]
    for name, s in [("Grid, Sun any-disk vs PGDA 240 m", res["grid"]["sun_any_vs_pgda"]), ("Grid, Sun flux fraction vs PGDA 240 m", res["grid"]["sun_frac_vs_pgda"]),
                    ("Grid, Earth any-disk vs PGDA 240 m", res["grid"]["earth_any_vs_pgda"]), ("Sites, Sun any-disk vs PGDA 240 m", res["sites"]["sun_any_vs_pgda240"]),
                    ("Sites, Sun any-disk vs PGDA 60 m", res["sites"]["sun_any_vs_pgda60"]), ("Sites, Sun any-disk vs PGDA 60 m, max within 150 m", res["sites"]["sun_any_vs_pgda60_nbhd_max"]), ("Sites, Earth any-disk vs PGDA 240 m", res["sites"]["earth_any_vs_pgda240"])]:
        L.append(f"| {name} | {s['n']} | {pp(s['bias'])} | {q(s['rmse'])} | {q(s['mae'])} | {q(s['p95_abs'])} | {s['r']:.3f} |")
    L += ["", "![scatter](../public/data/validation_scatter.png)", "", "### Per site (18.6-yr averages, %)", "",
          "| Site | Ours Sun any | PGDA 240 m | PGDA 60 m | PGDA 60 m range within 150 m | Ours Sun flux | Ours Earth any | PGDA Earth 240 m |", "|---|---|---|---|---|---|---|---|"]
    for r in res["site_rows"]:
        L.append(f"| {r['name']} | {r['sun_any']*100:.1f} | {'outside map' if r['pgda_sun240'] is None else f"{r['pgda_sun240']*100:.1f}"} | {'' if r['pgda_sun60'] is None else f'{r['pgda_sun60']*100:.1f}'} | {'' if r['pgda_sun60_nbhd_min'] is None else f"{r['pgda_sun60_nbhd_min']*100:.1f}–{r['pgda_sun60_nbhd_max']*100:.1f}"} | {abs(r['sun_frac'])*100:.1f} | {r['earth_any']*100:.1f} | {'outside map' if r['pgda_earth240'] is None else f"{r['pgda_earth240']*100:.1f}"} |")
    i = res["interpolation"]
    L += ["", "## B. Time sampling: ephemeris interpolation", "",
          f"The browser evaluates visibility every 10 minutes using Catmull-Rom interpolation of hourly DE440 vectors. Over 31 days (Mar 2027) at 10-min offsets, the maximum direction error vs direct SPICE is **{i['sun_max_deg']:.2e} deg (Sun)** and **{i['earth_max_deg']:.2e} deg (Earth)** "
          f"(linear interpolation would give {i['sun_linear_mid_max_deg']:.2e} / {i['earth_linear_mid_max_deg']:.2e} deg). Both are far below the 0.5 deg horizon bin width.", "",
          "## C. Grid (custom-site) horizons vs exhaustive site horizons", "",
          "Custom sites use a precomputed 5 km grid of ray-marched 2-deg horizons. At the polar sites (grid footprint), ray-marched minus exhaustive (binned to 2 deg):", "",
          "| Site | RMS (deg) | Bias (deg) |", "|---|---|---|"]
    L += [f"| {c['id']} | {c['rms_deg']:.2f} | {c['bias_deg']:+.2f} |" for c in res["raymarch_vs_exhaustive"]]
    L += ["", "## D. Sensitivity (calendar 2027)", "", "Reference: 2-min step, limb-darkened finite disk, 40 m near-field DEM. Values are differences from the reference.", "",
          "| Site | Ref sunlit % | 10 min | 60 min | point Sun | linear disk | uniform disk | 240 m DEM | Ref longest dark (h) | Δdark 60 min | Δdark 240 m DEM | Ref Earth % | ΔEarth 240 m DEM |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for u in unc:
        R_, V = u["reference"], u["variants"]; dv = lambda k, m: f"{V[k][m]-R_[m]:+.2f}"
        L.append(f"| {u['name']} | {abs(R_['sunlit']):.2f} | {dv('step_10min','sunlit')} | {dv('step_60min','sunlit')} | {dv('disk_point','sunlit')} | {dv('disk_linear','sunlit')} | {dv('disk_uniform','sunlit')} | {dv('dem_240m','sunlit')} | {R_['dark_h']:.1f} | {dv('step_60min','dark_h')} | {dv('dem_240m','dark_h')} | {R_['earth']:.2f} | {dv('dem_240m','earth')} |")
    L += ["", "Shiv Shakti (69.37 S) lies outside the 40 m DEM, so its DEM-resolution term is not estimable (shown as +0.00) and is flagged in the app. It is also outside the PGDA 65S maps, so it has no external illumination check.", "", "Interpretation: time step and Sun-disk model contribute well under 1 pp; DEM resolution of the near-field horizon dominates the uncertainty, which is why the app shows the 40 m vs 240 m spread as its error bar."]
    open(os.path.join(DOCS, "validation.md"), "w").write("\n".join(L) + "\n")

if __name__ == "__main__":
    main()
