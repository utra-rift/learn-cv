import {
	ClipboardCheck,
	History,
	Play,
	RotateCcw,
	Share2,
	Square,
	Video,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	friendlyError,
	friendlySyntax,
	type Grade,
	grade as gradeRuns,
} from "#/coach/grade";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Progress } from "#/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import type { Level } from "#/levels";
import { readSharedCode, shareUrl } from "#/lib/share";
import { storage, useStored } from "#/lib/storage";
import type { LogLine } from "#/runtimes/cv/client";
import type { ScriptRun, SyntaxIssue } from "#/runtimes/cv/types";
import { CodeEditor, type Marker } from "./CodeEditor";
import { ConsolePane } from "./ConsolePane";
import { useRuntime } from "./useRuntime";
import { Verdict } from "./Verdict";
import { WindowsPane } from "./WindowsPane";

export type Mode = "live" | "check";

interface PlayScreenProps {
	/** Where code is saved: a level number or "playground". */
	storageKey: string;
	/** The page path, for share links. */
	path: string;
	starter: string;
	/** The level being played; the playground has none. */
	level?: Level;
	next?: Level;
	/** The left column above the windows: the brief. */
	brief?: ReactNode;
	/** Passing code from the level before, for "use my code from the last level". */
	previousCode?: string | null;
	previousNumber?: number;
	onPassed?: (code: string) => void;
	onFailedCheck?: () => void;
	/** Replaces the code when `n` changes, such as with the answer. */
	replacement?: { code: string; n: number } | null;
}

const MAX_LOG_LINES = 400;

/**
 * The play screen: brief and windows on the left; the editor, console and
 * verdict on the right on wide screens, stacked on narrow ones.
 */
export function PlayScreen({
	storageKey,
	path,
	starter,
	level,
	next,
	brief,
	previousCode,
	previousNumber,
	onPassed,
	onFailedCheck,
	replacement,
}: PlayScreenProps) {
	const runtime = useRuntime();
	const projector = useStored(storage.isProjector, false);
	const checkable = Boolean(level?.clips.length);

	// The code. A share link carries it in the hash; read that once.
	const shared = useRef<string | null | undefined>(undefined);
	if (shared.current === undefined) shared.current = readSharedCode();
	const [code, setCode] = useState(
		() => shared.current ?? storage.getCode(storageKey) ?? starter,
	);
	useEffect(() => {
		if (shared.current) {
			storage.setCode(storageKey, shared.current);
			shared.current = null;
			history.replaceState(null, "", location.pathname + location.search);
			return;
		}
		setCode(storage.getCode(storageKey) ?? starter);
	}, [storageKey, starter]);

	const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const updateCode = useCallback(
		(value: string) => {
			setCode(value);
			clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(
				() => storage.setCode(storageKey, value),
				300,
			);
		},
		[storageKey],
	);
	const replaceCode = (value: string) => {
		storage.setCode(storageKey, value);
		setCode(value);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: only when a new replacement arrives
	useEffect(() => {
		if (replacement) replaceCode(replacement.code);
	}, [replacement?.n]);

	const [mode, setMode] = useState<Mode>("live");
	useEffect(() => {
		if (!checkable) setMode("live");
	}, [checkable]);

	// Console, verdict and editor markers.
	const [lines, setLines] = useState<LogLine[]>([]);
	const [grade, setGrade] = useState<Grade | null>(null);
	const [liveNote, setLiveNote] = useState<string | null>(null);
	const [runMarkers, setRunMarkers] = useState<Marker[]>([]);
	const [syntaxMarkers, setSyntaxMarkers] = useState<Marker[]>([]);
	const append = useCallback((line: LogLine) => {
		setLines((prev) => {
			const nextLines = [...prev, line];
			return nextLines.length > MAX_LOG_LINES
				? nextLines.slice(-MAX_LOG_LINES)
				: nextLines;
		});
	}, []);
	useEffect(() => runtime.onLog(append), [runtime, append]);

	// A new level starts clean.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when the page changes only
	useEffect(() => {
		setLines([]);
		setGrade(null);
		setLiveNote(null);
		setRunMarkers([]);
	}, [storageKey]);

	// Start downloading as soon as the page opens.
	useEffect(() => {
		void runtime.ready().catch(() => {});
	}, [runtime]);

	// Syntax errors as you type, while nothing is running.
	useEffect(() => {
		if (runtime.status.state !== "ready" || runtime.runState !== "idle") return;
		const timer = setTimeout(async () => {
			const issue = await runtime.syntax(code).catch(() => null);
			setSyntaxMarkers(issue ? [syntaxMarker(issue)] : []);
		}, 600);
		return () => clearTimeout(timer);
	}, [runtime, runtime.status.state, runtime.runState, code]);

	const running = runtime.runState !== "idle";

	const run = useCallback(async () => {
		if (running) return;
		setLines([]);
		setGrade(null);
		setLiveNote(null);
		setRunMarkers([]);
		try {
			await runtime.ready();
			const syntax = await runtime.syntax(code);
			if (syntax) {
				const marker = syntaxMarker(syntax);
				setRunMarkers([marker]);
				append({
					text: `File "main.py", line ${syntax.line}\n${syntax.type}: ${syntax.message}`,
					kind: "error",
				});
				setGrade({
					passed: false,
					title: "Syntax error",
					message: `Line ${syntax.line}: ${friendlySyntax(syntax)}`,
					line: syntax.line,
					clips: [],
				});
				return;
			}

			if (mode === "live" || !level) {
				const result = await runtime.live(code);
				reportLive(result);
				return;
			}

			const runs = await runtime.check(code, level.clips, level.watch);
			const g = gradeRuns(level, code, null, runs, (clip) => {
				const labels = runtime.clipLabels.get(clip);
				if (!labels) throw new Error(`No labels for ${clip}`);
				return labels;
			});
			const crashed = runs.find((r) => r.error);
			if (crashed?.error)
				append({ text: crashed.error.text.trim(), kind: "error" });
			for (const clip of g.clips) append({ text: clip.summary, kind: "info" });
			setGrade(g);
			if (g.line) setRunMarkers([{ line: g.line, message: g.message }]);
			if (g.passed) onPassed?.(code);
			else onFailedCheck?.();
		} catch (error) {
			setGrade({
				passed: false,
				title: "Couldn't run",
				message: `Something went wrong starting Python: ${String((error as Error)?.message ?? error)}`,
				clips: [],
			});
		}

		function reportLive(result: ScriptRun) {
			if (result.status === "error" && result.error) {
				append({ text: result.error.text.trim(), kind: "error" });
				const message = friendlyError(result.error);
				setGrade({
					passed: false,
					title: "Your code crashed",
					message,
					line: result.error.line ?? undefined,
					clips: [],
				});
				if (result.error.line)
					setRunMarkers([{ line: result.error.line, message }]);
			} else if (result.status === "stopped") {
				setLiveNote("Stopped.");
			} else {
				setLiveNote(
					checkable
						? "The script ended. Switch to Check when you're ready to be graded."
						: "The script ended.",
				);
			}
		}
	}, [
		running,
		runtime,
		code,
		mode,
		level,
		append,
		onPassed,
		onFailedCheck,
		checkable,
	]);

	// Ctrl/Cmd+Enter runs from anywhere; other keys over the page go to waitKey.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				void run();
				return;
			}
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (
				target?.closest(
					".monaco-editor, input, textarea, select, [contenteditable]",
				)
			)
				return;
			const keyCode = keyFor(event);
			if (keyCode !== null && runtime.runState === "live")
				runtime.pressKey(keyCode);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [run, runtime]);

	const [copied, setCopied] = useState(false);
	const share = async () => {
		await navigator.clipboard.writeText(shareUrl(path, code));
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	};

	const status = runtime.status;
	const loading = status.state === "loading" || status.state === "idle";
	const percent = status.total
		? Math.round((status.loaded / status.total) * 100)
		: 0;
	const markers = runMarkers.length ? runMarkers : syntaxMarkers;

	return (
		<TooltipProvider>
			<main className="grid flex-1 gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
				<div className="flex min-w-0 flex-col gap-4 xl:max-h-[calc(100vh-56px-3rem)] xl:overflow-y-auto xl:pr-1">
					{brief}
					<WindowsPane />
				</div>

				<div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:h-[calc(100vh-56px-3rem)] xl:self-start">
					<section
						aria-label="Your code"
						className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-md border border-line bg-surface-raised"
					>
						<div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
							<span className="border-b-2 border-cyan px-1 py-1 font-mono text-[12px] text-ink">
								main.py
							</span>
							<div className="ml-auto flex flex-wrap items-center gap-1">
								{previousCode && previousCode !== code && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={`Use my code from level ${previousNumber}`}
												onClick={() => replaceCode(previousCode)}
											>
												<History />
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											Use my passing code from level {previousNumber}
										</TooltipContent>
									</Tooltip>
								)}
								<AlertDialog>
									<Tooltip>
										<TooltipTrigger asChild>
											<AlertDialogTrigger asChild>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Reset code"
												>
													<RotateCcw />
												</Button>
											</AlertDialogTrigger>
										</TooltipTrigger>
										<TooltipContent>
											Start over from the starter code
										</TooltipContent>
									</Tooltip>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Start over?</AlertDialogTitle>
											<AlertDialogDescription>
												This replaces your code with the starter code.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Keep my code</AlertDialogCancel>
											<AlertDialogAction onClick={() => replaceCode(starter)}>
												Start over
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label="Copy a share link"
											onClick={share}
										>
											<Share2 />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{copied ? "Link copied" : "Copy a link to this code"}
									</TooltipContent>
								</Tooltip>
								{checkable && (
									<ToggleGroup
										type="single"
										variant="outline"
										size="sm"
										value={mode}
										onValueChange={(value) => value && setMode(value as Mode)}
										aria-label="Run on"
										disabled={running}
										className="ml-1"
									>
										<ToggleGroupItem
											value="live"
											aria-label="Live: your camera"
										>
											<Video />
											Live
										</ToggleGroupItem>
										<ToggleGroupItem
											value="check"
											aria-label="Check: grade on recorded clips"
										>
											<ClipboardCheck />
											Check
										</ToggleGroupItem>
									</ToggleGroup>
								)}
								{running ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => runtime.stop()}
										disabled={runtime.runState === "stopping"}
									>
										<Square />
										{runtime.runState === "stopping" ? "Stopping" : "Stop"}
									</Button>
								) : (
									<Button
										variant="accent"
										size="sm"
										onClick={run}
										disabled={status.state === "failed"}
									>
										<Play />
										{mode === "check" ? "Check" : "Run"}
									</Button>
								)}
							</div>
						</div>

						{loading && (
							<div className="flex items-center gap-3 border-b border-line px-4 py-2">
								<span className="type-body-sm whitespace-nowrap text-ink-muted">
									{status.label
										? `Downloading ${status.label}`
										: "Starting Python"}
									{percent ? ` · ${percent}%` : ""}
								</span>
								<Progress value={percent} className="flex-1" />
							</div>
						)}
						{status.state === "failed" && (
							<p className="border-b border-line px-4 py-2 type-body-sm text-error">
								Couldn't start Python: {status.error}
							</p>
						)}

						<div className="min-h-0 flex-1">
							<CodeEditor
								uri={`file:///${storageKey}/main.py`}
								value={code}
								onChange={updateCode}
								onRun={run}
								markers={markers}
								dark={projector}
							/>
						</div>
						<ConsolePane lines={lines} className="h-36 border-t border-line" />
					</section>

					<Verdict
						grade={grade}
						running={running || loading}
						runningLabel={
							loading
								? "Loading"
								: runtime.runState === "check"
									? "Checking"
									: runtime.runState === "stopping"
										? "Stopping"
										: "Running live"
						}
						runningText={
							runtime.runState === "live"
								? "Press Stop, or q with the mouse over a window, to end it."
								: runtime.runState === "check"
									? `Running your script on ${level?.clips.length ?? 0} recorded clips.`
									: undefined
						}
						idleText={liveNote ?? undefined}
						next={grade?.passed ? next : undefined}
					/>
				</div>
			</main>
		</TooltipProvider>
	);
}

function syntaxMarker(issue: SyntaxIssue): Marker {
	return {
		line: issue.line,
		column: issue.column,
		endLine: issue.endLine || undefined,
		endColumn: issue.endColumn || undefined,
		message: `${issue.type}: ${issue.message}`,
	};
}

/** The code cv2.waitKey returns for a key, or null for keys it ignores. */
function keyFor(event: KeyboardEvent): number | null {
	if (event.key === "Escape") return 27;
	if (event.key === "Enter") return 13;
	if (event.key === " ") return 32;
	if (event.key === "Tab") return 9;
	if (event.key === "Backspace") return 8;
	if (event.key.length === 1) return event.key.charCodeAt(0) & 0xff;
	return null;
}
