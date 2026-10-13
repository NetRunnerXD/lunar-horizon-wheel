"""Spot-check SPICE Sun/Earth az/el against the JPL Horizons API (geometry only, no terrain)."""
import json, urllib.request, urllib.parse, re, os, sys
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data")
def horizons(body, lon, lat, alt_km, t):
    q = dict(format="json", COMMAND=f"'{body}'", CENTER="'coord@301'", COORD_TYPE="'GEODETIC'",
             SITE_COORD=f"'{lon},{lat},{alt_km}'", MAKE_EPHEM="'YES'", EPHEM_TYPE="'OBSERVER'",
             TLIST=f"'{t}'", QUANTITIES="'4'", ANG_FORMAT="'DEG'", EXTRA_PREC="'YES'", CSV_FORMAT="'YES'")
    r = json.load(urllib.request.urlopen("https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q), timeout=60))["result"]
    row = [c.strip() for c in r.split("$$SOE")[1].split("$$EOE")[0].strip().split(",") if c.strip()]
    return float(row[-2]), float(row[-1])
res = []
for sid, hours in [("shackleton-rim-high", [0, 5000, 12345]), ("mons-malapert", [777, 20000])]:
    d = json.load(open(os.path.join(OUT, "sites", sid + ".json")))
    for h in hours:
        import datetime as dt
        t = (dt.datetime(2026, 1, 1) + dt.timedelta(hours=h)).strftime("%Y-%m-%d %H:%M")
        for body, code, k in [("Sun", "10", "sun"), ("Earth", "399", "earth")]:
            az, el = horizons(code, d["lon"], d["lat"], d["elevation_m"] / 1000 + 0.002, t)
            ours = d[k + "_az"][h] / 100, d[k + "_el"][h] / 100
            daz = (ours[0] - az + 180) % 360 - 180
            res.append(dict(site=sid, utc=t, body=body, horizons_az=az, horizons_el=el, ours_az=ours[0], ours_el=ours[1],
                            d_az=round(daz, 3), d_el=round(ours[1] - el, 3)))
            print(res[-1], flush=True)
json.dump(res, open(os.path.join(OUT, "validation.json"), "w"), indent=1)
