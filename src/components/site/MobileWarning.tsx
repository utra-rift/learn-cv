import { Laptop, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { storage, useStored } from "#/lib/storage";

/**
 * Phones and tablets can open the site, but it's built for a laptop: the
 * editor needs a keyboard and the camera windows need room. Shown on narrow
 * screens and touch-only devices (the `mobile-only` class in styles.css),
 * until dismissed on that device.
 */
export function MobileWarning() {
	const dismissed = useStored(storage.isMobileWarningDismissed, false);
	if (dismissed) return null;
	return (
		<aside
			aria-label="Laptop recommended"
			className="mobile-only border-b border-violet/40 bg-violet-soft px-4 py-3"
		>
			<div className="flex items-start gap-3">
				<Laptop
					className="mt-0.5 size-5 shrink-0 text-violet-text"
					aria-hidden
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<p className="type-label text-violet-text">Bring a laptop</p>
					<p className="type-body-sm text-ink">
						Learn CV is made for a laptop: you'll type Python, and the camera
						windows need room. You can look around on this device, but the
						levels won't be comfortable here.
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Dismiss"
					className="-mt-1 -mr-2 shrink-0"
					onClick={() => storage.dismissMobileWarning()}
				>
					<X />
				</Button>
			</div>
		</aside>
	);
}
