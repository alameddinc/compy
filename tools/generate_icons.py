#!/usr/bin/env python3
"""Generate WebNotes PNG icons (no external deps). Indigo rounded tile with
text lines + a yellow highlighter stroke."""
import struct, zlib, os

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "icons")

def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def over(dst, src, a):
    return tuple(round(src[i] * a + dst[i] * (1 - a)) for i in range(3))

def rounded_alpha(x, y, w, h, r):
    # anti-aliased coverage for a rounded rect
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx = x - cx; dy = y - cy
    dist = (dx * dx + dy * dy) ** 0.5
    edge = r - dist
    if x < r or x > w - r or y < r or y > h - r:
        return max(0.0, min(1.0, edge + 0.5))
    return 1.0

def bar(px, py, x0, x1, y0, y1, rad):
    if x0 - rad <= px <= x1 + rad and y0 <= py <= y1:
        if px < x0: return max(0.0, 1 - (x0 - px) / rad)
        if px > x1: return max(0.0, 1 - (px - x1) / rad)
        return 1.0
    return 0.0

def gen(size):
    W = H = size
    INDIGO_T = (0x6a, 0x63, 0xf5)
    INDIGO_B = (0x8b, 0x5c, 0xf6)
    YELLOW = (0xfd, 0xe6, 0x8a)
    WHITE = (0xff, 0xff, 0xff)
    r = size * 0.22
    px_bytes = bytearray()
    for y in range(H):
        row = bytearray([0])  # filter type 0
        for x in range(W):
            fx, fy = x + 0.5, y + 0.5
            cov = rounded_alpha(fx, fy, W, H, r)
            if cov <= 0:
                row += bytes([0, 0, 0, 0]); continue
            base = lerp(INDIGO_T, INDIGO_B, fy / H)
            col = base
            # three text lines
            line_x0, line_x1 = W * 0.26, W * 0.74
            th = H * 0.055
            for i, ly in enumerate((0.34, 0.5, 0.66)):
                yc = H * ly
                if i == 1:
                    continue  # middle handled by highlight
                a = bar(fx, fy, line_x0, W * 0.66, yc - th, yc + th, th)
                if a > 0:
                    col = over(col, WHITE, a * 0.85)
            # yellow highlighter stroke (middle, wider)
            yc = H * 0.5
            hy = H * 0.085
            a = bar(fx, fy, W * 0.24, W * 0.78, yc - hy, yc + hy, hy)
            if a > 0:
                col = over(col, YELLOW, a * 0.92)
                a2 = bar(fx, fy, W * 0.30, W * 0.60, yc - hy * 0.5, yc + hy * 0.5, hy)
                if a2 > 0:
                    col = over(col, (0x78, 0x35, 0x0f), a2 * 0.55)
            row += bytes([col[0], col[1], col[2], round(255 * cov)])
        px_bytes += row
    raw = zlib.compress(bytes(px_bytes), 9)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    path = os.path.join(OUT, f"icon{size}.png")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (16, 32, 48, 128):
        gen(s)
