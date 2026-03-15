/**
 * File scanning and import resolution.
 */
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const EXT_REGEX = /\.tsx?$/u;
const SKIP_REGEX = /node_modules|\.d\.ts|\.css/u;

/** Recursively scan a directory for .ts/.tsx files. */
export function scanFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (SKIP_REGEX.test(full)) {
			continue;
		}
		if (entry.isDirectory()) {
			for (const f of scanFiles(full)) {
				results.push(f);
			}
		} else if (EXT_REGEX.test(entry.name)) {
			results.push(full);
		}
	}
	return results;
}

/** Resolve a relative import specifier to an absolute file path. */
export function resolveImport(
	from: string,
	specifier: string,
	allFiles: Set<string>,
): string | null {
	if (!specifier.startsWith(".")) {
		return null;
	}
	const dir = dirname(from);
	const base = resolve(dir, specifier);
	for (const c of [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		join(base, "index.ts"),
		join(base, "index.tsx"),
	]) {
		if (allFiles.has(c)) {
			return c;
		}
	}
	return null;
}

/** Collect all project files under the given target directories, relative to root. */
export function collectFiles(root: string, targets: string[]): string[] {
	const files: string[] = [];
	for (const t of targets) {
		for (const f of scanFiles(resolve(root, t))) {
			files.push(relative(root, f));
		}
	}
	return files;
}
