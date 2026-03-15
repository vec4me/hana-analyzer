/**
 * Dependency graph construction and module classification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectFiles, resolveImport } from "./scan.ts";

// ── Import parsing regexes ───────────────────────────────────────────────────

const IMPORT_LINE_REGEX = /^.*from\s+["'](?<specifier>[^"']+)["']/u;
const TYPE_ONLY_PREFIX = /^import\s+type\s/u;
const DYNAMIC_IMPORT_REGEX = /import\(\s*["'](?<specifier>[^"']+)["']\s*\)/u;

// ── Types ────────────────────────────────────────────────────────────────────

export interface Edge {
	from: string;
	to: string;
	typeOnly: boolean;
}

export interface Graph {
	files: string[];
	edges: Edge[];
	runtimeEdges: Edge[];
	imports: Map<string, string[]>;
	importedBy: Map<string, string[]>;
	runtimeImports: Map<string, string[]>;
	runtimeImportedBy: Map<string, string[]>;
}

// ── Graph building ───────────────────────────────────────────────────────────

/** Build a full dependency graph from the given targets. */
export function buildGraph(root: string, targets: string[]): Graph {
	const files = collectFiles(root, targets);
	const fileSet = new Set(files.map((f) => resolve(root, f)));

	const edges: Edge[] = [];
	const runtimeEdges: Edge[] = [];
	const imports = new Map<string, string[]>();
	const importedBy = new Map<string, string[]>();
	const runtimeImports = new Map<string, string[]>();
	const runtimeImportedBy = new Map<string, string[]>();

	for (const file of files) {
		imports.set(file, []);
		runtimeImports.set(file, []);
		if (!importedBy.has(file)) {
			importedBy.set(file, []);
		}
		if (!runtimeImportedBy.has(file)) {
			runtimeImportedBy.set(file, []);
		}
	}

	function addEdge(from: string, to: string, typeOnly: boolean): void {
		const edge: Edge = { from: from, to: to, typeOnly: typeOnly };
		edges.push(edge);
		imports.get(from)?.push(to);
		const byList = importedBy.get(to);
		if (byList) {
			byList.push(from);
		} else {
			importedBy.set(to, [from]);
		}

		if (!typeOnly) {
			runtimeEdges.push(edge);
			runtimeImports.get(from)?.push(to);
			const rByList = runtimeImportedBy.get(to);
			if (rByList) {
				rByList.push(from);
			} else {
				runtimeImportedBy.set(to, [from]);
			}
		}
	}

	for (const file of files) {
		const src = readFileSync(resolve(root, file), "utf8");

		for (const line of src.split("\n")) {
			const trimmed = line.trim();

			const dynMatch = DYNAMIC_IMPORT_REGEX.exec(trimmed);
			if (dynMatch?.groups?.specifier) {
				const resolved = resolveImport(
					resolve(root, file),
					dynMatch.groups.specifier,
					fileSet,
				);
				if (resolved) {
					addEdge(file, resolved.slice(root.length + 1), false);
				}
				continue;
			}

			const importMatch = IMPORT_LINE_REGEX.exec(trimmed);
			if (!importMatch?.groups?.specifier) {
				continue;
			}
			const resolved = resolveImport(
				resolve(root, file),
				importMatch.groups.specifier,
				fileSet,
			);
			if (resolved) {
				addEdge(
					file,
					resolved.slice(root.length + 1),
					TYPE_ONLY_PREFIX.test(trimmed),
				);
			}
		}
	}

	return {
		files: files,
		edges: edges,
		runtimeEdges: runtimeEdges,
		imports: imports,
		importedBy: importedBy,
		runtimeImports: runtimeImports,
		runtimeImportedBy: runtimeImportedBy,
	};
}

// ── Module classification ────────────────────────────────────────────────────

/** Classify a file into its logical module (directory-based grouping). */
export function getModule(file: string): string {
	const parts = file.split("/");
	if (parts[0] === "frontend" && parts[1] === "components") {
		return parts.length > 3
			? `frontend/components/${parts[2]}`
			: "frontend/components";
	}
	if (parts[0] === "frontend" && (parts[1] === "hooks" || parts[1] === "css")) {
		return `frontend/${parts[1]}`;
	}
	if (parts[0] === "shared" && parts[1] === "types") {
		return "shared/types";
	}
	return parts[0] ?? "unknown";
}