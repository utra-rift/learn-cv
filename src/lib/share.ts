import {
	compressToEncodedURIComponent,
	decompressFromEncodedURIComponent,
} from "lz-string";

/** A link that opens this page with this code. The code stays in the hash, so it never reaches a server. */
export function shareUrl(path: string, code: string): string {
	const url = new URL(path, location.origin);
	url.hash = `code=${compressToEncodedURIComponent(code)}`;
	return url.href;
}

export function readSharedCode(): string | null {
	const match = location.hash.match(/code=([^&]+)/);
	if (!match) return null;
	return decompressFromEncodedURIComponent(match[1]) || null;
}
