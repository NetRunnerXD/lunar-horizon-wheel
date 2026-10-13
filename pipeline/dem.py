"""PDS polar-stereographic raster access (LOLA LDEM + LOLA/PGDA illumination products).
All rasters: south polar stereographic, sphere R=1737.4 km, true scale at the pole, 1-based PDS offsets."""
import numpy as np, os
R = 1737400.0
RAW = os.environ.get("LHW_RAW", os.path.join(os.path.dirname(__file__), "..", "..", "raw"))

class Raster:
    def __init__(self, name, n, scale, off, k=1.0, b=0.0):
        self.n, self.scale, self.off, self.k, self.b, self.name = n, scale, off, k, b, name
        self.h = np.memmap(os.path.join(RAW, name), dtype="<i2", mode="r", shape=(n, n))
    @staticmethod
    def xy_from_ll(lat, lon):
        rho = 2 * R * np.tan(np.pi / 4 + np.radians(lat) / 2)
        lon = np.radians(lon)
        return rho * np.sin(lon), rho * np.cos(lon)
    @staticmethod
    def ll_from_xy(x, y):
        rho = np.hypot(x, y)
        return np.degrees(2 * np.arctan(rho / (2 * R)) - np.pi / 2), np.degrees(np.arctan2(x, y))
    def rc_from_xy(self, x, y):
        return self.off - y / self.scale - 1, self.off + x / self.scale - 1
    def xy_from_rc(self, row, col):
        return (col + 1 - self.off) * self.scale, (self.off - row - 1) * self.scale
    def contains(self, x, y):
        r, c = self.rc_from_xy(x, y)
        return (r >= 0) & (c >= 0) & (r <= self.n - 2) & (c <= self.n - 2)
    def nearest(self, x, y):
        r, c = self.rc_from_xy(x, y)
        r = np.clip(np.rint(r).astype(int), 0, self.n - 1); c = np.clip(np.rint(c).astype(int), 0, self.n - 1)
        return self.h[r, c] * self.k + self.b
    def bilinear(self, x, y):
        r, c = self.rc_from_xy(x, y)
        r = np.clip(r, 0, self.n - 1.001); c = np.clip(c, 0, self.n - 1.001)
        r0, c0 = np.floor(r).astype(int), np.floor(c).astype(int)
        fr, fc = r - r0, c - c0
        h = self.h
        v = (h[r0, c0] * (1 - fr) * (1 - fc) + h[r0 + 1, c0] * fr * (1 - fc)
             + h[r0, c0 + 1] * (1 - fr) * fc + h[r0 + 1, c0 + 1] * fr * fc)
        return v * self.k + self.b
    def height(self, lat, lon):
        return float(self.nearest(*self.xy_from_ll(lat, lon)))

def load():
    """(fine 40 m poleward of ~80S, coarse 240 m poleward of ~60S) LOLA LDEMs, heights in metres above 1737.4 km."""
    return (Raster("ldem_80s_40m.img", 15200, 40.0, 7599.5, 0.5),
            Raster("ldem_60s_240m.img", 7760, 240.0, 3879.5, 0.5))

def pgda():
    """LOLA team (PGDA) 2016 average-visibility and PSR products."""
    return dict(sun240=Raster("AVGVISIB_65S_240M_201608.IMG", 6420, 240.0, 3209.5, 4e-5),
                earth240=Raster("AVGVISIB_65S_240M_201608_EARTH.IMG", 6420, 240.0, 3209.5, 4e-5),
                sun60=Raster("AVGVISIB_85S_060M_201608.IMG", 5058, 60.0, 2528.5, 4e-5),
                psr240=Raster("LPSR_65S_240M_201608.IMG", 6420, 240.0, 3209.5, 2.5e-5, 0.5))
