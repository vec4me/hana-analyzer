/**
 * Pure graph algebra — no imports, no side effects, no Node.js APIs.
 * This file is the single source of truth for partition operations and cost computation.
 * It is both imported by Node.js code AND embedded into the browser visualization.
 */

// ── Types (stripped when embedded in browser) ────────────────────────────────

export interface PartitionCost {
	moduleCount: number;
	interModuleEdges: number;
	intraModuleEdges: number;
	coupling: number;
	maxInDegree: number;
	maxOutDegree: number;
}

// ── Cost computation ─────────────────────────────────────────────────────────

/** Compute partition cost given a module assignment array and edge list. */
export function computePartitionCost(
	fileMod: string[],
	edgeList: number[][],
): PartitionCost {
	let interModuleEdges = 0;
	let intraModuleEdges = 0;

	for (const edge of edgeList) {
		const a = edge[0] as number;
		const b = edge[1] as number;
		if (fileMod[a] === fileMod[b]) {
			intraModuleEdges += 1;
		} else {
			interModuleEdges += 1;
		}
	}

	const mods = new Set(fileMod);
	const inDeg: Record<string, number> = {};
	const outDeg: Record<string, number> = {};
	for (const m of mods) {
		inDeg[m] = 0;
		outDeg[m] = 0;
	}
	for (const edge of edgeList) {
		const a = edge[0] as number;
		const b = edge[1] as number;
		if (fileMod[a] !== fileMod[b]) {
			outDeg[fileMod[a] as string] = (outDeg[fileMod[a] as string] ?? 0) + 1;
			inDeg[fileMod[b] as string] = (inDeg[fileMod[b] as string] ?? 0) + 1;
		}
	}

	const totalEdges = interModuleEdges + intraModuleEdges;
	let maxIn = 0;
	let maxOut = 0;
	for (const v of Object.values(inDeg)) {
		if (v > maxIn) {
			maxIn = v;
		}
	}
	for (const v of Object.values(outDeg)) {
		if (v > maxOut) {
			maxOut = v;
		}
	}

	return {
		moduleCount: mods.size,
		interModuleEdges: interModuleEdges,
		intraModuleEdges: intraModuleEdges,
		coupling: totalEdges > 0 ? interModuleEdges / totalEdges : 0,
		maxInDegree: maxIn,
		maxOutDegree: maxOut,
	};
}

// ── Partition operations ─────────────────────────────────────────────────────

/** Move files to a new module (split / extract). */
export function assignToModule(
	fileMod: string[],
	indices: number[],
	moduleName: string,
): void {
	for (const i of indices) {
		fileMod[i] = moduleName;
	}
}

/** Merge all files of source modules into a target module. */
export function mergeModules(
	fileMod: string[],
	sourceModules: Set<string>,
	targetModule: string,
): void {
	for (let i = 0; i < fileMod.length; i += 1) {
		if (sourceModules.has(fileMod[i] as string)) {
			fileMod[i] = targetModule;
		}
	}
}

/** Rename a module. */
export function renameModule(
	fileMod: string[],
	oldName: string,
	newName: string,
): void {
	for (let i = 0; i < fileMod.length; i += 1) {
		if (fileMod[i] === oldName) {
			fileMod[i] = newName;
		}
	}
}

// ── Twin detection ───────────────────────────────────────────────────────────

/** Find twin pairs — nodes with similar neighborhoods (Jaccard >= threshold). */
export function findTwinPairs(
	edgeList: number[][],
	nodeCount: number,
	threshold: number,
): [number, number, number][] {
	// Build adjacency signatures: in-edges and out-edges per node
	const outEdges: Set<number>[] = [];
	const inEdges: Set<number>[] = [];
	for (let i = 0; i < nodeCount; i += 1) {
		outEdges.push(new Set());
		inEdges.push(new Set());
	}
	for (const edge of edgeList) {
		const a = edge[0] as number;
		const b = edge[1] as number;
		outEdges[a]?.add(b);
		inEdges[b]?.add(a);
	}

	const results: [number, number, number][] = [];

	for (let i = 0; i < nodeCount; i += 1) {
		const sigI = new Set<number>();
		for (const o of outEdges[i] ?? []) {
			sigI.add(o + nodeCount); // offset out-edges
		}
		for (const o of inEdges[i] ?? []) {
			sigI.add(o);
		}
		if (sigI.size === 0) {
			continue;
		}

		for (let j = i + 1; j < nodeCount; j += 1) {
			const sigJ = new Set<number>();
			for (const o of outEdges[j] ?? []) {
				sigJ.add(o + nodeCount);
			}
			for (const o of inEdges[j] ?? []) {
				sigJ.add(o);
			}
			if (sigJ.size === 0) {
				continue;
			}

			let intersection = 0;
			for (const x of sigI) {
				if (sigJ.has(x)) {
					intersection += 1;
				}
			}
			if (intersection === 0) {
				continue;
			}

			const union = sigI.size + sigJ.size - intersection;
			const similarity = intersection / union;
			if (similarity >= threshold) {
				results.push([i, j, similarity]);
			}
		}
	}

	results.sort((a, b) => b[2] - a[2]);
	return results.slice(0, 20);
}

// ── Contraction ──────────────────────────────────────────────────────────────

/** Contract node B into node A: redirect B's edges to A, return self-loops to remove. */
export function contractNode(
	edgeList: number[][],
	keepNode: number,
	removeNode: number,
): void {
	for (const edge of edgeList) {
		if (edge[0] === removeNode) {
			edge[0] = keepNode;
		}
		if (edge[1] === removeNode) {
			edge[1] = keepNode;
		}
	}
	// Remove self-loops
	for (let i = edgeList.length - 1; i >= 0; i -= 1) {
		if (edgeList[i]?.[0] === edgeList[i]?.[1]) {
			edgeList.splice(i, 1);
		}
	}
}

// ── Simulated annealing ──────────────────────────────────────────────────────

/** Run simulated annealing to minimize inter-module edges. Returns accepted move count. */
export function anneal(
	fileMod: string[],
	edgeList: number[][],
	iterations: number,
	contracted: Set<number>,
): number {
	let currentInter = computePartitionCost(fileMod, edgeList).interModuleEdges;
	let accepted = 0;
	const n = fileMod.length;
	const tStart = 8;
	const tEnd = 0.1;

	for (let iter = 0; iter < iterations; iter += 1) {
		const temp = tStart * (tEnd / tStart) ** (iter / iterations);
		const fi = Math.floor(Math.random() * n);
		if (contracted.has(fi)) {
			continue;
		}

		const oldMod = fileMod[fi] as string;
		const candidateMods = new Set<string>();
		for (const edge of edgeList) {
			const a = edge[0] as number;
			const b = edge[1] as number;
			if (a === fi) {
				candidateMods.add(fileMod[b] as string);
			}
			if (b === fi) {
				candidateMods.add(fileMod[a] as string);
			}
		}
		candidateMods.add(fileMod[Math.floor(Math.random() * n)] as string);
		candidateMods.delete(oldMod);
		if (candidateMods.size === 0) {
			continue;
		}

		const candidates = Array.from(candidateMods);
		const tryMod = candidates[
			Math.floor(Math.random() * candidates.length)
		] as string;

		fileMod[fi] = tryMod;
		const newInter = computePartitionCost(fileMod, edgeList).interModuleEdges;
		const delta = newInter - currentInter;

		if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
			currentInter = newInter;
			accepted += 1;
		} else {
			fileMod[fi] = oldMod;
		}
	}

	return accepted;
}

// ── Removability ─────────────────────────────────────────────────────────────

export interface RemovabilityResult {
	/** Average removability across all nodes. 1.0 = fully decoupled, 0.0 = everything depends on everything. */
	average: number;
	/** Per-node: [nodeIndex, transitiveDependents, impact] sorted by impact descending. */
	perNode: [number, number, number][];
}

/**
 * For each node, compute how many other nodes transitively depend on it.
 * A node's impact = transitive dependents / (N - 1).
 * Removability = 1 - impact.
 * Codebase removability = average removability across all nodes.
 */
export function computeRemovability(
	edgeList: number[][],
	nodeCount: number,
): RemovabilityResult {
	// Build reverse adjacency (who depends on me)
	const dependedBy: number[][] = [];
	for (let i = 0; i < nodeCount; i += 1) {
		dependedBy.push([]);
	}
	for (const edge of edgeList) {
		const from = edge[0] as number;
		const to = edge[1] as number;
		// from imports to, so `to` is depended on by `from`
		dependedBy[to]?.push(from);
	}

	const perNode: [number, number, number][] = [];
	let totalImpact = 0;

	for (let node = 0; node < nodeCount; node += 1) {
		// BFS up the reverse edges: find all transitive dependents
		const visited = new Set<number>();
		const queue = [node];
		while (queue.length > 0) {
			const n = queue.pop() as number;
			if (visited.has(n)) {
				continue;
			}
			visited.add(n);
			for (const dep of dependedBy[n] ?? []) {
				if (!visited.has(dep)) {
					queue.push(dep);
				}
			}
		}
		const dependents = visited.size - 1; // exclude self
		const impact = nodeCount > 1 ? dependents / (nodeCount - 1) : 0;
		totalImpact += impact;
		perNode.push([node, dependents, impact]);
	}

	perNode.sort((a, b) => b[2] - a[2]);

	return {
		average: 1 - totalImpact / nodeCount,
		perNode: perNode,
	};
}

// ── Congruency ───────────────────────────────────────────────────────────────

/**
 * Compute spatial congruency — how well same-label nodes cluster together.
 *
 * Compares average distance between same-label pairs to average distance
 * between different-label pairs. Returns D_between / D_within.
 *
 * - > 1.0: same-label nodes are closer than average (good clustering)
 * - = 1.0: no clustering (random)
 * - < 1.0: same-label nodes are farther apart than different-label (anti-clustering)
 */
export function spatialCongruency(
	x: ArrayLike<number>,
	y: ArrayLike<number>,
	labels: string[],
	contracted: Set<number>,
): number {
	let withinSum = 0;
	let withinCount = 0;
	let betweenSum = 0;
	let betweenCount = 0;
	const n = labels.length;

	for (let i = 0; i < n; i += 1) {
		if (contracted.has(i)) {
			continue;
		}
		for (let j = i + 1; j < n; j += 1) {
			if (contracted.has(j)) {
				continue;
			}
			const dx = x[i] - x[j];
			const dy = y[i] - y[j];
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (labels[i] === labels[j]) {
				withinSum += dist;
				withinCount += 1;
			} else {
				betweenSum += dist;
				betweenCount += 1;
			}
		}
	}

	if (withinCount === 0 || betweenCount === 0) {
		return 1;
	}
	const withinAvg = withinSum / withinCount;
	const betweenAvg = betweenSum / betweenCount;
	if (withinAvg === 0) {
		return Number.POSITIVE_INFINITY;
	}
	return betweenAvg / withinAvg;
}

/**
 * Compute graph-distance congruency — same concept but using hop distance
 * instead of spatial distance. Works without a layout (for CLI reports).
 *
 * Uses BFS from each node, compares average hop distance for same-label
 * vs different-label pairs.
 */
export function graphCongruency(
	edgeList: number[][],
	nodeCount: number,
	labels: string[],
): number {
	// Build adjacency (undirected for hop distance)
	const adj: number[][] = [];
	for (let i = 0; i < nodeCount; i += 1) {
		adj.push([]);
	}
	for (const edge of edgeList) {
		const a = edge[0] as number;
		const b = edge[1] as number;
		adj[a]?.push(b);
		adj[b]?.push(a);
	}

	let withinSum = 0;
	let withinCount = 0;
	let betweenSum = 0;
	let betweenCount = 0;

	for (let source = 0; source < nodeCount; source += 1) {
		// BFS
		const dist = new Int32Array(nodeCount).fill(-1);
		dist[source] = 0;
		const queue = [source];
		let qi = 0;
		while (qi < queue.length) {
			const node = queue[qi] as number;
			qi += 1;
			for (const nb of adj[node] ?? []) {
				if (dist[nb] === -1) {
					dist[nb] = dist[node] + 1;
					queue.push(nb);
				}
			}
		}

		for (let j = source + 1; j < nodeCount; j += 1) {
			if (dist[j] === -1) {
				continue; // unreachable, skip
			}
			if (labels[source] === labels[j]) {
				withinSum += dist[j];
				withinCount += 1;
			} else {
				betweenSum += dist[j];
				betweenCount += 1;
			}
		}
	}

	if (withinCount === 0 || betweenCount === 0) {
		return 1;
	}
	const withinAvg = withinSum / withinCount;
	const betweenAvg = betweenSum / betweenCount;
	if (withinAvg === 0) {
		return Number.POSITIVE_INFINITY;
	}
	return betweenAvg / withinAvg;
}

// ── Graph invariants ─────────────────────────────────────────────────────────

export interface GraphInvariants {
	nodeCount: number;
	edgeCount: number;
	components: number;
	cycleRank: number;
	dagDepth: number;
	longestPath: number[];
	degeneracy: number;
	redundantEdges: number;
	essentialEdges: number;
	betweenness: [number, number][]; // [nodeIndex, score][] sorted desc
}

/** Build adjacency lists from edge list. */
interface AdjResult {
	out: number[][];
	inc: number[][];
}

function buildAdj(edgeList: number[][], nodeCount: number): AdjResult {
	const out: number[][] = [];
	const inc: number[][] = [];
	for (let i = 0; i < nodeCount; i += 1) {
		out.push([]);
		inc.push([]);
	}
	for (const edge of edgeList) {
		const a = edge[0] as number;
		const b = edge[1] as number;
		out[a]?.push(b);
		inc[b]?.push(a);
	}
	return { out: out, inc: inc };
}

/** Compute all graph invariants at once. */
export function computeInvariants(
	edgeList: number[][],
	nodeCount: number,
): GraphInvariants {
	const { out, inc } = buildAdj(edgeList, nodeCount);

	// ── Connected components (undirected) ──
	const visited = new Set<number>();
	let components = 0;
	for (let start = 0; start < nodeCount; start += 1) {
		if (visited.has(start)) {
			continue;
		}
		components += 1;
		const queue = [start];
		while (queue.length > 0) {
			const n = queue.pop() as number;
			if (visited.has(n)) {
				continue;
			}
			visited.add(n);
			for (const nb of out[n] ?? []) {
				if (!visited.has(nb)) {
					queue.push(nb);
				}
			}
			for (const nb of inc[n] ?? []) {
				if (!visited.has(nb)) {
					queue.push(nb);
				}
			}
		}
	}

	// ── DAG depth (longest path) ──
	const depthMemo = new Map<number, number[]>();
	function longest(node: number, visiting: Set<number>): number[] {
		if (depthMemo.has(node)) {
			return depthMemo.get(node) as number[];
		}
		if (visiting.has(node)) {
			return [];
		}
		visiting.add(node);
		let best: number[] = [];
		for (const dep of out[node] ?? []) {
			const sub = longest(dep, visiting);
			if (sub.length > best.length) {
				best = sub;
			}
		}
		visiting.delete(node);
		const result = [node].concat(best);
		depthMemo.set(node, result);
		return result;
	}
	let longestPath: number[] = [];
	for (let i = 0; i < nodeCount; i += 1) {
		const p = longest(i, new Set());
		if (p.length > longestPath.length) {
			longestPath = p;
		}
	}

	// ── Degeneracy ──
	const degree = new Float64Array(nodeCount);
	for (let i = 0; i < nodeCount; i += 1) {
		degree[i] = (out[i]?.length ?? 0) + (inc[i]?.length ?? 0);
	}
	const remaining = new Set<number>();
	for (let i = 0; i < nodeCount; i += 1) {
		remaining.add(i);
	}
	let maxK = 0;
	while (remaining.size > 0) {
		let minNode = -1;
		let minDeg = Number.POSITIVE_INFINITY;
		for (const f of remaining) {
			if (degree[f] < minDeg) {
				minDeg = degree[f];
				minNode = f;
			}
		}
		if (minDeg > maxK) {
			maxK = minDeg;
		}
		remaining.delete(minNode);
		for (const n of out[minNode] ?? []) {
			if (remaining.has(n)) {
				degree[n] -= 1;
			}
		}
		for (const n of inc[minNode] ?? []) {
			if (remaining.has(n)) {
				degree[n] -= 1;
			}
		}
	}

	// ── Transitive reduction (count redundant edges) ──
	let redundantEdges = 0;
	for (const edge of edgeList) {
		const from = edge[0] as number;
		const to = edge[1] as number;
		// BFS from `from`, excluding the direct edge to `to`
		const bfsVisited = new Set<number>();
		const queue: number[] = [];
		for (const nb of out[from] ?? []) {
			if (nb !== to) {
				queue.push(nb);
			}
		}
		let reachable = false;
		while (queue.length > 0) {
			const n = queue.pop() as number;
			if (n === to) {
				reachable = true;
				break;
			}
			if (bfsVisited.has(n)) {
				continue;
			}
			bfsVisited.add(n);
			for (const next of out[n] ?? []) {
				if (!bfsVisited.has(next)) {
					queue.push(next);
				}
			}
		}
		if (reachable) {
			redundantEdges += 1;
		}
	}

	// ── Betweenness centrality ──
	const centrality = new Float64Array(nodeCount);
	for (let source = 0; source < nodeCount; source += 1) {
		const dist = new Int32Array(nodeCount).fill(-1);
		const paths = new Float64Array(nodeCount);
		const pred: number[][] = [];
		for (let i = 0; i < nodeCount; i += 1) {
			pred.push([]);
		}
		const stack: number[] = [];

		dist[source] = 0;
		paths[source] = 1;
		const bfsQueue = [source];
		let qi = 0;
		while (qi < bfsQueue.length) {
			const node = bfsQueue[qi] as number;
			qi += 1;
			stack.push(node);
			const d = dist[node];
			for (const neighbor of out[node] ?? []) {
				if (dist[neighbor] === -1) {
					dist[neighbor] = d + 1;
					bfsQueue.push(neighbor);
				}
				if (dist[neighbor] === d + 1) {
					paths[neighbor] += paths[node];
					pred[neighbor]?.push(node);
				}
			}
		}

		const delta = new Float64Array(nodeCount);
		while (stack.length > 0) {
			const w = stack.pop() as number;
			for (const vNode of pred[w] ?? []) {
				delta[vNode] += (paths[vNode] / paths[w]) * (1 + delta[w]);
			}
			if (w !== source) {
				centrality[w] += delta[w];
			}
		}
	}

	const betweenness: [number, number][] = [];
	for (let i = 0; i < nodeCount; i += 1) {
		if (centrality[i] > 0) {
			betweenness.push([i, Math.round(centrality[i])]);
		}
	}
	betweenness.sort((a, b) => b[1] - a[1]);

	return {
		nodeCount: nodeCount,
		edgeCount: edgeList.length,
		components: components,
		cycleRank: edgeList.length - nodeCount + components,
		dagDepth: longestPath.length - 1,
		longestPath: longestPath,
		degeneracy: maxK,
		redundantEdges: redundantEdges,
		essentialEdges: edgeList.length - redundantEdges,
		betweenness: betweenness.slice(0, 20),
	};
}
