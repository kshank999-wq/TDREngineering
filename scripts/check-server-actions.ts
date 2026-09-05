/**
 * Guards the one rule about `"use server"` files that nothing else catches:
 *
 *   A "use server" file can only export async functions.
 *
 *   npm run check:actions
 *
 * Next.js enforces this when the module is loaded at runtime, not at build
 * time. That means `next build` passes, `tsc` passes, ESLint passes, and the
 * page 500s the first time somebody submits the form — with a digest instead of
 * a message. This exact defect shipped to production once (a `const` holding a
 * form's initial state, exported from an actions file); the cost of catching it
 * here is a few milliseconds.
 *
 * Type-only exports are fine — they are erased before the file ever runs.
 */

import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

type Violation = { file: string; line: number; name: string; what: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
}

/** True when the file's first statement is the "use server" directive. */
function isServerActionFile(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const expression = first.expression;
  return ts.isStringLiteral(expression) && expression.text === "use server";
}

function check(path: string): Violation[] {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  if (!isServerActionFile(source)) return [];

  const file = relative(ROOT, path);
  const violations: Violation[] = [];
  const at = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    ts
      .getModifiers(node)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const statement of source.statements) {
    if (!exported(statement)) continue;

    // Types and interfaces are erased before the module runs.
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue;

    if (ts.isFunctionDeclaration(statement)) {
      const isAsync = ts
        .getModifiers(statement)
        ?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
      if (!isAsync) {
        violations.push({
          file,
          line: at(statement),
          name: statement.name?.text ?? "(anonymous)",
          what: "a non-async function",
        });
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = ts.isIdentifier(declaration.name) ? declaration.name.text : "(destructured)";
        const initializer = declaration.initializer;
        const isAsyncFn =
          initializer !== undefined &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          ts.getModifiers(initializer)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

        if (!isAsyncFn) {
          violations.push({
            file,
            line: at(declaration),
            name,
            what: initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
              ? "a non-async function"
              : "a value, not a function",
          });
        }
      }
      continue;
    }

    violations.push({
      file,
      line: at(statement),
      name: ts.SyntaxKind[statement.kind],
      what: "not an async function",
    });
  }

  return violations;
}

const files = walk(SRC);
const violations = files.flatMap(check);
const serverFiles = files.filter((f) => {
  const text = readFileSync(f, "utf8");
  return isServerActionFile(ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true));
});

if (violations.length === 0) {
  console.log(
    `check:actions — ${serverFiles.length} "use server" file(s), every export is an async function.`,
  );
  process.exit(0);
}

console.error('\nA "use server" file can only export async functions.\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  export "${v.name}" is ${v.what}`);
}
console.error(
  "\nThis 500s at runtime the first time the module loads — the build will not catch it.",
);
console.error("Move the value into a plain module, or inline it at the call site.\n");
process.exit(1);
