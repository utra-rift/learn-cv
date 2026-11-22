/// <reference lib="webworker" />
// Python and OpenCV live here. A script runs synchronously inside a call;
// it talks to the page through shared memory (blocking reads) and messages
// (frames, windows, logs).

import type { PyodideAPI } from "pyodide";
import { PACKAGES, TOOLS } from "#/tools";
import { emit, prefetch, serve } from "../rpc";
import { type CvHarness, clipsIn, createCvHarness } from "./harness";
import {
	CTRL,
	type CvEvent,
	FRAME_BYTES,
	MAX_TRACKBARS,
	MAX_WINDOWS,
	type SharedBuffers,
} from "./shared";
import type { ClipRun, CvBridge, ScriptRun, WatchKind } from "./types";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (event: CvEvent, transfer: Transferable[] = []) =>
	scope.postMessage(event, transfer);

let shared: SharedBuffers | undefined;
let ctrl: Int32Array;
let frames: Uint8Array;
let booting: Promise<CvHarness> | undefined;

// Per-run state for the bridge.
let mode: "live" | "check" = "live";
let remembered: Record<string, number> = {};
const windows = new Map<string, number>();
let trackbarCount = 0;
interface Held {
	name: string;
	index: number;
	width: number;
	height: number;
	data: Uint8Array;
	frame: number;
}
const held = new Map<string, Held>();
const lastShown = new Map<string, number>();
const rates = new Map<string, { last: number; fps: number }>();

function windowIndex(name: string): number {
	let index = windows.get(name);
	if (index === undefined) {
		index = windows.size % MAX_WINDOWS;
		windows.set(name, index);
		Atomics.store(ctrl, CTRL.BUSY + index, 0);
		post({ type: "window", op: "create", name, index });
	}
	return index;
}

function send(frame: Held) {
	const rate = rates.get(frame.name);
	Atomics.store(ctrl, CTRL.BUSY + frame.index, 1);
	lastShown.set(frame.name, performance.now());
	post(
		{
			type: "frame",
			name: frame.name,
			index: frame.index,
			width: frame.width,
			height: frame.height,
			data: frame.data.buffer as ArrayBuffer,
			frame: frame.frame,
			fps: rate?.fps ?? 0,
		},
		[frame.data.buffer],
	);
}

/** Sends frames that waited for their window to finish drawing. */
function flush() {
	for (const [name, frame] of held) {
		if (Atomics.load(ctrl, CTRL.BUSY + frame.index) === 0) {
			held.delete(name);
			send(frame);
		}
	}
}

const bridge: CvBridge = {
	camera_open() {
		Atomics.store(ctrl, CTRL.CAMERA, 0);
		post({ type: "camera", op: "open" });
		// Wait for the page to start the camera (and the student to allow it).
		// Short waits, so Stop still gets through.
		while (Atomics.load(ctrl, CTRL.CAMERA) === 0) {
			Atomics.wait(ctrl, CTRL.CAMERA, 0, 100);
			if (shared && new Int32Array(shared.interrupt)[0] !== 0) return false;
		}
		return Atomics.load(ctrl, CTRL.CAMERA) === 1;
	},
	camera_read(target, lastSeq) {
		let seq = Atomics.load(ctrl, CTRL.SEQ);
		if (seq === lastSeq) {
			if (Atomics.load(ctrl, CTRL.CAMERA) === 2) return -2;
			Atomics.wait(ctrl, CTRL.SEQ, lastSeq, 100);
			seq = Atomics.load(ctrl, CTRL.SEQ);
			if (seq === lastSeq)
				return Atomics.load(ctrl, CTRL.CAMERA) === 2 ? -2 : -1;
		}
		const slot = seq % 2;
		const buffer = (target as { getBuffer(type: string): PyBuffer }).getBuffer(
			"u8",
		);
		try {
			buffer.data.set(
				frames.subarray(slot * FRAME_BYTES, (slot + 1) * FRAME_BYTES),
			);
		} finally {
			buffer.release();
		}
		return seq;
	},
	camera_release() {
		post({ type: "camera", op: "release" });
	},
	show(name, rgba, frame) {
		const index = windowIndex(name);
		const now = performance.now();
		const rate = rates.get(name);
		if (rate) {
			const dt = (now - rate.last) / 1000;
			if (dt > 0)
				rate.fps = rate.fps ? rate.fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;
			rate.last = now;
		} else {
			rates.set(name, { last: now, fps: 0 });
		}
		const busy = Atomics.load(ctrl, CTRL.BUSY + index) !== 0;
		// Check mode runs flat out; the windows only need about 25 frames a second.
		if (mode === "check" && now - (lastShown.get(name) ?? 0) < 40) return;
		const buffer = (rgba as { getBuffer(type: string): PyBuffer }).getBuffer(
			"u8",
		);
		let held_: Held;
		try {
			const [height, width] = buffer.shape;
			held_ = { name, index, width, height, data: buffer.data.slice(), frame };
		} finally {
			buffer.release();
		}
		// At most one frame per window in flight; a newer one replaces a waiting one.
		if (busy) held.set(name, held_);
		else {
			held.delete(name);
			send(held_);
		}
	},
	window(op, name) {
		if (op === "create") {
			windowIndex(name);
			return;
		}
		if (op === "destroy") {
			const index = windows.get(name) ?? -1;
			windows.delete(name);
			held.delete(name);
			post({ type: "window", op, name, index });
			return;
		}
		windows.clear();
		held.clear();
		post({ type: "window", op: "destroyAll", name: "", index: -1 });
	},
	trackbar_create(window, name, value, max) {
		const slot = trackbarCount++ % MAX_TRACKBARS;
		const saved =
			mode === "live" ? remembered[`${window}\u0000${name}`] : undefined;
		const start = saved !== undefined && saved <= max ? saved : value;
		Atomics.store(ctrl, CTRL.TRACKBAR + slot, start);
		windowIndex(window);
		post({ type: "trackbar", window, name, slot, max, initial: value });
		return slot;
	},
	trackbar_get(slot) {
		return Atomics.load(ctrl, CTRL.TRACKBAR + slot);
	},
	trackbar_set(slot, value) {
		Atomics.store(ctrl, CTRL.TRACKBAR + slot, value);
	},
	wait_key(ms) {
		flush();
		let key = Atomics.exchange(ctrl, CTRL.KEY, -1);
		if (key === -1 && ms > 0) {
			Atomics.wait(ctrl, CTRL.KEY, -1, ms);
			key = Atomics.exchange(ctrl, CTRL.KEY, -1);
		}
		return key;
	},
	sleep(ms) {
		if (ms > 0) Atomics.wait(ctrl, CTRL.SLEEP, 0, Math.min(ms, 1000));
	},
	flush,
};

interface PyBuffer {
	data: Uint8Array;
	shape: number[];
	release(): void;
}

async function fetchClip(name: string): Promise<Uint8Array | null> {
	const response = await fetch(`${TOOLS.clips.base}/${name}.zip`);
	if (!response.ok) return null;
	return new Uint8Array(await response.arrayBuffer());
}

async function boot(): Promise<CvHarness> {
	const base = new URL(TOOLS.pyodide.base, location.origin).href;
	await prefetch(
		TOOLS.pyodide.files.map((file) => `${base}/${file}`),
		"Python and OpenCV",
		(loaded, total, label) => emit({ type: "progress", loaded, total, label }),
	);
	const { loadPyodide } = (await import(
		/* @vite-ignore */ `${base}/pyodide.mjs`
	)) as {
		loadPyodide: (options: { indexURL: string }) => Promise<PyodideAPI>;
	};
	const py = await loadPyodide({ indexURL: `${base}/` });
	await py.loadPackage([...PACKAGES], { messageCallback: () => {} });
	if (shared) py.setInterruptBuffer(new Int32Array(shared.interrupt));
	const harness = createCvHarness(py, bridge, fetchClip, (text, stream) =>
		post({ type: "log", text, stream }),
	);
	emit({ type: "ready" });
	return harness;
}

function reset(nextMode: "live" | "check") {
	mode = nextMode;
	windows.clear();
	held.clear();
	rates.clear();
	lastShown.clear();
	trackbarCount = 0;
	if (shared) Atomics.store(new Int32Array(shared.interrupt), 0, 0);
	Atomics.store(ctrl, CTRL.KEY, -1);
	for (let i = 0; i < MAX_WINDOWS; i++) Atomics.store(ctrl, CTRL.BUSY + i, 0);
}

export interface LiveRequest {
	source: string;
	/** Slider positions the student left, by "window\0name". */
	trackbars: Record<string, number>;
}

export interface CheckRequest {
	source: string;
	clips: string[];
	watch: Record<string, WatchKind>;
}

serve({
	init(params: SharedBuffers) {
		shared = params;
		ctrl = new Int32Array(params.control);
		frames = new Uint8Array(params.frames);
		booting ??= boot();
		return booting.then(() => true);
	},
	async syntax(source: string) {
		booting ??= boot();
		return (await booting).checkSyntax(source);
	},
	async live(request: LiveRequest): Promise<ScriptRun> {
		booting ??= boot();
		const harness = await booting;
		await harness.loadClips(clipsIn(request.source));
		reset("live");
		remembered = request.trackbars;
		post({ type: "clip", name: null });
		return harness.runLive(request.source);
	},
	async check(request: CheckRequest): Promise<ClipRun[]> {
		booting ??= boot();
		const harness = await booting;
		await harness.loadClips(request.clips);
		const runs: ClipRun[] = [];
		for (const clip of request.clips) {
			reset("check");
			post({ type: "clip", name: clip, labels: harness.labels(clip) });
			const run = harness.runCheck(request.source, clip, request.watch);
			runs.push(run);
			if (run.status === "stopped") break;
		}
		return runs;
	},
});
