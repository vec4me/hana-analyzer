/**
 * HUD — sidebar with graph invariants, module list, keyboard shortcuts.
 */
import {
	N,
	contracted,
	fileMod,
	initialCost,
	labels,
	modColorMap,
	selected,
	computeCongruency,
	computeCost,
	computeGraphInvariants,
	computeRemovabilityStats,
} from "./state.ts";

export function updateHUD(hudEl: HTMLElement): void {
	const cost = computeCost();
	const inv = computeGraphInvariants();

	let html = "";

	// Selection
	if (selected.size > 0) {
		const selMods = new Set<string>();
		for (const i of selected) {
			selMods.add(fileMod[i] as string);
		}
		html += `<div class="selection-info">${selected.size} selected</div>`;
	}

	// ── Graph invariants ──
	html +=
		'<div class="section"><h3>Graph Invariants</h3><div class="cost-grid">';
	html += `<span class="cost-label">nodes</span><span class="cost-value">${inv.nodeCount - contracted.size}</span>`;
	html += `<span class="cost-label">edges</span><span class="cost-value">${inv.edgeCount}</span>`;
	html += `<span class="cost-label">components</span><span class="cost-value">${inv.components}</span>`;
	html += `<span class="cost-label">cycle rank</span><span class="cost-value">${inv.cycleRank}</span>`;
	html += `<span class="cost-label">DAG depth</span><span class="cost-value">${inv.dagDepth}</span>`;
	html += `<span class="cost-label">degeneracy</span><span class="cost-value">${inv.degeneracy}</span>`;
	html += `<span class="cost-label">essential edges</span><span class="cost-value">${inv.essentialEdges}</span>`;
	html += `<span class="cost-label">redundant edges</span><span class="cost-value">${inv.redundantEdges}</span>`;
	const cong = computeCongruency();
	const congColor =
		cong >= 1.5 ? "#3fb950" : cong >= 1.0 ? "#d2a8ff" : "#f85149";
	html += `<span class="cost-label">congruency</span><span class="cost-value" style="color:${congColor}">${cong.toFixed(2)}x</span>`;
	html += "</div></div>";

	// ── Removability ──
	const rem = computeRemovabilityStats();
	const remColor =
		rem.average >= 0.8 ? "#3fb950" : rem.average >= 0.6 ? "#d2a8ff" : "#f85149";
	html += '<div class="section"><h3>Removability</h3>';
	html += `<div style="margin-bottom:6px">average: <span style="color:${remColor};font-weight:600">${(rem.average * 100).toFixed(0)}%</span></div>`;
	html +=
		'<div style="font-size:11px;color:#8b949e;margin-bottom:4px">Hardest to remove (most dependents):</div>';
	for (const [nodeIdx, dependents, impact] of rem.perNode.slice(0, 8)) {
		const name = labels[nodeIdx] ?? String(nodeIdx);
		const barW = Math.min(100, Math.round(impact * 100));
		html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">`;
		html += `<span style="width:24px;text-align:right;color:#8b949e;font-size:11px">${dependents}</span>`;
		html += `<div style="flex:1;height:6px;background:rgb(30,35,42);border-radius:3px">`;
		html += `<div style="width:${barW}%;height:100%;background:rgb(248,81,73);border-radius:3px"></div>`;
		html += "</div>";
		html += `<span style="font-size:11px;color:#c9d1d9;min-width:60px">${name}</span>`;
		html += "</div>";
	}
	html += "</div>";

	// ── Longest path ──
	if (inv.longestPath.length > 0) {
		html += '<div class="section"><h3>Longest Path</h3>';
		html += '<div style="font-size:11px;color:#8b949e;line-height:1.5">';
		html += inv.longestPath.map((i) => labels[i] ?? String(i)).join(" → ");
		html += "</div></div>";
	}

	// ── Betweenness (top bottlenecks) ──
	if (inv.betweenness.length > 0) {
		html += '<div class="section"><h3>Bottlenecks (betweenness)</h3>';
		for (const [nodeIdx, score] of inv.betweenness.slice(0, 8)) {
			const name = labels[nodeIdx] ?? String(nodeIdx);
			const barW = Math.min(
				100,
				Math.round((score / (inv.betweenness[0]?.[1] ?? 1)) * 100),
			);
			html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">`;
			html += `<span style="width:30px;text-align:right;color:#8b949e;font-size:11px">${score}</span>`;
			html += `<div style="flex:1;height:6px;background:rgb(30,35,42);border-radius:3px">`;
			html += `<div style="width:${barW}%;height:100%;background:rgb(163,113,247);border-radius:3px"></div>`;
			html += "</div>";
			html += `<span style="font-size:11px;color:#c9d1d9;min-width:60px">${name}</span>`;
			html += "</div>";
		}
		html += "</div>";
	}

	// ── Partition cost (with deltas) ──
	const delta = {
		interModuleEdges: cost.interModuleEdges - initialCost.interModuleEdges,
		coupling: cost.coupling - initialCost.coupling,
		moduleCount: cost.moduleCount - initialCost.moduleCount,
	};

	function fmt(v: number, invert: boolean): string {
		if (v === 0) {
			return "";
		}
		const cls = (invert ? v < 0 : v > 0) ? "cost-worsened" : "cost-improved";
		const display =
			typeof v === "number" && v % 1 !== 0
				? `${(v * 100).toFixed(1)}%`
				: String(v);
		return ` <span class="${cls}">(${v > 0 ? "+" : ""}${display})</span>`;
	}

	html += '<div class="section"><h3>Partition Cost</h3><div class="cost-grid">';
	html += `<span class="cost-label">modules</span><span class="cost-value">${cost.moduleCount}${fmt(delta.moduleCount, true)}</span>`;
	html += `<span class="cost-label">inter-module</span><span class="cost-value">${cost.interModuleEdges}${fmt(delta.interModuleEdges, true)}</span>`;
	html += `<span class="cost-label">intra-module</span><span class="cost-value">${cost.intraModuleEdges}</span>`;
	html += `<span class="cost-label">coupling</span><span class="cost-value">${(cost.coupling * 100).toFixed(1)}%${fmt(delta.coupling, true)}</span>`;
	html += `<span class="cost-label">max in-degree</span><span class="cost-value">${cost.maxInDegree}</span>`;
	html += `<span class="cost-label">max out-degree</span><span class="cost-value">${cost.maxOutDegree}</span>`;
	html += "</div></div>";

	// ── Modules ──
	const modFiles: Record<string, number[]> = {};
	for (let i = 0; i < N; i += 1) {
		if (contracted.has(i)) {
			continue;
		}
		const mod = fileMod[i] as string;
		if (!modFiles[mod]) {
			modFiles[mod] = [];
		}
		modFiles[mod].push(i);
	}
	const modList = Object.entries(modFiles).sort(
		(a, b) => b[1].length - a[1].length,
	);

	html += `<div class="section"><h3>Modules (${modList.length})</h3>`;
	for (const [mod, files] of modList) {
		const c = modColorMap[mod] ?? "#888";
		html += `<div class="module-item" data-mod="${mod}">`;
		html += `<span class="module-dot" style="background:${c}"></span>`;
		html += `<span class="module-name">${mod}</span>`;
		html += `<span class="module-count">${files.length}</span>`;
		html += "</div>";
	}
	html += "</div>";

	// ── Shortcuts ──
	html += '<div class="section"><h3>Keys</h3><div class="shortcuts">';
	html += "<kbd>Click</kbd> select · <kbd>Shift+Click</kbd> multi-select<br>";
	html += "<kbd>S</kbd> split · <kbd>M</kbd> merge · <kbd>E</kbd> extract<br>";
	html +=
		"<kbd>R</kbd> rename · <kbd>O</kbd> anneal · <kbd>T</kbd> toggle twins<br>";
	html += "<kbd>W</kbd> contract twins · <kbd>Esc</kbd> clear";
	html += "</div></div>";

	hudEl.innerHTML = html;

	// Module click → select all files in module
	for (const el of hudEl.querySelectorAll(".module-item")) {
		el.addEventListener("click", () => {
			const mod = (el as HTMLElement).dataset.mod;
			selected.clear();
			for (let i = 0; i < N; i += 1) {
				if (fileMod[i] === mod) {
					selected.add(i);
				}
			}
			updateHUD(hudEl);
		});
	}
}
