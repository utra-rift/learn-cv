// Turns per-frame snapshots into numbers the levels grade on.

import type {
	ClipLabels,
	ClipRun,
	FrameLabel,
	MaskRecord,
	Snapshot,
} from "#/runtimes/cv/types";

export const OBJECT_NAMES: Record<string, string> = {
	ball: "ball",
	note: "sticky note",
	cup: "cup",
};

export function objectName(labels: ClipLabels): string {
	return OBJECT_NAMES[labels.object ?? ""] ?? "object";
}

type Value = Snapshot[string] | undefined;

export function isBad(value: Value): value is string {
	return typeof value === "string" && value.startsWith("bad:");
}

export function badType(value: string): string {
	return value.slice(4);
}

export function point(value: Value): [number, number] | null {
	return Array.isArray(value) ? value : null;
}

export function mask(value: Value): MaskRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as MaskRecord)
		: null;
}

export function dist(a: [number, number], b: { x: number; y: number }) {
	return Math.hypot(a[0] - b.x, a[1] - b.y);
}

export function mean(values: number[]): number {
	return values.length
		? values.reduce((sum, v) => sum + v, 0) / values.length
		: Number.NaN;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const px = (x: number) => `${x.toFixed(1)} px`;

/** Frames with a snapshot, paired with their labels. */
export function frames(
	run: ClipRun,
	labels: ClipLabels,
): { i: number; label: FrameLabel; rec: Snapshot }[] {
	const out: { i: number; label: FrameLabel; rec: Snapshot }[] = [];
	labels.frames.forEach((label, i) => {
		const rec = run.records[i];
		if (rec) out.push({ i, label, rec });
	});
	return out;
}

/** The first snapshot of `name` with the wrong type, if any. */
export function firstBad(run: ClipRun, name: string): string | null {
	for (const rec of run.records) {
		const value = rec?.[name];
		if (isBad(value)) return badType(value);
	}
	return null;
}

/** Centre error, misses and false detections of a point variable. */
export function trackStats(run: ClipRun, labels: ClipLabels, name: string) {
	const errors: number[] = [];
	let visible = 0;
	let missed = 0;
	let hidden = 0;
	let falsePositives = 0;
	for (const { label, rec } of frames(run, labels)) {
		const p = point(rec[name]);
		if (label.v) {
			visible++;
			if (p) errors.push(dist(p, label));
			else missed++;
		} else {
			hidden++;
			if (p) falsePositives++;
		}
	}
	return {
		meanError: mean(errors),
		missRate: visible ? missed / visible : 0,
		falseRate: hidden ? falsePositives / hidden : 0,
		visible,
		hidden,
		falsePositives,
		missed,
	};
}

export const tick = (passed: boolean) => (passed ? "✓" : "✗");
