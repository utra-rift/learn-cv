import { Check, ChevronRight, Lightbulb, Presentation } from "lucide-react";
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
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type { Level } from "#/levels";
import type { StepImage } from "#/levels/types";
import { inline, RichText } from "#/lib/rich-text";
import { cn } from "#/lib/utils";

interface LevelBriefProps {
	level: Level;
	step: number;
	onStep: (step: number) => void;
	hintsShown: number;
	onShowHint: () => void;
	showAnswer: boolean;
	onUseAnswer: () => void;
	instructor: boolean;
}

export function LevelBrief({
	level,
	step,
	onStep,
	hintsShown,
	onShowHint,
	showAnswer,
	onUseAnswer,
	instructor,
}: LevelBriefProps) {
	const checked = level.clips.length > 0;
	return (
		<section
			aria-labelledby="level-title"
			className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-5"
		>
			<div className="flex items-center gap-3">
				<span className="type-label text-cyan-text">
					Level {String(level.number).padStart(2, "0")}
				</span>
				<span className="type-data text-[12px] text-ink-muted">
					{level.minutes} min
				</span>
				{!checked && <Badge variant="violet">Demo</Badge>}
			</div>
			<h1 id="level-title" className="type-display-sm text-ink uppercase">
				{level.title}
			</h1>
			<p className="type-body text-ink-muted">{inline(level.idea)}</p>
			<p className="type-body text-ink">
				<span className="type-label mr-2 text-ink-muted">Goal</span>
				{inline(level.goal)}
			</p>

			<Steps level={level} step={step} onStep={onStep} />

			{hintsShown > 0 && (
				<ol className="flex flex-col gap-3">
					{level.hints.slice(0, hintsShown).map((hint, i) => (
						<li
							key={hint.slice(0, 24)}
							className="flex gap-3 rounded-sm border border-line bg-surface p-3 type-body-sm text-ink-muted"
						>
							<Lightbulb
								className="mt-0.5 size-4 shrink-0 text-cyan"
								aria-hidden
							/>
							<div className="min-w-0 flex-1">
								<span className="sr-only">Hint {i + 1}: </span>
								<RichText text={hint} />
							</div>
						</li>
					))}
				</ol>
			)}

			<div className="flex flex-wrap gap-2">
				{hintsShown < level.hints.length && (
					<Button variant="outline" size="sm" onClick={onShowHint}>
						<Lightbulb />
						{hintsShown === 0 ? "Hint" : "Another hint"}
					</Button>
				)}
				{showAnswer && checked && (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="ghost" size="sm">
								Answer
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent className="sm:max-w-2xl">
							<AlertDialogHeader>
								<AlertDialogTitle>One way to solve it</AlertDialogTitle>
								<AlertDialogDescription>
									Read it through before you copy it. Using it replaces the code
									in your editor.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<pre className="max-h-[50vh] overflow-auto rounded-sm border border-line bg-surface p-4 type-data text-ink">
								{level.solution}
							</pre>
							<AlertDialogFooter>
								<AlertDialogCancel>Close</AlertDialogCancel>
								<AlertDialogAction onClick={onUseAnswer}>
									Use this code
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				)}
			</div>

			{instructor && level.presenter.length > 0 && (
				<aside
					aria-label="Presenter notes"
					className="flex flex-col gap-2 rounded-sm border border-violet/50 bg-violet-soft p-4"
				>
					<span className="flex items-center gap-2 type-label text-violet-text">
						<Presentation className="size-4" aria-hidden />
						Presenter notes · {level.minutes} min
					</span>
					<ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-ink marker:text-violet">
						{level.presenter.map((note) => (
							<li key={note.slice(0, 32)}>{inline(note)}</li>
						))}
					</ul>
				</aside>
			)}
		</section>
	);
}

/**
 * The walkthrough. One step open at a time, so a beginner always knows what
 * to do next, and the presenter can call out "step 3".
 */
function Steps({
	level,
	step,
	onStep,
}: {
	level: Level;
	step: number;
	onStep: (step: number) => void;
}) {
	const total = level.steps.length;
	const done = step >= total;
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<span className="type-label text-ink-muted">Steps</span>
				<span className="type-data text-[12px] text-ink-muted tabular-nums">
					{done ? "All done" : `${step + 1} of ${total}`}
				</span>
			</div>
			<ol className="flex flex-col overflow-hidden rounded-sm border border-line">
				{level.steps.map((s, i) => {
					const current = i === step;
					const complete = i < step;
					return (
						<li
							key={s.title}
							className={cn(
								"border-l-2 border-b border-b-line last:border-b-0",
								current ? "border-l-cyan bg-surface" : "border-l-transparent",
							)}
						>
							<button
								type="button"
								onClick={() => onStep(i)}
								aria-current={current ? "step" : undefined}
								className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
							>
								<span
									className={cn(
										"flex size-5 shrink-0 items-center justify-center rounded-pill border type-data text-[11px]",
										complete
											? "border-cyan bg-cyan text-on-cyan"
											: current
												? "border-cyan text-cyan-text"
												: "border-line text-ink-muted",
									)}
								>
									{complete ? (
										<Check className="size-3" aria-label="done" />
									) : (
										i + 1
									)}
								</span>
								<span
									className={cn(
										"type-body-sm",
										current ? "font-semibold text-ink" : "text-ink-muted",
									)}
								>
									{s.title}
								</span>
							</button>
							{current && (
								<div className="@container flex flex-col gap-3 px-3 pb-3 pl-11 type-body-sm text-ink">
									<RichText text={s.body} />
									{s.images && <StepImages images={s.images} />}
									<div>
										<Button
											variant="outline"
											size="sm"
											onClick={() => onStep(i + 1)}
										>
											{i + 1 < total ? "Done, next step" : "Done"}
											<ChevronRight />
										</Button>
									</div>
								</div>
							)}
						</li>
					);
				})}
			</ol>
		</div>
	);
}

/** Pictures of what to expect: 4:3 tiles side by side, banners full width. */
function StepImages({ images }: { images: StepImage[] }) {
	const tiles = images.filter((image) => !image.wide).length;
	return (
		<div
			className={cn(
				"grid gap-2",
				tiles >= 4
					? "grid-cols-2 @md:grid-cols-4"
					: tiles === 3
						? "grid-cols-3"
						: tiles === 2
							? "grid-cols-2"
							: "grid-cols-1",
			)}
		>
			{images.map((image) => (
				<figure
					key={image.src}
					className={cn(
						"flex min-w-0 flex-col gap-1",
						image.wide && "col-span-full",
						!image.wide && tiles === 1 && "max-w-sm",
					)}
				>
					<img
						src={image.src}
						alt={image.alt}
						width={image.wide ? 640 : 320}
						height={image.wide ? 112 : 240}
						loading="lazy"
						className={cn(
							"w-full rounded-md border border-line bg-black",
							image.wide ? "h-auto" : "aspect-[4/3] object-cover",
						)}
					/>
					<figcaption className="type-data text-[11px] leading-4 text-ink-muted">
						{image.caption}
					</figcaption>
				</figure>
			))}
		</div>
	);
}
