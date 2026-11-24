import * as NodeModule from "node:module";
import { afterEach, expect, it, onTestFinished, vi } from "vite-plus/test";

vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { extra: { appVariant: process.env.APP_VARIANT, brand: process.env.T3CODE_BRAND } };
    },
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

it.each([
  ["development", undefined, "T3 Code", "dev/blueprint-ios-1024.png"],
  ["preview", undefined, "T3 Code", "nightly/nightly-ios-1024.png"],
  ["production", undefined, "T3 Code", "prod/black-ios-1024.png"],
  ["development", "j3", "J3 Code", "fork/j3/icon-1024.png"],
  ["preview", "j3", "J3 Code", "fork/j3/icon-1024.png"],
  ["production", "j3", "J3 Code", "fork/j3/icon-1024.png"],
])("selects the title and mark for %s with brand %j", async (variant, brand, title, mark) => {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("T3CODE_BRAND", brand);
  const require = NodeModule.createRequire(import.meta.url);
  const previous = require.extensions[".png"];
  const loaded: string[] = [];
  require.extensions[".png"] = (module, filename) => {
    loaded.push(filename);
    module.exports = `../../../../assets/${filename.split("/assets/").at(-1)}`;
  };
  onTestFinished(() => {
    if (previous) require.extensions[".png"] = previous;
    else delete require.extensions[".png"];
    for (const filename of loaded) delete require.cache[filename];
  });
  const assets = await import("./brandAssets");
  expect(Reflect.get(assets, "MOBILE_PRODUCT_NAME")).toBe(title);
  expect(assets.T3_CODE_BRAND_MARK_SOURCE).toBe(`../../../../assets/${mark}`);
});
