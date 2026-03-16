/**
 * Path coupling analysis: find hardcoded directory name references.
 *
 * Scans the codebase for string occurrences of top-level directory names used
 * as path prefixes (e.g. "scripts/foo.sh"). These are coupling points — if
 * the directory is renamed, every reference breaks.
 *
 * Reads .gitignore to know what to skip. Exits with code 1 if any hardcoded
 * references are found.
 *
 * Usage: npx tsx <this-file>
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WORD_CHAR_REGEX = /\w/u;

interface Reference {
	file: string;
	line: number;
	text: string;
}

/** Read a .gitignore file and return the set of directory names it ignores (trailing-slash entries). */
function readGitignoreDirs(dir: string): Set<string> {
	const ignored = new Set<string>();
	try {
		const content = readFileSync(join(dir, ".gitignore"), "utf8");
		for (const raw of content.split("\n")) {
			const line = raw.trim();
			if (line === "" || line.startsWith("#")) {
				continue;
			}
			if (line.endsWith("/")) {
				ignored.add(line.slice(0, -1));
			}
		}
	} catch {
		// no .gitignore in this directory
	}
	return ignored;
}

/** Recursively collect all files, reading .gitignore in each directory. */
function collectFiles(
	dir: string,
	root: string,
	parentIgnored: Set<string>,
): string[] {
	const localIgnored = readGitignoreDirs(dir);
	const ignored = new Set<string>();
	for (const v of parentIgnored) {
		ignored.add(v);
	}
	for (const v of localIgnored) {
		ignored.add(v);
	}

	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (ignored.has(entry.name)) {
				continue;
			}
			for (const f of collectFiles(full, root, ignored)) {
				results.push(f);
			}
		} else if (!entry.isSymbolicLink()) {
			results.push(relative(root, full));
		}
	}
	return results;
}

/** Get top-level directories from the file list. */
function getTopLevelDirs(files: string[]): string[] {
	const dirs = new Set<string>();
	for (const file of files) {
		const slash = file.indexOf("/");
		if (slash > 0) {
			dirs.add(file.slice(0, slash));
		}
	}
	return Array.from(dirs).sort();
}

/** Check if a directory name reference is a hardcoded path (not relative). */
function isHardcodedRef(line: string, col: number): boolean {
	if (col >= 2 && line.slice(col - 2, col) === "./") {
		return false;
	}
	if (col >= 3 && line.slice(col - 3, col) === "../") {
		return false;
	}
	if (col > 0 && WORD_CHAR_REGEX.test(line[col - 1] as string)) {
		return false;
	}
	return true;
}

function main(): void {
	const root = resolve(import.meta.dirname, "..");
	const files = collectFiles(root, root, new Set());
	const dirs = getTopLevelDirs(files);

	const refs: Reference[] = [];

	for (const file of files) {
		let content: string;
		try {
			content = readFileSync(resolve(root, file), "utf8");
		} catch {
			continue;
		}

		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] as string;

			for (const dir of dirs) {
				const needle = `${dir}/`;
				let col = line.indexOf(needle);
				while (col !== -1) {
					if (isHardcodedRef(line, col)) {
						refs.push({
							file: file,
							line: i + 1,
							text: line.trim(),
						});
					}
					col = line.indexOf(needle, col + 1);
				}
			}
		}
	}

	if (refs.length === 0) {
		console.log("No hardcoded directory references found.");
		return;
	}

	console.error(`Found ${refs.length} hardcoded directory references:\n`);
	for (const ref of refs) {
		const truncated =
			ref.text.length > 120 ? `${ref.text.slice(0, 120)}…` : ref.text;
		console.error(`  ${ref.file}:${ref.line}: ${truncated}`);
	}
	console.error(
		"\nHardcoded directory paths create coupling — if the directory is renamed, these break.",
	);
	process.exit(1);
}

void main();
