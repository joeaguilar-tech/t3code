import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vite-plus/test";

const root = (path: string) => NodeURL.fileURLToPath(new URL(`../../${path}`, import.meta.url));
const require = NodeModule.createRequire(root("apps/desktop/package.json"));
const { hashMessage } = require("gt-i18n/internal");
const { gtFallback, msg } = require("gt-i18n");
const read = (path: string) => NodeFS.readFileSync(root(path), "utf8");
const catalogDir = (app: string) => `apps/${app}/src/i18n/translations`;
const english = (app: string) => JSON.parse(read(`${catalogDir(app)}/en.json`));
const product = /T3[ -]Code/;
const rewrite = (value: unknown): unknown => {
  if (typeof value === "string") return value.replace(/T3([ -])Code/g, "J3$1Code");
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
  }
  return value;
};

async function implementation() {
  const path = "./brandCopy.ts";
  expect(NodeFS.existsSync(new URL(path, import.meta.url)), "build-time copy transform").toBe(true);
  return import(/* @vite-ignore */ path);
}

describe.each(["web", "desktop", "mobile"])("%s brand copy", (app) => {
  it("classifies every product-name message and pins its English and hash", async () => {
    const { BRAND, KEEP } = await implementation();
    const en = english(app);
    const brand = BRAND[app];
    const keep = KEEP[app];
    expect(Object.keys(brand).filter((key) => key in keep)).toEqual([]);
    expect(Object.keys({ ...brand, ...keep }).sort()).toEqual(
      Object.keys(en)
        .filter((key) => product.test(JSON.stringify(en[key])))
        .sort(),
    );
    for (const [key, row] of Object.entries({ ...brand, ...keep })) {
      const [format, source] = row as ["ICU" | "JSX", string];
      expect(JSON.stringify(en[key]), key).toBe(source);
      expect(hashMessage(en[key], { $format: format }), key).toBe(key);
    }
  });

  it("rewrites and re-keys exactly the branded rows of every catalog", async () => {
    const { BRAND, createBrandCopy } = await implementation();
    const transform = createBrandCopy("j3", app);
    for (const path of NodeFS.globSync(`${catalogDir(app)}/*.json`, { cwd: root("") })) {
      if (path.endsWith("/en.json")) continue;
      const original = JSON.parse(read(path));
      const expected = { ...original };
      for (const [key, row] of Object.entries(BRAND[app])) {
        const [format, source] = row as ["ICU" | "JSX", string];
        if (!Object.hasOwn(original, key)) continue;
        const next = hashMessage(rewrite(JSON.parse(source)), { $format: format });
        expect(Object.hasOwn(original, next), key).toBe(false);
        expected[next] = rewrite(original[key]);
        delete expected[key];
      }
      expect(JSON.parse(transform(read(path), root(path)) ?? read(path)), path).toEqual(expected);
    }
  });

  it("finds all branded messages in source", async () => {
    const { BRAND, createBrandCopy } = await implementation();
    const found = new Set<string>();
    const transform = createBrandCopy("j3", app, (key: string) => found.add(key));
    const { src } = JSON.parse(read(`apps/${app}/gt.config.json`));
    for (const path of NodeFS.globSync(
      src.filter((pattern: string) => !pattern.startsWith("!")),
      {
        cwd: root(`apps/${app}`),
      },
    )) {
      if (path.includes(".test.")) continue;
      const absolute = root(`apps/${app}/${path}`);
      transform(NodeFS.readFileSync(absolute, "utf8"), absolute);
    }
    expect([...found].sort()).toEqual(Object.keys(BRAND[app]).sort());
  });

  it("registers no transform for upstream builds", async () => {
    const { createBrandCopy } = await implementation();
    expect(createBrandCopy(undefined, app)).toBeUndefined();
  });
});

it("resolves a branded ICU message via msg and a re-keyed German catalog", async () => {
  const { createBrandCopy } = await implementation();
  const transform = createBrandCopy("j3", "web");
  const id = root("apps/web/src/example.ts");
  const source = "{organization} manages T3 Code updates.";
  const next = JSON.parse(transform(JSON.stringify(source), id));
  expect(gtFallback(msg(next), { organization: "Example" })).toBe(
    "Example manages J3 Code updates.",
  );
  const path = `${catalogDir("web")}/de.json`;
  const de = JSON.parse(transform(read(path), root(path)));
  const translated = de[hashMessage(next, { $format: "ICU" })];
  expect(translated).toContain("J3 Code");
  expect(gtFallback(translated, { organization: "Example", $locale: "de" })).toContain("Example");
});

it("resolves the rewritten JSX children by their branded hash", async () => {
  const { createBrandCopy } = await implementation();
  const transform = createBrandCopy("j3", "web");
  const code = transform("<T>Welcome to T3 Code</T>", root("apps/web/src/example.tsx"));
  expect(code).toBe("<T>Welcome to J3 Code</T>");
  const path = `${catalogDir("web")}/de.json`;
  const de = JSON.parse(transform(read(path), root(path)));
  expect(de[hashMessage("Welcome to J3 Code", { $format: "JSX" })]).toContain("J3 Code");
});

it("rewrites the widget fallback and removes upstream icon dependencies for Metro", async () => {
  const { createBrandCopy } = await implementation();
  const transform = createBrandCopy("j3", "mobile");
  const widget = "apps/mobile/src/widgets/AgentActivityWidget.tsx";
  expect(transform(read(widget), root(widget))).toContain("Open J3 Code to load agent activity");
  const assets = "apps/mobile/src/components/brandAssets.ts";
  const code = transform(read(assets), root(assets));
  expect(code).toContain("assets/fork/j3/icon-1024.png");
  expect(code).not.toMatch(/assets\/(?:dev|nightly|prod)\//);
});
