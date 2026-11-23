// Where the toolchain and the clips live: static files in public/tools and
// public/clips, served by the dev server and, in production, as Worker static
// assets from the same origin. Paths carry versions, so a file never changes
// once deployed. scripts/sync-tools.ts fills public/ from these values.

export const PYODIDE_VERSION = "314.0.7";
/** Pyodide packages loaded at boot, from pyodide-lock.json. */
export const PACKAGES = ["numpy", "opencv-python"] as const;
/** Bump when the clips or their labels change. */
export const CLIPS_VERSION = "v2";

export const TOOLS = {
	pyodide: {
		version: PYODIDE_VERSION,
		base: `/tools/pyodide/${PYODIDE_VERSION}`,
		/** Fetched up front so the progress bar has something to measure. */
		files: [
			"pyodide.asm.wasm",
			"python_stdlib.zip",
			"pyodide.asm.mjs",
			"numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl",
			"opencv_python-4.11.0.86-cp314-cp314-pyemscripten_2026_0_wasm32.whl",
		],
	},
	clips: {
		version: CLIPS_VERSION,
		base: `/clips/${CLIPS_VERSION}`,
	},
} as const;

/** What a first visit downloads, for the landing page: the files above, measured. Each level adds about 2 MB of clips. */
export const DOWNLOAD_SIZE = "about 27 MB";
