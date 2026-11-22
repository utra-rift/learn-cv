#!/usr/bin/env bun
// Puts everything the browser downloads into public/ (gitignored there), at
// the paths the site serves it from:
//
//   public/tools/pyodide/<version>/   Pyodide, plus the NumPy and OpenCV wheels
//   public/clips/<version>/           The recorded test clips (see make-clips.ts)
//
// The dev server serves them like any public file, and `vite build` copies them
// into the build, so `wrangler deploy` uploads them as static assets.
// Versions must match src/tools.ts. Runs before `bun dev`, `bun run build`
// and `bun run deploy`.

import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { CLIPS_VERSION, PACKAGES, PYODIDE_VERSION } from "../src/tools";

const root = path.join(import.meta.dir, "..");
const vendor = path.join(root, "public");
const cache = path.join(root, "node_modules/.cache/cv-workshop");
const pyodideDir = path.join(root, "node_modules/pyodide");

const installed = JSON.parse(
	readFileSync(path.join(pyodideDir, "package.json"), "utf8"),
).version;
if (installed !== PYODIDE_VERSION) {
	throw new Error(
		`node_modules has pyodide ${installed}, src/tools.ts wants ${PYODIDE_VERSION}`,
	);
}

const out = path.join(vendor, "tools/pyodide", PYODIDE_VERSION);
mkdirSync(out, { recursive: true });

function copy(from: string, to: string) {
	if (existsSync(to) && statSync(to).size === statSync(from).size) return;
	copyFileSync(from, to);
}

// The runtime itself.
for (const file of [
	"pyodide.mjs",
	"pyodide.asm.mjs",
	"pyodide.asm.wasm",
	"python_stdlib.zip",
	"pyodide-lock.json",
]) {
	copy(path.join(pyodideDir, file), path.join(out, file));
}

// The wheels aren't in the npm package. They come from Pyodide's CDN once,
// checked against the sha256 in pyodide-lock.json, and are cached.
const lock = JSON.parse(
	readFileSync(path.join(pyodideDir, "pyodide-lock.json"), "utf8"),
) as {
	packages: Record<
		string,
		{ file_name: string; sha256: string; version: string }
	>;
};
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`;

for (const name of PACKAGES) {
	const pkg = lock.packages[name];
	if (!pkg) throw new Error(`${name} isn't in pyodide-lock.json`);
	const cached = path.join(cache, "wheels", pkg.file_name);
	if (!existsSync(cached)) {
		console.log(`Downloading ${pkg.file_name}`);
		const response = await fetch(`${CDN}/${pkg.file_name}`);
		if (!response.ok)
			throw new Error(`${pkg.file_name}: HTTP ${response.status}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		const hash = createHash("sha256").update(bytes).digest("hex");
		if (hash !== pkg.sha256) {
			throw new Error(
				`${pkg.file_name}: expected sha256 ${pkg.sha256}, got ${hash}`,
			);
		}
		mkdirSync(path.dirname(cached), { recursive: true });
		writeFileSync(cached, bytes);
	}
	copy(cached, path.join(out, pkg.file_name));
}

// The clips are generated from a seed, so they're built here rather than
// checked in. Real recordings replace them later (see README).
const clipsDir = path.join(vendor, "clips", CLIPS_VERSION);
if (!existsSync(path.join(clipsDir, "manifest.json"))) {
	console.log("Rendering the test clips");
	const proc = Bun.spawnSync(
		["bun", path.join(root, "scripts/make-clips.ts")],
		{
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1);
}

const versions = PACKAGES.map(
	(name) => `${name} ${lock.packages[name].version}`,
);
console.log(
	`Tools ready: pyodide ${PYODIDE_VERSION}, ${versions.join(", ")}, clips ${CLIPS_VERSION}`,
);
