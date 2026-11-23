import { ExternalLink, Presentation, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { storage, useStored } from "#/lib/storage";
import { cn } from "#/lib/utils";

const WINDOW_NAME = "learn-cv-notes";

/**
 * Opens the notes in a window of their own, which follows the level open in
 * this tab. Share this tab and keep that window on your own screen.
 */
export function openNotesWindow() {
	const notes = window.open(
		"/notes",
		WINDOW_NAME,
		"popup,width=520,height=760",
	);
	if (notes) {
		storage.setNotesWindowOpen(true);
		notes.focus();
	}
}

/**
 * Presenter-only content (instructor mode): the notes on a level, the run
 * sheet on the landing page. Hidden by the dev tools setting; while the notes
 * window is open, only a small bar stays here, so a screen share doesn't show
 * them.
 */
export function PresenterNotes({
	title,
	children,
	className,
}: {
	title: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const hidden = useStored(storage.areNotesHidden, false);
	const popped = useStored(storage.isNotesWindowOpen, false);
	if (hidden) return null;

	if (popped) {
		return (
			<aside
				aria-label="Presenter notes"
				className={cn(
					"flex flex-wrap items-center justify-between gap-2 rounded-sm border border-dashed border-violet/50 px-4 py-2",
					className,
				)}
			>
				<span className="flex items-center gap-2 type-body-sm text-ink-muted">
					<Presentation className="size-4 text-violet-text" aria-hidden />
					Presenter notes are in their own window.
				</span>
				<span className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="h-8 px-2 text-violet-text"
						onClick={openNotesWindow}
					>
						<ExternalLink />
						Show
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 px-2 text-violet-text"
						onClick={() => storage.setNotesWindowOpen(false)}
					>
						<Undo2 />
						Bring back
					</Button>
				</span>
			</aside>
		);
	}

	return (
		<aside
			aria-label="Presenter notes"
			className={cn(
				"flex flex-col gap-2 rounded-sm border border-violet/50 bg-violet-soft p-4",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-2 type-label text-violet-text">
					<Presentation className="size-4" aria-hidden />
					{title}
				</span>
				<Button
					variant="ghost"
					size="sm"
					className="-my-1 h-8 px-2 text-violet-text hover:bg-violet/10"
					onClick={openNotesWindow}
				>
					<ExternalLink />
					Pop out
				</Button>
			</div>
			{children}
		</aside>
	);
}
