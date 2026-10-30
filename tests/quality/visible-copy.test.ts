// The whole app's visible copy against the brand (#133): no banned phrase (brand.bannedPhrases) and no American
// spelling, with Nazanin's findBrandProblems as the one checker. Each page's own tests check their key sentences; this
// one reads every source file, so a new page or message can't slip past.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { findBrandProblems } from "@/features/tailor/brand-check";

const root = join(__dirname, "..", "..");
const sourceDir = join(root, "src");

/** Files with no copy in them: the brand checker's own US-to-UK list, and PDF syntax ("/Type /Catalog") for tests. */
const NOT_COPY_FILES = new Set(["src/features/tailor/brand-check.ts", "src/features/profile/server/test-pdf.ts"]);

/** Lists of the very words the app forbids, so they name them on purpose. */
const RULE_LISTS = new Set(["bannedPhrases", "usSpellings"]);

/** Props that hold code, not words a person reads. */
const CODE_PROPS = new Set([
  "className",
  "href",
  "id",
  "key",
  "type",
  "name",
  "htmlFor",
  "role",
  "method",
  "action",
  "target",
  "rel",
  "src",
  "autoComplete",
  "inputMode",
  "variant",
  "size",
  "as",
  "tone",
  "dateTime",
  "form",
  "encType",
  "accept",
  "pattern",
  "lang",
  "dir",
  "value",
  "defaultValue",
]);

/** Calls whose strings are code or logs: class lists, errors for developers, events and patterns. */
const CODE_CALLS = new Set(["cn", "clsx", "twMerge", "cva", "require", "RegExp", "Error", "TypeError", "RangeError", "track"]);

/** One lower-case word or class name, such as "flex", "items-center" or "md:px-4": code, not a sentence. */
const CODE_TOKEN = /^[a-z0-9]+(?:[-:/_.][a-z0-9[\]#%()!&>=*+]+)*$/;

type Copy = { file: string; line: number; text: string };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "testing" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|eval|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")
      ? [path]
      : [];
  });
}

/** True when a string sits where only code goes: an import, a type, a code prop or call, or the banned list itself. */
function isCodePlace(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current) || ts.isTypeNode(current)) return true;
    if (ts.isJsxAttribute(current)) {
      const name = current.name.getText();
      return CODE_PROPS.has(name) || name.startsWith("data-") || /^aria-(describedby|labelledby|controls|live|current)$/.test(name);
    }
    if ((ts.isPropertyAssignment(current) || ts.isVariableDeclaration(current)) && RULE_LISTS.has(current.name.getText())) return true;
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const callee = current.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText();
      if (CODE_CALLS.has(name) || (ts.isPropertyAccessExpression(callee) && callee.expression.getText() === "console")) return true;
    }
  }
  return false;
}

/** Strings a person can read: JSX text, and string literals that aren't code (class lists, ids, paths, links). */
function visibleCopy(file: string): Copy[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Copy[] = [];
  const add = (node: ts.Node, value: string) => {
    const words = value.trim();
    if (words === "" || /^(https?:|mailto:|\/|\.\/|@\/)/.test(words)) return;
    if (words.split(/\s+/).every((token) => CODE_TOKEN.test(token))) return;
    // An object key such as "Content-Type" or "Authorization" is a name for code, not copy.
    if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) return;
    found.push({ file: relative(root, file).replace(/\\/g, "/"), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: words });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) add(node, node.text);
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isCodePlace(node)) add(node, node.text);
    else if (ts.isTemplateExpression(node) && !isCodePlace(node)) {
      add(node, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" … "));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const copy = sourceFiles(sourceDir)
  .filter((file) => !NOT_COPY_FILES.has(relative(root, file).replace(/\\/g, "/")))
  .flatMap(visibleCopy);

describe("the app's visible copy", () => {
  it("finds the copy it checks: JSX text, props and messages across the app", () => {
    const texts = copy.map((item) => item.text);
    // One sentence each from a page, a prop and a server message, so the scan can't quietly read nothing.
    expect(texts).toContain("Paste the job ad first.");
    expect(texts.some((text) => text.includes("Every application, made to fit"))).toBe(true);
    expect(copy.length).toBeGreaterThan(500);
  });

  it("has no banned brand phrase and no American spelling", () => {
    const problems = copy.flatMap(({ file, line, text }) =>
      findBrandProblems(text).map((problem) =>
        problem.kind === "banned-phrase"
          ? `${file}:${line} banned phrase "${problem.found}"`
          : `${file}:${line} "${problem.found}" should be "${problem.suggestion}"`,
      ),
    );

    expect(problems).toEqual([]);
  });
});
