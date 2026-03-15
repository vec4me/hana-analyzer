/**
 * Force-directed layout simulation and camera.
 */
import { N, contracted, edgeList, vx, vy, x, y } from "./state.ts";

const IDEAL_LEN = 300;
const REPULSION = 50_000;
const SPRING = 0.015;

export function simStep(): void {
	for (let i = 0; i < N; i += 1) {
		if (contracted.has(i)) {
			continue;
		}
		for (let j = i + 1; j < N; j += 1) {
			if (contracted.has(j)) {
				continue;
			}
			const dx = x[i] - x[j];
			const dy = y[i] - y[j];
			const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
			const force = REPULSION / (dist * dist);
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			vx[i] += fx;
			vy[i] += fy;
			vx[j] -= fx;
			vy[j] -= fy;
		}
	}
	for (const [a, b] of edgeList) {
		if (contracted.has(a as number) || contracted.has(b as number)) {
			continue;
		}
		const dx = x[b as number] - x[a as number];
		const dy = y[b as number] - y[a as number];
		const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
		const displacement = dist - IDEAL_LEN;
		const force = displacement * SPRING;
		const fx = (dx / dist) * force;
		const fy = (dy / dist) * force;
		vx[a as number] += fx;
		vy[a as number] += fy;
		vx[b as number] -= fx;
		vy[b as number] -= fy;
	}
	for (let i = 0; i < N; i += 1) {
		if (contracted.has(i)) {
			continue;
		}
		vx[i] *= 0.45;
		vy[i] *= 0.45;
		x[i] += vx[i];
		y[i] += vy[i];
	}
}

// ── Camera ───────────────────────────────────────────────────────────────────

export let camX = 0;
export let camY = 0;
export let camZ = 1;

export function fitView(): void {
	let minX = x[0] as number;
	let maxX = x[0] as number;
	let minY = y[0] as number;
	let maxY = y[0] as number;
	for (let i = 1; i < N; i += 1) {
		if (x[i] < minX) {
			minX = x[i];
		}
		if (x[i] > maxX) {
			maxX = x[i];
		}
		if (y[i] < minY) {
			minY = y[i];
		}
		if (y[i] > maxY) {
			maxY = y[i];
		}
	}
	const pad = 40;
	const w = maxX - minX + pad * 2;
	const h = maxY - minY + pad * 2;
	camZ = Math.min(innerWidth / w, innerHeight / h);
	camX = (minX + maxX) / 2 - innerWidth / 2 / camZ;
	camY = (minY + maxY) / 2 - innerHeight / 2 / camZ;
}

export function screenX(v: number): number {
	return (v - camX) * camZ;
}

export function screenY(v: number): number {
	return (v - camY) * camZ;
}

export function findNode(mx: number, my: number): number {
	const worldMx = mx / camZ + camX;
	const worldMy = my / camZ + camY;
	let best = -1;
	let bestD = 25 / camZ;
	for (let i = 0; i < N; i += 1) {
		if (contracted.has(i)) {
			continue;
		}
		const d = Math.hypot(x[i] - worldMx, y[i] - worldMy);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}
