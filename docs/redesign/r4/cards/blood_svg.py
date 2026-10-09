"""Generate the woodblock blood shapes for the samurai's wrong-answer cut (D4) as inline SVG data URIs.

Flat colour, crisp edges: one splat where the blade cut, a tapered ribbon that breaks into teardrops
along one curve (the blade's flick), late drops that fall to the ground line, a flat pool on that line,
and torn-edge stains for the paper scraps. Prints CSS custom properties to paste into guided-moments.css.
"""
import math
import random
import sys
import urllib.parse

BLOOD = '#9b1422'
DEEP = '#5c0911'
STAIN = '#8e1220'


def f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.') if abs(x) >= 0.05 else '0'


def teardrop(x, y, r, angle_deg, tail=2.6, fill=BLOOD):
    """head of radius r at (x, y), travelling along angle_deg; the tail trails behind it, concave sides"""
    L = tail * r
    a = math.acos(1 / tail)
    tx, ty = math.cos(math.pi - a) * r, math.sin(math.pi - a) * r
    d = (f'M{f(-L)} 0Q{f(-0.95 * r)} {f(-0.5 * r)} {f(tx)} {f(-ty)}'
         f'A{f(r)} {f(r)} 0 1 1 {f(tx)} {f(ty)}Q{f(-0.95 * r)} {f(0.5 * r)} {f(-L)} 0Z')
    return f'<path fill="{fill}" transform="translate({f(x)} {f(y)}) rotate({f(angle_deg)})" d="{d}"/>'


def blob(cx, cy, radii, rot=0.0, sx=1.0, sy=1.0):
    """a closed smooth outline through points at the given radii, evenly spaced in angle (Catmull-Rom)"""
    n = len(radii)
    pts = []
    for i, r in enumerate(radii):
        t = rot + 2 * math.pi * i / n
        pts.append((cx + math.cos(t) * r * sx, cy + math.sin(t) * r * sy))
    d = [f'M{f(pts[0][0])} {f(pts[0][1])}']
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}')
    return ''.join(d) + 'Z'


def jagged(cx, cy, base, n, jag, seed, sx=1.0, sy=1.0, rot=0.0):
    """a torn, fibrous outline: straight segments with a fine random radius (washi soaking)"""
    rnd = random.Random(seed)
    pts = []
    for i in range(n):
        t = rot + 2 * math.pi * i / n
        r = base * (1 + rnd.uniform(-jag, jag)) * (1 + 0.18 * math.sin(3 * t + seed))
        pts.append(f'{f(cx + math.cos(t) * r * sx)} {f(cy + math.sin(t) * r * sy)}')
    return 'M' + 'L'.join(pts) + 'Z'


def svg(w, h, body):
    s = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="none">{body}</svg>'
    return 'url("data:image/svg+xml,' + urllib.parse.quote(s, safe=" =/:,.-'()") + '")'


def bezier(o, c, e, t):
    u = 1 - t
    x = u * u * o[0] + 2 * u * t * c[0] + t * t * e[0]
    y = u * u * o[1] + 2 * u * t * c[1] + t * t * e[1]
    dx = 2 * u * (c[0] - o[0]) + 2 * t * (e[0] - c[0])
    dy = 2 * u * (c[1] - o[1]) + 2 * t * (e[1] - c[1])
    return x, y, math.degrees(math.atan2(dy, dx)), (dx, dy)


def spray():
    """viewBox 132 × 100: the cut at (14, 62); the flick leaves along the blade's way, rises, and the drops
    begin to fall past the top of the arc (one ballistic curve, like the blade arc above it)"""
    O, C, E = (14, 62), (58, 0), (128, 42)
    parts = []
    # the splat where the blade went in: an uneven pool of crimson over a deep core, spurs along the throw
    parts.append(f'<path fill="{DEEP}" d="{blob(O[0] - 2.2, O[1] + 1.6, [5.2, 3.9, 4.6, 6.1, 4.2, 3.6], rot=0.9, sx=1.25, sy=0.72)}"/>')
    parts.append(f'<path fill="{BLOOD}" d="{blob(O[0] + 1.4, O[1] - 1.2, [6.4, 9.6, 5.2, 4.4, 5.6, 4.1, 4.8, 7.8], rot=-0.95, sx=1.0, sy=0.62)}"/>')
    for x, y, r, a in [(26, 54, 1.9, -38), (24.5, 63.5, 1.4, 6), (9, 54.5, 1.1, -128), (15.5, 70, 1.0, 96), (30.5, 58.5, 0.9, -12)]:
        parts.append(teardrop(x, y, r, a, tail=3.0))
    # the ribbon: thick at the cut, tapering along the curve, ending in a rounded head
    left, right = [], []
    t0, t1 = 0.05, 0.3
    steps = 18
    for i in range(steps + 1):
        t = t0 + (t1 - t0) * i / steps
        x, y, _, (dx, dy) = bezier(O, C, E, t)
        n = math.hypot(dx, dy)
        nx, ny = -dy / n, dx / n
        w = 3.6 * (1 - (i / steps)) ** 1.1 + 0.9
        left.append((x + nx * w / 2, y + ny * w / 2))
        right.append((x - nx * w / 2, y - ny * w / 2))
    d = 'M' + 'L'.join(f'{f(px)} {f(py)}' for px, py in left) + 'L' + 'L'.join(f'{f(px)} {f(py)}' for px, py in reversed(right)) + 'Z'
    parts.append(f'<path fill="{BLOOD}" d="{d}"/>')
    hx, hy, ha, _ = bezier(O, C, E, t1 + 0.014)
    parts.append(teardrop(hx, hy, 1.7, ha, tail=2.3))
    # the drops the ribbon breaks into: teardrops along the curve, a large one first, then smaller, further apart
    rnd = random.Random(7)
    chain = [(0.37, 2.9), (0.44, 2.3), (0.5, 2.6), (0.57, 1.9), (0.63, 2.1), (0.69, 1.5), (0.75, 1.6), (0.81, 1.2), (0.87, 1.05), (0.93, 0.85), (0.98, 0.7)]
    for k, (t, r) in enumerate(chain):
        x, y, a, (dx, dy) = bezier(O, C, E, t)
        n = math.hypot(dx, dy)
        off = (1 if k % 2 else -1) * rnd.uniform(0.8, 3.2)
        x, y = x - dy / n * off, y + dx / n * off
        parts.append(teardrop(x, y, r, a + rnd.uniform(-8, 8), tail=rnd.uniform(2.4, 3.4), fill=DEEP if k in (2, 6) else BLOOD))
    # fine spatter off the line
    for t, off, r in [(0.42, 7.5, 0.7), (0.53, -6.5, 0.6), (0.66, 7, 0.55), (0.78, -5.5, 0.5), (0.6, 10.5, 0.45), (0.9, 5.5, 0.45), (0.34, -8, 0.6), (0.72, -9, 0.4)]:
        x, y, a, (dx, dy) = bezier(O, C, E, t)
        n = math.hypot(dx, dy)
        parts.append(f'<circle fill="{BLOOD}" cx="{f(x - dy / n * off)}" cy="{f(y + dx / n * off)}" r="{f(r)}"/>')
    # a lower, heavier throw: four drops flung right and already falling
    O2, C2, E2 = (20, 66), (52, 56), (90, 80)
    for k, (t, r) in enumerate([(0.3, 2.3), (0.52, 1.9), (0.74, 1.5), (0.92, 1.1)]):
        x, y, a, _ = bezier(O2, C2, E2, t)
        parts.append(teardrop(x, y + (1.4 if k % 2 else -1), r, a, tail=2.6, fill=DEEP if k == 1 else BLOOD))
    return svg(132, 100, ''.join(parts))


def drip():
    """viewBox 100 × 34: three heavy drops falling, heads down, near the foot of the box"""
    parts = [
        teardrop(22, 26, 6.6, 90, tail=3.0),
        teardrop(50, 28, 5.0, 92, tail=3.1, fill=DEEP),
        teardrop(76, 25.5, 4.2, 88, tail=3.2),
    ]
    return svg(100, 34, ''.join(parts))


def pool():
    """viewBox 240 × 20: a flat pool on the ground line, a deeper body off-centre, two satellites"""
    main = blob(116, 10.4, [66, 52, 72, 48, 60, 70, 50, 64, 46, 58, 68, 54], rot=0.2, sx=1.0, sy=0.125)
    lobe = blob(168, 11.6, [26, 20, 30, 22, 24, 19], rot=0.6, sx=1.0, sy=0.2)
    deep = blob(150, 11.2, [24, 16, 28, 18, 21, 15, 26, 17], rot=0.3, sx=1.0, sy=0.15)
    parts = [
        f'<path fill="{BLOOD}" d="{main}"/>',
        f'<path fill="{BLOOD}" d="{lobe}"/>',
        f'<path fill="{DEEP}" d="{deep}"/>',
        f'<path fill="{BLOOD}" d="{blob(20, 11.5, [9, 6, 10, 7, 8, 6], sx=1.0, sy=0.2)}"/>',
        f'<path fill="{BLOOD}" d="{blob(224, 9.5, [6, 4.5, 7, 5], sx=1.0, sy=0.24)}"/>',
    ]
    return svg(240, 20, ''.join(parts))


def stain(kind):
    """viewBox 100 × 100 on a paper scrap: blood soaked in from a cut edge, a torn, fibrous outline"""
    if kind == 'corner':
        body = [f'<path fill="{STAIN}" fill-opacity=".9" d="{jagged(4, 8, 46, 46, 0.13, 3, sx=1.0, sy=0.85)}"/>',
                f'<path fill="{DEEP}" fill-opacity=".85" d="{jagged(0, 2, 22, 30, 0.16, 5)}"/>',
                f'<circle fill="{STAIN}" cx="62" cy="34" r="3.2"/><circle fill="{STAIN}" cx="54" cy="52" r="2.2"/>']
    elif kind == 'edge':
        body = [f'<path fill="{STAIN}" fill-opacity=".9" d="{jagged(100, 52, 40, 48, 0.14, 11, sx=0.55, sy=1.15)}"/>',
                f'<path fill="{DEEP}" fill-opacity=".8" d="{jagged(102, 46, 18, 28, 0.18, 13, sx=0.6, sy=1.2)}"/>',
                f'<circle fill="{STAIN}" cx="58" cy="30" r="2.6"/><circle fill="{STAIN}" cx="64" cy="78" r="1.8"/>']
    else:
        body = [f'<path fill="{STAIN}" fill-opacity=".9" d="{jagged(30, 96, 30, 40, 0.15, 17, sx=1.2, sy=0.55)}"/>',
                f'<circle fill="{STAIN}" cx="62" cy="70" r="4"/><circle fill="{STAIN}" cx="74" cy="58" r="2.4"/><circle fill="{STAIN}" cx="83" cy="49" r="1.5"/>']
    return svg(100, 100, ''.join(body))


if __name__ == '__main__':
    out = {
        '--se-blood-spray': spray(),
        '--se-blood-drip': drip(),
        '--se-blood-pool': pool(),
        '--se-stain-corner': stain('corner'),
        '--se-stain-edge': stain('edge'),
        '--se-stain-foot': stain('foot'),
    }
    for k, v in out.items():
        print(f'  {k}: {v};')
    if len(sys.argv) > 1:
        # write each SVG raw for a look in a browser
        import os
        os.makedirs(sys.argv[1], exist_ok=True)
        for k, v in out.items():
            raw = urllib.parse.unquote(v[len('url("data:image/svg+xml,'):-2])
            open(os.path.join(sys.argv[1], k.strip('-') + '.svg'), 'w').write(raw)
