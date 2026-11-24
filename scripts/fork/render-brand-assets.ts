import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { resolveForkBrand } from "@t3tools/shared/forkBrand";
import sharp from "sharp";

class RenderForkIconError extends Schema.TaggedError<
  RenderForkIconError,
  { readonly brand: unique symbol }
>()("RenderForkIconError", { path: Schema.String, cause: Schema.Defect() }) {}

const renderAsset = <A>(path: string, render: () => Promise<A>) =>
  Effect.tryPromise({
    try: render,
    catch: (cause) => new RenderForkIconError({ path, cause }),
  });

const brand = resolveForkBrand("j3");
if (!brand) throw new Error("Missing fork assets");

const { source, macIconPng, windowsIconIco, mobile, web } = brand.assets;

function render(size: number) {
  return sharp(source, { density: 576 }).resize(size, size).png();
}

async function renderIco(sizes: readonly number[]) {
  const frames = await Promise.all(sizes.map((size) => render(size).toBuffer()));
  const directory = Buffer.alloc(6 + frames.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  for (const [index, frame] of frames.entries()) {
    const entry = 6 + index * 16;
    directory[entry] = directory[entry + 1] = (sizes[index] ?? 256) % 256;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frame.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  }
  return Buffer.concat([directory, ...frames]);
}

await Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const svg = yield* fs.readFileString(source);
  const mark = svg.replace(/^[ \t]*<rect[^>]*\/>\n/mu, "");
  // The 70-unit round strokes span x=147–828 and y=283–741. Pad x to fit the 3:2 widget frame.
  const widgetMark = mark.replace('viewBox="0 0 1024 1024"', 'viewBox="144 283 687 458"');
  const renderAndroidLayer = (art: string) =>
    sharp(Buffer.from(art))
      .resize(336, 336)
      .extend({ top: 48, bottom: 48, left: 48, right: 48, background: "#00000000" })
      .png();
  yield* Effect.all(
    [
      fs.writeFileString(mobile.widgetMarkSvg, widgetMark),
      renderAsset(macIconPng, () => render(1024).toFile(macIconPng)),
      renderAsset(mobile.androidForegroundPng, () =>
        renderAndroidLayer(mark).toFile(mobile.androidForegroundPng),
      ),
      renderAsset(mobile.androidMonochromePng, () =>
        renderAndroidLayer(mark.replace(/stroke="[^"]*"/u, 'stroke="#ffffff"')).toFile(
          mobile.androidMonochromePng,
        ),
      ),
      renderAsset(mobile.androidSplashPng, () =>
        sharp(Buffer.from(svg))
          .resize(192, 192)
          .extend({ top: 48, bottom: 48, left: 48, right: 48, background: mobile.backgroundColor })
          .png()
          .toFile(mobile.androidSplashPng),
      ),
      renderAsset(web.favicon16Png, () => render(16).toFile(web.favicon16Png)),
      renderAsset(web.favicon32Png, () => render(32).toFile(web.favicon32Png)),
      renderAsset(web.appleTouchIconPng, () => render(180).toFile(web.appleTouchIconPng)),
      renderAsset(web.icon192Png, () => render(192).toFile(web.icon192Png)),
      renderAsset(web.icon512Png, () => render(512).toFile(web.icon512Png)),
      renderAsset(web.faviconIco, () => renderIco([16, 24, 32, 48, 64, 128, 256])).pipe(
        Effect.flatMap((data) => fs.writeFile(web.faviconIco, data)),
      ),
      renderAsset(windowsIconIco, () => renderIco([16, 24, 32, 48, 64, 128, 256])).pipe(
        Effect.flatMap((data) => fs.writeFile(windowsIconIco, data)),
      ),
    ],
    { concurrency: "unbounded" },
  );
}).pipe(Effect.provide(NodeServices.layer), Effect.runPromise);
