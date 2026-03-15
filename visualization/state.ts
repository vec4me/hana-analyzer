/**
 * Graph state — positions, partitions, selection, contraction.
 */
import {
	anneal,
	assignToModule,
	computeInvariants,
	computePartitionCost,
	computeRemovability,
	contractNode,
	mergeModules,
	renameModule,
	spatialCongruency,
} from "../algebra.ts";

declare const __GRAPH_DATA__: {
	deps: Record<string, string[]>;
	partition: Record<string, string>;
	twinPairs: [string, string, number][];
};

// ── Build graph from injected data ───────────────────────────────────────────

const { deps, partition, twinPairs } = __GRAPH_DATA__;

const allNames = new Set(Object.keys(deps));
for (const ds of Object.values(deps)) {
	for (const d of ds) {
		allNames.add(d);
	}
}
export const names = Array.from(allNames);
export const nameToId: Record<string, number> = {};
for (let i = 0; i < names.length; i += 1) {
	nameToId[names[i] as string] = i;
}
export const N = names.length;

export const edgeList: number[][] = [];
for (const [from, tos] of Object.entries(deps)) {
	for (const to of tos) {
		if (nameToId[from] !== undefined && nameToId[to] !== undefined) {
			edgeList.push([nameToId[from] as number, nameToId[to] as number]);
		}
	}
}

export { twinPairs };

// ── Labels ───────────────────────────────────────────────────────────────────

const EXT_RE = /\.(?:ts|tsx)$/u;
const INDEX_RE = /\/index$/u;

function short(n: string): string {
	const noExt = n.replace(EXT_RE, "").replace(INDEX_RE, "/");
	const parts = noExt.split("/");
	return parts.at(-1) as string;
}

export const labels = names.map(short);

// ── Partition state ──────────────────────────────────────────────────────────

export const fileMod: string[] = new Array(N);
for (let i = 0; i < N; i += 1) {
	fileMod[i] = partition[names[i] as string] ?? "unknown";
}

// ── Module colors ────────────────────────────────────────────────────────────

const PALETTE = [
	"rgb(88,166,255)",
	"rgb(63,185,80)",
	"rgb(210,153,34)",
	"rgb(163,113,247)",
	"rgb(121,192,255)",
	"rgb(56,139,253)",
	"rgb(219,109,40)",
	"rgb(218,76,115)",
	"rgb(110,198,156)",
	"rgb(187,128,179)",
	"rgb(255,166,87)",
	"rgb(100,200,200)",
	"rgb(200,150,100)",
	"rgb(150,200,100)",
	"rgb(200,100,150)",
];

export let modColorMap: Record<string, string> = {};
export const nodeColor: string[] = new Array(N);

export function rebuildModuleColors(): void {
	const mods = Array.from(new Set(fileMod)).sort();
	modColorMap = {};
	for (let i = 0; i < mods.length; i += 1) {
		modColorMap[mods[i] as string] = PALETTE[i % PALETTE.length] as string;
	}
	for (let i = 0; i < N; i += 1) {
		nodeColor[i] = modColorMap[fileMod[i] as string] ?? "rgb(139,148,158)";
	}
}

rebuildModuleColors();

// ── Physics state ────────────────────────────────────────────────────────────

export const x = new Float64Array(N);
export const y = new Float64Array(N);
const initRadius = Math.sqrt(N) * 40;
for (let i = 0; i < N; i += 1) {
	const angle = (i / N) * Math.PI * 2;
	x[i] = Math.cos(angle) * initRadius;
	y[i] = Math.sin(angle) * initRadius;
}

export const vx = new Float64Array(N);
export const vy = new Float64Array(N);

// ── Selection & contraction ──────────────────────────────────────────────────

export const selected = new Set<number>();
export const contracted = new Set<number>();
export let showTwins = true;

export function setShowTwins(v: boolean): void {
	showTwins = v;
}

// ── Cost ─────────────────────────────────────────────────────────────────────

export function computeCost() {
	return computePartitionCost(fileMod, edgeList);
}

export const initialCost = computeCost();

export function computeGraphInvariants() {
	return computeInvariants(edgeList, N);
}

export const initialInvariants = computeGraphInvariants();

export function computeCongruency() {
	return spatialCongruency(x, y, fileMod, contracted);
}

export function computeRemovabilityStats() {
	return computeRemovability(edgeList, N);
}

// ── Operations ───────────────────────────────────────────────────────────────

export function opSplit(name: string): void {
	assignToModule(fileMod, Array.from(selected), name);
	rebuildModuleColors();
	selected.clear();
}

export function opMerge(target: string): void {
	const mods = new Set<string>();
	for (const i of selected) {
		mods.add(fileMod[i] as string);
	}
	mergeModules(fileMod, mods, target);
	rebuildModuleColors();
	selected.clear();
}

export function opExtract(name: string): void {
	assignToModule(fileMod, Array.from(selected), name);
	rebuildModuleColors();
	selected.clear();
}

export function opRename(oldName: string, newName: string): void {
	renameModule(fileMod, oldName, newName);
	rebuildModuleColors();
	selected.clear();
}

export function opAnneal(): number {
	const accepted = anneal(fileMod, edgeList, 1000, contracted);
	rebuildModuleColors();
	return accepted;
}

export function opContractTwins(): number {
	let count = 0;
	for (const [fileA, fileB] of twinPairs) {
		const ai = nameToId[fileA];
		const bi = nameToId[fileB];
		if (ai === undefined || bi === undefined) {
			continue;
		}
		if (contracted.has(ai) || contracted.has(bi)) {
			continue;
		}
		fileMod[bi] = fileMod[ai] as string;
		contractNode(edgeList, ai, bi);
		contracted.add(bi);
		count += 1;
	}
	rebuildModuleColors();
	showTwins = false;
	return count;
}

export function toggleSelect(i: number, multi: boolean): void {
	if (!multi) {
		selected.clear();
	}
	if (selected.has(i)) {
		selected.delete(i);
	} else {
		selected.add(i);
	}
}

export function selectedModules(): Set<string> {
	const mods = new Set<string>();
	for (const i of selected) {
		mods.add(fileMod[i] as string);
	}
	return mods;
}
