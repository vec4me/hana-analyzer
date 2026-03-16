/**
 * AST-based import and export extraction using the TypeScript compiler API.
 */
import ts from "typescript";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImportBinding {
	name: string;
	alias: string | null;
	isTypeOnly: boolean;
}

export interface ImportInfo {
	moduleSpecifier: string;
	bindings: ImportBinding[];
	isTypeOnly: boolean;
	isDynamic: boolean;
	isNamespace: boolean;
	isReexport: boolean;
}

export type ExportKind =
	| "function"
	| "variable"
	| "type"
	| "interface"
	| "class"
	| "enum"
	| "unknown";

export interface ExportInfo {
	name: string;
	kind: ExportKind;
	isDefault: boolean;
	isTypeOnly: boolean;
}

export interface FileAnalysis {
	imports: ImportInfo[];
	exports: ExportInfo[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	if (!ts.canHaveModifiers(node)) {
		return false;
	}
	const mods = ts.getModifiers(node);
	if (!mods) {
		return false;
	}
	return mods.some((m) => m.kind === kind);
}

function isExported(node: ts.Node): boolean {
	return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function isDefaultExport(node: ts.Node): boolean {
	return hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

// ── Main ─────────────────────────────────────────────────────────────────────

/** Parse a single file and extract all imports and exports. */
export function analyzeFile(source: string, fileName: string): FileAnalysis {
	const scriptKind = fileName.endsWith(".tsx")
		? ts.ScriptKind.TSX
		: ts.ScriptKind.TS;
	const sf = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind,
	);
	const imports: ImportInfo[] = [];
	const exports: ExportInfo[] = [];

	function visit(node: ts.Node): void {
		// ── Static imports ──────────────────────────────────────────
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			const clause = node.importClause;
			const info: ImportInfo = {
				moduleSpecifier: node.moduleSpecifier.text,
				bindings: [],
				isTypeOnly: clause ? clause.isTypeOnly : false,
				isDynamic: false,
				isNamespace: false,
				isReexport: false,
			};

			if (clause) {
				// Default import: import foo from './bar'
				if (clause.name) {
					info.bindings.push({
						name: "default",
						alias: clause.name.text,
						isTypeOnly: false,
					});
				}

				if (clause.namedBindings) {
					if (ts.isNamedImports(clause.namedBindings)) {
						// Named imports: import { foo, bar as baz } from './bar'
						for (const el of clause.namedBindings.elements) {
							info.bindings.push({
								name: el.propertyName ? el.propertyName.text : el.name.text,
								alias: el.propertyName ? el.name.text : null,
								isTypeOnly: el.isTypeOnly,
							});
						}
					} else if (ts.isNamespaceImport(clause.namedBindings)) {
						// Namespace import: import * as foo from './bar'
						info.isNamespace = true;
						info.bindings.push({
							name: "*",
							alias: clause.namedBindings.name.text,
							isTypeOnly: false,
						});
					}
				}
			}
			// else: side-effect import (import './foo'), no bindings

			imports.push(info);
		}

		// ── Export declarations ──────────────────────────────────────
		if (ts.isExportDeclaration(node)) {
			if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
				// Re-export: export { foo } from './bar', export * from './bar'
				const info: ImportInfo = {
					moduleSpecifier: node.moduleSpecifier.text,
					bindings: [],
					isTypeOnly: node.isTypeOnly,
					isDynamic: false,
					isNamespace: false,
					isReexport: true,
				};

				if (node.exportClause && ts.isNamedExports(node.exportClause)) {
					for (const el of node.exportClause.elements) {
						info.bindings.push({
							name: el.propertyName ? el.propertyName.text : el.name.text,
							alias: el.propertyName ? el.name.text : null,
							isTypeOnly: el.isTypeOnly,
						});
						exports.push({
							name: el.name.text,
							kind: "unknown",
							isDefault: false,
							isTypeOnly: node.isTypeOnly || el.isTypeOnly,
						});
					}
				} else if (!node.exportClause) {
					// export * from './bar'
					info.isNamespace = true;
					info.bindings.push({
						name: "*",
						alias: null,
						isTypeOnly: false,
					});
				}

				imports.push(info);
			} else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
				// Local named exports: export { foo, bar }
				for (const el of node.exportClause.elements) {
					exports.push({
						name: el.name.text,
						kind: "unknown",
						isDefault: false,
						isTypeOnly: node.isTypeOnly || el.isTypeOnly,
					});
				}
			}
		}

		// ── Export assignment: export default X ──────────────────────
		if (ts.isExportAssignment(node)) {
			exports.push({
				name: "default",
				kind: "unknown",
				isDefault: true,
				isTypeOnly: false,
			});
		}

		// ── Exported function declarations ──────────────────────────
		if (ts.isFunctionDeclaration(node) && isExported(node)) {
			exports.push({
				name: node.name ? node.name.text : "default",
				kind: "function",
				isDefault: isDefaultExport(node),
				isTypeOnly: false,
			});
		}

		// ── Exported class declarations ─────────────────────────────
		if (ts.isClassDeclaration(node) && isExported(node)) {
			exports.push({
				name: node.name ? node.name.text : "default",
				kind: "class",
				isDefault: isDefaultExport(node),
				isTypeOnly: false,
			});
		}

		// ── Exported variable statements ────────────────────────────
		if (ts.isVariableStatement(node) && isExported(node)) {
			for (const decl of node.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) {
					exports.push({
						name: decl.name.text,
						kind: "variable",
						isDefault: false,
						isTypeOnly: false,
					});
				}
			}
		}

		// ── Exported interface declarations ─────────────────────────
		if (ts.isInterfaceDeclaration(node) && isExported(node)) {
			exports.push({
				name: node.name.text,
				kind: "interface",
				isDefault: false,
				isTypeOnly: true,
			});
		}

		// ── Exported type alias declarations ────────────────────────
		if (ts.isTypeAliasDeclaration(node) && isExported(node)) {
			exports.push({
				name: node.name.text,
				kind: "type",
				isDefault: false,
				isTypeOnly: true,
			});
		}

		// ── Exported enum declarations ──────────────────────────────
		if (ts.isEnumDeclaration(node) && isExported(node)) {
			exports.push({
				name: node.name.text,
				kind: "enum",
				isDefault: false,
				isTypeOnly: false,
			});
		}

		// ── Dynamic imports: import('./bar') ────────────────────────
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword
		) {
			const arg = node.arguments[0];
			if (arg && ts.isStringLiteral(arg)) {
				imports.push({
					moduleSpecifier: arg.text,
					bindings: [],
					isTypeOnly: false,
					isDynamic: true,
					isNamespace: false,
					isReexport: false,
				});
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sf);

	return { imports: imports, exports: exports };
}
