import type { PyodideAPI } from "pyodide";
import { SHIM_PY } from "./shim";
import type {
	ClipLabels,
	ClipRun,
	CvBridge,
	ScriptRun,
	SyntaxIssue,
	WatchKind,
} from "./types";

export interface CvHarness {
	checkSyntax(source: string): SyntaxIssue | null;
	/** Unpacks clips into /clips if they aren't there yet. */
	loadClips(names: string[]): Promise<void>;
	labels(name: string): ClipLabels;
	/** Runs a script against the webcam (or clips it opens by name). */
	runLive(source: string): ScriptRun;
	/** Runs a script once per clip, with the clip standing in for the webcam. */
	runCheck(
		source: string,
		clip: string,
		watch: Record<string, WatchKind>,
	): ClipRun;
}

/** Clip names a script opens by name, like VideoCapture("ball.mp4"). */
export function clipsIn(source: string): string[] {
	const names = new Set<string>();
	for (const match of source.matchAll(
		/VideoCapture\(\s*(?:f?["'])([^"']+)["']/g,
	)) {
		const base = match[1].split("/").pop() ?? "";
		names.add(base.replace(/\.(mp4|avi|mov|mkv|webm)$/i, ""));
	}
	return [...names];
}

/**
 * Sets up a Pyodide instance (with numpy and opencv-python loaded) to run
 * students' scripts through the browser shims.
 */
export function createCvHarness(
	py: PyodideAPI,
	bridge: CvBridge,
	fetchClip: (name: string) => Promise<Uint8Array | null>,
	onOutput: (text: string, stream: "stdout" | "stderr") => void = () => {},
): CvHarness {
	py.registerJsModule("_cvbridge", bridge as unknown as object);
	py.FS.mkdirTree("/clips");
	py.FS.writeFile("/home/pyodide/_learncv.py", SHIM_PY);
	py.setStdout({ batched: (text: string) => onOutput(text, "stdout") });
	py.setStderr({ batched: (text: string) => onOutput(text, "stderr") });
	py.runPython("import _learncv");
	const mod = py.pyimport("_learncv");
	const run = mod.run;
	const syntax = mod.check_syntax;
	const loaded = new Set<string>();
	const labelCache = new Map<string, ClipLabels>();

	const call = (
		source: string,
		mode: "live" | "check",
		clip: string | null,
		watch: Record<string, WatchKind>,
	): ScriptRun => {
		const pyWatch = py.toPy(watch);
		try {
			const json = run.callKwargs(source, {
				mode,
				clip,
				watch: pyWatch,
			}) as string;
			return JSON.parse(json) as ScriptRun;
		} catch (error) {
			// An interrupt that lands outside the script, in the shim's own code.
			const message = String((error as Error)?.message ?? error);
			if (message.includes("KeyboardInterrupt")) {
				return emptyRun("stopped");
			}
			throw error;
		} finally {
			pyWatch.destroy();
		}
	};

	return {
		checkSyntax(source) {
			const result = syntax(source);
			if (!result) return null;
			const issue = result.toJs({
				dict_converter: Object.fromEntries,
			}) as SyntaxIssue;
			result.destroy();
			return issue;
		},
		async loadClips(names) {
			for (const name of names) {
				if (loaded.has(name)) continue;
				const bytes = await fetchClip(name);
				if (!bytes) continue;
				py.unpackArchive(bytes, "zip", { extractDir: "/clips" });
				loaded.add(name);
			}
		},
		labels(name) {
			let labels = labelCache.get(name);
			if (!labels) {
				labels = JSON.parse(
					py.FS.readFile(`/clips/${name}/labels.json`, { encoding: "utf8" }),
				) as ClipLabels;
				labelCache.set(name, labels);
			}
			return labels;
		},
		runLive(source) {
			return call(source, "live", null, {});
		},
		runCheck(source, clip, watch) {
			return { clip, ...call(source, "check", clip, watch) };
		},
	};
}

export function emptyRun(status: ScriptRun["status"]): ScriptRun {
	return {
		status,
		error: null,
		seconds: 0,
		framesRead: 0,
		records: [],
		inRange: [],
		trackbars: [],
		shown: [],
	};
}

/** A bridge with no page behind it: no camera, no windows, no keys. For tests. */
export function nullBridge(): CvBridge {
	let slots: number[] = [];
	return {
		camera_open: () => false,
		camera_read: () => -2,
		camera_release: () => {},
		show: () => {},
		window: () => {},
		trackbar_create: (_w, _n, value) => {
			slots.push(value);
			return slots.length - 1;
		},
		trackbar_get: (slot) => slots[slot] ?? 0,
		trackbar_set: (slot, value) => {
			slots[slot] = value;
		},
		wait_key: () => -1,
		sleep: () => {},
		flush: () => {
			if (slots.length > 512) slots = [];
		},
	};
}
