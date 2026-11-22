import type * as Monaco from "monaco-editor";

export type MonacoApi = typeof Monaco;

let loading: Promise<MonacoApi> | undefined;

/** Loads Monaco once, in the browser only. */
export function loadMonaco(): Promise<MonacoApi> {
	loading ??= (async () => {
		const monaco = (await import("./monaco-core")) as unknown as MonacoApi;
		self.MonacoEnvironment = {
			getWorker: () =>
				new Worker(new URL("./editor.worker.ts", import.meta.url), {
					type: "module",
					name: "monaco",
				}),
		};
		defineTheme(monaco);
		return monaco;
	})();
	return loading;
}

/** The Arena (dark) and light themes from the RIFT design tokens. */
function defineTheme(monaco: MonacoApi) {
	monaco.editor.defineTheme("rift-arena", {
		base: "vs-dark",
		inherit: true,
		rules: [
			{ token: "", foreground: "F4FBFC" },
			{ token: "comment", foreground: "7F92AB", fontStyle: "italic" },
			{ token: "keyword", foreground: "4DC6E2" },
			{ token: "keyword.directive", foreground: "A897FF" },
			{ token: "string", foreground: "A897FF" },
			{ token: "string.escape", foreground: "C9BEFF" },
			{ token: "number", foreground: "9FE3F2" },
			{ token: "number.float", foreground: "9FE3F2" },
			{ token: "type", foreground: "4DC6E2" },
			{ token: "identifier", foreground: "F4FBFC" },
			{ token: "delimiter", foreground: "9FB0C6" },
			{ token: "operator", foreground: "9FB0C6" },
		],
		colors: {
			"editor.background": "#0E1A2E",
			"editor.foreground": "#F4FBFC",
			"editor.lineHighlightBackground": "#13223A",
			"editor.lineHighlightBorder": "#00000000",
			"editor.selectionBackground": "#4DC6E240",
			"editor.inactiveSelectionBackground": "#4DC6E224",
			"editorCursor.foreground": "#4DC6E2",
			"editorLineNumber.foreground": "#4A5B73",
			"editorLineNumber.activeForeground": "#9FB0C6",
			"editorIndentGuide.background1": "#22324A",
			"editorIndentGuide.activeBackground1": "#4A5B73",
			"editorWidget.background": "#0E1A2E",
			"editorWidget.border": "#22324A",
			"editorSuggestWidget.background": "#0E1A2E",
			"editorSuggestWidget.border": "#22324A",
			"editorSuggestWidget.selectedBackground": "#0D2A38",
			"editorHoverWidget.background": "#0E1A2E",
			"editorHoverWidget.border": "#22324A",
			"editorError.foreground": "#FF6B81",
			"editorWarning.foreground": "#FFC861",
			focusBorder: "#7B61FF",
			"scrollbarSlider.background": "#22324A99",
			"scrollbarSlider.hoverBackground": "#4A5B73AA",
		},
	});
	monaco.editor.defineTheme("rift-light", {
		base: "vs",
		inherit: true,
		rules: [
			{ token: "", foreground: "002554" },
			{ token: "comment", foreground: "5C6E86", fontStyle: "italic" },
			{ token: "keyword", foreground: "006E88" },
			{ token: "string", foreground: "5A3FE0" },
			{ token: "string.escape", foreground: "7B61FF" },
			{ token: "number", foreground: "00586D" },
			{ token: "number.float", foreground: "00586D" },
			{ token: "type", foreground: "006E88" },
			{ token: "identifier", foreground: "002554" },
			{ token: "delimiter", foreground: "4A5B73" },
			{ token: "operator", foreground: "4A5B73" },
		],
		colors: {
			"editor.background": "#FFFFFF",
			"editor.foreground": "#002554",
			"editor.lineHighlightBackground": "#F4FBFC",
			"editor.lineHighlightBorder": "#00000000",
			"editor.selectionBackground": "#4DC6E24D",
			"editor.inactiveSelectionBackground": "#4DC6E22E",
			"editorCursor.foreground": "#002554",
			"editorLineNumber.foreground": "#9FB0C6",
			"editorLineNumber.activeForeground": "#4A5B73",
			"editorIndentGuide.background1": "#D3E4EA",
			"editorIndentGuide.activeBackground1": "#9FB0C6",
			"editorWidget.background": "#FFFFFF",
			"editorWidget.border": "#D3E4EA",
			"editorHoverWidget.background": "#FFFFFF",
			"editorHoverWidget.border": "#D3E4EA",
			"editorError.foreground": "#C8233C",
			"editorWarning.foreground": "#A66A00",
			focusBorder: "#7B61FF",
			"scrollbarSlider.background": "#D3E4EA99",
			"scrollbarSlider.hoverBackground": "#9FB0C6AA",
		},
	});
}
