import type * as Monaco from "monaco-editor";
import { useEffect, useRef, useState } from "react";
import type { MonacoApi } from "#/editor/monaco";

/** A problem to underline, from a syntax check or a run. 1-based. */
export interface Marker {
	line: number;
	column?: number;
	endLine?: number;
	endColumn?: number;
	message: string;
	severity?: "error" | "warning";
}

interface CodeEditorProps {
	/** Remounts the model when it changes: one model per level. */
	uri: string;
	value: string;
	onChange: (value: string) => void;
	onRun: () => void;
	markers: Marker[];
	dark: boolean;
}

/** Monaco with one file, main.py. Loaded on the client only. */
export function CodeEditor({
	uri,
	value,
	onChange,
	onRun,
	markers,
	dark,
}: CodeEditorProps) {
	const host = useRef<HTMLDivElement>(null);
	const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoRef = useRef<MonacoApi | null>(null);
	const [ready, setReady] = useState(false);
	const latest = useRef({ onChange, onRun, value });
	latest.current = { onChange, onRun, value };
	// The last text the editor itself reported, so we don't write it back.
	const emitted = useRef<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: created once; the theme updates below
	useEffect(() => {
		let disposed = false;
		let created: Monaco.editor.IStandaloneCodeEditor | null = null;
		void (async () => {
			const { loadMonaco } = await import("#/editor/monaco");
			const monaco = await loadMonaco();
			if (disposed || !host.current) return;
			monacoRef.current = monaco;
			created = monaco.editor.create(host.current, {
				theme: dark ? "rift-arena" : "rift-light",
				automaticLayout: true,
				fontFamily:
					'"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace',
				fontSize: 14,
				lineHeight: 22,
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				padding: { top: 12, bottom: 12 },
				fixedOverflowWidgets: true,
				tabSize: 4,
				insertSpaces: true,
				detectIndentation: false,
				guides: { indentation: true },
				acceptSuggestionOnEnter: "smart",
				scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
			});
			created.addAction({
				id: "learn-cv.run",
				label: "Run",
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
				run: () => latest.current.onRun(),
			});
			created.onDidChangeModelContent(() => {
				const model = created?.getModel();
				if (!model) return;
				emitted.current = model.getValue();
				latest.current.onChange(emitted.current);
			});
			editor.current = created;
			setReady(true);
		})();
		return () => {
			disposed = true;
			created?.dispose();
			editor.current = null;
		};
	}, []);

	useEffect(() => {
		monacoRef.current?.editor.setTheme(dark ? "rift-arena" : "rift-light");
	}, [dark]);

	// One model per level, so undo history doesn't cross levels.
	useEffect(() => {
		const monaco = monacoRef.current;
		const instance = editor.current;
		if (!ready || !monaco || !instance) return;
		const modelUri = monaco.Uri.parse(uri);
		let model = monaco.editor.getModel(modelUri);
		if (!model) {
			model = monaco.editor.createModel(
				latest.current.value,
				"python",
				modelUri,
			);
		}
		// The page's text wins: it's what was saved for this level.
		if (model.getValue() !== latest.current.value) {
			model.setValue(latest.current.value);
		}
		emitted.current = model.getValue();
		if (instance.getModel() !== model) instance.setModel(model);
		instance.focus();
	}, [ready, uri]);

	// New text from outside (reset, answer, shared link). Text that came from
	// the editor itself is skipped, or a fast typist would lose keystrokes.
	useEffect(() => {
		const model = editor.current?.getModel();
		if (!ready || !model || value === emitted.current) return;
		if (model.getValue() === value) return;
		editor.current?.pushUndoStop();
		model.pushEditOperations(
			[],
			[{ range: model.getFullModelRange(), text: value }],
			() => null,
		);
		editor.current?.pushUndoStop();
	}, [ready, value]);

	useEffect(() => {
		const monaco = monacoRef.current;
		const model = editor.current?.getModel();
		if (!ready || !monaco || !model) return;
		monaco.editor.setModelMarkers(
			model,
			"learn-cv",
			markers
				.filter((m) => m.line >= 1 && m.line <= model.getLineCount())
				.map((m) => ({
					severity:
						m.severity === "warning"
							? monaco.MarkerSeverity.Warning
							: monaco.MarkerSeverity.Error,
					message: m.message,
					startLineNumber: m.line,
					startColumn:
						m.column ?? model.getLineFirstNonWhitespaceColumn(m.line),
					endLineNumber: m.endLine || m.line,
					endColumn: m.endColumn || model.getLineMaxColumn(m.endLine || m.line),
				})),
		);
	}, [ready, markers]);

	return (
		<div className="relative h-full min-h-0">
			<div ref={host} className="absolute inset-0" />
			{!ready && (
				<div className="absolute inset-0 flex items-center justify-center type-body-sm text-ink-muted">
					Loading the editor…
				</div>
			)}
		</div>
	);
}
