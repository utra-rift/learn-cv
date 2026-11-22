import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { storage, useStored } from "#/lib/storage";
import { cn } from "#/lib/utils";

/**
 * The top bar. On a level, the level chips sit in it (children). The theme
 * button switches to the Arena (dark) theme for projectors.
 */
export function SiteHeader({
	className,
	children,
}: {
	className?: string;
	children?: React.ReactNode;
}) {
	const instructor = useStored(storage.isInstructor, false);
	const projector = useStored(storage.isProjector, false);
	return (
		<header
			className={cn(
				"flex h-14 items-center gap-4 border-b border-line px-4 sm:px-6",
				className,
			)}
		>
			<Link
				to="/"
				className="flex shrink-0 items-center gap-3"
				aria-label="Learn CV home"
			>
				<img
					src={
						projector
							? "/logos/rift-mark-white-cropped.svg"
							: "/logos/rift-mark-cropped.svg"
					}
					alt=""
					width={500}
					height={850}
					className="h-8 w-auto"
				/>
				<span
					className={cn("type-label text-ink", children && "max-lg:sr-only")}
				>
					Learn CV
				</span>
			</Link>
			{children && (
				<div className="flex h-full min-w-0 flex-1 items-center border-l border-line pl-2">
					{children}
				</div>
			)}
			<div className="ml-auto flex shrink-0 items-center gap-2">
				{instructor && <Badge variant="violet">Instructor</Badge>}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={projector ? "Light theme" : "Arena theme, for projectors"}
					title={projector ? "Light theme" : "Arena theme, for projectors"}
					onClick={() => storage.setProjector(!projector)}
				>
					{projector ? <Sun /> : <Moon />}
				</Button>
			</div>
		</header>
	);
}
