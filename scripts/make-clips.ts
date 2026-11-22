#!/usr/bin/env bun
// Renders the Check-mode clips into public/clips/<version>/, one zip per clip:
//
//   <name>/labels.json      fps, size, colour bounds and a label per frame
//   <name>/0000.jpg ...     the frames, 320x240 JPEG
//   <name>/0000.png ...     the object's visible pixels (level 1 clips only)
//
// These are synthetic stand-ins, drawn with OpenCV from a fixed seed so every
// build gets identical bytes: a room with a desk, a ball, a sticky note, a cup,
// fingers, an occluding box, a thrown ball and hands showing 0 to 5 fingers in
// three skin tones. Recorded clips will replace them; keep the label format.
//
//   bun scripts/make-clips.ts            # all clips
//   bun scripts/make-clips.ts ball cup   # just these

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadPyodide } from "pyodide";
import { CLIPS_VERSION, PYODIDE_VERSION } from "../src/tools";

const root = path.join(import.meta.dir, "..");
const out = path.join(root, "public/clips", CLIPS_VERSION);
const wheels = path.join(root, "public/tools/pyodide", PYODIDE_VERSION);
mkdirSync(out, { recursive: true });

const py = await loadPyodide({ packageBaseUrl: `${wheels}/` });
await py.loadPackage(["numpy", "opencv-python"], { messageCallback: () => {} });
py.runPython(GENERATOR());

const only = process.argv.slice(2);
const names = (py.globals.get("CLIP_NAMES").toJs() as string[]).filter(
	(name) => only.length === 0 || only.includes(name),
);
const manifest: Record<string, { frames: number; bytes: number }> = {};
for (const name of names) {
	const started = performance.now();
	const frames = py.runPython(`render_clip(${JSON.stringify(name)})`) as number;
	const bytes = py.FS.readFile(`/tmp/${name}.zip`) as Uint8Array;
	writeFileSync(path.join(out, `${name}.zip`), bytes);
	manifest[name] = { frames, bytes: bytes.byteLength };
	console.log(
		`  ${name.padEnd(14)} ${String(frames).padStart(3)} frames ${(bytes.byteLength / 1024).toFixed(0).padStart(5)} KB  ${Math.round(performance.now() - started)} ms`,
	);
}
if (only.length === 0) {
	writeFileSync(
		path.join(out, "manifest.json"),
		`${JSON.stringify({ version: CLIPS_VERSION, clips: manifest }, null, 2)}\n`,
	);
}

function GENERATOR() {
	// No backslashes or dollar-braces below: this is Python inside a template.
	return `
import cv2, numpy as np, json, zipfile, math

W, H, FPS = 320, 240, 30

# Colours are BGR. Bounds are OpenCV HSV (hue 0-179) with room for shading.
BALL = (60, 220, 190)          # optic yellow, H about 36
NOTE = (85, 225, 250)          # sticky-note yellow, H about 26
CUP = (205, 120, 30)           # bright blue, H about 104
SKIN = {"light": (150, 180, 232), "medium": (100, 142, 196), "dark": (55, 78, 118)}
BOUNDS = {
    "ball": ([28, 110, 70], [46, 255, 255]),
    "note": ([19, 110, 120], [32, 255, 255]),
    "cup": ([96, 120, 60], [114, 255, 255]),
}

def lowfreq(rng, amp):
    small = rng.normal(0, 1, (6, 8, 3)).astype(np.float32)
    return cv2.resize(small, (W, H), interpolation=cv2.INTER_CUBIC) * amp

def room(rng):
    """A wall with a window glow, a desk, a book and a pen cup."""
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    img = np.array([200, 196, 188], np.float32) * (1 - t) + np.array([172, 168, 160], np.float32) * t
    img = np.ascontiguousarray(np.broadcast_to(img, (H, W, 3))).copy()
    glow = np.zeros((H, W), np.float32)
    cv2.circle(glow, (40, 30), 70, 1.0, -1)
    glow = cv2.GaussianBlur(glow, (0, 0), 30)
    img += glow[:, :, None] * 25
    desk_y = 188
    img[desk_y:] = np.array([60, 82, 118], np.float32)
    img[desk_y:desk_y + 2] = np.array([40, 55, 80], np.float32)
    cv2.rectangle(img, (228, 162), (300, 192), (122, 92, 72), -1)       # muted blue book
    cv2.rectangle(img, (228, 162), (300, 166), (205, 205, 210), -1)     # its pages
    cv2.rectangle(img, (20, 150), (44, 190), (95, 95, 100), -1)         # grey pen cup
    cv2.line(img, (28, 150), (24, 128), (40, 40, 160), 2)               # a red pen
    img += lowfreq(rng, 5)
    return img

def plain_wall(rng, tone=(168, 150, 132)):
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    img = np.array(tone, np.float32) * (1.04 - 0.08 * t)
    img = np.ascontiguousarray(np.broadcast_to(img, (H, W, 3))).copy()
    img += lowfreq(rng, 3)
    return img

def arena(rng):
    img = np.full((H, W, 3), (26, 20, 18), np.float32)
    for x in range(0, W, 40):
        cv2.line(img, (x, 0), (x - 60, H), (36, 30, 28), 1)
    img += lowfreq(rng, 4)
    return img

def finish(img, rng, i):
    """Sensor noise, a little flicker, then JPEG."""
    frame = img * (1 + 0.012 * math.sin(i * 0.7)) + rng.normal(0, 3.0, img.shape)
    frame = np.clip(frame, 0, 255).astype(np.uint8)
    ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return jpg.tobytes()

def shaded_disc(img, mask, cx, cy, r, color, seam=True):
    """A lit sphere: brightness falls off away from the top-left, saturation stays."""
    x0, x1 = max(0, int(cx - r - 2)), min(W, int(cx + r + 3))
    y0, y1 = max(0, int(cy - r - 2)), min(H, int(cy + r + 3))
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    dx, dy = (xx - cx) / r, (yy - cy) / r
    d2 = dx * dx + dy * dy
    inside = d2 <= 1.0
    nz = np.sqrt(np.clip(1 - d2, 0, 1))
    light = np.array([-0.45, -0.55, 0.70], np.float32)
    lam = np.clip(dx * light[0] + dy * light[1] + nz * light[2], 0, 1)
    shade = 0.58 + 0.45 * lam
    edge = np.clip((1.0 - np.sqrt(d2)) * r + 0.5, 0, 1)    # antialiased rim
    col = np.array(color, np.float32)[None, None, :] * shade[:, :, None]
    patch = img[y0:y1, x0:x1]
    a = edge[:, :, None]
    patch[:] = patch * (1 - a) + col * a
    m = mask[y0:y1, x0:x1]
    m[edge >= 0.5] = 255
    if seam:
        # The white seam: part of the ball, but not ball-coloured.
        s = np.zeros((H, W), np.uint8)
        cv2.ellipse(s, (int(cx - r * 0.35), int(cy)), (int(r * 0.9), int(r * 1.15)), 0, -60, 60, 255, 2, cv2.LINE_AA)
        s[mask == 0] = 0
        a = (s.astype(np.float32) / 255)[:, :, None] * 0.85
        img[:] = img * (1 - a) + np.array([200, 214, 214], np.float32) * a

def fill_poly(img, mask, pts, color, grad=0.18):
    pts = np.array(pts, np.float32)
    layer = np.zeros((H, W), np.uint8)
    cv2.fillPoly(layer, [np.round(pts).astype(np.int32)], 255, cv2.LINE_AA)
    ys = np.linspace(1 + grad / 2, 1 - grad / 2, H, dtype=np.float32)[:, None, None]
    col = np.array(color, np.float32)[None, None, :] * ys
    a = (layer.astype(np.float32) / 255)[:, :, None]
    img[:] = img * (1 - a) + col * a
    mask[layer >= 128] = 255

def finger(img, occ, p0, p1, width, color):
    """A finger: a thick capsule with a darker outline, drawn over the object."""
    p0 = (int(round(p0[0])), int(round(p0[1])))
    p1 = (int(round(p1[0])), int(round(p1[1])))
    dark = tuple(int(c * 0.78) for c in color)
    cv2.line(img, p0, p1, dark, width + 2, cv2.LINE_AA)
    cv2.line(img, p0, p1, color, width, cv2.LINE_AA)
    cv2.line(occ, p0, p1, 255, width + 2)

def poly_center(pts):
    m = cv2.moments(np.array(pts, np.float32))
    return m["m10"] / m["m00"], m["m01"] / m["m00"]

def rect_pts(cx, cy, w, h, angle):
    a = math.radians(angle)
    c, s = math.cos(a), math.sin(a)
    out = []
    for px, py in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        out.append((cx + px * c - py * s, cy + px * s + py * c))
    return out

def visible_box(mask):
    return int(np.count_nonzero(mask))

# ---------------------------------------------------------------- clips

class Clip:
    def __init__(self, name, seed, frames, obj=None, masks=False):
        self.name, self.n, self.obj, self.masks = name, frames, obj, masks
        self.rng = np.random.default_rng(seed)
        self.files, self.labels = [], []
        self.extra = {}

    def add(self, img, label, mask=None):
        i = len(self.labels)
        self.files.append((f"{self.name}/{i:04d}.jpg", finish(img, self.rng, i)))
        if self.masks and mask is not None:
            ok, png = cv2.imencode(".png", mask)
            self.files.append((f"{self.name}/{i:04d}.png", png.tobytes()))
        self.labels.append(label)

    def save(self):
        meta = {"name": self.name, "fps": FPS, "width": W, "height": H,
                "frames": self.labels, "masks": self.masks, **self.extra}
        if self.obj:
            lo, hi = BOUNDS[self.obj]
            meta["object"] = self.obj
            meta["hsv"] = {"lo": lo, "hi": hi}
        # A fixed timestamp, so the same clip always zips to the same bytes.
        def entry(name):
            return zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        with zipfile.ZipFile(f"/tmp/{self.name}.zip", "w", zipfile.ZIP_STORED) as z:
            z.writestr(entry(f"{self.name}/labels.json"), json.dumps(meta, separators=(",", ":")))
            for name, data in self.files:
                z.writestr(entry(name), data)
        return len(self.labels)

def label(visible, x, y, r, **more):
    return {"v": bool(visible), "x": round(float(x), 2), "y": round(float(y), 2), "r": round(float(r), 2), **more}

def ball_path(i, n):
    t = i / n
    return 160 + 105 * math.sin(2 * math.pi * t * 1.0 + 0.3), 112 + 58 * math.sin(2 * math.pi * t * 1.6)

def clip_ball():
    c = Clip("ball", 101, 75, "ball", masks=True)
    bg = room(c.rng)
    for i in range(c.n):
        img, mask = bg.copy(), np.zeros((H, W), np.uint8)
        x, y = ball_path(i, c.n)
        if 52 <= i < 60:      # it leaves the frame for a moment
            x += (i - 51) * 30
        r = 17 + 2 * math.sin(i / 9)
        shaded_disc(img, mask, x, y, r, BALL)
        vis = visible_box(mask) > 30
        c.add(img, label(vis, x, y, r), mask)
    return c.save()

def clip_note():
    c = Clip("note", 102, 75, "note", masks=True)
    bg = room(c.rng)
    for i in range(c.n):
        img, mask = bg.copy(), np.zeros((H, W), np.uint8)
        cx = 150 + 70 * math.sin(i / 12)
        cy = 110 + 30 * math.sin(i / 17)
        pts = rect_pts(cx, cy, 52, 50, 12 * math.sin(i / 10))
        fill_poly(img, mask, pts, NOTE)
        # A thumb holding the bottom corner.
        occ = np.zeros((H, W), np.uint8)
        bx, by = pts[2]
        finger(img, occ, (bx + 14, by + 22), (bx - 4, by - 4), 12, SKIN["medium"])
        mask[occ > 0] = 0
        c.add(img, label(True, *poly_center(pts), 26, poly=[[round(p[0], 1), round(p[1], 1)] for p in pts]), mask)
    return c.save()

def clip_cup():
    c = Clip("cup", 103, 75, "cup", masks=True)
    bg = room(c.rng)
    for i in range(c.n):
        img, mask = bg.copy(), np.zeros((H, W), np.uint8)
        cx = 160 + 90 * math.sin(i / 11 + 1)
        top, bottom = 104, 176
        pts = [(cx - 29, top), (cx + 29, top), (cx + 22, bottom), (cx - 22, bottom)]
        fill_poly(img, mask, pts, CUP, grad=0.3)
        cv2.ellipse(img, (int(cx + 28), 136), (12, 17), 0, -90, 90, CUP, 6, cv2.LINE_AA)   # handle
        cv2.ellipse(mask, (int(cx + 28), 136), (12, 17), 0, -90, 90, 255, 6)
        cv2.ellipse(img, (int(cx), top), (29, 6), 0, 0, 360, (90, 55, 15), -1, cv2.LINE_AA)  # the inside
        cv2.ellipse(mask, (int(cx), top), (29, 6), 0, 180, 360, 0, -1)
        c.add(img, label(True, *poly_center(pts), 34, poly=[[round(p[0], 1), round(p[1], 1)] for p in pts]), mask)
    return c.save()

def specks(img, rng, color, count=6):
    for _ in range(count):
        x, y = int(rng.integers(0, W)), int(rng.integers(0, 186))
        cv2.circle(img, (x, y), int(rng.integers(0, 2)), color, -1)

def clip_ball_fingers():
    """Fingers cover part of the ball, then it leaves; a small ball-coloured cap stays on the desk."""
    c = Clip("ball-fingers", 201, 90, "ball")
    bg = room(c.rng)
    cv2.rectangle(bg, (150, 176), (159, 181), BALL, -1)    # highlighter cap, about 50 px
    for i in range(c.n):
        img, mask = bg.copy(), np.zeros((H, W), np.uint8)
        t = i / 70
        x, y = 70 + 170 * t, 120 - 40 * math.sin(math.pi * t)
        if i >= 70:
            x = 240 + (i - 70) * 10
        r = 28
        shaded_disc(img, mask, x, y, r, BALL)
        specks(img, c.rng, BALL)
        if 12 <= i < 64:
            occ = np.zeros((H, W), np.uint8)
            # A thumb and a finger across the ball, the hand off to the right.
            finger(img, occ, (x - r - 16, y + r + 6), (x + 6, y + 6), 7, SKIN["medium"])
            finger(img, occ, (x + r + 22, y - 14), (x - 6, y - 9), 7, SKIN["medium"])
            cv2.ellipse(img, (int(x + r + 36), int(y - 2)), (14, 22), 0, 0, 360, SKIN["medium"], -1, cv2.LINE_AA)
            mask[occ > 0] = 0
        vis = visible_box(mask) > 60
        c.add(img, label(vis, x, y, r))
    return c.save()

def clip_note_fingers():
    c = Clip("note-fingers", 202, 92, "note")
    bg = room(c.rng)
    for i in range(c.n):
        img, mask = bg.copy(), np.zeros((H, W), np.uint8)
        cx = 120 + 90 * math.sin(min(i, 79) / 14)
        cy = 112 + 20 * math.sin(i / 9)
        if i >= 80:     # then it's taken away to the left
            cx -= (i - 79) * 14
        pts = rect_pts(cx, cy, 56, 54, 8 * math.sin(i / 13))
        fill_poly(img, mask, pts, NOTE)
        occ = np.zeros((H, W), np.uint8)
        # A finger across the middle splits the note in two.
        finger(img, occ, (cx + 8, cy + 60), (cx + 2, cy - 18), 9, SKIN["dark"])
        finger(img, occ, (cx - 40, cy + 40), (cx - 20, cy + 18), 11, SKIN["dark"])
        mask[occ > 0] = 0
        c.add(img, label(visible_box(mask) > 400, *poly_center(pts), 28))
    return c.save()

def clip_occlusion():
    """Constant velocity, behind a box for half a second."""
    c = Clip("occlusion", 301, 70, "ball")
    bg = room(c.rng)
    box = (138, 70, 188, 170)
    for i in range(c.n):
        img, mask = bg.copy(), np.zeros((H, W), np.uint8)
        x, y = 22 + 4.2 * i, 92 + 0.55 * i
        r = 15
        shaded_disc(img, mask, x, y, r, BALL)
        occ = np.zeros((H, W), np.uint8)
        cv2.rectangle(img, box[:2], box[2:], (88, 104, 128), -1)        # a cardboard box
        cv2.rectangle(img, box[:2], box[2:], (60, 72, 92), 2)
        cv2.rectangle(occ, box[:2], box[2:], 255, -1)
        mask[occ > 0] = 0
        vis = visible_box(mask) > 0.6 * math.pi * r * r
        c.add(img, label(vis, x, y, r, hidden=bool(visible_box(mask) == 0)))
    return c.save()

def clip_throw():
    """A ball thrown across the room: up, over and down under gravity."""
    c = Clip("throw", 302, 46, "ball")
    c.extra["lead"] = 0.2
    bg = room(c.rng)
    for i in range(c.n):
        img, mask = bg.copy(), np.zeros((H, W), np.uint8)
        t = i - 4
        if t < 0:
            x, y = -40, 200
        else:
            x, y = 28 + 6.2 * t, 196 - 10.0 * t + 0.5 * 0.5 * t * t
        r = 13
        if t >= 0:
            shaded_disc(img, mask, x, y, r, BALL)
        vis = visible_box(mask) > 0.5 * math.pi * r * r
        c.add(img, label(vis, x, y, r))
    return c.save()

# ---------------------------------------------------------------- hands

FINGERS = [  # base offset from palm centre, angle from vertical, length, width
    (-25, -30, 40, 11),   # little
    (-9, -11, 50, 12),    # ring
    (8, 7, 54, 12),       # middle
    (24, 25, 48, 12),     # index
]

def draw_hand(img, cx, cy, count, tone, tilt):
    col = SKIN[tone]
    dark = tuple(int(c * 0.82) for c in col)
    rot = math.radians(tilt)
    def P(dx, dy):
        return (int(round(cx + dx * math.cos(rot) - dy * math.sin(rot))),
                int(round(cy + dx * math.sin(rot) + dy * math.cos(rot))))
    # Forearm to the bottom of the frame, then the palm.
    arm = np.array([P(-22, 20), P(24, 20), P(30, 140), P(-30, 140)], np.int32)
    cv2.fillPoly(img, [arm], col, cv2.LINE_AA)
    cv2.ellipse(img, P(0, 0), (34, 36), tilt, 0, 360, col, -1, cv2.LINE_AA)
    # Index to little, then the thumb.
    order = [3, 2, 1, 0]
    up = set(order[:min(count, 4)])
    for k, (bx, ang, length, width) in enumerate(FINGERS):
        a = math.radians(ang)
        base = (bx, -26)
        if k in up:
            tip = (bx + length * math.sin(a), -26 - length * math.cos(a))
        else:
            tip = (bx + 5 * math.sin(a), -32)       # a folded knuckle
        cv2.line(img, P(*base), P(*tip), dark, width + 2, cv2.LINE_AA)
        cv2.line(img, P(*base), P(*tip), col, width, cv2.LINE_AA)
    if count == 5:
        cv2.line(img, P(28, 8), P(66, -14), dark, 16, cv2.LINE_AA)
        cv2.line(img, P(28, 8), P(66, -14), col, 14, cv2.LINE_AA)
    else:
        cv2.line(img, P(22, 6), P(30, -6), col, 14, cv2.LINE_AA)    # thumb tucked in
    cv2.ellipse(img, P(0, -4), (34, 33), tilt, 0, 360, col, -1, cv2.LINE_AA)

def clip_hand(name, seed, tone, counts, wall_tone):
    c = Clip(name, seed, 0)
    bg = plain_wall(c.rng, wall_tone)
    c.extra["keys"] = {"4": "b"}
    hold = 16
    for i in range(10):          # the empty background, for pressing b
        c.add(bg.copy(), {"v": False, "x": 0, "y": 0, "r": 0, "fingers": None})
    for j, n in enumerate(counts):
        for k in range(hold):
            img = bg.copy()
            cx = 160 + 30 * math.sin((j * hold + k) / 13)
            cy = 150 + 6 * math.sin((j * hold + k) / 7)
            tilt = 8 * math.sin((j * hold + k) / 11)
            draw_hand(img, cx, cy, n, tone, tilt)
            # The first two frames after a change are motion blur in a real
            # recording; they aren't graded.
            label_n = None if k < 2 else n
            c.add(img, {"v": True, "x": round(cx, 2), "y": round(cy, 2), "r": 36, "fingers": label_n})
    return c.save()

def clip_armor():
    """For the closing demo: an armor plate is a dark panel between two light bars."""
    c = Clip("armor", 401, 90)
    bg = arena(c.rng)
    for i in range(c.n):
        img = bg.copy()
        cx = 160 + 90 * math.sin(i / 15)
        cy = 120 + 25 * math.sin(i / 9)
        ang = 10 * math.sin(i / 12)
        plate = rect_pts(cx, cy, 70, 44, ang)
        cv2.fillPoly(img, [np.round(np.array(plate)).astype(np.int32)], (58, 56, 60), cv2.LINE_AA)
        sticker = rect_pts(cx, cy, 22, 26, ang)
        cv2.fillPoly(img, [np.round(np.array(sticker)).astype(np.int32)], (200, 200, 205), cv2.LINE_AA)
        glow = np.zeros_like(img)
        for side in (-1, 1):
            a = math.radians(ang)
            bx, by = cx + side * 43 * math.cos(a), cy + side * 43 * math.sin(a)
            bar = rect_pts(bx, by, 7, 34, ang)
            cv2.fillPoly(glow, [np.round(np.array(bar)).astype(np.int32)], (255, 170, 60), cv2.LINE_AA)
        img += cv2.GaussianBlur(glow, (0, 0), 5) * 1.4 + glow
        img = np.minimum(img, 255)
        c.add(img, label(True, cx, cy, 40))
    return c.save()

CLIPS = {
    "ball": clip_ball,
    "note": clip_note,
    "cup": clip_cup,
    "ball-fingers": clip_ball_fingers,
    "note-fingers": clip_note_fingers,
    "occlusion": clip_occlusion,
    "throw": clip_throw,
    "hand-light": lambda: clip_hand("hand-light", 501, "light", [0, 1, 2, 3, 4, 5], (168, 150, 132)),
    "hand-medium": lambda: clip_hand("hand-medium", 502, "medium", [5, 3, 1, 4, 0, 2], (176, 150, 134)),
    "hand-dark": lambda: clip_hand("hand-dark", 503, "dark", [2, 4, 0, 5, 1, 3], (150, 170, 190)),
    "armor": clip_armor,
}
CLIP_NAMES = list(CLIPS)

def render_clip(name):
    return CLIPS[name]()
`;
}
