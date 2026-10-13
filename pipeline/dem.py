"""LOLA polar-stereographic DEM access (PDS LDEM_85S_40M and LDEM_75S_240M)."""
import numpy as np, os
R = 1737400.0
RAW = os.environ.get("LHW_RAW", os.path.join(os.path.dirname(__file__), "..", "..", "raw"))

class DEM:
    def __init__(self, name, n, scale, off):
        self.n, self.scale, self.off = n, scale, off
        self.h = np.memmap(os.path.join(RAW, name), dtype="<i2", mode="r", shape=(n, n))
    def xy_from_ll(self, lat, lon):
        # South polar stereographic (PDS DSMAP_POLAR), sphere R
        rho = 2 * R * np.tan(np.pi / 4 + np.radians(lat) / 2)
        lon = np.radians(lon)
        return rho * np.sin(lon), rho * np.cos(lon)
    def ll_from_xy(self, x, y):
        rho = np.hypot(x, y)
        lat = np.degrees(2 * np.arctan(rho / (2 * R)) - np.pi / 2)
        lon = np.degrees(np.arctan2(x, y))
        return lat, lon
    def rc_from_xy(self, x, y):
        # 1-based: SAMPLE = S0 + x/scale ; LINE = L0 - y/scale (south pole convention)
        col = self.off + x / self.scale - 1
        row = self.off - y / self.scale - 1
        return row, col
    def xy_from_rc(self, row, col):
        return (col + 1 - self.off) * self.scale, (self.off - row - 1) * self.scale
    def height(self, lat, lon):
        r, c = self.rc_from_xy(*self.xy_from_ll(lat, lon))
        return self.h[int(round(r)), int(round(c))] * 0.5

def load():
    return (DEM("ldem_85s_40m.img", 7584, 40.0, 3791.5),
            DEM("ldem_75s_240m.img", 3812, 240.0, 1905.5))
