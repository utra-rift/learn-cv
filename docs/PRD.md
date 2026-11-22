# Browser CV Workshop: PRD

Nov 22, 2026 · @Evan

## Overview

Learn CV is a browser playground for a RIFT computer vision workshop of under an hour. Students hold something up to their laptop camera and build a tracker step by step. Any solid, brightly coloured object works: a tennis ball, a sticky note, a marker cap. They go from a colour mask to a contour fit to a Kalman filter that keeps tracking the object while it's hidden, then use the same contour tools to count raised fingers. It ends with a short bridge to armor plate detection, the vision task that matters for ARC.

Students write ordinary desktop OpenCV in Python: a `while True:` loop with `cap.read()`, `cv2.imshow`, `cv2.createTrackbar` and `cv2.waitKey`. Real OpenCV runs in Pyodide inside a Web Worker. A small set of shims replaces the parts of `cv2` that need a desktop (the camera, windows, trackbars, keys) with browser equivalents. So the code a student writes here runs unchanged on a laptop or the robot's vision computer.

It's the sister app of [Learn PID](https://github.com/utra-rift/pid-workshop). It reuses that app's RIFT design system, Pyodide worker plumbing, Monaco editor and coaching style. It's built with TanStack Start and deploys to Cloudflare Workers with Alchemy, because it serves large files (Pyodide, the OpenCV wheel and recorded test clips) from R2.

## Goals and non-goals

By the end of the session, every student has a working object tracker and finger counter on their own camera and knows how each piece maps to armor plate auto-aim.

**Goals**

- Zero install. A student opens a link in a laptop browser, allows the camera and is coding within 2 minutes on campus Wi-Fi, once the toolchain is cached.
- Students write standard desktop OpenCV. Every script on the site also runs with `pip install opencv-python` and no changes.
- Every level can be checked automatically against a recorded clip, so a student knows they're done without asking the instructor.
- Failed checks get a plain-English reason based on what the code did ("the mask is empty in 80% of frames: your hue range is probably too narrow"), in the same style as Learn PID's coach.
- Camera frames never leave the device.

**Non-goals**

- C++. Learn PID covers it, and OpenCV's C++ API in the browser would need its own compiler pipeline.
- Neural network detectors (YOLO and similar). They come up as a one-slide mention in the last level.
- Accounts or any server that stores data. Progress lives in localStorage, as in Learn PID.
- Phone layouts. Phones can open the site but aren't designed for.
- Covering all of `cv2.highgui`. Only the calls the levels use are shimmed (see Functional requirements).

## Users and workshop flow

The audience is RIFT members with mixed experience: some have never written Python, some already write firmware. An instructor runs the session from a projector in the Arena (dark) theme. Each student works on their own laptop with any solid-coloured object, and the instructor brings tennis balls and sticky notes for anyone without one. Four levels fit in 45 minutes, with 5 minutes of setup before and a 5-minute armor plate demo at the end. Distance estimation and camera calibration are left for a follow-up session.

| # | Level | Minutes | Student writes | Checked on clips by |
| --- | --- | --- | --- | --- |
| 1 | See it | 8 | `cv2.cvtColor` to HSV and `cv2.inRange`, with bounds from trackbars tuned on their own object | Mask overlap with the labelled object, on clips of a ball, a sticky note and a cup |
| 2 | Find it | 10 | `morphologyEx` open then close, `findContours`, the largest blob, `minEnclosingCircle` or `boundingRect`, and a size check that rejects noise | Centre error and missed frames, including frames where fingers cover part of the object |
| 3 | Track it | 17 | A constant-velocity Kalman filter in NumPy that keeps predicting while the object is hidden, then an aim point a lead time ahead | Centre error through a half-second occlusion, and lead error on a thrown-ball clip |
| 4 | Count fingers | 10 | Press `b` to save the empty background, `cv2.absdiff` to find the hand, then `convexHull` and `convexityDefects`, counting the deep defects | Finger count per frame on gesture clips showing 0 to 5 fingers |

Level 4 finds the hand by difference from a saved background instead of a skin-colour threshold. That works the same for every skin tone and needs no tuning, as long as the camera stays still and the background behind the hand is plain. The closing demo shows armor plates as two light bars instead of one blob, through the same pipeline, and isn't checked.

The formulas the levels teach:

```latex
\hat{x}_{k|k-1} = F \hat{x}_{k-1}, \qquad \hat{x}_k = \hat{x}_{k|k-1} + K_k \left( z_k - H \hat{x}_{k|k-1} \right)
```

```latex
p_{\text{aim}} = p + v \, t_{\text{lead}}
```

Every level has two modes. **Live** runs the student's script on their webcam, which is where the learning happens. **Check** runs the same script on a recorded clip with labelled ball positions and grades it, which is how a student knows they're done. Pass thresholds are calibrated against reference solutions during the build, the same way Learn PID's were.

The instructor needs three things: `?instructor=1` to unlock every level and show answers, the Arena theme for the projector, and a fullscreen view of one student's output window for showing a mistake to the room.

## Functional requirements

### Routes

| Route | Purpose | SSR |
| --- | --- | --- |
| `/` | What this is, a camera check (allow access, see yourself), a toolchain download with a progress bar, the level list | yes |
| `/level/$levelId` | The play screen | no |
| `/playground` | One blank script and the camera, for free play after the session | no |

### cv2 shims

The shims are installed by assigning onto the real module before the student's code runs (`cv2.imshow = shim_imshow`), so everything else in `cv2` stays real OpenCV 4.11.

| Desktop call | In the browser |
| --- | --- |
| `cv2.VideoCapture(0)` | The webcam. `read()` blocks until a frame newer than the last one returned is in shared memory, then returns `(True, frame)` as a BGR `uint8` array |
| `cv2.VideoCapture("ball.mp4")` | A recorded clip, stored as JPEG frames in the Pyodide file system and decoded with `cv2.imdecode`. Frame by frame and deterministic, so Check gives the same result every run. Returns `(False, None)` at the end |
| `cap.isOpened()`, `cap.release()`, `cap.get(cv2.CAP_PROP_FPS)`, `CAP_PROP_FRAME_WIDTH` and `HEIGHT` | Answer from the camera or clip settings |
| `cv2.namedWindow(name)` | A panel on the page titled `name`. `imshow` creates it if it doesn't exist yet |
| `cv2.imshow(name, img)` | Draws a BGR, BGRA or single-channel image in that panel. A mask shows as greyscale |
| `cv2.createTrackbar(track, window, value, max, onChange)` | A labelled slider under that window. `onChange` is called from inside `waitKey` |
| `cv2.getTrackbarPos(track, window)`, `setTrackbarPos` | Read and set the slider |
| `cv2.waitKey(ms)` | Waits up to `ms` (at least one frame's worth when 0 would block forever), runs trackbar callbacks, and returns the last key pressed over the page or `-1`. `q` and Esc work as students expect |
| `cv2.destroyAllWindows()`, `destroyWindow(name)` | Remove the panels |

Anything else in `cv2.highgui` raises a clear error naming the call and saying it isn't available in the browser, rather than an OpenCV backend error.

### Play screen

The layout follows Learn PID: level brief on the left, editor and console on the right on wide screens, stacked on narrow ones.

- **Brief.** Title, the idea in two or three sentences, the goal, two hints shown one at a time, and an Answer dialog (instructor mode, or after both hints and two failed checks).
- **Windows.** The `imshow` panels, tiled, each scaled to fit. A frame-rate readout per window. Clicking a panel opens it fullscreen for the projector.
- **Editor.** Monaco with one file, `main.py`, plus Run, Stop, Reset, Share and "use my code from the last level". Ctrl/Cmd+Enter runs. The Live and Check toggle sits next to Run.
- **Console.** `print` output, tracebacks trimmed to the student's lines, and in Check mode a one-line summary per clip.
- **Verdict.** Ready, Running, a pass with the takeaway and a link to the next level, or a fail with the coach message.
- **Overlay of the answer.** In Check mode, the labelled ball position draws as a ring on the clip, so students can see where they're off.

### Running and stopping

- Run starts the script in the worker. Stop raises `KeyboardInterrupt` in Python through the interrupt buffer. If Python doesn't stop within 2 s, the worker is restarted, with Pyodide reloaded from cache.
- A script that never calls `waitKey` or `read()` still runs, and Stop still works.
- Check mode runs the script on every clip for the level with the webcam off, then grades it. It goes through the same shims, so a script that works in Live works in Check.

### Coaching

First code problems: syntax errors on their line, `cv2.findContours` unpacked into the wrong number of values, `max()` of an empty contour list, BGR treated as RGB, HSV hue above 179. Then level-specific messages with numbers from the run, such as "the circle is 18 px off on average once fingers cover the object". Then general advice.

### Progress and sharing

Same as Learn PID: localStorage keyed by level number, code per level, passed levels and hints shown. Share links carry the code in the URL hash with lz-string.

## Technical architecture

The student's script runs in a Web Worker and blocks there on shared memory, so a desktop-style `while True:` loop never freezes the page. This reuses Learn PID's Pyodide worker, RPC and interrupt code, plus one new piece: the shims.

&#91;embedded content: architecture · browser threads and Cloudflare\]

The main thread owns everything the browser only allows there (the camera, canvases, sliders, key events). The worker owns Python. They meet in a SharedArrayBuffer.

### Stack

| Piece | Choice |
| --- | --- |
| App | TanStack Start, React 19, Vite, the same versions as Learn PID |
| UI | Tailwind 4, shadcn/ui, the RIFT tokens and components copied from `src/design` and `src/components/ui` in pid-workshop |
| Python | Pyodide 314.0.7 (Python 3.14) in a worker, with `numpy` 2.4.6 and `opencv-python` 4.11.0.86 from Pyodide's package set |
| Editor | Monaco 0.57, trimmed to the Python grammar. basedpyright in a worker if OpenCV's type stubs load in it (open question) |
| Hosting | Cloudflare Workers, deployed with Alchemy (`alchemy.run.ts`), with an R2 bucket for the large files |

### Frames and blocking

- **Camera to Python.** The main thread draws each camera frame (320×240) to an `OffscreenCanvas`, copies its RGBA pixels into a frame slot in shared memory and bumps a sequence number with `Atomics.notify`. `cap.read()` waits with `Atomics.wait` until the sequence number moves past the last frame it returned, copies the slot into a NumPy array and converts it to BGR. Python always gets the newest frame, and slow code skips frames instead of falling behind.
- **Python to windows.** `imshow` converts the image to RGBA in Python and posts the buffer to the main thread as a transferable, which draws it with `putImageData`. At most one frame per window is in flight; later frames replace queued ones.
- **Sliders and keys.** Each trackbar owns a slot in a shared `Int32Array` that the slider writes. `getTrackbarPos` reads it with `Atomics.load`. Key presses over the page go into one more slot, which `waitKey` reads and clears.
- **Stop.** Pyodide's interrupt buffer, as in Learn PID.
- **Check mode.** Clips are JPEG frame sequences with a `labels.json`, unpacked into the Pyodide file system. `VideoCapture(path)` decodes them with `cv2.imdecode`, so grading is deterministic and doesn't depend on browser video decoders.

### Deployment

The large files are Pyodide (about 15 MB uncompressed in Learn PID's build), NumPy, the OpenCV wheel and the clips. Learn PID serves its toolchains from a separate R2 bucket at `cdn2.evanyu.dev` and deploys the app to Vercel. Here, Alchemy puts the app and the bucket on one Cloudflare account:

- `alchemy.run.ts` declares an R2 bucket and a `TanStackStart` resource with the bucket bound to it.
- The Worker serves `/tools/*` and `/clips/*` from the binding. Paths include versions and are cached as immutable.
- Everything is same-origin, so COEP `require-corp` needs no CORS or `Cross-Origin-Resource-Policy` setup on the bucket.
- COOP and COEP go on every response: pages and R2 responses from the Worker, and static assets through a `_headers` file, because Workers serves static assets without running the Worker. A smoke script checks the headers on a page, a script, a worker file and a wasm file after each deploy, like Learn PID's `check-vercel.mjs`.
- A service worker caches `/tools` and `/clips` after the first visit, so a second visit and the venue's Wi-Fi don't matter.

## Design

Learn CV uses the RIFT design system exactly as pid-workshop does, so the two apps look like one product. Copy, don't re-derive:

- `src/design/tokens.css` and `src/design/brand-book.md`: navy, ice, cyan and violet, the light and Arena (dark) themes, the 4 px spacing scale and the shadcn aliases.
- `src/styles.css`: the Tailwind `@theme` with the font stacks (Lexend Giga for display, Lexend, JetBrains Mono) and radii.
- `src/components/ui/*` (button, badge, card, progress, switch, toggle group, tooltip, popover, alert dialog) and `src/components/site/SiteHeader.tsx`.
- `public/logos` and `public/fonts`.

Rules from the brand book that matter most here:

- Headlines are one to three words in capitals: `SEE IT`, `FIND IT`, `TRACK IT`, `COUNT FINGERS`.
- Sharp corners. `radius-md` for the window panels, `radius-pill` only for tags.
- Cyan is the one overlay colour on camera output (masks, circles, the Kalman estimate). Violet is the predicted aim point, as the rare second accent. Labelled answers in Check mode draw in `ink-muted`, dashed.
- Arena theme by default on `?projector=1` and for the fullscreen window view.
- Pixel counts, frame rates and HSV values go in `data` (mono).

The play screen keeps Learn PID's level chips in the top bar, brief panel, editor header, console and verdict components, adapted for one language. The window panels are the new component: a canvas, a title in `label`, a frame-rate readout in `data` and the window's trackbars beneath it.

## Performance, support and risks

**Targets.** 15 fps or better for the level 3 reference solution at 320×240 on the weakest laptop the team has. Toolchain ready within 60 s on a first visit and 5 s on a repeat visit.

**Browsers.** Current Chrome, Edge, Firefox and Safari on laptops. All four support SharedArrayBuffer on cross-origin isolated pages and camera access over HTTPS. Learn PID was only tested in Chromium, so Firefox and Safari need a pass of their own.

| Risk | Mitigation |
| --- | --- |
| The OpenCV wheel is large and its size isn't measured yet | Measure in the spike. Ask students to open the site before the session; the service worker keeps it after that |
| Frame copies between threads are too slow on old laptops | Capture at 320×240, one copy in and one out per frame, and drop frames rather than queue them. Fall back to 160×120 if the spike misses 15 fps |
| A student's camera is blocked, missing or in use by another app | The landing page's camera check names the problem. Every level still works in Check mode on clips, so nobody sits idle |
| Colour thresholds fail under the room's lighting | Level 1 has students tune live, which is the lesson. The instructor's spares are bright, saturated colours |
| Finger counting fails on a busy background | The level asks for a plain wall or desk behind the hand and shows the difference mask so students can see why |
| Recording and labelling clips takes longer than expected | Label every 5th frame by hand and interpolate; record against a plain background |

### Open questions

- Does `opencv-python` 4.11 in Pyodide include `cv2.KalmanFilter` and `convexityDefects` without surprises? Both are core modules, so likely yes; the spike confirms.
- Do OpenCV's type stubs load in basedpyright? If not, ship the editor without a language server and keep the syntax checks.
- Alchemy v1 (`alchemy/cloudflare`) or v2 (`alchemy/Cloudflare`, Effect-based)? Pick whichever has the stable TanStack Start resource at build time.
- New repo (`utra-rift/cv-workshop`) or a second app beside pid-workshop in one monorepo? A new repo with copied design files is simpler for now.
- Who records the clips, and with which objects?

### Milestones

1. **Spike.** OpenCV loads in the worker; a shimmed `VideoCapture` and `imshow` loop runs at 15 fps on a weak laptop; wheel size measured. Exit: a decision on resolution.
2. **Shims and playground.** Every shim in the table, Stop, the `/playground` route, the RIFT design. Exit: a desktop OpenCV script runs unchanged.
3. **Levels and Check.** Four levels with starters, solutions, hints, clips, labels, pass thresholds and coach messages; tests that run every solution on the clips in Node, as Learn PID does. Exit: solutions pass, starters fail.
4. **Deploy and dry run.** Alchemy deploy, header smoke check, service worker, a run-through with two or three members on their own laptops. Exit: every level passes on each laptop in under 45 minutes.

## Sources

- [pid-workshop](https://github.com/utra-rift/pid-workshop): README, `docs/SPEC.md`, `src/design`, the Pyodide worker in `src/runtimes/python`
- Pyodide 314.0.7 `pyodide-lock.json` (npm package `pyodide`): `opencv-python` 4.11.0.86 and `numpy` 2.4.6
- [Alchemy: TanStack Start on Cloudflare](https://alchemy.run/cloudflare/frontend/tanstack-start) and [R2Bucket](https://alchemy.run/docs/providers/cloudflare/bucket)
