/**
 * Build and open the interactive dependency graph visualization.
 * Uses esbuild to bundle visualization/*.ts into a self-contained HTML file.
 */
import { exec } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSync } from "esbuild";
import { findTwinPairs } from "./algebra.ts";
import { buildGraph, getModule } from "./graph.ts";

/** Open the interactive graph visualization in the browser. */
export function openVisualization(root: string, targets: string[]): void {
	const g = buildGraph(root, targets);

	// Convert to simple formats for the browser
	const deps: Record<string, string[]> = {};
	const partition: Record<string, string> = {};
	for (const file of g.files) {
		deps[file] = g.imports.get(file) ?? [];
		partition[file] = getModule(file);
	}

	// Build indexed edge list for twin detection
	const fileIndex = new Map<string, number>();
	for (let i = 0; i < g.files.length; i += 1) {
		fileIndex.set(g.files[i] as string, i);
	}
	const edgeList: number[][] = [];
	for (const e of g.edges) {
		const a = fileIndex.get(e.from);
		const b = fileIndex.get(e.to);
		if (a !== undefined && b !== undefined) {
			edgeList.push([a, b]);
		}
	}
	const twinPairs = findTwinPairs(edgeList, g.files.length, 0.3).map(
		([a, b, sim]) => [g.files[a] as string, g.files[b] as string, sim],
	);

	console.log(`${g.files.length} files, ${g.edges.length} edges`);

	// Bundle browser code
	const bundle =
		buildSync({
			entryPoints: [join(import.meta.dirname, "visualization/app.ts")],
			bundle: true,
			write: false,
			format: "iife",
			platform: "browser",
			target: "es2020",
			minify: false,
		}).outputFiles[0]?.text ?? "";

	const data = JSON.stringify({
		deps: deps,
		partition: partition,
		twinPairs: twinPairs,
	});
	const html = HTML_SHELL.replace("__TITLE__", targets.join(", "))
		.replace("__DATA__", data)
		.replace("__BUNDLE__", bundle);

	const tmpFile = join(tmpdir(), "dep-graph.html");
	writeFileSync(tmpFile, html);
	console.log(`Opening ${tmpFile}`);
	exec(`xdg-open '${tmpFile}'`);
}

const HTML_SHELL = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>deps: __TITLE__</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: rgb(13,17,23); overflow: hidden; font-family: system-ui, sans-serif; color: #c9d1d9; }
canvas { display: block; position: absolute; top: 0; left: 0; }
#hud {
  position: absolute; top: 12px; right: 12px; width: 280px;
  background: rgba(22,27,34,0.95); border: 1px solid rgb(48,54,61);
  border-radius: 8px; padding: 12px; font-size: 12px;
  max-height: calc(100vh - 24px); overflow-y: auto; z-index: 10;
}
#hud h3 { font-size: 13px; color: #58a6ff; margin-bottom: 6px; }
#hud .section { margin-bottom: 12px; }
#hud .cost-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
#hud .cost-label { color: #8b949e; }
#hud .cost-value { color: #c9d1d9; text-align: right; }
#hud .cost-improved { color: #3fb950; }
#hud .cost-worsened { color: #f85149; }
#hud .module-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 3px 6px; border-radius: 4px; cursor: pointer; margin: 1px 0;
}
#hud .module-item:hover { background: rgba(88,166,255,0.1); }
#hud .module-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; flex-shrink: 0; }
#hud .module-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#hud .module-count { color: #8b949e; margin-left: 4px; }
#hud .shortcuts { color: #8b949e; line-height: 1.6; }
#hud .shortcuts kbd {
  background: rgb(48,54,61); padding: 1px 5px; border-radius: 3px;
  font-family: monospace; font-size: 11px; color: #c9d1d9;
}
#hud .selection-info { color: #d2a8ff; margin-bottom: 8px; }
#status {
  position: absolute; bottom: 12px; left: 12px;
  background: rgba(22,27,34,0.9); border: 1px solid rgb(48,54,61);
  border-radius: 6px; padding: 8px 12px; font-size: 12px; z-index: 10;
  max-width: 500px;
}
</style>
</head><body>
<canvas id="c"></canvas>
<div id="hud"></div>
<div id="status"></div>
<script>var __GRAPH_DATA__ = __DATA__;</script>
<script>__BUNDLE__</script>
</body></html>`;
