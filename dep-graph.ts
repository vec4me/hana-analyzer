/**
 * Entry point: open interactive force-directed dependency graph.
 * Usage: npx tsx scripts/analyzer/dep-graph.ts [targets...]
 * Default targets: frontend, shared
 */
import { resolve } from "node:path";
import { openVisualization } from "./visualize.ts";

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : ["frontend", "shared"];

function main(): void {
	const root = resolve(import.meta.dirname, "../..");
	openVisualization(root, targets);
}

void main();
