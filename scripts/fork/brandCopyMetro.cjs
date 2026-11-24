const NodeCrypto = require("node:crypto");
const NodeFS = require("node:fs");
const NodePath = require("node:path");
const { loadRepoEnv } = require("../lib/public-config.ts");

function withBrandCopy(config) {
  return {
    ...config,
    transformerPath: __filename,
    transformer: { ...config.transformer, forkBrandUpstreamWorker: config.transformerPath },
  };
}

let brandCopy;

async function transform(config, root, filename, data, options) {
  const { forkBrandUpstreamWorker, ...upstreamConfig } = config;
  const upstream = require(forkBrandUpstreamWorker);
  if (options.type !== "asset") {
    brandCopy ??= require("./brandCopy.ts").createBrandCopy("j3", "mobile");
    const rewritten = brandCopy(data.toString("utf8"), NodePath.resolve(root, filename));
    if (rewritten !== null) data = Buffer.from(rewritten);
  }
  return upstream.transform(upstreamConfig, root, filename, data, options);
}

function getCacheKey(config, options) {
  const { forkBrandUpstreamWorker, ...upstreamConfig } = config;
  const upstream = require(forkBrandUpstreamWorker);
  const hash = NodeCrypto.createHash("sha256");
  for (const file of [
    forkBrandUpstreamWorker,
    require.resolve("./brandCopy.ts"),
    require.resolve("./brandCopyExtras.ts"),
    require.resolve("./brandCopyInventory.ts"),
    require.resolve("../../packages/shared/src/forkBrand.ts"),
  ]) {
    hash.update(NodeFS.readFileSync(file));
  }
  hash.update(upstream.getCacheKey?.(upstreamConfig, options) ?? "");
  return hash.digest("hex");
}

function wrap(config) {
  return loadRepoEnv().T3CODE_BRAND === "j3" ? config.then(withBrandCopy) : config;
}

module.exports = { wrap, transform, getCacheKey };
