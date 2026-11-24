import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";

import {
  createBuildConfig,
  createStagePackageJson,
  resolveDesktopBuildIconAssets,
} from "./build-desktop-artifact.ts";

const upstreamAssetPath = /assets\/(?:prod\/|dev\/|nightly\/|android-|widget\/T3Mark\.svg)/u;

it.layer(NodeServices.layer)("desktop artifact identity", (it) => {
  it.effect.each(["", "j3"])(
    "brands desktop packaging for %s while preserving update identity",
    (brand) =>
      Effect.gen(function* () {
        const config = yield* createBuildConfig(
          "mac",
          "zip",
          "0.0.33100",
          false,
          false,
          undefined,
          undefined,
        );
        if (brand) {
          const serialized = JSON.stringify(config);
          assert.notMatch(serialized, /T3 Code/u);
          assert.notMatch(serialized, upstreamAssetPath);
        }
        const manifest = JSON.parse(
          JSON.stringify(
            createStagePackageJson({
              version: "0.0.33100",
              buildVersion: "0.0.33100",
              t3codeCommitHash: "abc123",
              private: true,
              packageManager: "pnpm",
              description: "Desktop app",
              license: "MIT",
              homepage: "https://t3.codes",
              author: "T3 Tools",
              main: "apps/desktop/dist-electron/boot.cjs",
              build: config,
              dependencies: {},
              devDependencies: { electron: "1.0.0" },
            }),
          ),
        );
        assert.equal(manifest.name, "t3code");
        assert.notProperty(manifest, "productName");
        assert.equal(manifest.build.productName, config.productName);

        const mac = config.mac as {
          extendInfo: Record<string, string>;
          protocols: ReadonlyArray<{ name: string; schemes: string[]; role?: string }>;
        };
        const name = brand ? "J3 Code" : "T3 Code";
        assert.equal(config.productName, brand ? name : "T3 Code (Beta)");
        assert.equal(config.appId, "tech.joeaguilar.t3code");
        assert.equal(config.artifactName, "T3-Code-${version}-${arch}.${ext}");
        assert.deepStrictEqual(config.publish, [
          {
            provider: "github",
            owner: "joeaguilar-tech",
            repo: "t3code",
            releaseType: "release",
          },
        ]);
        assert.deepStrictEqual(mac.protocols, [
          { name, schemes: ["t3code", "t3code-dev"] },
          { name: "Web site URL", schemes: ["http", "https"], role: "Viewer" },
        ]);
        for (const [key, description] of Object.entries(mac.extendInfo)) {
          if (key.endsWith("UsageDescription")) assert.include(description, name);
        }
        assert.deepStrictEqual(
          resolveDesktopBuildIconAssets("0.0.33100", brand),
          brand
            ? {
                macIconPng: "assets/fork/j3/icon-1024.png",
                linuxIconPng: "assets/fork/j3/icon-1024.png",
                windowsIconIco: "assets/fork/j3/windows.ico",
              }
            : {
                macIconPng: "assets/prod/black-macos-1024.png",
                linuxIconPng: "assets/prod/black-universal-1024.png",
                windowsIconIco: "assets/prod/t3-black-windows.ico",
              },
        );
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                T3CODE_BRAND: brand,
                T3CODE_DESKTOP_UPDATE_REPOSITORY: "joeaguilar-tech/t3code",
              },
            }),
          ),
        ),
      ),
  );
});
