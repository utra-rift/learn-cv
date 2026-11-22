#!/usr/bin/env bun
// Checks a deployed site's headers, like Learn PID's check-vercel.mjs: a page,
// a script, the Python worker, a wasm file and a clip must all be
// cross-origin isolated, or the worker won't start ("The worker crashed") and
// SharedArrayBuffer is missing. Run after every deploy:
//
//   bun scripts/check-headers.ts https://learn-cv.example.workers.dev

import { CLIPS_VERSION, PYODIDE_VERSION } from "../src/tools";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) {
	console.error("Usage: bun scripts/check-headers.ts <site url>");
	process.exit(1);
}

const REQUIRED: Record<string, string> = {
	"cross-origin-opener-policy": "same-origin",
	"cross-origin-embedder-policy": "require-corp",
};

let failed = 0;

async function check(
	label: string,
	path: string,
	expect: { type?: RegExp; immutable?: boolean } = {},
) {
	const response = await fetch(base + path);
	const problems: string[] = [];
	if (!response.ok) problems.push(`HTTP ${response.status}`);
	for (const [name, value] of Object.entries(REQUIRED)) {
		const got = response.headers.get(name);
		if (got !== value) problems.push(`${name}: ${got ?? "missing"}`);
	}
	const type = response.headers.get("content-type") ?? "";
	if (expect.type && !expect.type.test(type))
		problems.push(`content-type: ${type || "missing"}`);
	if (
		expect.immutable &&
		!/immutable/.test(response.headers.get("cache-control") ?? "")
	) {
		problems.push(
			`cache-control: ${response.headers.get("cache-control") ?? "missing"}`,
		);
	}
	await response.body?.cancel();
	if (problems.length) failed++;
	console.log(
		`${problems.length ? "FAIL" : "ok  "} ${label.padEnd(8)} ${path}${problems.length ? `\n       ${problems.join("\n       ")}` : ""}`,
	);
	return response;
}

// A page, and the scripts it loads.
const pageResponse = await fetch(`${base}/`);
const html = await pageResponse.text();
await check("page", "/", { type: /text\/html/ });
await check("level", "/level/3-see-it", { type: /text\/html/ });

const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(
	(m) => m[1],
);
if (!scripts.length) {
	failed++;
	console.log("FAIL script  no /assets/*.js found in the page");
} else {
	await check("script", scripts[0], { type: /javascript/ });
}

// The Python worker's file name is hashed; find it in the client scripts.
let workerPath: string | undefined;
for (const script of scripts) {
	const text = await (await fetch(base + script)).text();
	workerPath = text.match(/assets\/cv\.worker-[\w-]+\.js/)?.[0];
	if (workerPath) break;
	for (const chunk of text.matchAll(/"\.?\/?(assets\/[\w.-]+\.js)"/g)) {
		const inner = await (await fetch(`${base}/${chunk[1]}`)).text();
		workerPath = inner.match(/assets\/cv\.worker-[\w-]+\.js/)?.[0];
		if (workerPath) break;
	}
	if (workerPath) break;
}
if (workerPath) await check("worker", `/${workerPath}`, { type: /javascript/ });
else console.log("skip worker  couldn't find cv.worker in the client scripts");

await check("wasm", `/tools/pyodide/${PYODIDE_VERSION}/pyodide.asm.wasm`, {
	type: /application\/wasm/,
	immutable: true,
});
await check("clip", `/clips/${CLIPS_VERSION}/ball.zip`, {
	type: /zip/,
	immutable: true,
});
await check("sw", "/sw.js", { type: /javascript/ });

console.log(failed ? `\n${failed} failed` : "\nAll headers OK");
process.exit(failed ? 1 : 0);
