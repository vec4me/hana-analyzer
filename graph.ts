/**
 * Dependency graph construction and module classification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExportInfo, ImportBinding } from "./ast.ts";
import { analyzeFile } from "./ast.ts";
import { collectFiles, resolveImport } from "./scan.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Edge {
	from: string;
	to: string;
	typeOnly: boolean;
	bindings: ImportBinding[];
	isDynamic: boolean;
	isReexport: boolean;
}

export interface Graph {
	files: string[];
	edges: Edge[];
	runtimeEdges: Edge[];
	imports: Map<string, string[]>;
	importedBy: Map<string, string[]>;
	runtimeImports: Map<string, string[]>;
	runtimeImportedBy: Map<string, string[]>;
	exports: Map<string, ExportInfo[]>;
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
	const fileExports = new Map<string, ExportInfo[]>();

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

	function addEdge(
		from: string,
		to: string,
		typeOnly: boolean,
		bindings: ImportBinding[],
		isDynamic: boolean,
		isReexport: boolean,
	): void {
		const edge: Edge = {
			from: from,
			to: to,
			typeOnly: typeOnly,
			bindings: bindings,
			isDynamic: isDynamic,
			isReexport: isReexport,
		};
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
		const analysis = analyzeFile(src, file);

		fileExports.set(file, analysis.exports);

		for (const imp of analysis.imports) {
			const resolved = resolveImport(
				resolve(root, file),
				imp.moduleSpecifier,
				fileSet,
			);
			if (!resolved) {
				continue;
			}
			const relPath = resolved.slice(root.length + 1);

			// An edge is type-only if the import declaration is type-only,
			// or if every individual binding is type-only
			const allBindingsTypeOnly =
				imp.bindings.length > 0 && imp.bindings.every((b) => b.isTypeOnly);
			const typeOnly = imp.isTypeOnly || allBindingsTypeOnly;

			addEdge(
				file,
				relPath,
				typeOnly,
				imp.bindings,
				imp.isDynamic,
				imp.isReexport,
			);
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
		exports: fileExports,
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
