// The shared memory between the page and the Python worker. The page owns
// what only the main thread can touch (camera, canvases, sliders, keys); the
// worker blocks on these slots with Atomics.wait, so a desktop-style
// `while True:` loop never freezes the page.

export const FRAME_W = 320;
export const FRAME_H = 240;
export const FRAME_BYTES = FRAME_W * FRAME_H * 4;

/** Int32 slots in the control buffer. */
export const CTRL = {
	/** Bumped (and notified) by the page after each camera frame. */
	SEQ: 0,
	/** 0 while starting, 1 running, 2 failed or stopped. Written by the page. */
	CAMERA: 1,
	/** The last key pressed over the page, or -1. Read and cleared by waitKey. */
	KEY: 2,
	/** Never written: the worker sleeps on it. */
	SLEEP: 3,
	/** 1 while a window is drawing a frame, per window index. */
	BUSY: 16,
	/** Slider positions, per trackbar slot. */
	TRACKBAR: 64,
	LENGTH: 256,
} as const;

export const MAX_WINDOWS = CTRL.TRACKBAR - CTRL.BUSY;
export const MAX_TRACKBARS = CTRL.LENGTH - CTRL.TRACKBAR;

export interface SharedBuffers {
	control: SharedArrayBuffer;
	/** Two camera frame slots, RGBA. The page writes slot seq % 2. */
	frames: SharedArrayBuffer;
	/** Pyodide's interrupt buffer: 2 raises KeyboardInterrupt. */
	interrupt: SharedArrayBuffer;
}

export function createShared(): SharedBuffers {
	const control = new SharedArrayBuffer(CTRL.LENGTH * 4);
	new Int32Array(control).fill(0);
	new Int32Array(control)[CTRL.KEY] = -1;
	return {
		control,
		frames: new SharedArrayBuffer(FRAME_BYTES * 2),
		interrupt: new SharedArrayBuffer(4),
	};
}

/** Messages the worker sends the page while a script runs. */
export type CvEvent =
	| { type: "log"; text: string; stream: "stdout" | "stderr" }
	| {
			type: "window";
			op: "create" | "destroy" | "destroyAll";
			name: string;
			index: number;
	  }
	| {
			type: "frame";
			name: string;
			index: number;
			width: number;
			height: number;
			data: ArrayBuffer;
			/** Clip frame in Check mode, else -1. */
			frame: number;
			/** How often the script calls imshow on this window. */
			fps: number;
	  }
	| {
			type: "trackbar";
			window: string;
			name: string;
			slot: number;
			max: number;
			/** The value the script gave createTrackbar, for Reset. */
			initial: number;
	  }
	| { type: "camera"; op: "open" | "release" }
	| { type: "clip"; name: string | null; labels?: unknown };
