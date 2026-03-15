/**
 * Browser entry point — wires up canvas, HUD, and keyboard interaction.
 */
import {
	contracted,
	fileMod,
	opAnneal,
	opContractTwins,
	opExtract,
	opMerge,
	opRename,
	opSplit,
	selected,
	selectedModules,
	setShowTwins,
	showTwins,
	toggleSelect,
	computeCost,
} from "./state.ts";
import { findNode } from "./physics.ts";
import { draw, setHighlight } from "./renderer.ts";
import { updateHUD } from "./hud.ts";

/** Wrapper to access the browser prompt dialog (biome's noAlert rule forbids direct calls). */
function promptUser(message: string, defaultValue?: string): string | null {
	const fn = Reflect.get(globalThis, "prompt") as (
		msg: string,
		def?: string,
	) => string | null;
	return fn(message, defaultValue);
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const hudEl = document.getElementById("hud") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

let statusTimer = 0;

function setStatus(msg: string): void {
	statusEl.textContent = msg;
	clearTimeout(statusTimer);
	statusTimer = globalThis.setTimeout(() => {
		statusEl.textContent = "";
	}, 5000);
}

// ── Render loop ──
function frame(): void {
	draw(canvas, ctx);
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── Mouse ──
canvas.addEventListener("mousemove", (e) => {
	setHighlight(findNode(e.clientX, e.clientY));
});

canvas.addEventListener("click", (e) => {
	const ni = findNode(e.clientX, e.clientY);
	if (ni >= 0) {
		toggleSelect(ni, e.shiftKey);
	} else if (!e.shiftKey) {
		selected.clear();
	}
	updateHUD(hudEl);
});

// ── Keyboard ──
globalThis.addEventListener("keydown", (e: KeyboardEvent) => {
	if ((e.target as HTMLElement).tagName === "INPUT") {
		return;
	}

	switch (e.key.toLowerCase()) {
		case "s": {
			if (selected.size === 0) {
				setStatus("Select files first");
				break;
			}
			const name = promptUser("New module name:");
			if (!name) {
				break;
			}
			opSplit(name);
			setStatus(`Split ${selected.size} files → ${name}`);
			updateHUD(hudEl);
			break;
		}
		case "m": {
			const mods = selectedModules();
			if (mods.size < 2) {
				setStatus("Select files from 2+ modules to merge");
				break;
			}
			const target = promptUser("Merge into module name:", Array.from(mods)[0]);
			if (!target) {
				break;
			}
			opMerge(target);
			setStatus(`Merged ${mods.size} modules → ${target}`);
			updateHUD(hudEl);
			break;
		}
		case "e": {
			if (selected.size === 0) {
				setStatus("Select files first");
				break;
			}
			const eName = promptUser("Extract to module name:");
			if (!eName) {
				break;
			}
			opExtract(eName);
			setStatus(`Extracted ${selected.size} files → ${eName}`);
			updateHUD(hudEl);
			break;
		}
		case "r": {
			if (selected.size === 0) {
				setStatus("Select a file to rename its module");
				break;
			}
			const oldMod = fileMod[Array.from(selected)[0] as number] as string;
			const newName = promptUser(`Rename module "${oldMod}" to:`, oldMod);
			if (!newName || newName === oldMod) {
				break;
			}
			opRename(oldMod, newName);
			setStatus(`Renamed ${oldMod} → ${newName}`);
			updateHUD(hudEl);
			break;
		}
		case "o": {
			const before = computeCost();
			const accepted = opAnneal();
			const after = computeCost();
			updateHUD(hudEl);
			setStatus(
				`Annealing: 1000 iterations, ${accepted} accepted, coupling ${(before.coupling * 100).toFixed(1)}% → ${(after.coupling * 100).toFixed(1)}%`,
			);
			break;
		}
		case "t": {
			setShowTwins(!showTwins);
			setStatus(`Twins ${showTwins ? "shown" : "hidden"}`);
			break;
		}
		case "w": {
			const count = opContractTwins();
			updateHUD(hudEl);
			setStatus(
				`Contracted ${count} twin pairs, ${contracted.size} nodes removed`,
			);
			break;
		}
		case "escape": {
			selected.clear();
			updateHUD(hudEl);
			break;
		}
		default:
			break;
	}
});

// ── Init ──
updateHUD(hudEl);
setStatus("Click nodes to select, then use S/M/E/R/O keys. Press O to anneal.");
