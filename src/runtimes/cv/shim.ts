// The Python side of the browser shims. Written to Pyodide's file system as
// _learncv.py and imported once. install() replaces the desktop-only parts of
// cv2 (camera, windows, trackbars, keys) with functions that talk to the page
// through the `_cvbridge` JS module; everything else stays real OpenCV.
//
// In Check mode the same shims play a recorded clip instead of the webcam and
// snapshot the student's top-level variables at the end of every frame, which
// is what the levels grade.

export const SCRIPT_FILE = "main.py";

export const SHIM_PY = String.raw`
import cv2, numpy as np, json, linecache, math, os, re, sys, time, traceback
import _cvbridge as B

FILE = "main.py"
CLIP_ROOT = "/clips"

class NotInBrowserError(RuntimeError):
    """A cv2 call that needs a desktop window system."""

class _ClipEnded(BaseException):
    """Stops a script that keeps reading after its clip has ended."""

# ---------------------------------------------------------------- state

class _State:
    def __init__(self):
        self.mode = "live"
        self.clip = None          # labels.json of the clip being checked
        self.watch = {}           # variable name -> "mask" | "point" | "int" | "fill"
        self.ns = None
        self.frame = -1           # last frame read from the checked clip
        self.ended = False
        self.reads_after_end = 0
        self.records = {}         # frame -> snapshot
        self.snapped = -1
        self.inrange = []         # bounds passed to inRange, first few distinct
        self.trackbars = {}       # (window, name) -> dict
        self.windows = set()
        self.captures = []
        self.frames_read = 0
        self.gt = {}
        self.tb_log = []          # every trackbar created, for the coach
        self.last_frame = None    # a copy of the clip frame, before the script draws on it
        self.shown = set()        # windows imshow has drawn in

S = _State()

# ---------------------------------------------------------------- clips

def _clip_name(path):
    base = os.path.basename(str(path))
    return re.sub(r"\.(mp4|avi|mov|mkv|webm)$", "", base, flags=re.I)

def clip_meta(name):
    p = f"{CLIP_ROOT}/{name}/labels.json"
    if not os.path.exists(p):
        return None
    with open(p) as f:
        meta = json.load(f)
    meta["dir"] = f"{CLIP_ROOT}/{name}"
    return meta

def clip_names():
    if not os.path.isdir(CLIP_ROOT):
        return []
    return sorted(n for n in os.listdir(CLIP_ROOT) if os.path.exists(f"{CLIP_ROOT}/{n}/labels.json"))

# ---------------------------------------------------------------- capture

_W, _H = 320, 240

class VideoCapture:
    """cv2.VideoCapture for the browser: index 0 is the webcam, a name like "ball.mp4" is a recorded clip."""

    def __init__(self, source=0, apiPreference=None, *args):
        self._open = False
        self._clip = None
        self._cam = False
        self._i = 0
        self._seq = -1
        self._buf = None
        self._t0 = None
        self._checked = False
        self._last = None
        is_index = isinstance(source, (int, np.integer)) or (isinstance(source, str) and source.strip().isdigit())
        if is_index:
            if S.mode == "check":
                # Check mode: the clip being graded stands in for the webcam.
                self._clip = S.clip
                self._checked = True
                self._open = True
            else:
                self._cam = True
                self._open = bool(B.camera_open(int(source)))
        else:
            meta = clip_meta(_clip_name(source))
            if meta is None:
                names = ", ".join(n + ".mp4" for n in clip_names()) or "none loaded"
                print(f"VideoCapture: there's no clip called {source!r} here. Clips: {names}.", file=sys.stderr)
            else:
                self._clip = meta
                self._checked = S.mode == "check" and S.clip is not None and meta["name"] == S.clip["name"]
                self._open = True
        S.captures.append(self)

    def isOpened(self):
        return self._open

    def read(self, image=None):
        if not self._open:
            return False, None
        if self._cam:
            if self._buf is None:
                self._buf = np.empty((_H, _W, 4), np.uint8)
            while True:
                seq = B.camera_read(self._buf, self._seq)
                if seq >= 0:
                    break
                if seq == -2:
                    self._open = False
                    return False, None
            self._seq = seq
            S.frames_read += 1
            return True, cv2.cvtColor(self._buf, cv2.COLOR_RGBA2BGR)
        clip = self._clip
        n = len(clip["frames"])
        if self._checked:
            _end_frame(False)
        if self._i >= n:
            if self._checked:
                S.ended = True
                S.reads_after_end += 1
                if S.reads_after_end > 30:
                    raise _ClipEnded()
            return False, None
        if S.mode == "live":
            # Play at the clip's frame rate, like a video file would on a laptop.
            if self._t0 is None:
                self._t0 = time.monotonic() - self._i / clip["fps"]
            wait = self._t0 + self._i / clip["fps"] - time.monotonic()
            if wait > 0:
                B.sleep(int(wait * 1000))
        with open(f"{clip['dir']}/{self._i:04d}.jpg", "rb") as f:
            frame = cv2.imdecode(np.frombuffer(f.read(), np.uint8), cv2.IMREAD_COLOR)
        if self._checked:
            S.frame = self._i
            S.last_frame = frame.copy()
        self._i += 1
        S.frames_read += 1
        return True, frame

    def grab(self):
        ok, frame = self.read()
        self._last = frame
        return ok

    def retrieve(self, image=None, flag=0):
        return (self._last is not None), self._last

    def get(self, prop):
        prop = int(prop)
        fps = float(self._clip["fps"]) if self._clip else 30.0
        if prop == cv2.CAP_PROP_FPS:
            return fps
        if prop == cv2.CAP_PROP_FRAME_WIDTH:
            return float(self._clip["width"] if self._clip else _W)
        if prop == cv2.CAP_PROP_FRAME_HEIGHT:
            return float(self._clip["height"] if self._clip else _H)
        if prop == cv2.CAP_PROP_FRAME_COUNT:
            return float(len(self._clip["frames"])) if self._clip else -1.0
        if prop == cv2.CAP_PROP_POS_FRAMES:
            return float(self._i)
        return 0.0

    def set(self, prop, value):
        if self._clip and int(prop) == cv2.CAP_PROP_POS_FRAMES and not self._checked:
            self._i = max(0, min(int(value), len(self._clip["frames"])))
            self._t0 = None
            return True
        return False

    def release(self):
        if self._cam and self._open:
            B.camera_release()
        self._open = False

    def __del__(self):
        pass

# ---------------------------------------------------------------- windows

def namedWindow(winname, flags=None):
    winname = str(winname)
    if winname not in S.windows:
        S.windows.add(winname)
        B.window("create", winname)

def _to_rgba(mat):
    img = np.asarray(mat)
    if img.dtype == np.bool_:
        img = img.astype(np.uint8) * 255
    elif img.dtype in (np.float32, np.float64, np.float16):
        img = np.clip(img * 255.0, 0, 255).astype(np.uint8)
    elif img.dtype == np.uint16:
        img = (img >> 8).astype(np.uint8)
    elif img.dtype != np.uint8:
        img = np.clip(img, 0, 255).astype(np.uint8)
    if img.ndim == 3 and img.shape[2] == 1:
        img = img[:, :, 0]
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2RGBA)
    if img.ndim == 3 and img.shape[2] == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
    if img.ndim == 3 and img.shape[2] == 4:
        return cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
    raise ValueError(f"imshow can't show an array of shape {img.shape}. It takes a greyscale, BGR or BGRA image.")

def imshow(winname, mat):
    if mat is None:
        raise ValueError("imshow got None instead of an image. Did cap.read() run out of frames?")
    rgba = _to_rgba(mat)
    namedWindow(winname)
    S.shown.add(str(winname))
    B.show(str(winname), rgba, S.frame if S.mode == "check" else -1)

def destroyWindow(winname):
    winname = str(winname)
    S.windows.discard(winname)
    for key in [k for k in S.trackbars if k[0] == winname]:
        del S.trackbars[key]
    B.window("destroy", winname)

def destroyAllWindows():
    S.windows.clear()
    S.trackbars.clear()
    B.window("destroyAll", "")

def getWindowProperty(winname, prop_id):
    return 1.0 if str(winname) in S.windows else -1.0

# ---------------------------------------------------------------- trackbars

_ROLE = re.compile(r"^(l|u|lo|hi|low|high|min|max|lower|upper)?_?(h|s|v|hue|sat|val|saturation|value|bright|brightness)_?(l|u|lo|hi|low|high|min|max|lower|upper)?$")
_LOW = {"l", "lo", "low", "min", "lower"}

def trackbar_role(name):
    """("h", 0) for a hue minimum, ("v", 1) for a value maximum, or None."""
    words = re.findall(r"[a-z]+", str(name).lower())
    for i in range(len(words)):
        for j in range(i + 1, min(len(words), i + 3) + 1):
            m = _ROLE.match("_".join(words[i:j]))
            if m and (m.group(1) or m.group(3)):
                ch = m.group(2)[0]
                side = m.group(1) or m.group(3)
                return ch, (0 if side in _LOW else 1)
    return None

def _preset(name, count):
    if S.mode != "check" or not S.clip or "hsv" not in S.clip:
        return None
    role = trackbar_role(name)
    if role is None:
        return None
    ch, side = role
    bounds = S.clip["hsv"]["lo" if side == 0 else "hi"]
    return min(int(count), int(bounds["hsv".index(ch)]))

def createTrackbar(trackbarName, windowName, value, count, onChange):
    if not callable(onChange):
        raise TypeError("createTrackbar needs a function as its last argument, such as lambda v: None")
    trackbarName, windowName = str(trackbarName), str(windowName)
    namedWindow(windowName)
    value, count = int(value), int(count)
    preset = _preset(trackbarName, count)
    if preset is not None:
        value = preset
    slot = B.trackbar_create(windowName, trackbarName, value, count)
    if S.mode == "live":
        value = int(B.trackbar_get(slot))   # the page may restore where the student left it
    role = trackbar_role(trackbarName)
    S.trackbars[(windowName, trackbarName)] = {"slot": slot, "value": value, "max": count, "cb": onChange, "last": value}
    S.tb_log.append({"window": windowName, "name": trackbarName, "max": count, "role": list(role) if role else None})

def _trackbar(trackbarname, winname):
    key = (str(winname), str(trackbarname))
    if key not in S.trackbars:
        names = ", ".join(f"{n!r} on {w!r}" for w, n in S.trackbars) or "none yet"
        raise ValueError(f"There's no trackbar {key[1]!r} on window {key[0]!r}. Trackbars: {names}.")
    return S.trackbars[key]

def getTrackbarPos(trackbarname, winname):
    tb = _trackbar(trackbarname, winname)
    if S.mode == "check":
        return tb["value"]
    tb["value"] = int(B.trackbar_get(tb["slot"]))
    return tb["value"]

def setTrackbarPos(trackbarname, winname, pos):
    tb = _trackbar(trackbarname, winname)
    tb["value"] = max(0, min(int(pos), tb["max"]))
    B.trackbar_set(tb["slot"], tb["value"])

def _run_callbacks():
    for tb in list(S.trackbars.values()):
        v = tb["value"] if S.mode == "check" else int(B.trackbar_get(tb["slot"]))
        if v != tb["last"]:
            tb["last"] = tb["value"] = v
            tb["cb"](v)

# ---------------------------------------------------------------- keys

def waitKey(delay=0):
    B.flush()
    _run_callbacks()
    if S.mode == "check":
        _end_frame(True)
        key = (S.clip or {}).get("keys", {}).get(str(S.frame))
        return ord(key) if key else -1
    delay = int(delay)
    if delay <= 0:
        # Blocks until a key, like on a laptop. Stop still works.
        while True:
            k = B.wait_key(50)
            _run_callbacks()
            if k != -1:
                return k
    deadline = time.monotonic() + delay / 1000
    while True:
        left = int((deadline - time.monotonic()) * 1000)
        k = B.wait_key(max(1, min(50, left)))
        if k != -1 or left <= 50:
            return k
        _run_callbacks()

def pollKey():
    return waitKey(1)

# ---------------------------------------------------------------- recording inRange

def inRange(src, lowerb, upperb, dst=None):
    if len(S.inrange) < 8:
        try:
            lo = [float(x) for x in np.asarray(lowerb).ravel()[:3]]
            hi = [float(x) for x in np.asarray(upperb).ravel()[:3]]
            if [lo, hi] not in S.inrange:
                S.inrange.append([lo, hi])
        except Exception:
            pass
    return _REAL["inRange"](src, lowerb, upperb) if dst is None else _REAL["inRange"](src, lowerb, upperb, dst)

# ---------------------------------------------------------------- snapshots

def _gt_mask(i):
    if i in S.gt:
        return S.gt[i]
    clip, label = S.clip, S.clip["frames"][i]
    m = None
    if clip.get("masks"):
        m = cv2.imread(f"{clip['dir']}/{i:04d}.png", cv2.IMREAD_GRAYSCALE)
    if m is None:
        m = np.zeros((clip["height"], clip["width"]), np.uint8)
        if label.get("v"):
            if "poly" in label:
                cv2.fillPoly(m, [np.round(np.array(label["poly"])).astype(np.int32)], 255)
            else:
                cv2.circle(m, (int(round(label["x"])), int(round(label["y"]))), int(round(label["r"])), 255, -1)
    S.gt[i] = m
    return m

def _point(v):
    if v is None:
        return None
    try:
        a = np.asarray(v, dtype=np.float64).ravel()
    except Exception:
        return "bad:" + type(v).__name__
    if a.size < 2 or not np.all(np.isfinite(a[:2])):
        return "bad:" + type(v).__name__
    return [round(float(a[0]), 2), round(float(a[1]), 2)]

def _mask(v, i, full):
    if v is None:
        return None
    if not isinstance(v, np.ndarray):
        return "bad:" + type(v).__name__
    m = v[:, :, 0] if v.ndim == 3 and v.shape[2] == 1 else v
    h, w = S.clip["height"], S.clip["width"]
    if m.ndim != 2 or m.shape != (h, w):
        return "bad:shape " + "x".join(map(str, v.shape))
    on = m > 0
    out = {"fill": round(float(on.mean()), 4)}
    if full:
        gt = _gt_mask(i) > 0
        inter = int(np.count_nonzero(on & gt))
        union = int(np.count_nonzero(on | gt))
        g = int(np.count_nonzero(gt))
        out["iou"] = round(inter / union, 4) if union else 1.0
        out["cover"] = round(inter / g, 4) if g else None
    return out

def _int(v):
    if v is None:
        return None
    try:
        return int(v)
    except Exception:
        return "bad:" + type(v).__name__

def _gray(v):
    """Is v the frame in greyscale? Compared with OpenCV's own conversion."""
    if v is None or S.last_frame is None:
        return None
    if not isinstance(v, np.ndarray):
        return "bad:" + type(v).__name__
    ref = S.last_frame
    if v.ndim == 3 and v.shape[2] > 1:
        return {"ok": False, "why": "channels"}
    g = v[:, :, 0] if v.ndim == 3 else v
    if g.shape != ref.shape[:2]:
        return {"ok": False, "why": "shape"}
    want = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
    diff = float(np.abs(g.astype(np.int16) - want.astype(np.int16)).mean())
    return {"ok": diff < 0.25, "why": "diff", "diff": round(diff, 2)}

def _picked(v):
    """Is v the HSV colour of the square in the middle of the frame (or its centre pixel)?"""
    if v is None or S.last_frame is None:
        return None
    try:
        got = np.asarray(v, dtype=np.float64).ravel()
    except Exception:
        return "bad:" + type(v).__name__
    if got.size < 3 or not np.all(np.isfinite(got[:3])):
        return "bad:" + type(v).__name__
    got = got[:3]
    ref = S.last_frame
    h, w = ref.shape[:2]
    cx, cy = w // 2, h // 2
    hsv = cv2.cvtColor(ref, cv2.COLOR_BGR2HSV)

    def square(img, y, x):
        return img[max(0, y - 5):y + 5, max(0, x - 5):x + 5].reshape(-1, 3).mean(axis=0)

    def close(a, b):
        return abs(a[0] - b[0]) <= 3 and abs(a[1] - b[1]) <= 10 and abs(a[2] - b[2]) <= 10

    want = square(hsv, cy, cx)
    ok = bool(close(got, want) or close(got, hsv[cy, cx]))
    out = {"ok": ok, "got": [round(float(x), 1) for x in got], "want": [round(float(x), 1) for x in want]}
    if not ok:
        out["swapped"] = bool(close(got, square(hsv, cx, cy)))
        out["bgr"] = bool(close(got, square(ref, cy, cx)) or close(got, ref[cy, cx]))
    return out

def _end_frame(at_wait_key):
    """Snapshots the watched variables for the frame just processed."""
    i = S.frame
    if S.mode != "check" or i < 0 or S.ns is None:
        return
    if not at_wait_key and S.snapped == i:
        return
    S.snapped = i
    rec = {}
    for name, kind in S.watch.items():
        if name not in S.ns:
            rec[name] = "missing"
            continue
        v = S.ns.get(name)
        if kind == "point":
            rec[name] = _point(v)
        elif kind == "mask":
            rec[name] = _mask(v, i, True)
        elif kind == "fill":
            rec[name] = _mask(v, i, False)
        elif kind == "int":
            rec[name] = _int(v)
        elif kind == "gray":
            rec[name] = _gray(v)
        elif kind == "picked":
            rec[name] = _picked(v)
    S.records[i] = rec

# ---------------------------------------------------------------- install and run

_HIGHGUI_SHIMS = {
    "VideoCapture": VideoCapture,
    "namedWindow": namedWindow,
    "imshow": imshow,
    "destroyWindow": destroyWindow,
    "destroyAllWindows": destroyAllWindows,
    "getWindowProperty": getWindowProperty,
    "createTrackbar": createTrackbar,
    "getTrackbarPos": getTrackbarPos,
    "setTrackbarPos": setTrackbarPos,
    "waitKey": waitKey,
    "pollKey": pollKey,
    "inRange": inRange,
}

_UNAVAILABLE = [
    "setMouseCallback", "selectROI", "selectROIs", "resizeWindow", "moveWindow",
    "setWindowProperty", "setWindowTitle", "getWindowImageRect", "displayOverlay",
    "displayStatusBar", "createButton", "getMouseWheelDelta", "startWindowThread",
    "waitKeyEx", "setTrackbarMin", "setTrackbarMax", "updateWindow", "addText",
    "fontQt", "loadWindowParameters", "saveWindowParameters", "startLoop", "stopLoop",
    "setOpenGlContext", "setOpenGlDrawCallback", "currentUIFramework", "VideoWriter",
]

def _unavailable(name):
    def call(*args, **kwargs):
        raise NotInBrowserError(
            f"cv2.{name} isn't available in the browser. Learn CV has the camera, imshow, "
            "namedWindow, trackbars and waitKey; use those instead."
        )
    call.__name__ = name
    return call

_REAL = {}

def install():
    if not _REAL:
        for name in list(_HIGHGUI_SHIMS) + _UNAVAILABLE:
            _REAL[name] = getattr(cv2, name, None)
    for name, fn in _HIGHGUI_SHIMS.items():
        setattr(cv2, name, fn)
    for name in _UNAVAILABLE:
        setattr(cv2, name, _unavailable(name))

def check_syntax(src):
    try:
        compile(src, FILE, "exec")
        return None
    except SyntaxError as e:
        return {"line": e.lineno or 1, "column": e.offset or 1, "endLine": e.end_lineno or 0,
                "endColumn": e.end_offset or 0, "type": type(e).__name__, "message": e.msg}

def _describe(e):
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == FILE]
    line = frames[-1].lineno if frames else None
    code = frames[-1].line if frames else None
    text = ""
    if frames:
        text = "Traceback (most recent call last):\n" + "".join(traceback.format_list(frames))
    text += "".join(traceback.format_exception_only(type(e), e))
    msg = str(e)
    if isinstance(e, cv2.error):
        # OpenCV's messages start with a build path; keep the useful end.
        m = re.search(r"error: \(([-\d]+):([^)]*)\) (.*)", msg, re.S)
        if m:
            msg = m.group(3).strip()
    return {"type": type(e).__name__, "message": msg, "line": line, "code": code, "text": text}

def run(src, mode="live", clip=None, watch=None):
    """Runs a student's script. Returns a JSON summary."""
    install()
    S.__init__()
    S.mode = mode
    S.watch = dict(watch or {})
    if clip:
        S.clip = clip_meta(clip)
    linecache.cache[FILE] = (len(src), None, src.splitlines(True), FILE)
    ns = {"__name__": "__main__", "__file__": FILE, "__builtins__": __builtins__}
    S.ns = ns
    status, error = "ok", None
    started = time.monotonic()
    try:
        exec(compile(src, FILE, "exec"), ns)
    except _ClipEnded:
        pass
    except SystemExit:
        pass
    except KeyboardInterrupt:
        status = "stopped"
    except BaseException as e:
        if S.mode == "check" and S.ended:
            pass  # it crashed after the clip ran out (say, no "if not ok: break")
        else:
            status, error = "error", _describe(e)
    finally:
        try:
            _end_frame(False)
        except Exception:
            pass
        for cap in S.captures:
            try:
                cap.release()
            except Exception:
                pass
        B.flush()
    out = {
        "status": status,
        "error": error,
        "seconds": round(time.monotonic() - started, 3),
        "framesRead": S.frames_read,
        "records": [S.records.get(i) for i in range(len(S.clip["frames"]))] if S.clip else [],
        "inRange": S.inrange,
        "trackbars": S.tb_log,
        "shown": sorted(S.shown),
    }
    S.ns = None
    ns.clear()
    return json.dumps(out)
`;
