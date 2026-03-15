/**
 * Canvas renderer — draws edges, nodes, labels, twin lines.
 */
import {
	N,
	contracted,
	edgeList,
	fileMod,
	labels,
	nameToId,
	nodeColor,
	selected,
	showTwins,
	twinPairs,
	x,
	y,
} from "./state.ts";
import { camZ, fitView, screenX, screenY, simStep } from "./physics.ts";

const STEPS_PER_FRAME = 100;

let hlNode = -1;
let hlConn: Set<number> | null = null;
let hlEdges: Set<number> | null = null;

export function setHighlight(ni: number): void {
	if (ni === hlNode) {
		return;
	}
	hlNode = ni;
	if (ni >= 0) {
		const [c, ce] = computeConn(ni);
		hlConn = c;
		hlEdges = ce;
	} else {
		hlConn = null;
		hlEdges = null;
	}
}

function computeConn(ni: number): [Set<number>, Set<number>] {
	const conn = new Set([ni]);
	const ce = new Set<number>();
	function walk(n: number, dir: "down" | "up"): void {
		for (let i = 0; i < edgeList.length; i += 1) {
			const a = edgeList[i]?.[0] as number;
			const b = edgeList[i]?.[1] as number;
			const src = dir === "down" ? a : b;
			const dst = dir === "down" ? b : a;
			if (src === n && !conn.has(dst)) {
				conn.add(dst);
				ce.add(i);
				walk(dst, dir);
			}
		}
	}
	walk(ni, "down");
	walk(ni, "up");
	return [conn, ce];
}

function drawArrow(
	ctx: CanvasRenderingContext2D,
	ax: number,
	ay: number,
	bx: number,
	by: number,
	headLen: number,
): void {
	const dx = bx - ax;
	const dy = by - ay;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) {
		return;
	}
	const angle = Math.atan2(dy, dx);
	ctx.beginPath();
	ctx.moveTo(ax, ay);
	ctx.lineTo(bx, by);
	ctx.stroke();
	if (headLen > 0) {
		const mx = ax + dx * 0.55;
		const my = ay + dy * 0.55;
		ctx.beginPath();
		ctx.moveTo(mx + headLen * Math.cos(angle), my + headLen * Math.sin(angle));
		ctx.lineTo(
			mx - headLen * Math.cos(angle - 0.5),
			my - headLen * Math.sin(angle - 0.5),
		);
		ctx.lineTo(
			mx - headLen * Math.cos(angle + 0.5),
			my - headLen * Math.sin(angle + 0.5),
		);
		ctx.closePath();
		ctx.fillStyle = ctx.strokeStyle;
		ctx.fill();
	}
}

export function draw(
	canvas: HTMLCanvasElement,
	ctx: CanvasRenderingContext2D,
): void {
	for (let s = 0; s < STEPS_PER_FRAME; s += 1) {
		simStep();
	}
	fitView();
	canvas.width = innerWidth;
	canvas.height = innerHeight;

	const fs = Math.max(9, Math.min(14, 13 * camZ));
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";

	const dotR = Math.max(3, 4 * camZ);
	const active = hlNode >= 0;

	// ── Edges: base ──
	ctx.lineWidth = Math.max(1, 1.5 * camZ);
	for (let i = 0; i < edgeList.length; i += 1) {
		if (active && hlEdges?.has(i)) {
			continue;
		}
		const ai = edgeList[i]?.[0] as number;
		const bi = edgeList[i]?.[1] as number;
		if (contracted.has(ai) || contracted.has(bi)) {
			continue;
		}
		const dim = active && hlEdges && !hlEdges.has(i);
		const interMod = fileMod[ai] !== fileMod[bi];
		if (dim) {
			ctx.strokeStyle = "rgb(25,30,38)";
		} else if (interMod) {
			ctx.strokeStyle = "rgb(100,60,60)";
		} else {
			ctx.strokeStyle = "rgb(60,80,60)";
		}
		drawArrow(
			ctx,
			screenX(x[ai]),
			screenY(y[ai]),
			screenX(x[bi]),
			screenY(y[bi]),
			dim ? 0 : Math.max(4, 6 * camZ),
		);
	}

	// ── Edges: highlight ──
	if (active && hlEdges) {
		ctx.lineWidth = Math.max(1.5, 2.2 * camZ);
		for (const i of hlEdges) {
			const ai = edgeList[i]?.[0] as number;
			const bi = edgeList[i]?.[1] as number;
			ctx.strokeStyle = nodeColor[ai] as string;
			drawArrow(
				ctx,
				screenX(x[ai]),
				screenY(y[ai]),
				screenX(x[bi]),
				screenY(y[bi]),
				Math.max(6, 9 * camZ),
			);
		}
	}

	// ── Twin lines ──
	if (!active && showTwins) {
		ctx.lineWidth = Math.max(1.5, 2.5 * camZ);
		for (const [fileA, fileB, similarity] of twinPairs) {
			const ai = nameToId[fileA];
			const bi = nameToId[fileB];
			if (ai === undefined || bi === undefined) {
				continue;
			}
			if (contracted.has(ai) || contracted.has(bi)) {
				continue;
			}
			const alpha = Math.min(1, 0.2 + similarity * 0.8);
			ctx.strokeStyle = `rgba(255,50,50,${alpha})`;
			ctx.setLineDash([6, 4]);
			ctx.beginPath();
			ctx.moveTo(screenX(x[ai]), screenY(y[ai]));
			ctx.lineTo(screenX(x[bi]), screenY(y[bi]));
			ctx.stroke();
			ctx.setLineDash([]);
			const mx = (screenX(x[ai]) + screenX(x[bi])) / 2;
			const my = (screenY(y[ai]) + screenY(y[bi])) / 2;
			ctx.fillStyle = "rgba(255,80,80,0.85)";
			ctx.fillText(`${Math.round(similarity * 100)}%`, mx + 4, my - 4);
		}
	}

	// ── Nodes ──
	ctx.font = `${fs}px system-ui, sans-serif`;
	for (let i = 0; i < N; i += 1) {
		if (contracted.has(i)) {
			continue;
		}
		const dim = active && hlConn && !hlConn.has(i);
		const isHl = i === hlNode;
		const isSel = selected.has(i);
		const nx = screenX(x[i]);
		const ny = screenY(y[i]);

		if (isSel) {
			ctx.strokeStyle = "rgb(255,215,0)";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(nx, ny, dotR * 2, 0, 6.283);
			ctx.stroke();
		}

		ctx.fillStyle = dim ? "rgb(18,21,26)" : (nodeColor[i] as string);
		ctx.beginPath();
		ctx.arc(nx, ny, isHl ? dotR * 1.6 : dotR, 0, 6.283);
		ctx.fill();

		// Label (always visible)
		const bright = isHl || isSel || (active && hlConn?.has(i));
		if (dim) {
			ctx.fillStyle = "rgba(255,255,255,0.1)";
		} else if (isHl) {
			ctx.fillStyle = "rgb(255,255,255)";
		} else if (isSel) {
			ctx.fillStyle = "rgb(255,215,0)";
		} else if (bright) {
			ctx.fillStyle = "rgba(255,255,255,0.75)";
		} else {
			ctx.fillStyle = "rgba(255,255,255,0.45)";
		}
		ctx.fillText(labels[i] as string, nx + dotR + 5, ny);
		if (isSel || isHl) {
			ctx.fillStyle = "rgba(255,255,255,0.4)";
			ctx.fillText(`[${fileMod[i]}]`, nx + dotR + 5, ny + fs + 2);
		}
	}
}
