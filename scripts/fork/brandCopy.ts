// @effect-diagnostics nodeBuiltinImport:off - Build transforms run outside the Effect runtime.
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { parseSync } from "vite-plus";

import { resolveForkBrand } from "@t3tools/shared/forkBrand";
import { BRAND } from "./brandCopyInventory.ts";
import { EXTRA_COPY } from "./brandCopyExtras.ts";

export { BRAND, KEEP } from "./brandCopyInventory.ts";

type Surface = keyof typeof BRAND;
type Format = "ICU" | "JSX";
type Edit = { start: number; end: number; text: string };
const root = NodeURL.fileURLToPath(new URL("../..", import.meta.url));
const sharedRequire = NodeModule.createRequire(
  new URL("../../packages/shared/package.json", import.meta.url),
);
const product = /T3[ -]Code/g;
const normalize = (value: string) =>
  value
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function mapStrings(value: unknown, map: (value: string) => string): unknown {
  if (typeof value === "string") return map(value);
  if (Array.isArray(value)) return value.map((child) => mapStrings(child, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mapStrings(child, map)]),
    );
  }
  return value;
}

interface AstNode {
  type: string;
  start: number;
  end: number;
  value?: unknown;
  openingElement?: { name: { name?: string } };
}

function walk(
  value: unknown,
  inTranslation: boolean,
  visit: (node: AstNode, inTranslation: boolean) => void,
) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, inTranslation, visit);
  } else if (value && typeof value === "object") {
    const node = value as AstNode;
    const translated =
      inTranslation || (node.type === "JSXElement" && node.openingElement?.name.name === "T");
    if (node.type) visit(node, translated);
    for (const child of Object.values(value)) walk(child, translated, visit);
  }
}

function createCopyEdits(
  selection: string | undefined,
  surface: Surface,
  onSourceMatch?: (key: string) => void,
) {
  const brand = resolveForkBrand(selection);
  if (!brand) return undefined;

  const { hashMessage } = sharedRequire("gt-i18n/internal") as {
    hashMessage: (source: unknown, options: { $format: Format }) => string;
  };
  const rename = (text: string) =>
    text.replace(product, (match) =>
      match.includes("-") ? brand.name.replaceAll(" ", "-") : brand.name,
    );
  const icu = new Map<string, string>();
  const jsx = new Map<string, string>();
  const rekeys = new Map<string, string>();

  for (const [key, [format, encoded]] of Object.entries(BRAND[surface])) {
    const source: unknown = JSON.parse(encoded);
    rekeys.set(key, hashMessage(mapStrings(source, rename), { $format: format }));
    mapStrings(source, (text) => {
      if (text !== rename(text))
        (format === "ICU" ? icu : jsx).set(format === "ICU" ? text : normalize(text), key);
      return text;
    });
  }

  const appRoot = `apps/${surface}/`;
  return (code: string, id: string): Edit[] => {
    const path = NodePath.relative(root, id.split("?", 1)[0]!).replaceAll("\\", "/");
    if (
      path.startsWith(`${appRoot}src/i18n/translations/`) &&
      path.endsWith(".json") &&
      !path.endsWith("/en.json")
    ) {
      const catalog: Record<string, unknown> = JSON.parse(code);
      for (const [oldKey, newKey] of rekeys) {
        if (!Object.hasOwn(catalog, oldKey)) continue;
        if (Object.hasOwn(catalog, newKey))
          throw new Error(`Brand copy collision in ${path}: ${newKey}`);
        catalog[newKey] = mapStrings(catalog[oldKey], rename);
        delete catalog[oldKey];
      }
      return [{ start: 0, end: code.length, text: JSON.stringify(catalog) }];
    }
    if (path === "apps/mobile/src/components/brandAssets.ts" && surface === "mobile") {
      const assetPath = NodePath.posix.relative(
        NodePath.posix.dirname(path),
        brand.assets.mobile.iconPng,
      );
      return Array.from(
        code.matchAll(
          /(?<=require\(")(?:\.\.\/)+assets\/(?:dev\/blueprint|nightly\/nightly|prod\/black)-ios-1024\.png(?="\))/g,
        ),
        (match) => ({ start: match.index, end: match.index + match[0].length, text: assetPath }),
      );
    }
    const extras = EXTRA_COPY[path];
    if (
      ![appRoot, "packages/shared/src/", "packages/client-runtime/src/"].some((prefix) =>
        path.startsWith(prefix),
      ) ||
      !/\.[cm]?[jt]sx?$/.test(path) ||
      (!extras && !/T3\s+Code|T3-Code/.test(code))
    )
      return [];

    const edits: Edit[] = [];
    const extraMatches = new Map<string, AstNode[]>();
    for (const entry of extras ?? []) {
      extraMatches.set(typeof entry === "string" ? entry : entry.text, []);
    }
    const renameNode = (node: AstNode) => {
      const raw = code.slice(node.start, node.end);
      for (const match of raw.matchAll(/T3(?:-|\s+)Code/g)) {
        const start = node.start + match.index;
        const text = rename(match[0].replace(/\s+/g, " "));
        edits.push({ start, end: start + match[0].length, text });
      }
    };
    walk(parseSync(path, code).program, false, (node, translated) => {
      const value =
        node.type === "TemplateElement"
          ? (node.value as { cooked?: string }).cooked
          : node.type === "Literal" || node.type === "JSXText"
            ? node.value
            : undefined;
      if (typeof value !== "string") return;
      const key =
        (node.type === "JSXText" ? undefined : icu.get(value)) ??
        (translated ? jsx.get(normalize(value)) : undefined);
      const matches = extras && extraMatches.get(normalize(value));
      if (matches) {
        if (key || translated)
          throw new Error(`Extra brand copy overlaps a translation in ${path}: ${value}`);
        matches.push(node);
      }
      if (key) {
        renameNode(node);
        onSourceMatch?.(key);
      }
    });
    for (const entry of extras ?? []) {
      const { text, matchCount, occurrences, precededBy } =
        typeof entry === "string"
          ? { text: entry, matchCount: 1, occurrences: [0], precededBy: undefined }
          : entry;
      const matches = extraMatches.get(text)!.sort((a, b) => a.start - b.start);
      if (matches.length !== matchCount) {
        throw new Error(
          `Expected ${matchCount} occurrences of "${text}" in ${path}, found ${matches.length}`,
        );
      }
      for (const index of occurrences) {
        const node = matches[index];
        if (
          !node ||
          (precededBy && code.slice(node.start - precededBy.length, node.start) !== precededBy)
        ) {
          throw new Error(`Extra brand copy anchor changed in ${path}: "${text}"`);
        }
        renameNode(node);
      }
    }
    return edits;
  };
}

export function createBrandCopy(
  selection: string | undefined,
  surface: Surface,
  onSourceMatch?: (key: string) => void,
) {
  const collect = createCopyEdits(selection, surface, onSourceMatch);
  if (!collect) return undefined;
  return (code: string, id: string): string | null => {
    const edits = collect(code, id);
    if (edits.length === 0) return null;
    for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) {
      code = code.slice(0, start) + text + code.slice(end);
    }
    return code;
  };
}

export function brandCopyPlugin(selection: string | undefined, surface: Surface) {
  const collect = createCopyEdits(selection, surface);
  if (!collect) return undefined;
  const require = NodeModule.createRequire(import.meta.url);
  const viteRequire = NodeModule.createRequire(require.resolve("vite-plus"));
  const { MagicString } = viteRequire("magic-string") as {
    MagicString: new (code: string) => {
      overwrite(start: number, end: number, text: string): void;
      toString(): string;
      generateMap(options: { source: string; hires: boolean; includeContent: boolean }): {
        version: number;
        sources: string[];
        sourcesContent: string[];
        names: string[];
        mappings: string;
      };
    };
  };
  return {
    name: "t3code:fork-brand-copy",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const edits = collect(code, id);
      if (edits.length === 0) return null;
      const output = new MagicString(code);
      for (const { start, end, text } of edits) output.overwrite(start, end, text);
      return {
        code: output.toString(),
        map: output.generateMap({ source: id, hires: false, includeContent: true }),
      };
    },
  };
}
