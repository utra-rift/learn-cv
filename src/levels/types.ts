import type { ClipLabels, ClipRun, WatchKind } from "#/runtimes/cv/types";

export interface WrongAnswer {
	name: string;
	code: string;
	/** The coach message this answer must produce. */
	expect: RegExp;
}

/** How one clip went, for the console and the coach. */
export interface ClipResult {
	clip: string;
	passed: boolean;
	/** One line for the console: "ball: mask overlap 82% ✓". */
	summary: string;
	/** Advice with numbers from the run, when it failed. */
	coach?: string;
	/** Line to point at in the editor, if the problem is on one. */
	line?: number;
}

/** A picture in a step, from public/. */
export interface StepImage {
	src: string;
	alt: string;
	caption: string;
	/** A banner across the whole step, like the hue scale, instead of a 4:3 tile. */
	wide?: boolean;
}

export interface Step {
	title: string;
	/** Inline `code` and **bold**, and ``` blocks. */
	body: string;
	/** What to expect, side by side under the text. */
	images?: StepImage[];
}

export interface Level {
	id: string;
	number: number;
	/** One to three words. Rendered in capitals. */
	title: string;
	minutes: number;
	/**
	 * Builds on the previous level's code: its starter has that level's answer
	 * in it, and "use my code from the last level" is offered.
	 */
	continues?: boolean;
	/** Two or three sentences: the idea. Inline `code` and **bold** allowed. */
	idea: string;
	goal: string;
	/**
	 * The walkthrough, in order. Each matches a "# STEP n" comment in the
	 * starter, so the presenter can say "step 3" and everyone finds it.
	 */
	steps: Step[];
	/** For the presenter (instructor mode): what to say and show, and what goes wrong. */
	presenter: string[];
	hints: [string, string];
	/** The takeaway, shown when the level passes. */
	why: string;
	/** Clips Check runs the script on. Empty for the unchecked demo. */
	clips: string[];
	/** Top-level variables the checker snapshots every frame. */
	watch: Record<string, WatchKind>;
	starter: string;
	solution: string;
	wrongAnswers: WrongAnswer[];
	/** Grades one clip. */
	measure?(run: ClipRun, labels: ClipLabels): ClipResult;
	/** Code mistakes that fail the level even when the clips pass. */
	problems?(source: string, runs: ClipRun[]): string | null;
	/** Advice from the source and run, checked before per-clip advice. */
	smell?(
		source: string,
		runs: ClipRun[],
		labels: (clip: string) => ClipLabels,
	): string | null;
}

/** Strips the common leading indentation so code can be written indented in source. */
export function code(
	strings: TemplateStringsArray,
	...values: unknown[]
): string {
	const raw = String.raw({ raw: strings }, ...values)
		.replace(/^\n/, "")
		.replace(/\n\s*$/, "\n");
	const lines = raw.split("\n");
	const indent = Math.min(
		...lines
			.filter((line) => line.trim())
			.map((line) => line.match(/^\s*/)?.[0].length ?? 0),
	);
	return lines.map((line) => line.slice(indent)).join("\n");
}
