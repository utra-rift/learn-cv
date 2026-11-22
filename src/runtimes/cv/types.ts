/** What the checker reads from a student's top-level variable each frame. */
export type WatchKind = "mask" | "point" | "int" | "fill" | "gray" | "picked";

/**
 * The JS functions Python calls through `import _cvbridge`. The worker backs
 * them with shared memory and messages to the page; tests use a stub.
 */
export interface CvBridge {
	/** Starts the webcam. Blocks until it's running (true) or failed (false). */
	camera_open(index: number): boolean;
	/** Copies a frame newer than `lastSeq` into `target` (RGBA). Returns its sequence number, -1 on timeout, -2 when the camera stopped. */
	camera_read(target: unknown, lastSeq: number): number;
	camera_release(): void;
	/** Shows an RGBA image in a window. `frame` is the clip frame in Check mode, else -1. */
	show(name: string, rgba: unknown, frame: number): void;
	window(op: "create" | "destroy" | "destroyAll", name: string): void;
	trackbar_create(
		window: string,
		name: string,
		value: number,
		max: number,
	): number;
	trackbar_get(slot: number): number;
	trackbar_set(slot: number, value: number): void;
	/** Waits up to `ms` for a key. Returns its code or -1. */
	wait_key(ms: number): number;
	sleep(ms: number): void;
	/** Sends any frames held back because a window was still drawing. */
	flush(): void;
}

export interface ScriptError {
	type: string;
	message: string;
	line: number | null;
	/** The source line that raised. */
	code: string | null;
	/** Traceback trimmed to the student's file. */
	text: string;
}

export interface SyntaxIssue {
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
	type: string;
	message: string;
}

export type MaskRecord = { fill: number; iou?: number; cover?: number | null };
/** How a `gray` image compares with OpenCV's own greyscale of the frame. */
export type GrayRecord = {
	ok: boolean;
	why: "channels" | "shape" | "diff";
	diff?: number;
};
/** How a picked HSV colour compares with the square in the middle of the frame. */
export type PickedRecord = {
	ok: boolean;
	got: number[];
	want: number[];
	/** It matches the square at [x, y] instead of [y, x]. */
	swapped?: boolean;
	/** It matches the BGR colour instead of HSV. */
	bgr?: boolean;
};
/** A snapshot value: the converted value, null when unset, or "bad:<type>". */
export type Snapshot = Record<
	string,
	| MaskRecord
	| GrayRecord
	| PickedRecord
	| [number, number]
	| number
	| string
	| null
>;

export interface ScriptRun {
	status: "ok" | "error" | "stopped" | "timeout";
	error: ScriptError | null;
	seconds: number;
	framesRead: number;
	/** One per clip frame, null where the script never finished the frame. */
	records: (Snapshot | null)[];
	/** Bounds passed to inRange: [[h, s, v], [h, s, v]]. */
	inRange: number[][][];
	trackbars: {
		window: string;
		name: string;
		max: number;
		role: ["h" | "s" | "v", 0 | 1] | null;
	}[];
	/** Windows imshow drew in. */
	shown: string[];
}

export interface ClipRun extends ScriptRun {
	clip: string;
}

export interface FrameLabel {
	/** The object is visible (mostly). */
	v: boolean;
	x: number;
	y: number;
	r: number;
	fingers?: number | null;
	poly?: [number, number][];
	hidden?: boolean;
}

export interface ClipLabels {
	name: string;
	fps: number;
	width: number;
	height: number;
	frames: FrameLabel[];
	masks?: boolean;
	object?: string;
	hsv?: { lo: number[]; hi: number[] };
	/** Keys pressed in Check mode, by frame: {"4": "b"}. */
	keys?: Record<string, string>;
	/** Seconds ahead the aim point should lead, for the throw clip. */
	lead?: number;
}
