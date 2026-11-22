#!/usr/bin/env bun
// Browser smoke test against a running server, with Chromium's fake camera:
// the landing page download, every level's answer in Live and Check, a
// starter's coach message, Stop on a runaway loop, and the playground on a clip.
//
//   bun dev                                  # in another terminal
//   bun scripts/smoke.ts http://localhost:3000
//
// Uses Playwright's Chromium (~/Library/Caches/ms-playwright), or CHROME_PATH.

import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { getLevel, LEVELS, type Level } from "../src/levels";

const byId = (id: string) => getLevel(id) as Level;
const SEE_IT = byId("3-see-it");
const FIND_IT = byId("4-find-it");
const ARMOR = byId("7-armor");

const base = process.argv[2] ?? "http://localhost:3000";

function findChrome(): string | undefined {
	if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
	const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
	if (!existsSync(cache)) return undefined;
	for (const dir of readdirSync(cache)
		.filter((d) => d.startsWith("chromium-"))
		.sort()
		.reverse()) {
		for (const sub of ["chrome-mac", "chrome-mac-arm64"]) {
			const app = path.join(
				cache,
				dir,
				sub,
				"Chromium.app/Contents/MacOS/Chromium",
			);
			if (existsSync(app)) return app;
		}
	}
	return undefined;
}

const browser = await chromium.launch({
	executablePath: findChrome(),
	headless: true,
	args: [
		"--use-fake-device-for-media-stream",
		"--use-fake-ui-for-media-stream",
	],
});
const context = await browser.newContext({
	viewport: { width: 1440, height: 900 },
});
await context.grantPermissions(["camera"], { origin: base });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
	if (msg.type() === "error") errors.push(msg.text());
});

let failed = 0;
async function step(name: string, fn: () => Promise<void>) {
	const started = performance.now();
	try {
		await fn();
		console.log(
			`ok   ${name} (${((performance.now() - started) / 1000).toFixed(1)} s)`,
		);
	} catch (error) {
		failed++;
		console.log(
			`FAIL ${name}: ${String((error as Error)?.message ?? error)
				.split("\n")
				.slice(0, 3)
				.join(" | ")}`,
		);
		await page
			.screenshot({ path: `smoke-${name.replace(/\W+/g, "-")}.png` })
			.catch(() => {});
		const state = await page
			.evaluate(() => [
				document.querySelector("section[aria-live=polite]")?.textContent,
				document.querySelector("[role=log]")?.textContent?.slice(0, 400),
			])
			.catch(() => []);
		console.log(`     page: ${state.join(" | ")}`);
	}
}

/** Opens a page and waits for React to hydrate, so clicks land. */
async function open(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState("networkidle");
	await page.waitForTimeout(500);
}

async function setCode(page: Page, key: string, code: string) {
	await page.evaluate(
		([k, c]) => localStorage.setItem(`cv:code:${k}`, JSON.stringify(c)),
		[key, code],
	);
}

async function verdict(page: Page, timeout = 90_000) {
	const label = page.locator("section[aria-live=polite] p.type-label");
	await page.waitForFunction(
		() => {
			const text =
				document.querySelector("section[aria-live=polite] p.type-label")
					?.textContent ?? "";
			return (
				!/^(Running|Checking|Loading|Stopping)/.test(text) && text !== "Ready"
			);
		},
		null,
		{ timeout },
	);
	return {
		title: (await label.textContent()) ?? "",
		message:
			(await page
				.locator("section[aria-live=polite] p.type-body-sm")
				.textContent()) ?? "",
	};
}

await step("landing page is isolated and downloads the toolchain", async () => {
	await open(page, base);
	if (!(await page.evaluate(() => crossOriginIsolated)))
		throw new Error("not cross-origin isolated");
	await page.getByRole("button", { name: /Test my camera/ }).click();
	await page.getByText("Working").waitFor({ timeout: 10_000 });
	await page.getByRole("button", { name: /Download/ }).click();
	await page.getByText(/ready/i).first().waitFor({ timeout: 120_000 });
	await page
		.locator("text=Python and OpenCV ready")
		.or(page.locator("text=Python ready"))
		.first()
		.waitFor({ timeout: 120_000 });
});

await step(
	"level 3 runs live on the camera, with windows and sliders",
	async () => {
		await setCode(page, String(SEE_IT.number), SEE_IT.solution);
		await open(page, `${base}/level/${SEE_IT.id}?instructor=1`);
		await page.getByRole("button", { name: "Run", exact: true }).click();
		await page
			.locator("figcaption", { hasText: "camera" })
			.waitFor({ timeout: 60_000 });
		await page.locator("input[type=range]").first().waitFor();
		const sliders = await page.locator("input[type=range]").count();
		if (sliders !== 6) throw new Error(`expected 6 sliders, got ${sliders}`);
		// Frames are arriving: the readout shows a frame rate.
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll("figcaption span")].some((s) =>
					/\d+ fps/.test(s.textContent ?? ""),
				),
			null,
			{ timeout: 15_000 },
		);
		// q over the page ends the script, like on a laptop.
		await page.locator("figure canvas").first().click();
		await page.keyboard.press("Escape");
		await page.keyboard.press("q");
		await page.getByText("The script ended").waitFor({ timeout: 10_000 });
	},
);

for (const level of LEVELS.filter((l) => l.clips.length)) {
	await step(`level ${level.number} answer passes Check`, async () => {
		await setCode(page, String(level.number), level.solution);
		await open(page, `${base}/level/${level.id}?instructor=1`);
		await page.getByRole("radio", { name: /Check/ }).click();
		await page.getByRole("button", { name: "Check", exact: true }).click();
		const v = await verdict(page);
		if (!/complete/.test(v.title)) throw new Error(`${v.title}: ${v.message}`);
	});
}

await step("level 4 starter fails with a coach message", async () => {
	await setCode(page, String(FIND_IT.number), FIND_IT.starter);
	await open(page, `${base}/level/${FIND_IT.id}?instructor=1`);
	await page.getByRole("radio", { name: /Check/ }).click();
	await page.getByRole("button", { name: "Check", exact: true }).click();
	const v = await verdict(page);
	if (v.title !== "Not yet" || !v.message)
		throw new Error(`${v.title}: ${v.message}`);
	console.log(`     coach: ${v.message}`);
});

await step("Stop interrupts a loop that never reads or waits", async () => {
	await setCode(page, "playground", "n = 0\nwhile True:\n    n += 1\n");
	await open(page, `${base}/playground`);
	await page.getByRole("button", { name: "Run", exact: true }).click();
	await page.getByRole("button", { name: "Stop" }).waitFor({ timeout: 60_000 });
	await page.waitForTimeout(500);
	await page.getByRole("button", { name: "Stop" }).click();
	await page
		.getByRole("button", { name: "Run", exact: true })
		.waitFor({ timeout: 5000 });
});

await step("playground plays a clip by name", async () => {
	await setCode(page, "playground", ARMOR.solution);
	await open(page, `${base}/playground`);
	await page.getByRole("button", { name: "Run", exact: true }).click();
	await page.getByText("bars", { exact: true }).waitFor({ timeout: 60_000 });
	await page.getByRole("button", { name: "Stop" }).click();
	await page
		.getByRole("button", { name: "Run", exact: true })
		.waitFor({ timeout: 5000 });
});

await browser.close();
const relevant = errors.filter((e) => !/favicon|DevTools/.test(e));
if (relevant.length) {
	console.log(
		`\nPage errors:\n${[...new Set(relevant)].slice(0, 10).join("\n")}`,
	);
}
console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);
