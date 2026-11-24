// @effect-diagnostics nodeBuiltinImport:off - Vite hooks run outside the Effect runtime.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { Plugin } from "vite-plus";

import { formatWebManifest } from "../src/branding.logic.ts";

export function forkWebAssetsPlugin(
  brand: string | undefined,
  webAssets: Readonly<Record<string, string>>,
): Plugin {
  const manifest = new URL("../public/manifest.webmanifest", import.meta.url);
  const assets = new Map(
    Object.values(webAssets).map((source) => [
      `/${NodePath.basename(source)}`,
      new URL(`../../../${source}`, import.meta.url),
    ]),
  );
  const readManifest = async () =>
    formatWebManifest(await NodeFSP.readFile(manifest, "utf8"), brand);

  return {
    name: "t3code:fork-web-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?", 1)[0] ?? "";
        const source = assets.get(pathname);
        if (pathname !== "/manifest.webmanifest" && !source) return next();
        const data = source ? NodeFSP.readFile(source) : readManifest();
        void data.then((body) => {
          res.setHeader(
            "Content-Type",
            source
              ? pathname.endsWith(".ico")
                ? "image/x-icon"
                : "image/png"
              : "application/manifest+json",
          );
          res.end(body);
        }, next);
      });
    },
    async writeBundle({ dir }) {
      if (!dir) return;
      await Promise.all([
        ...Array.from(assets, ([target, source]) =>
          NodeFSP.copyFile(source, NodePath.join(dir, target)),
        ),
        readManifest().then((content) =>
          NodeFSP.writeFile(NodePath.join(dir, "manifest.webmanifest"), content),
        ),
      ]);
    },
  };
}
