// Runs every level's solution, starter and wrong answers on the real clips
// through real Pyodide and OpenCV, the same shims the browser uses.
//   bun run tools   (once: fills public/tools and public/clips)
//   bun test

import { beforeAll, describe, expect, test } from "bun:test";
import { type Grade, grade } from "#/coach/grade";
import { CHECKED_LEVELS, LEVELS, type Level } from "#/levels";
import type { CvHarness } from "#/runtimes/cv/harness";
import { bootHarness } from "./boot";

let harness: CvHarness;

beforeAll(async () => {
	harness = await bootHarness();
	await harness.loadClips([...new Set(LEVELS.flatMap((l) => l.clips))]);
}, 120_000);

function check(level: Level, source: string): Grade {
	const syntax = harness.checkSyntax(source);
	const runs = syntax
		? []
		: level.clips.map((clip) => harness.runCheck(source, clip, level.watch));
	return grade(level, source, syntax, runs, (clip) => harness.labels(clip));
}

for (const level of CHECKED_LEVELS) {
	describe(level.id, () => {
		test("the solution passes every clip", () => {
			const g = check(level, level.solution);
			const detail = `${g.title}: ${g.message}\n${g.clips.map((c) => c.summary).join("\n")}`;
			expect(g.passed, detail).toBe(true);
		});

		test("the starter runs but doesn't pass", () => {
			const g = check(level, level.starter);
			expect(g.title, g.message).toBe("Not yet");
			expect(g.passed).toBe(false);
		});

		for (const wrong of level.wrongAnswers) {
			test(`"${wrong.name}" fails with the right advice`, () => {
				expect(wrong.code, "the wrong answer changes the solution").not.toBe(
					level.solution,
				);
				const g = check(level, wrong.code);
				expect(g.passed).toBe(false);
				expect(g.message).toMatch(wrong.expect);
			});
		}
	});
}

describe("shims", () => {
	const level = LEVELS[0];

	test("a syntax error points at its line", () => {
		const g = check(level, "import cv2\nwhile True\n    pass\n");
		expect(g.title).toBe("Syntax error");
		expect(g.line).toBe(2);
		expect(g.message).toMatch(/:/);
	});

	test("unsupported highgui calls name themselves", () => {
		const run = harness.runCheck(
			'import cv2\ncv2.setMouseCallback("x", print)\n',
			"ball",
			{},
		);
		expect(run.status).toBe("error");
		expect(run.error?.message).toMatch(
			/cv2.setMouseCallback isn't available in the browser/,
		);
		expect(run.error?.line).toBe(2);
	});

	test("a clip by name plays to the end, then read() returns (False, None)", () => {
		const out: string[] = [];
		const run = harness.runCheck(
			[
				"import cv2",
				'cap = cv2.VideoCapture("throw.mp4")',
				"n = 0",
				"while True:",
				"    ok, frame = cap.read()",
				"    if not ok:",
				"        break",
				"    n += 1",
				"assert frame is None",
				"assert cap.get(cv2.CAP_PROP_FPS) == 30",
				"assert n == int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), n",
			].join("\n"),
			"ball",
			{},
		);
		expect(run.status, run.error?.text ?? out.join("")).toBe("ok");
		expect(run.framesRead).toBe(46);
	});

	test("a script that ignores the end of the clip still finishes", () => {
		const run = harness.runCheck(
			"import cv2\ncap = cv2.VideoCapture(0)\nwhile True:\n    ok, frame = cap.read()\n    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)\n",
			"ball",
			{},
		);
		expect(run.status).toBe("ok");
		expect(run.framesRead).toBe(75);
	});

	test("trackbars read back, and callbacks run inside waitKey", () => {
		const run = harness.runCheck(
			[
				"import cv2",
				"seen = []",
				'cv2.createTrackbar("Blur", "w", 3, 10, seen.append)',
				'assert cv2.getTrackbarPos("Blur", "w") == 3',
				'cv2.setTrackbarPos("Blur", "w", 7)',
				"cv2.waitKey(1)",
				"assert seen == [7], seen",
				'assert cv2.getWindowProperty("w", cv2.WND_PROP_VISIBLE) >= 1',
			].join("\n"),
			"ball",
			{},
		);
		expect(run.status, run.error?.text).toBe("ok");
	});

	test("Check presets colour sliders from the clip, whatever they're called", () => {
		const run = harness.runCheck(
			[
				"import cv2",
				'for name in ["LH", "low_s", "Value Min", "hue max", "S upper", "vmax"]:',
				'    cv2.createTrackbar(name, "t", 0, 255, lambda v: None)',
				'got = [cv2.getTrackbarPos(n, "t") for n in ["LH", "low_s", "Value Min", "hue max", "S upper", "vmax"]]',
				"assert got == [28, 110, 70, 46, 255, 255], got",
			].join("\n"),
			"ball",
			{},
		);
		expect(run.status, run.error?.text).toBe("ok");
	});

	test("imshow takes grey, BGR, BGRA, bool and float images", () => {
		const run = harness.runCheck(
			[
				"import cv2, numpy as np",
				'cv2.imshow("a", np.zeros((10, 10), np.uint8))',
				'cv2.imshow("b", np.zeros((10, 10, 3), np.uint8))',
				'cv2.imshow("c", np.zeros((10, 10, 4), np.uint8))',
				'cv2.imshow("d", np.zeros((10, 10), bool))',
				'cv2.imshow("e", np.zeros((10, 10, 3), np.float32))',
				"cv2.destroyAllWindows()",
			].join("\n"),
			"ball",
			{},
		);
		expect(run.status, run.error?.text).toBe("ok");
	});

	test("level 4 gets the b key on frame 4 in Check", () => {
		const run = harness.runCheck(
			[
				"import cv2",
				"cap = cv2.VideoCapture(0)",
				"keys = {}",
				"i = 0",
				"while True:",
				"    ok, frame = cap.read()",
				"    if not ok:",
				"        break",
				"    k = cv2.waitKey(1)",
				"    if k != -1:",
				"        keys[i] = chr(k)",
				"    i += 1",
				"assert keys == {4: 'b'}, keys",
			].join("\n"),
			"hand-light",
			{},
		);
		expect(run.status, run.error?.text).toBe("ok");
	});
});
