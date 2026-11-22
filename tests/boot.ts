// Boots the real toolchain in Bun for tests: Pyodide with NumPy and OpenCV
// from public/tools (run `bun run tools` first), the browser shims and the clips.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadPyodide } from "pyodide";
import {
	type CvHarness,
	createCvHarness,
	nullBridge,
} from "#/runtimes/cv/harness";
import { CLIPS_VERSION, PACKAGES, PYODIDE_VERSION } from "#/tools";

const root = path.join(import.meta.dir, "..");
const tools = path.join(root, "public/tools/pyodide", PYODIDE_VERSION);
const clips = path.join(root, "public/clips", CLIPS_VERSION);

export async function bootHarness(
	onOutput?: (text: string) => void,
): Promise<CvHarness> {
	if (!existsSync(path.join(clips, "manifest.json"))) {
		throw new Error("No clips in public/clips. Run `bun run tools` first.");
	}
	const py = await loadPyodide({ packageBaseUrl: `${tools}/` });
	await py.loadPackage([...PACKAGES], { messageCallback: () => {} });
	return createCvHarness(
		py,
		nullBridge(),
		async (name) => {
			const file = path.join(clips, `${name}.zip`);
			return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
		},
		(text) => onOutput?.(text),
	);
}
