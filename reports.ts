/**
 * Text-based analysis reports — CLI version of the visualization.
 * Uses algebra.ts for all computations.
 */
import {
	computeInvariants,
	computeRemovability,
	findTwinPairs,
	graphCongruency,
} from "./algebra.ts";
import type { Graph } from "./graph.ts";

const DIVIDER =
	"═══════════════════════════════════════════════════════════════";
const SUB_DIVIDER =
	"───────────────────────────────────────────────────────────────";

/** Convert a string-keyed Graph to indexed arrays for algebra functions. */
interface IndexedGraph {
	edgeList: number[][];
	fileIndex: Map<string, number>;
}

function toIndexed(g: Graph): IndexedGraph {
	const fileIndex = new Map<string, number>();
	for (let i = 0; i < g.files.length; i += 1) {
		fileIndex.set(g.files[i] as string, i);
	}
	const edgeList: number[][] = [];
	for (const e of g.runtimeEdges) {
		const a = fileIndex.get(e.from);
		const b = fileIndex.get(e.to);
		if (a !== undefined && b !== undefined) {
			edgeList.push([a, b]);
		}
	}
	return { edgeList: edgeList, fileIndex: fileIndex };
}

function reportDegree(g: Graph, direction: "in" | "out"): void {
	const isIn = direction === "in";
	const runtimeMap = isIn ? g.runtimeImportedBy : g.runtimeImports;
	const totalMap = isIn ? g.importedBy : g.imports;
	const label = isIn ? "importers" : "dependencies";
	const title = isIn
		? "HIGH IN-DEGREE NODES (most imported files, runtime)"
		: "HIGH OUT-DEGREE NODES (files that import the most, runtime)";

	console.log(`\n${SUB_DIVIDER}`);
	console.log(` ${title}`);
	console.log(SUB_DIVIDER);

	interface NodeInfo {
		file: string;
		runtime: number;
		total: number;
	}
	const nodes: NodeInfo[] = [];
	for (const [file, list] of runtimeMap) {
		if (list.length < 3) {
			continue;
		}
		nodes.push({
			file: file,
			runtime: list.length,
			total: totalMap.get(file)?.length ?? 0,
		});
	}
	nodes.sort((a, b) => b.runtime - a.runtime);

	for (const n of nodes.slice(0, 20)) {
		const typeOnly = n.total - n.runtime;
		const typeTag = typeOnly > 0 ? ` (+${typeOnly} type-only)` : "";
		console.log(
			`  ${String(n.runtime).padStart(2)} ${label}  ${n.file}${typeTag}`,
		);
	}
}

/** Run all reports. */
export function runAllReports(g: Graph): void {
	const { edgeList, fileIndex } = toIndexed(g);
	const inv = computeInvariants(edgeList, g.files.length);
	const typeOnlyCount = g.edges.length - g.runtimeEdges.length;

	// ── Overview + invariants ──
	console.log(DIVIDER);
	console.log(" DEPENDENCY ANALYSIS");
	console.log(DIVIDER);
	console.log(
		`  ${g.files.length} nodes, ${g.edges.length} edges (${g.runtimeEdges.length} runtime, ${typeOnlyCount} type-only)`,
	);
	console.log(`  ${inv.components} connected components`);
	console.log(`  cycle rank: ${inv.cycleRank} (0 = forest)`);
	console.log(`  DAG depth: ${inv.dagDepth} (longest dependency chain)`);
	console.log(`  degeneracy: ${inv.degeneracy} (densest core k-value)`);
	console.log(
		`  longest path: ${inv.longestPath.map((i) => g.files[i]).join(" → ")}`,
	);
	const moduleLabels = g.files.map((f) => {
		const parts = f.split("/");
		return parts.length > 1 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? "");
	});
	const cong = graphCongruency(edgeList, g.files.length, moduleLabels);
	console.log(
		`  congruency: ${cong.toFixed(2)}x (>1 = same-group nodes are closer in graph)`,
	);

	// ── Removability ──
	const rem = computeRemovability(edgeList, g.files.length);
	console.log(
		`  removability: ${(rem.average * 100).toFixed(0)}% (100% = fully decoupled)`,
	);

	// ── Hardest to remove ──
	console.log(`\n${SUB_DIVIDER}`);
	console.log(" HARDEST TO REMOVE (most transitive dependents)");
	console.log(SUB_DIVIDER);
	for (const [nodeIdx, dependents, impact] of rem.perNode.slice(0, 15)) {
		console.log(
			`  ${String(dependents).padStart(3)} dependents (${(impact * 100).toFixed(0)}% impact)  ${g.files[nodeIdx]}`,
		);
	}

	// ── In-degree / out-degree ──
	reportDegree(g, "in");
	reportDegree(g, "out");

	// ── Transitive reduction ──
	console.log(`\n${SUB_DIVIDER}`);
	console.log(" TRANSITIVE REDUCTION (redundant edges)");
	console.log(SUB_DIVIDER);
	console.log(
		`  ${inv.essentialEdges} essential edges, ${inv.redundantEdges} redundant (reachable via other paths)`,
	);

	// ── Betweenness ──
	console.log(`\n${SUB_DIVIDER}`);
	console.log(" BETWEENNESS CENTRALITY (bottleneck nodes)");
	console.log(SUB_DIVIDER);
	for (const [nodeIdx, score] of inv.betweenness) {
		console.log(`  ${String(score).padStart(5)}  ${g.files[nodeIdx]}`);
	}

	// ── Twin pairs ──
	console.log(`\n${SUB_DIVIDER}`);
	console.log(
		" TWIN PAIRS (files with identical dependency profiles — contractible)",
	);
	console.log(SUB_DIVIDER);
	const allEdgeList: number[][] = [];
	for (const e of g.edges) {
		const a = fileIndex.get(e.from);
		const b = fileIndex.get(e.to);
		if (a !== undefined && b !== undefined) {
			allEdgeList.push([a, b]);
		}
	}
	const twins = findTwinPairs(allEdgeList, g.files.length, 0.3);
	if (twins.length === 0) {
		console.log("  No twin pairs found.");
	} else {
		for (const [a, b, sim] of twins) {
			console.log(
				`  ${String(Math.round(sim * 100)).padStart(3)}%  ${g.files[a]}  ↔  ${g.files[b]}`,
			);
		}
	}

	// ── Cycles ──
	console.log(`\n${SUB_DIVIDER}`);
	console.log(" CYCLES");
	console.log(SUB_DIVIDER);
	const visited = new Set<string>();
	const inStack = new Set<string>();
	const cycles: string[][] = [];
	function dfs(file: string, path: string[]): void {
		if (inStack.has(file)) {
			const cycleStart = path.indexOf(file);
			if (cycleStart >= 0) {
				cycles.push(path.slice(cycleStart).concat([file]));
			}
			return;
		}
		if (visited.has(file)) {
			return;
		}
		visited.add(file);
		inStack.add(file);
		for (const dep of g.imports.get(file) ?? []) {
			dfs(dep, path.concat([file]));
		}
		inStack.delete(file);
	}
	for (const file of g.files) {
		dfs(file, []);
	}
	if (cycles.length === 0) {
		console.log("  None found.");
	} else {
		const seen = new Set<string>();
		for (const cycle of cycles) {
			const key = Array.from(cycle).sort().join(" → ");
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			console.log(`  ${cycle.join(" → ")}`);
		}
	}

	console.log(`\n${DIVIDER}`);
}
