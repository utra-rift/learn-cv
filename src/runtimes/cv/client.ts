// The page's side of the Python worker: one per page. It owns the camera, the
// windows' canvases, the sliders and key presses, and runs and stops scripts.

import { storage } from "#/lib/storage";
import { type WorkerEvent, WorkerRpc } from "../rpc";
import { CameraFeed } from "./camera";
import type { CheckRequest, LiveRequest } from "./cv.worker";
import { CTRL, type CvEvent, createShared, type SharedBuffers } from "./shared";
import type {
	ClipLabels,
	ClipRun,
	ScriptRun,
	SyntaxIssue,
	WatchKind,
} from "./types";

export interface RuntimeStatus {
	state: "idle" | "loading" | "ready" | "failed";
	loaded: number;
	total: number;
	label: string;
	error?: string;
}

export interface TrackbarView {
	slot: number;
	name: string;
	max: number;
	/** The value the script gave createTrackbar. */
	initial: number;
}

export interface WindowView {
	name: string;
	index: number;
	trackbars: TrackbarView[];
}

/** A script's output line for the console. */
export interface LogLine {
	text: string;
	kind: "log" | "error" | "warning" | "info";
}

export type RunState = "idle" | "live" | "check" | "stopping";

/** How long Stop waits for Python before restarting the worker. */
const STOP_GRACE_MS = 2000;
/** Real time Check gets per clip before it's stopped. */
const CHECK_BUDGET_MS = 20_000;
/** The camera stays on this long after a script ends, in case it runs again. */
const CAMERA_LINGER_MS = 4000;

type Listener = () => void;

interface Drawn {
	image: ImageData;
	frame: number;
}

class CvRuntime {
	status: RuntimeStatus = { state: "idle", loaded: 0, total: 0, label: "" };
	runState: RunState = "idle";
	windows: WindowView[] = [];
	/** The clip playing in Check mode, for the answer overlay. */
	clip: ClipLabels | null = null;
	/** Labels of every clip Check has played, for grading. */
	readonly clipLabels = new Map<string, ClipLabels>();
	readonly fps = new Map<string, number>();

	private readonly shared: SharedBuffers;
	private readonly ctrl: Int32Array;
	private readonly interrupt: Int32Array;
	private readonly camera: CameraFeed;
	private rpc: WorkerRpc;
	private starting?: Promise<void>;
	private listeners = new Set<Listener>();
	private logListeners = new Set<(line: LogLine) => void>();
	private canvases = new Map<string, Set<HTMLCanvasElement>>();
	private latest = new Map<string, Drawn>();
	private cameraTimer?: ReturnType<typeof setTimeout>;
	private stopTimer?: ReturnType<typeof setTimeout>;

	constructor() {
		this.shared = createShared();
		this.ctrl = new Int32Array(this.shared.control);
		this.interrupt = new Int32Array(this.shared.interrupt);
		this.camera = new CameraFeed(
			this.ctrl,
			new Uint8Array(this.shared.frames),
			(message) => this.log({ text: message, kind: "error" }),
		);
		this.rpc = new WorkerRpc(
			() =>
				new Worker(new URL("./cv.worker.ts", import.meta.url), {
					type: "module",
					name: "python-opencv",
				}),
			this.onWorkerEvent,
		);
	}

	// ---------------------------------------------------------------- subscriptions

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onLog(listener: (line: LogLine) => void): () => void {
		this.logListeners.add(listener);
		return () => this.logListeners.delete(listener);
	}

	/** Bumped on every change, for useSyncExternalStore. */
	version = 0;

	private changed() {
		this.version++;
		for (const listener of this.listeners) listener();
	}

	private log(line: LogLine) {
		for (const listener of this.logListeners) listener(line);
	}

	private setStatus(patch: Partial<RuntimeStatus>) {
		this.status = { ...this.status, ...patch };
		this.changed();
	}

	private setRunState(state: RunState) {
		this.runState = state;
		this.changed();
	}

	// ---------------------------------------------------------------- boot

	/** Downloads and starts Python and OpenCV. Safe to call more than once. */
	ready(): Promise<void> {
		this.starting ??= (async () => {
			if (!globalThis.crossOriginIsolated) {
				const error =
					"This page isn't cross-origin isolated, so Python can't share memory with the camera. Reload it; if that doesn't help, the server is missing its COOP and COEP headers.";
				this.setStatus({ state: "failed", error });
				throw new Error(error);
			}
			this.setStatus({ state: "loading", error: undefined });
			try {
				await this.rpc.call("init", this.shared);
				this.setStatus({ state: "ready" });
				storage.markDownloaded();
			} catch (error) {
				this.setStatus({
					state: "failed",
					error: String((error as Error)?.message ?? error),
				});
				this.starting = undefined;
				throw error;
			}
		})();
		return this.starting;
	}

	private onWorkerEvent = (event: WorkerEvent | CvEvent) => {
		switch (event.type) {
			case "progress":
				this.setStatus({
					state: "loading",
					loaded: event.loaded,
					total: event.total,
					label: event.label,
				});
				return;
			case "failed":
				this.setStatus({ state: "failed", error: event.message });
				return;
			case "ready":
				return;
			case "log":
				this.log({
					text: event.text,
					kind: event.stream === "stderr" ? "warning" : "log",
				});
				return;
			case "window":
				this.onWindow(event);
				return;
			case "trackbar":
				this.onTrackbar(event);
				return;
			case "frame":
				this.onFrame(event);
				return;
			case "camera":
				if (event.op === "open") {
					clearTimeout(this.cameraTimer);
					void this.camera.start();
				} else this.releaseCamera();
				return;
			case "clip":
				this.clip = (event.labels as ClipLabels | undefined) ?? null;
				if (this.clip) this.clipLabels.set(this.clip.name, this.clip);
				this.windows = [];
				this.latest.clear();
				this.changed();
				return;
		}
	};

	// ---------------------------------------------------------------- windows

	private onWindow(event: Extract<CvEvent, { type: "window" }>) {
		if (event.op === "create") {
			if (!this.windows.some((w) => w.name === event.name)) {
				this.windows = [
					...this.windows,
					{ name: event.name, index: event.index, trackbars: [] },
				];
				this.changed();
			}
		} else if (this.runState === "check") {
			// Keep the last frame and the answer on screen after a check.
			return;
		} else if (event.op === "destroy") {
			this.windows = this.windows.filter((w) => w.name !== event.name);
			this.latest.delete(event.name);
			this.changed();
		} else {
			this.windows = [];
			this.latest.clear();
			this.changed();
		}
	}

	private onTrackbar(event: Extract<CvEvent, { type: "trackbar" }>) {
		this.windows = this.windows.map((w) =>
			w.name === event.window
				? {
						...w,
						trackbars: [
							...w.trackbars.filter((t) => t.name !== event.name),
							{
								slot: event.slot,
								name: event.name,
								max: event.max,
								initial: event.initial,
							},
						],
					}
				: w,
		);
		this.changed();
	}

	private onFrame(event: Extract<CvEvent, { type: "frame" }>) {
		const image = new ImageData(
			new Uint8ClampedArray(event.data),
			event.width,
			event.height,
		);
		this.latest.set(event.name, { image, frame: event.frame });
		this.fps.set(event.name, event.fps);
		for (const canvas of this.canvases.get(event.name) ?? []) {
			this.draw(canvas, event.name);
		}
		Atomics.store(this.ctrl, CTRL.BUSY + event.index, 0);
	}

	/**
	 * Gives a canvas to the runtime, which draws every frame of the window into
	 * it. Returns a function that takes it back.
	 */
	attachCanvas(name: string, canvas: HTMLCanvasElement): () => void {
		let set = this.canvases.get(name);
		if (!set) {
			set = new Set();
			this.canvases.set(name, set);
		}
		set.add(canvas);
		this.draw(canvas, name);
		return () => set.delete(canvas);
	}

	private draw(canvas: HTMLCanvasElement, name: string) {
		const drawn = this.latest.get(name);
		if (!drawn) return;
		const { image, frame } = drawn;
		if (canvas.width !== image.width) canvas.width = image.width;
		if (canvas.height !== image.height) canvas.height = image.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.putImageData(image, 0, 0);
		const clip = this.clip;
		if (
			clip &&
			frame >= 0 &&
			image.width === clip.width &&
			image.height === clip.height
		) {
			drawAnswer(ctx, canvas, clip, frame);
		}
	}

	getTrackbar(slot: number): number {
		return Atomics.load(this.ctrl, CTRL.TRACKBAR + slot);
	}

	/** Moves a slider. Live sliders are remembered for the next run. */
	setTrackbar(window: string, name: string, slot: number, value: number) {
		Atomics.store(this.ctrl, CTRL.TRACKBAR + slot, value);
		if (this.runState === "live") storage.setSlider(window, name, value);
	}

	/**
	 * Puts a window's sliders back where the script started them, and forgets
	 * the saved positions so the next run starts there too. A running script
	 * sees the change at its next getTrackbarPos.
	 */
	resetTrackbars(view: WindowView) {
		for (const t of view.trackbars) {
			Atomics.store(this.ctrl, CTRL.TRACKBAR + t.slot, t.initial);
			storage.forgetSlider(view.name, t.name);
		}
	}

	/** A key pressed over the page, for waitKey. */
	pressKey(code: number) {
		Atomics.store(this.ctrl, CTRL.KEY, code);
		Atomics.notify(this.ctrl, CTRL.KEY);
	}

	private releaseCamera() {
		clearTimeout(this.cameraTimer);
		this.cameraTimer = setTimeout(() => this.camera.stop(), CAMERA_LINGER_MS);
	}

	// ---------------------------------------------------------------- running

	async syntax(source: string): Promise<SyntaxIssue | null> {
		await this.ready();
		return this.rpc.call<SyntaxIssue | null>("syntax", source);
	}

	private begin(state: RunState) {
		clearTimeout(this.stopTimer);
		Atomics.store(this.interrupt, 0, 0);
		this.windows = [];
		this.latest.clear();
		this.clip = null;
		this.setRunState(state);
	}

	private end() {
		clearTimeout(this.stopTimer);
		this.releaseCamera();
		this.setRunState("idle");
	}

	/** Runs a script on the webcam until it ends or Stop. */
	async live(source: string): Promise<ScriptRun> {
		await this.ready();
		this.begin("live");
		try {
			const request: LiveRequest = {
				source,
				trackbars: storage.getSliders(),
			};
			return await this.settle(this.rpc.call<ScriptRun>("live", request));
		} finally {
			this.end();
		}
	}

	/** Runs a script on each clip with the webcam off. */
	async check(
		source: string,
		clips: string[],
		watch: Record<string, WatchKind>,
	): Promise<ClipRun[]> {
		await this.ready();
		this.begin("check");
		// A runaway loop gets interrupted, then the worker is replaced.
		const budget = setTimeout(
			() => this.stop("timeout"),
			CHECK_BUDGET_MS * clips.length,
		);
		try {
			const request: CheckRequest = { source, clips, watch };
			const runs = await this.settle(
				this.rpc.call<ClipRun[]>("check", request),
			);
			return Array.isArray(runs)
				? runs.map((run) =>
						run.status === "stopped" && this.timedOut
							? { ...run, status: "timeout" as const }
							: run,
					)
				: clips.map((clip) => ({ clip, ...runs }));
		} finally {
			clearTimeout(budget);
			this.timedOut = false;
			this.end();
		}
	}

	private timedOut = false;
	private settleStopped?: (run: ScriptRun) => void;

	/** Resolves with the run, or with a stopped run if the worker had to be restarted. */
	private settle<T>(call: Promise<T>): Promise<T | ScriptRun> {
		return new Promise((resolve, reject) => {
			this.settleStopped = resolve;
			call.then(resolve, (error) => {
				if (String(error?.message) === "restarted") return;
				reject(error);
			});
		});
	}

	/**
	 * Raises KeyboardInterrupt in the script. If Python hasn't stopped in two
	 * seconds (stuck outside Python), the worker restarts with Pyodide from cache.
	 */
	stop(reason: "user" | "timeout" = "user") {
		if (this.runState === "idle") return;
		this.timedOut = reason === "timeout";
		this.setRunState("stopping");
		Atomics.store(this.interrupt, 0, 2);
		clearTimeout(this.stopTimer);
		this.stopTimer = setTimeout(() => {
			if (this.runState !== "stopping") return;
			this.log({
				text: "Python didn't stop, so it was restarted.",
				kind: "info",
			});
			this.settleStopped?.({
				status: this.timedOut ? "timeout" : "stopped",
				error: null,
				seconds: 0,
				framesRead: 0,
				records: [],
				inRange: [],
				trackbars: [],
				shown: [],
			});
			this.rpc.restart();
			this.starting = undefined;
			this.setStatus({ state: "loading", loaded: 0, total: 0, label: "" });
			void this.ready().catch(() => {});
		}, STOP_GRACE_MS);
	}
}

/** The labelled answer, dashed, so students can see where they're off. */
function drawAnswer(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	clip: ClipLabels,
	frame: number,
) {
	const label = clip.frames[frame];
	if (!label) return;
	const muted =
		getComputedStyle(canvas).getPropertyValue("--ink-muted").trim() ||
		"#9fb0c6";
	ctx.save();
	ctx.strokeStyle = muted;
	ctx.fillStyle = muted;
	ctx.lineWidth = 1.5;
	ctx.setLineDash([4, 3]);
	if (typeof label.fingers === "number") {
		ctx.font = "600 12px 'JetBrains Mono Variable', monospace";
		ctx.fillText(`answer: ${label.fingers}`, canvas.width - 80, 18);
	} else if (label.fingers === undefined && label.r > 0) {
		ctx.beginPath();
		ctx.arc(label.x, label.y, label.r + 3, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(label.x - 3, label.y);
		ctx.lineTo(label.x + 3, label.y);
		ctx.moveTo(label.x, label.y - 3);
		ctx.lineTo(label.x, label.y + 3);
		ctx.stroke();
	}
	ctx.restore();
}

let runtime: CvRuntime | undefined;

/** The page's one runtime. Browser only. */
export function getRuntime(): CvRuntime {
	runtime ??= new CvRuntime();
	return runtime;
}

export type { CvRuntime };
