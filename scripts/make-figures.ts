#!/usr/bin/env bun
// Renders the pictures in the level steps into public/figures/, with OpenCV in
// Pyodide. Most come from the recorded clips (public/clips, so run
// `bun run tools` first), processed the same way the reference answers do, so
// a picture shows what a student's own code should produce. Deterministic;
// rerun after changing the clips or the levels:
//
//   bun scripts/make-figures.ts
//
// Where each picture is used is in src/levels/index.ts (`images` on a step).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadPyodide } from "pyodide";
import { CLIPS_VERSION, PYODIDE_VERSION } from "../src/tools";

const root = path.join(import.meta.dir, "..");
const out = path.join(root, "public/figures");
const wheels = path.join(root, "public/tools/pyodide", PYODIDE_VERSION);
const clips = path.join(root, "public/clips", CLIPS_VERSION);
mkdirSync(out, { recursive: true });

const py = await loadPyodide({ packageBaseUrl: `${wheels}/` });
await py.loadPackage(["numpy", "opencv-python"], { messageCallback: () => {} });
for (const name of [
	"ball",
	"cup",
	"ball-fingers",
	"occlusion",
	"throw",
	"hand-light",
	"armor",
]) {
	const bytes = new Uint8Array(readFileSync(path.join(clips, `${name}.zip`)));
	py.unpackArchive(bytes, "zip", { extractDir: "/clips" });
}
py.FS.mkdirTree("/tmp/fig");

// No backslashes or dollar-braces below: this is Python inside a template.
py.runPython(`
import cv2, json, math, numpy as np

W, H = 320, 240
OUT = "/tmp/fig/"
CYAN = (226, 198, 77)
VIOLET = (255, 97, 123)
MUTED = (198, 176, 159)
INK = (252, 251, 244)
NAVY = (46, 26, 14)
FONT = cv2.FONT_HERSHEY_SIMPLEX

def frame(clip, i):
    return cv2.imread(f"/clips/{clip}/{i:04d}.jpg")

def labels(clip):
    with open(f"/clips/{clip}/labels.json") as f:
        return json.load(f)

def save(name, img):
    if name.endswith(".jpg"):
        ok, data = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        open(OUT + name, "wb").write(data.tobytes())
    else:
        cv2.imwrite(OUT + name, img)

def label(img, text, org, color=INK, scale=0.45):
    """Text with a dark outline, readable on any picture."""
    cv2.putText(img, text, org, FONT, scale, NAVY, 3, cv2.LINE_AA)
    cv2.putText(img, text, org, FONT, scale, color, 1, cv2.LINE_AA)

def dashed_circle(img, c, r, color):
    for a in range(0, 360, 30):
        cv2.ellipse(img, c, (r, r), 0, a, a + 18, color, 1, cv2.LINE_AA)

BALL_LO, BALL_HI = (28, 110, 70), (46, 255, 255)

def ball_mask(img):
    return cv2.inRange(cv2.cvtColor(img, cv2.COLOR_BGR2HSV), BALL_LO, BALL_HI)

def clean(mask):
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))

def find_ball(img):
    contours, _ = cv2.findContours(clean(ball_mask(img)), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    biggest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(biggest) <= 150:
        return None
    (x, y), r = cv2.minEnclosingCircle(biggest)
    return (x, y)

# ------------------------------------------------- level 3: tune the sliders

def tune():
    rng = np.random.default_rng(7)
    # A pale yellow wall: nearly the ball's hue, but greyish (low saturation).
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    img = np.array([178, 214, 222], np.float32) * (1 - t) + np.array([158, 192, 200], np.float32) * t
    img = np.ascontiguousarray(np.broadcast_to(img, (H, W, 3))).copy()
    small = rng.normal(0, 1, (6, 8, 3)).astype(np.float32)
    img += cv2.resize(small, (W, H), interpolation=cv2.INTER_CUBIC) * 4
    img[186:] = np.array([60, 82, 118], np.float32)
    img[186:188] = np.array([40, 55, 80], np.float32)
    # A lit tennis ball with its white seam.
    cx, cy, r = 168, 118, 34
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = (xx - cx) / r, (yy - cy) / r
    d2 = dx * dx + dy * dy
    nz = np.sqrt(np.clip(1 - d2, 0, 1))
    lam = np.clip(dx * -0.45 + dy * -0.55 + nz * 0.70, 0, 1)
    col = np.array([60, 220, 190], np.float32)[None, None, :] * (0.58 + 0.45 * lam)[:, :, None]
    a = np.clip((1.0 - np.sqrt(d2)) * r + 0.5, 0, 1)[:, :, None]
    img = img * (1 - a) + col * a
    seam = np.zeros((H, W), np.uint8)
    cv2.ellipse(seam, (int(cx - r * 0.35), cy), (int(r * 0.9), int(r * 1.15)), 0, -60, 60, 255, 3, cv2.LINE_AA)
    seam[d2 > 1] = 0
    sa = (seam.astype(np.float32) / 255)[:, :, None] * 0.85
    img = img * (1 - sa) + np.array([200, 214, 214], np.float32) * sa
    img = np.clip(img + rng.normal(0, 3.0, img.shape), 0, 255).astype(np.uint8)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    save("tune-camera.jpg", img)
    save("tune-before.png", cv2.inRange(hsv, (25, 0, 80), (45, 255, 255)))
    save("tune-after.png", cv2.inRange(hsv, (25, 110, 80), (45, 255, 255)))

# ------------------------------------------------- level 1: grey

def grey():
    img = frame("ball", 30)
    save("camera-colour.jpg", img)
    save("camera-gray.jpg", cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))

# ------------------------------------------------- level 2: pixels

def pixels():
    lab = labels("ball")["frames"]
    i = min(range(len(lab)), key=lambda k: math.hypot(lab[k]["x"] - 160, lab[k]["y"] - 120))
    img = frame("ball", i)
    cx, cy = W // 2, H // 2

    grid = img.copy()
    cv2.arrowedLine(grid, (6, 10), (120, 10), INK, 2, cv2.LINE_AA, tipLength=0.08)
    label(grid, "x", (126, 15), INK, 0.5)
    cv2.arrowedLine(grid, (10, 6), (10, 100), INK, 2, cv2.LINE_AA, tipLength=0.1)
    label(grid, "y", (5, 115), INK, 0.5)
    label(grid, "(0, 0)", (16, 30))
    cv2.rectangle(grid, (cx - 5, cy - 5), (cx + 4, cy + 4), VIOLET, 1)
    cv2.drawMarker(grid, (cx, cy), CYAN, cv2.MARKER_CROSS, 24, 1, cv2.LINE_AA)
    label(grid, "frame[cy, cx]", (cx + 12, cy - 12), CYAN)
    label(grid, "x = 319", (250, 232), INK, 0.4)
    label(grid, "y = 239", (250, 216), INK, 0.4)
    save("pixels-grid.jpg", grid)

    # The 10 x 10 square, blown up so each pixel is a tile.
    square = img[cy - 5:cy + 5, cx - 5:cx + 5]
    tile = 24
    zoom = cv2.resize(square, (10 * tile, 10 * tile), interpolation=cv2.INTER_NEAREST)
    for k in range(11):
        cv2.line(zoom, (k * tile, 0), (k * tile, 10 * tile), NAVY, 1)
        cv2.line(zoom, (0, k * tile), (10 * tile, k * tile), NAVY, 1)
    pad = np.full((H, W, 3), NAVY, np.uint8)
    pad[0:240, 40:280] = zoom
    cv2.rectangle(pad, (40 + 5 * tile, 5 * tile), (40 + 6 * tile, 6 * tile), CYAN, 2)
    save("pixels-zoom.png", pad)

def hue_scale():
    w, h = 640, 112
    strip = np.zeros((28, 180, 3), np.uint8)
    strip[:, :, 0] = np.arange(180, dtype=np.uint8)[None, :]
    strip[:, :, 1:] = 255
    strip = cv2.resize(cv2.cvtColor(strip, cv2.COLOR_HSV2BGR), (600, 28), interpolation=cv2.INTER_NEAREST)
    img = np.full((h, w, 3), NAVY, np.uint8)
    img[14:42, 20:620] = strip
    names = {0: "red", 30: "yellow", 60: "green", 90: "cyan", 120: "blue", 150: "magenta", 179: "red"}
    for hue, name in names.items():
        x = 20 + int(hue * 600 / 180)
        cv2.line(img, (x, 42), (x, 50), INK, 1)
        num = str(hue)
        (tw, _), _ = cv2.getTextSize(num, FONT, 0.6, 1)
        cv2.putText(img, num, (x - tw // 2, 72), FONT, 0.6, INK, 1, cv2.LINE_AA)
        (tw, _), _ = cv2.getTextSize(name, FONT, 0.5, 1)
        cv2.putText(img, name, (max(4, min(w - tw - 4, x - tw // 2)), 98), FONT, 0.5, MUTED, 1, cv2.LINE_AA)
    save("hue-scale.png", img)

# ------------------------------------------------- level 4: morphology and contours

def morphology():
    lab = labels("ball-fingers")["frames"]

    def window(i):
        x0 = int(min(max(lab[i]["x"] - 80, 0), W - 160))
        y0 = int(min(max(lab[i]["y"] - 60, 0), H - 120))
        return x0, y0

    def score(i):
        # The frame that shows both jobs best: specks for OPEN to remove near
        # the ball, and the ball in one piece after CLOSE.
        raw = ball_mask(frame("ball-fingers", i))
        x0, y0 = window(i)
        crop = raw[y0:y0 + 120, x0:x0 + 160]
        n, _, stats, _ = cv2.connectedComponentsWithStats(crop)
        specks = sum(1 for k in range(1, n) if stats[k, cv2.CC_STAT_AREA] < 12)
        closed = clean(raw)[y0:y0 + 120, x0:x0 + 160]
        pieces = cv2.connectedComponentsWithStats(closed)[0] - 1
        return (pieces == 1, specks)

    i = max(range(14, 62), key=score)
    img = frame("ball-fingers", i)
    raw = ball_mask(img)
    opened = cv2.morphologyEx(raw, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    x0, y0 = window(i)
    # Crop around the ball and blow it up, so the specks and gaps show.
    def crop(m):
        return cv2.resize(m[y0:y0 + 120, x0:x0 + 160], (W, H), interpolation=cv2.INTER_NEAREST)
    save("morph-camera.jpg", cv2.resize(img[y0:y0 + 120, x0:x0 + 160], (W, H), interpolation=cv2.INTER_LINEAR))
    save("morph-raw.png", crop(raw))
    save("morph-open.png", crop(opened))
    save("morph-close.png", crop(closed))

def contours():
    img = frame("ball-fingers", 4)
    mask = clean(ball_mask(img))
    found, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = img.copy()
    biggest = max(found, key=cv2.contourArea)
    for c in found:
        if c is biggest:
            continue
        cv2.drawContours(out, [c], -1, MUTED, 1, cv2.LINE_AA)
        x, y, w, h = cv2.boundingRect(c)
        label(out, f"{cv2.contourArea(c):.0f} px: too small", (x - 40, y - 8), MUTED, 0.4)
    cv2.drawContours(out, [biggest], -1, VIOLET, 1, cv2.LINE_AA)
    (x, y), r = cv2.minEnclosingCircle(biggest)
    cv2.circle(out, (int(x), int(y)), int(r), CYAN, 2, cv2.LINE_AA)
    cv2.circle(out, (int(x), int(y)), 3, CYAN, -1, cv2.LINE_AA)
    label(out, f"{cv2.contourArea(biggest):.0f} px: the ball", (int(x + r + 6), int(y)), CYAN, 0.4)
    save("find-contours.jpg", out)

# ------------------------------------------------- level 5: Kalman

def kalman(clip):
    """The level 5 answer, run over a clip: (estimate, aim) per frame."""
    dt, lead = 1 / 30, 0.2
    F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], float)
    Hm = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], float)
    Q = np.diag([1.0, 1.0, 400.0, 400.0])
    R = np.eye(2) * 4.0
    state, P, out = None, None, []
    for i in range(len(labels(clip)["frames"])):
        center = find_ball(frame(clip, i))
        if state is not None:
            state = F @ state
            P = F @ P @ F.T + Q
        if center is not None:
            z = np.array(center)
            if state is None:
                state = np.array([z[0], z[1], 0.0, 0.0])
                P = np.diag([10.0, 10.0, 1e4, 1e4])
            else:
                y = z - Hm @ state
                S = Hm @ P @ Hm.T + R
                K = P @ Hm.T @ np.linalg.inv(S)
                state = state + K @ y
                P = (np.eye(4) - K @ Hm) @ P
        if state is None:
            out.append((None, None, center))
        else:
            out.append(((state[0], state[1]), (state[0] + state[2] * lead, state[1] + state[3] * lead), center))
    return out

def tracking():
    lab = labels("occlusion")["frames"]
    hidden = [i for i, l in enumerate(lab) if l.get("hidden")]
    i = hidden[len(hidden) // 2]
    track = kalman("occlusion")
    img = frame("occlusion", i)
    for k in range(0, i):
        est, _, meas = track[k]
        if meas is not None:
            cv2.circle(img, (int(meas[0]), int(meas[1])), 2, MUTED, -1, cv2.LINE_AA)
    for k in range(max(0, i - 14), i + 1):
        est = track[k][0]
        if est is not None:
            cv2.circle(img, (int(est[0]), int(est[1])), 3 if k < i else 6, CYAN, -1, cv2.LINE_AA)
    est = track[i][0]
    label(img, "estimate", (int(est[0]) - 30, int(est[1]) - 14), CYAN, 0.45)
    label(img, "no measurement here", (130, 190), INK, 0.4)
    save("track-hidden.jpg", img)

    lab = labels("throw")["frames"]
    track = kalman("throw")
    i = 18
    img = frame("throw", i)
    for k in range(0, len(lab)):
        if lab[k]["v"]:
            cv2.circle(img, (int(lab[k]["x"]), int(lab[k]["y"])), 1, MUTED, -1, cv2.LINE_AA)
    est, aim, _ = track[i]
    future = lab[i + 6]
    dashed_circle(img, (int(future["x"]), int(future["y"])), int(future["r"]) + 3, INK)
    label(img, "0.2 s later", (int(future["x"]) + 18, int(future["y"]) + 4), INK, 0.4)
    cv2.circle(img, (int(est[0]), int(est[1])), 5, CYAN, -1, cv2.LINE_AA)
    cv2.drawMarker(img, (int(aim[0]), int(aim[1])), VIOLET, cv2.MARKER_CROSS, 16, 2, cv2.LINE_AA)
    label(img, "aim", (int(aim[0]) - 12, int(aim[1]) - 12), VIOLET, 0.45)
    save("track-lead.jpg", img)

# ------------------------------------------------- level 6: fingers

def angle_at(far, start, end):
    a = np.linalg.norm(end - start)
    b = np.linalg.norm(far - start)
    c = np.linalg.norm(end - far)
    return math.degrees(math.acos(np.clip((b * b + c * c - a * a) / (2 * b * c + 1e-9), -1, 1)))

BOX = (170, 10, 310, 210)   # the level's BOX: x0, y0, x1, y1

def clean(diff):
    _, m = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

def fingers():
    clip = "hand-light"
    lab = labels(clip)["frames"]
    # Four fingers up, on the frame where the person has moved furthest from
    # where they sat when b was pressed (frame 4). Same sway as make-clips.
    def moved(t):
        return abs(16 * (math.sin(t / 9) - math.sin(4 / 9))) + abs(7 * (math.sin(t / 6) - math.sin(4 / 6)))
    i = max((k for k, l in enumerate(lab) if l.get("fingers") == 4), key=moved)
    bg = frame(clip, 4)
    img = frame(clip, i)
    x0, y0, x1, y1 = BOX
    blur_bg = cv2.GaussianBlur(bg, (5, 5), 0)
    blur = cv2.GaussianBlur(img, (5, 5), 0)

    # Over the whole frame, the person who moved shows up too.
    save("fingers-whole.png", clean(cv2.absdiff(blur, blur_bg).max(axis=2)))
    boxed = img.copy()
    cv2.rectangle(boxed, (x0 - 1, y0 - 1), (x1, y1), CYAN, 1)
    save("fingers-box.jpg", boxed)

    # The level's way: only the box.
    box_bg = cv2.GaussianBlur(bg[y0:y1, x0:x1], (5, 5), 0)
    box_now = cv2.GaussianBlur(img[y0:y1, x0:x1], (5, 5), 0)
    hand = clean(cv2.absdiff(box_now, box_bg).max(axis=2))
    save("fingers-background.jpg", bg[y0:y1, x0:x1].copy())
    save("fingers-camera.jpg", img[y0:y1, x0:x1].copy())
    save("fingers-hand.png", hand)

    contours, _ = cv2.findContours(hand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(contours, key=cv2.contourArea)
    out = img.copy()
    box = out[y0:y1, x0:x1]
    # Drawn the way the level 6 answer draws them: a thin cyan hull and a
    # cyan dot in each valley, inside the box. The lines to the fingertips are extra.
    cv2.drawContours(box, [cv2.convexHull(c)], -1, CYAN, 1, cv2.LINE_AA)
    defects = cv2.convexityDefects(c, cv2.convexHull(c, returnPoints=False))
    valleys = 0
    for s, e, f, depth in defects[:, 0]:
        start, end, far = c[s][0], c[e][0], c[f][0]
        if depth / 256 > 20 and angle_at(far, start, end) < 90:
            valleys += 1
            cv2.line(box, tuple(int(v) for v in start), tuple(int(v) for v in far), MUTED, 1, cv2.LINE_AA)
            cv2.line(box, tuple(int(v) for v in end), tuple(int(v) for v in far), MUTED, 1, cv2.LINE_AA)
            cv2.circle(box, tuple(int(v) for v in far), 4, CYAN, -1, cv2.LINE_AA)
    cv2.rectangle(out, (x0 - 1, y0 - 1), (x1, y1), CYAN, 1)
    label(out, f"{valleys} valleys + 1 = {valleys + 1} fingers", (10, 24), INK, 0.5)
    label(out, "hull", (x0 + 6, y1 - 8), CYAN, 0.45)
    save("fingers-defects.jpg", out)

# ------------------------------------------------- level 7: armor

def armor():
    img = frame("armor", 20)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.morphologyEx(cv2.inRange(hsv, (85, 60, 200), (130, 255, 255)), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bars = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if cv2.contourArea(c) > 40 and h > 1.5 * w:
            bars.append((x + w / 2, y + h / 2, h))
            cv2.rectangle(img, (x, y), (x + w, y + h), CYAN, 1)
    bars.sort()
    if len(bars) >= 2:
        (x1, y1, _), (x2, y2, _) = bars[0], bars[1]
        plate = (int((x1 + x2) / 2), int((y1 + y2) / 2))
        cv2.line(img, (int(x1), int(y1)), (int(x2), int(y2)), VIOLET, 1, cv2.LINE_AA)
        cv2.drawMarker(img, plate, VIOLET, cv2.MARKER_CROSS, 18, 2, cv2.LINE_AA)
        label(img, "light bar", (int(x1) - 30, int(y1) - 26), CYAN, 0.4)
        label(img, "plate", (plate[0] - 18, plate[1] + 34), VIOLET, 0.45)
    save("armor-result.jpg", img)

for make in (tune, grey, pixels, hue_scale, morphology, contours, tracking, fingers, armor):
    make()
`);

const names = (py.FS.readdir("/tmp/fig") as string[])
	.filter((name) => !name.startsWith("."))
	.sort();
for (const name of names) {
	const bytes = py.FS.readFile(`/tmp/fig/${name}`) as Uint8Array;
	writeFileSync(path.join(out, name), bytes);
	console.log(
		`  ${name.padEnd(22)} ${(bytes.byteLength / 1024).toFixed(1)} KB`,
	);
}
