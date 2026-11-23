# Learn CV

A browser playground for the RIFT computer vision workshop. Students start with the basics (getting a picture from the camera, and reading the NumPy array inside it), then hold something bright up to their laptop camera and build a tracker: a colour mask, a contour fit, a Kalman filter that keeps tracking while the object is hidden, and a finger counter. A closing demo shows the same pipeline finding armor plates.

Students write ordinary desktop OpenCV in Python: a `while True:` loop with `cap.read()`, `cv2.imshow`, `cv2.createTrackbar` and `cv2.waitKey`. Real OpenCV 4.11 runs in Pyodide inside a Web Worker. A few shims replace the parts of `cv2` that need a desktop (camera, windows, trackbars, keys), so every script here also runs unchanged with `pip install opencv-python`. Camera frames never leave the browser.

It's the sister app of [Learn PID](https://github.com/utra-rift/pid-workshop) and uses the same RIFT design system, worker plumbing, Monaco editor and coaching style. The product spec is [docs/PRD.md](docs/PRD.md).

## Run it

```bash
bun install
bun dev           # http://localhost:3000
```

`bun dev` (and `bun run build`) first runs `scripts/sync-tools.ts`, which fills two gitignored folders in `public/`:

- `public/tools/pyodide/314.0.7/`: Pyodide from npm, plus the NumPy 2.4.6 and OpenCV 4.11.0.86 wheels downloaded once from Pyodide's CDN and checked against the sha256 in `pyodide-lock.json`.
- `public/clips/v2/`: the Check-mode clips, rendered by `scripts/make-clips.ts`.

They're ordinary static files: the dev server serves them at `/tools` and `/clips`, and in production they're Worker static assets at the same paths. The dev server runs the app in workerd through Cloudflare's Vite plugin, like production.

| What a student downloads | Size |
|---|---|
| Pyodide (wasm, stdlib, loader) | 13 MB |
| NumPy + OpenCV wheels | 13.6 MB |
| Clips, per level | 1 to 3 MB |

A service worker (`public/sw.js`) keeps `/tools` and `/clips` after the first visit, so the second visit works on bad Wi-Fi.

Add `?instructor=1` to any URL to unlock every level, show the answers, the presenter notes and the run sheet on the landing page. `?projector=1` switches to the Arena (dark) theme; so does the moon button in the header. `=0` turns either off.

## Running the session

The landing page is the setup checklist: test the camera, download Python (27 MB), grab a bright object. Ask students to do it before the session.

With `?instructor=1`, the landing page shows the run sheet (5 min setup; levels of 4, 6, 7, 9, 14 and 9 minutes; a 4 min armor demo; 58 minutes in all) and each level shows presenter notes: what to draw, what to live-code, and the usual mistakes.

Every level is a numbered list of small steps, and the starter code has matching `# STEP n` comments, so you can say "step 3" and everyone finds the line. Most steps are a one-line change. The two intro levels explain every line in comments. Levels 4 and 5 build on the level before, and their starters already contain its answer, so a student who falls behind can open the next level ("Open it anyway") and keep up.

Each level has two modes next to Run:

- **Live** runs the script on the webcam. Sliders keep their positions between runs (and between levels), so tuning isn't lost. Keys pressed over the page go to `waitKey`, so `q` and Esc work.
- **Check** runs the same script on recorded clips and grades it. It sets the colour sliders to each clip's colours, presses `b` for level 4, draws the labelled answer as a dashed ring, and prints one line per clip.

Click any window to show it fullscreen in the Arena theme, for the projector.

## The levels

| # | Level | Student writes | Check grades |
|---|---|---|---|
| 1 | Camera on | `VideoCapture`, the read loop, `imshow`, `waitKey`, a `cvtColor` to grey | `gray` equals OpenCV's greyscale of each frame, and two windows are shown |
| 2 | Pixels | `frame[y, x]`, a slice around the centre of the HSV frame, `.mean()` | `picked` is the H, S and V of the 10 × 10 square in the middle, in 85% of frames |
| 3 | See it | `cvtColor` to HSV, sliders into `inRange` | `mask` overlaps the object 60%+ on a ball, a sticky note and a cup |
| 4 | Find it | open/close, `findContours`, biggest blob, size check, `minEnclosingCircle` | `center` within 4 px while fingers cover the object, ≤10% missed, ≤20% false when it's gone |
| 5 | Track it | constant-velocity Kalman filter in NumPy, `aim = p + v·LEAD` | `estimate` within 15 px through a half-second occlusion; `aim` within 24 px of where a thrown ball is 0.2 s later |
| 6 | Count fingers | `b` saves the background, `absdiff`, `convexHull`, `convexityDefects` | `fingers` right in 85% of frames and 70% of each count, on three skin tones |
| 7 | Armor plates | nothing: a demo of pairing two light bars | not checked |

The checker reads the student's top-level variables (`gray`, `picked`, `mask`, `center`, `estimate`, `aim`, `fingers`) at each `waitKey` call, which marks the end of a frame. They're plain variables, so the script still runs on a laptop.

Thresholds were set against the reference solutions: levels 1 and 2 match exactly, level 3 overlaps 80 to 98%, level 4 is 0.5 to 1.1 px off, level 5 is 9 px off while hidden and aims 18 px from where the ball ends up, level 6 is right in 100% of frames. Level 2 also tells students when x and y are swapped or the square came from the BGR frame.

The coach checks code problems first: syntax errors on their line, `findContours` unpacked into three values, `max()` of an empty contour list, `COLOR_RGB2HSV`, a hue slider or bound above 179, bounds hard-coded instead of read from the sliders. Then it gives level advice with numbers from the run ("The circle is 9.2 px off on average once fingers cover the ball"). Tracebacks are trimmed to `main.py`.

## Tests

```bash
bun run tools          # once, fills public/tools and public/clips
bun test               # every level's answer, starter and wrong answers on the real clips
bun run typecheck
bun run check          # Biome
```

`tests/levels.test.ts` boots real Pyodide and OpenCV in Bun, runs the same shims the browser uses, and checks that every solution passes, every starter fails, and each wrong answer gets its expected coach message (39 tests). It also covers the shims: clips ending, trackbar callbacks, slider presets, `imshow` dtypes, unsupported highgui calls and the `b` key. About 8 seconds.

The browser smoke test needs a running server and Playwright's Chromium (`~/Library/Caches/ms-playwright`, or set `CHROME_PATH`). It uses Chromium's fake camera:

```bash
bun scripts/smoke.ts http://localhost:3000
```

It covers the landing page download and camera check, a live run with windows, sliders and `q`, every level's answer in Check, a starter's coach message, Stop on a runaway loop, and a clip by name in the playground.

## How it works

```
 main thread                                   Python worker (Pyodide + OpenCV)
 ───────────                                   ─────────────────────────────────
 camera → OffscreenCanvas 320x240 ──RGBA──▶  frame slots ◀── cap.read() waits (Atomics.wait)
 sliders ──────────────────────────────────▶  trackbar slots ◀── getTrackbarPos
 key presses ──────────────────────────────▶  key slot ◀── waitKey reads and clears
 Stop ─────────────────────────────────────▶  interrupt buffer → KeyboardInterrupt
 canvases ◀── frame messages (transferred, one per window in flight) ◀── imshow
```

- `src/runtimes/cv/shim.ts` is the Python side: `install()` assigns the shims onto the real `cv2` module (`cv2.imshow = imshow`), so everything else stays real OpenCV. `VideoCapture(0)` is the webcam in Live and the clip in Check; `VideoCapture("ball.mp4")` plays a clip by name, frame by frame from JPEGs with `cv2.imdecode`, so Check is deterministic. Other highgui calls (`setMouseCallback`, `selectROI`, …) raise an error that names the call.
- `src/runtimes/cv/harness.ts` sets up a Pyodide instance with the shims. The worker (`cv.worker.ts`) and the tests share it.
- `src/runtimes/cv/shared.ts` is the shared memory layout. `cv.worker.ts` backs the `_cvbridge` module with it. `client.ts` is the page's side: it owns the camera (`camera.ts`), the windows' canvases, the sliders and keys, and Stop. If Python doesn't stop within 2 s, the worker restarts with Pyodide from cache.
- `src/levels/` defines the levels (steps, presenter notes, hints, starters, solutions, wrong answers) and how each clip is measured. A step can show pictures of what to expect; `scripts/make-figures.ts` (`bun run figures`) renders them into `public/figures/` with OpenCV. `src/coach/grade.ts` turns runs into a verdict.
- `src/components/play/` is the play screen: the brief with its steps, the windows, Monaco (Python only), the console and the verdict.
- `src/routes/`: `/` (server-rendered), `/level/$levelId` and `/playground` (client only).

### Cross-origin isolation

SharedArrayBuffer needs a cross-origin isolated page, so every response carries `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. They're set in three places: `src/start.ts` for server-rendered pages, `public/_headers` for static assets (Workers serves those without running the Worker), and `server.headers` in `vite.config.ts` for dev. `public/_headers` also marks `/tools/*` and `/clips/*` as immutable, since their paths carry versions.

## Deploy

Live at https://learn-cv.webdirector-1d0.workers.dev, on Cloudflare account `1d068566b34f167cac6462045382c0ff` (Webdirector@utra.ca), set in `wrangler.jsonc`.

It's one Worker: TanStack Start's server (built by Cloudflare's Vite plugin) plus static assets. The toolchain and clips are static assets too, about 36 MB in 18 files, the biggest the 10.7 MB OpenCV wheel, well under Workers' 25 MB per-file limit. So there's no R2 bucket and no Worker code on those requests, and redeploys only upload files that changed.

```bash
bunx wrangler login                    # or set CLOUDFLARE_API_TOKEN for that account
bun run deploy                         # sync public/tools and public/clips, build, wrangler deploy
bun scripts/check-headers.ts https://learn-cv.webdirector-1d0.workers.dev
```

A token needs Workers Scripts: Edit and Account Settings: Read on the account. `check-headers.ts` checks a page, a script, the Python worker, a wasm file, a clip and the service worker for the isolation headers. The deployed site passes it, and passes the full browser smoke test (`bun scripts/smoke.ts <url>`).

## Open items

- **Real clips.** The clips are synthetic: rendered with OpenCV from a seed (a room, a shaded tennis ball with a seam, a sticky note, a cup, fingers, a box, a throw, hands in three skin tones on plain walls, an armor plate). They behave like the real thing for grading, but the PRD wants recordings. Keep the format in `scripts/make-clips.ts` (`labels.json` with `hsv`, `keys`, `lead` and per-frame `v`, `x`, `y`, `r`, `fingers`; level 1 also needs per-frame masks), label every 5th frame and interpolate, then recalibrate the thresholds with `bun test`.
- **Language server.** The editor has syntax checking as you type (from Python's own parser) but no completion. basedpyright with OpenCV's stubs wasn't tried.
- **Browsers and laptops.** Tested in Chromium only. Firefox and Safari need a pass, and the 15 fps target needs checking on the weakest team laptop. In headless Chromium the level 1 answer runs at about 20 fps live, the fake camera's rate; Check runs at about 600 frames per second.
- **Fonts.** The Widescreen files are trial versions, copied from pid-workshop; its licence TODO applies.
