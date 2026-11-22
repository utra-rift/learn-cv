import { Link } from "@tanstack/react-router";
import { CircleCheck, CircleDashed, CircleX, LoaderCircle } from "lucide-react";
import type { Grade } from "#/coach/grade";
import type { Level } from "#/levels";
import { inline } from "#/lib/rich-text";
import { cn } from "#/lib/utils";

interface VerdictProps {
	grade: Grade | null;
	running: boolean;
	runningLabel?: string;
	runningText?: string;
	idleText?: string;
	next?: Level;
}

export function Verdict({
	grade,
	running,
	runningLabel,
	runningText,
	idleText,
	next,
}: VerdictProps) {
	const state = running
		? "running"
		: !grade
			? "idle"
			: grade.passed
				? "pass"
				: "fail";
	return (
		<section
			aria-live="polite"
			className={cn(
				"flex gap-3 rounded-md border bg-surface-raised p-4",
				state === "pass"
					? "border-cyan shadow-glow"
					: state === "fail"
						? "border-error/60"
						: "border-line",
			)}
		>
			{state === "running" && (
				<LoaderCircle
					className="mt-0.5 size-5 shrink-0 animate-spin text-ink-muted"
					aria-hidden
				/>
			)}
			{state === "idle" && (
				<CircleDashed
					className="mt-0.5 size-5 shrink-0 text-ink-muted"
					aria-hidden
				/>
			)}
			{state === "pass" && (
				<CircleCheck className="mt-0.5 size-5 shrink-0 text-cyan" aria-hidden />
			)}
			{state === "fail" && (
				<CircleX className="mt-0.5 size-5 shrink-0 text-error" aria-hidden />
			)}
			<div className="flex min-w-0 flex-col gap-1">
				<p
					className={cn(
						"type-label",
						state === "pass"
							? "text-cyan-text"
							: state === "fail"
								? "text-error"
								: "text-ink-muted",
					)}
				>
					{state === "running"
						? (runningLabel ?? "Running")
						: state === "idle"
							? "Ready"
							: grade?.title}
				</p>
				<p className="type-body-sm text-ink">
					{state === "running"
						? (runningText ?? "Hang on.")
						: state === "idle"
							? (idleText ??
								"Press Run (or Ctrl+Enter). Switch to Check when you're ready to be graded.")
							: inline(grade?.message ?? "")}
				</p>
				{state === "pass" && next && (
					<Link
						to="/level/$levelId"
						params={{ levelId: next.id }}
						className="mt-1 type-label text-cyan-text underline-offset-4 hover:underline"
					>
						Next: {next.title} →
					</Link>
				)}
			</div>
		</section>
	);
}
