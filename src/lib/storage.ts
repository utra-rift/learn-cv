import { useSyncExternalStore } from "react";
import { PACKAGES, PYODIDE_VERSION } from "#/tools";

// Everything lives in localStorage: no accounts, no server.
const PREFIX = "cv:";

const listeners = new Set<() => void>();
function notify() {
	for (const listener of listeners) listener();
}

function read<T>(key: string, fallback: T): T {
	if (typeof localStorage === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(PREFIX + key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

function write(key: string, value: unknown, quiet = false) {
	if (typeof localStorage === "undefined") return;
	try {
		if (value === undefined) localStorage.removeItem(PREFIX + key);
		else localStorage.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		// Private mode or full storage: progress just isn't saved.
	}
	if (!quiet) notify();
}

export interface LevelProgress {
	passedAt: string;
}

/** Names the toolchain version, so a new version counts as a new download. */
const TOOLCHAIN_KEY = `pyodide ${PYODIDE_VERSION} ${PACKAGES.join(" ")}`;

// Per-level values are keyed by level number.
export const storage = {
	/** Passed levels, by level number. */
	getProgress: (): Record<number, LevelProgress> => read("progress", {}),
	markPassed(level: number, code: string) {
		const progress = storage.getProgress();
		progress[level] ??= { passedAt: new Date().toISOString() };
		write("progress", progress);
		write(`passed:${level}`, code);
	},
	getPassedCode: (level: number): string | null =>
		read(`passed:${level}`, null),

	getCode: (key: string): string | null => read(`code:${key}`, null),
	/** No notify: the editor is the only reader, and it already has the text. */
	setCode: (key: string, code: string) => write(`code:${key}`, code, true),

	getHints: (level: number): number => read(`hints:${level}`, 0),
	setHints: (level: number, count: number) => write(`hints:${level}`, count),

	/** The step each student is on, by level. */
	getStep: (level: number): number => read(`step:${level}`, 0),
	setStep: (level: number, step: number) => write(`step:${level}`, step),

	/** Levels opened before passing the one before, by number. */
	getSkipped: (): number[] => read("skipped", []),
	skipTo(level: number) {
		const skipped = storage.getSkipped();
		if (!skipped.includes(level)) write("skipped", [...skipped, level]);
	},

	isInstructor: (): boolean => read("instructor", false),
	setInstructor: (on: boolean) => write("instructor", on ? true : undefined),

	/** The "bring a laptop" banner on phones and tablets, once closed. */
	isMobileWarningDismissed: (): boolean => read("mobile-warning", false),
	dismissMobileWarning: () => write("mobile-warning", true),

	/** The Arena (dark) theme, for projectors. */
	isProjector: (): boolean => read("projector", false),
	setProjector: (on: boolean) => write("projector", on ? true : undefined),

	/** Slider positions from Live runs, by "window\0name", so tuning survives a re-run. */
	getSliders: (): Record<string, number> => read("sliders", {}),
	setSlider(window: string, name: string, value: number) {
		const sliders = storage.getSliders();
		sliders[`${window}\u0000${name}`] = value;
		write("sliders", sliders, true);
	},
	forgetSlider(window: string, name: string) {
		const sliders = storage.getSliders();
		delete sliders[`${window}\u0000${name}`];
		write("sliders", sliders, true);
	},
	clearSliders: () => write("sliders", undefined),

	/** Whether this browser has downloaded the current toolchain. */
	isDownloaded: (): boolean => read("downloaded", "") === TOOLCHAIN_KEY,
	markDownloaded() {
		if (!storage.isDownloaded()) write("downloaded", TOOLCHAIN_KEY);
	},

	/** The dev tools button, toggled with the Konami code. */
	isDev: (): boolean => read("dev", false),
	setDev: (on: boolean) => write("dev", on ? true : undefined),

	/** Marks these levels passed, without any passing code. For testing. */
	passAll(levels: number[]) {
		const progress = storage.getProgress();
		const passedAt = new Date().toISOString();
		for (const level of levels) progress[level] ??= { passedAt };
		write("progress", progress);
	},

	/** Clears passed levels, saved code, steps and hints. Settings stay. */
	resetProgress() {
		if (typeof localStorage === "undefined") return;
		for (const key of Object.keys(localStorage)) {
			if (
				/^cv:(progress$|code:|passed:|hints:|step:|sliders$|skipped$)/.test(key)
			)
				localStorage.removeItem(key);
		}
		notify();
	},
};

function subscribe(listener: () => void) {
	listeners.add(listener);
	const onStorage = (event: StorageEvent) => {
		if (event.key?.startsWith(PREFIX)) listener();
	};
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", onStorage);
	};
}

/** Re-renders when stored values change, including from other tabs. */
export function useStored<T>(get: () => T, serverValue: T): T {
	const cache = useSyncExternalStore(
		subscribe,
		() => JSON.stringify(get()),
		() => JSON.stringify(serverValue),
	);
	return JSON.parse(cache) as T;
}
