"""Copy ISRO-worker layers (../isro/manifest.json + layers/*) into public/data/layers. Never copies isro/raw."""
import json, os, shutil
HERE = os.path.dirname(__file__); SRC = os.path.join(HERE, "..", "..", "isro"); DST = os.path.join(HERE, "..", "public", "data", "layers")
TITLES = {"ch3_surface_temps_near_site": "LRO Diviner (orbital) temperatures within ~350 m of ChaSTE"}
NOTE = " ISRO/ISSDC data: non-commercial research/education use with acknowledgement 'ISRO/ISSDC'; raw data not redistributed."
m = json.load(open(os.path.join(SRC, "manifest.json"))); os.makedirs(DST, exist_ok=True)
old = {l["id"]: l for l in json.load(open(os.path.join(DST, "manifest.json")))["layers"]} if os.path.exists(os.path.join(DST, "manifest.json")) else {}
out = []
for l in m["layers"]:
    f = l["file"]
    assert not f.startswith("raw") and "/raw/" not in f, f"refusing raw file {f}"
    shutil.copy(os.path.join(SRC, f), os.path.join(DST, os.path.basename(f)))
    o = old.get(l["id"], {})
    kind = "image" if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) else "points"
    out.append(dict(id=l["id"], title=o.get("title") or TITLES.get(l["id"]) or l.get("title") or l["id"], file=os.path.basename(f), kind=kind,
                    caption=l.get("contents") or l.get("caption"), attribution=o.get("attribution") or l.get("attribution", "ISRO/ISSDC"),
                    licence=(o.get("licence") or l.get("licence", "")) + ("" if "ISSDC" not in json.dumps(l) else NOTE)))
json.dump(dict(about="Synced from ../isro by pipeline/sync_isro_layers.py", layers=out), open(os.path.join(DST, "manifest.json"), "w"), indent=1)
print([x["id"] for x in out])
