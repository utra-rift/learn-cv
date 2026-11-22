import { Maximize2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import type { CvRuntime, TrackbarView, WindowView } from "#/runtimes/cv/client";
import { useRuntime } from "./useRuntime";

/**
 * The cv2.imshow windows, tiled. Each is a canvas the runtime draws into, a
 * title, a frame-rate readout and its trackbars. Clicking one opens it
 * fullscreen in the Arena theme, for showing the room.
 */
export function WindowsPane({ className }: { className?: string }) {
	const runtime = useRuntime();
	const [fullscreen, setFullscreen] = useState<string | null>(null);
	const windows = runtime.windows;
	const open = windows.find((w) => w.name === fullscreen);

	// Bring the windows into view when a run opens the first one.
	const section = useRef<HTMLElement>(null);
	const hadWindows = useRef(false);
	useEffect(() => {
		const has = windows.length > 0;
		if (has && !hadWindows.current) {
			section.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
		hadWindows.current = has;
	}, [windows.length]);

	useEffect(() => {
		if (!fullscreen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setFullscreen(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [fullscreen]);

	return (
		<section
			ref={section}
			aria-label="Windows"
			className={cn(
				"rounded-md border border-line bg-surface-raised p-3",
				className,
			)}
		>
			{windows.length === 0 ? (
				<EmptyWindows state={runtime.runState} />
			) : (
				<div
					className={cn(
						"grid gap-3",
						windows.length > 1 && "sm:grid-cols-2",
						windows.length > 4 && "lg:grid-cols-3",
					)}
				>
					{windows.map((w) => (
						<WindowPanel
							key={w.name}
							runtime={runtime}
							view={w}
							onOpen={() => setFullscreen(w.name)}
						/>
					))}
				</div>
			)}

			{open && (
				<div
					data-theme="dark"
					role="dialog"
					aria-modal="true"
					aria-label={`${open.name}, fullscreen`}
					className="fixed inset-0 z-50 flex flex-col gap-4 bg-background p-6 text-foreground"
				>
					<div className="flex items-center justify-between gap-4">
						<span className="type-display-sm">{open.name}</span>
						<div className="flex items-center gap-4">
							<FpsReadout runtime={runtime} name={open.name} />
							<Button
								variant="outline"
								size="sm"
								onClick={() => setFullscreen(null)}
							>
								<X />
								Close
							</Button>
						</div>
					</div>
					<div className="flex min-h-0 flex-1 items-center justify-center">
						<WindowCanvas
							runtime={runtime}
							name={open.name}
							className="h-full max-h-full w-auto max-w-full [image-rendering:pixelated]"
						/>
					</div>
					{open.trackbars.length > 0 && (
						<Trackbars
							runtime={runtime}
							view={open}
							className="mx-auto w-full max-w-3xl"
						/>
					)}
				</div>
			)}
		</section>
	);
}

function EmptyWindows({ state }: { state: CvRuntime["runState"] }) {
	return (
		<div className="flex aspect-[4/3] max-h-72 w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-line text-center">
			<p className="type-label text-ink-muted">
				{state === "idle" ? "No windows yet" : "Starting"}
			</p>
			<p className="max-w-xs type-body-sm text-ink-muted">
				{state === "idle"
					? "Press Run. Every cv2.imshow window shows up here."
					: "Windows appear when the script calls cv2.imshow."}
			</p>
		</div>
	);
}

function WindowPanel({
	runtime,
	view,
	onOpen,
}: {
	runtime: CvRuntime;
	view: WindowView;
	onOpen: () => void;
}) {
	return (
		<figure className="@container flex min-w-0 flex-col gap-2">
			<figcaption className="flex items-center justify-between gap-2">
				<span className="truncate type-label text-ink">{view.name}</span>
				<FpsReadout runtime={runtime} name={view.name} />
			</figcaption>
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Open ${view.name} fullscreen`}
				className="group relative block cursor-zoom-in overflow-hidden rounded-md border border-line bg-black"
			>
				<WindowCanvas runtime={runtime} name={view.name} className="w-full" />
				<Maximize2
					aria-hidden
					className="absolute top-2 right-2 size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-80"
				/>
			</button>
			{view.trackbars.length > 0 && <Trackbars runtime={runtime} view={view} />}
		</figure>
	);
}

function WindowCanvas({
	runtime,
	name,
	className,
}: {
	runtime: CvRuntime;
	name: string;
	className?: string;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		if (!canvas.current) return;
		return runtime.attachCanvas(name, canvas.current);
	}, [runtime, name]);
	return (
		<canvas
			ref={canvas}
			width={320}
			height={240}
			className={cn(
				"block aspect-[4/3] h-auto bg-black object-contain",
				className,
			)}
		/>
	);
}

function FpsReadout({ runtime, name }: { runtime: CvRuntime; name: string }) {
	const [fps, setFps] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setFps(runtime.fps.get(name) ?? 0), 500);
		return () => clearInterval(timer);
	}, [runtime, name]);
	return (
		<span className="shrink-0 type-data text-[12px] text-ink-muted tabular-nums">
			{fps ? `${fps.toFixed(0)} fps` : "–"}
		</span>
	);
}

function Trackbars({
	runtime,
	view,
	className,
}: {
	runtime: CvRuntime;
	view: WindowView;
	className?: string;
}) {
	// Check sets the sliders itself, so Reset is only for your own runs.
	const resettable = runtime.clip === null;
	const changed = useChanged(runtime, view);
	return (
		<div className={cn("@container flex flex-col gap-1", className)}>
			<div className="grid gap-x-4 gap-y-1 @lg:grid-cols-2">
				{view.trackbars.map((t) => (
					<Trackbar
						key={`${t.slot}-${t.name}`}
						runtime={runtime}
						window={view.name}
						trackbar={t}
					/>
				))}
			</div>
			{resettable && (
				<div className="flex justify-end">
					<Button
						variant="ghost"
						size="sm"
						disabled={!changed}
						onClick={() => runtime.resetTrackbars(view)}
						title="Put the sliders back to the values in your code"
					>
						<RotateCcw />
						Reset sliders
					</Button>
				</div>
			)}
		</div>
	);
}

/** Whether any slider in the window is away from where the script started it. */
function useChanged(runtime: CvRuntime, view: WindowView): boolean {
	const [changed, setChanged] = useState(false);
	useEffect(() => {
		const check = () =>
			setChanged(
				view.trackbars.some((t) => runtime.getTrackbar(t.slot) !== t.initial),
			);
		check();
		const timer = setInterval(check, 200);
		return () => clearInterval(timer);
	}, [runtime, view]);
	return changed;
}

function Trackbar({
	runtime,
	window: windowName,
	trackbar,
}: {
	runtime: CvRuntime;
	window: string;
	trackbar: TrackbarView;
}) {
	const [value, setValue] = useState(() => runtime.getTrackbar(trackbar.slot));
	// Python can move a slider too (setTrackbarPos), so keep in step with it.
	useEffect(() => {
		const timer = setInterval(
			() => setValue(runtime.getTrackbar(trackbar.slot)),
			200,
		);
		return () => clearInterval(timer);
	}, [runtime, trackbar.slot]);
	const id = `tb-${windowName}-${trackbar.name}`.replace(/\W+/g, "-");
	return (
		<div className="grid min-w-0 grid-cols-[4.5rem_minmax(4rem,1fr)_2.25rem] items-center gap-2">
			<label htmlFor={id} className="truncate type-body-sm text-ink-muted">
				{trackbar.name}
			</label>
			<input
				id={id}
				type="range"
				min={0}
				max={trackbar.max}
				value={value}
				onChange={(event) => {
					const next = Number(event.target.value);
					setValue(next);
					runtime.setTrackbar(windowName, trackbar.name, trackbar.slot, next);
				}}
				className="h-6 w-full cursor-pointer accent-cyan"
			/>
			<span className="text-right type-data text-ink tabular-nums">
				{value}
			</span>
		</div>
	);
}
