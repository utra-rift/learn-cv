import type { ClipResult, Level } from "#/levels";
import type {
	ClipLabels,
	ClipRun,
	ScriptError,
	SyntaxIssue,
} from "#/runtimes/cv/types";

export interface Grade {
	passed: boolean;
	/** Short headline: "Level 3 complete", "Not yet", "Syntax error". */
	title: string;
	/** Plain English, may contain `code` and **bold**. */
	message: string;
	/** Line to point at in the editor. */
	line?: number;
	clips: ClipResult[];
}

/**
 * Grades a Check run. Code problems come first (syntax, crashes), then what
 * the source and the run show (BGR as RGB, hue over 179), then each clip's
 * numbers, then general advice.
 */
export function grade(
	level: Level,
	source: string,
	syntax: SyntaxIssue | null,
	runs: ClipRun[],
	labels: (clip: string) => ClipLabels,
): Grade {
	if (syntax) {
		return {
			passed: false,
			title: "Syntax error",
			message: `Line ${syntax.line}: ${friendlySyntax(syntax)}`,
			line: syntax.line,
			clips: [],
		};
	}

	const crashed = runs.find((run) => run.status === "error" && run.error);
	if (crashed?.error) {
		return {
			passed: false,
			title: "Your code crashed",
			message: friendlyError(crashed.error),
			line: crashed.error.line ?? undefined,
			clips: [],
		};
	}
	if (runs.some((run) => run.status === "timeout")) {
		return {
			passed: false,
			title: "Too slow",
			message:
				"Check ran out of time. Look for a loop that never ends, or one that never calls `cap.read()`.",
			clips: [],
		};
	}
	if (runs.some((run) => run.status === "stopped")) {
		return {
			passed: false,
			title: "Stopped",
			message: "You stopped the check before it finished.",
			clips: [],
		};
	}
	if (runs.length && runs.every((run) => run.framesRead === 0)) {
		return {
			passed: false,
			title: "No frames",
			message:
				"The script never read a frame. Check runs it with each clip standing in for the camera, so it needs `cap = cv2.VideoCapture(0)` and `cap.read()` in a loop.",
			clips: [],
		};
	}

	const problem = level.problems?.(source, runs);
	if (problem) {
		return { passed: false, title: "Not yet", message: problem, clips: [] };
	}

	const clips = level.measure
		? runs.map((run) => level.measure?.(run, labels(run.clip)) as ClipResult)
		: [];
	if (clips.length && clips.every((clip) => clip.passed)) {
		return {
			passed: true,
			title: `Level ${level.number} complete`,
			message: level.why,
			clips,
		};
	}

	const smell = level.smell?.(source, runs, labels);
	const failing = clips.find((clip) => !clip.passed);
	return {
		passed: false,
		title: "Not yet",
		message:
			smell ?? failing?.coach ?? "Close. Check the hints and run it again.",
		line: failing?.line,
		clips,
	};
}

export function friendlySyntax(issue: SyntaxIssue): string {
	const { type, message } = issue;
	if (type === "IndentationError" || type === "TabError") {
		return `the indentation is off (${message}). Python uses the spaces at the start of a line to group code.`;
	}
	if (message.includes("expected ':'"))
		return "missing a `:` at the end of the line.";
	if (message.includes("was never closed"))
		return `${message}. Check your brackets.`;
	return message;
}

/** A Python exception from a student's script, in plain English. */
export function friendlyError(error: ScriptError): string {
	const { type, message, code } = error;
	const at = error.line ? `Line ${error.line}: ` : "";
	const line = code ?? "";

	if (type === "ValueError" && line.includes("findContours")) {
		if (/unpack/.test(message)) {
			return `${at}in OpenCV 4, \`cv2.findContours\` returns two values: \`contours, hierarchy = cv2.findContours(...)\`. Older tutorials unpack three.`;
		}
	}
	if (
		type === "ValueError" &&
		/(max|min)\(\) (iterable )?arg(ument)? is an empty sequence|iterable argument is empty/.test(
			message,
		)
	) {
		return `${at}\`max()\` got an empty list: there were no contours in that frame. Check \`if contours:\` before taking the biggest.`;
	}
	if (
		type === "error" &&
		/!_src\.empty\(\)|ssize\.empty\(\)|empty\(\) in function/.test(message)
	) {
		return `${at}an OpenCV function got an empty image. If it came from \`cap.read()\`, check \`ok\` and \`break\` when it's False.`;
	}
	if (
		type === "error" &&
		/Can't parse '(center|pt1|pt2|org|pt)'/.test(message)
	) {
		return `${at}drawing functions need whole-number pixel positions. Use \`(int(x), int(y))\`.`;
	}
	if (
		type === "error" &&
		/Bad argument|Expected Ptr<cv::UMat>|Overload resolution failed/.test(
			message,
		)
	) {
		return `${at}an OpenCV function got the wrong kind of argument. ${firstLine(message)}`;
	}
	if (type === "NotInBrowserError") return `${at}${message}`;
	if (type === "NameError") {
		const name = message.match(/name '([^']+)'/)?.[1];
		return name
			? `${at}\`${name}\` isn't defined. Check the spelling, or set it before you use it.`
			: `${at}${message}`;
	}
	if (type === "ModuleNotFoundError") {
		return `${at}${message}. Only the standard library, NumPy and OpenCV are available here.`;
	}
	if (type === "ZeroDivisionError") return `${at}your code divided by zero.`;
	if (type === "IndexError" && line.includes("defects")) {
		return `${at}${message}. Defects index into the contour: \`c[s][0]\` is the start point.`;
	}
	return `${at}${type}: ${firstLine(message)}`;
}

function firstLine(text: string): string {
	return text.trim().split("\n")[0] ?? text;
}
