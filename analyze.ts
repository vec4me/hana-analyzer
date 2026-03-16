/**
 * Entry point: run all text-based dependency analysis reports.
 * Usage: npx tsx <this-file>
 */
import { resolve } from "node:path";
import { buildGraph } from "./graph.ts";
import { runAllReports } from "./reports.ts";

const TARGETS = ["frontend", "shared", "backend"];

function main(): void {
	const root = resolve(import.meta.dirname, "..");
	const g = buildGraph(root, TARGETS);
	runAllReports(g);
}

void main();
