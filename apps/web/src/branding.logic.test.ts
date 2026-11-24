import { describe, expect, it } from "vite-plus/test";

import { resolveWebBranding, formatWebManifest } from "./branding.logic";

describe("web branding", () => {
  it.each([
    ["", false, null, "T3 Code", "T3 Code (Beta)"],
    ["", true, null, "T3 Code", "T3 Code (Dev)"],
    ["", false, "latest", "T3 Code", "T3 Code"],
    ["", false, "nightly", "T3 Code", "T3 Code (Nightly)"],
    ["j3", false, null, "J3 Code", "J3 Code"],
    ["j3", true, null, "J3 Code", "J3 Code (Dev)"],
    ["j3", false, "nightly", "J3 Code", "J3 Code (Nightly)"],
  ] as const)(
    "resolves titles for %s, dev=%s, channel=%s",
    (brand, development, hostedAppChannel, baseName, displayName) => {
      expect(resolveWebBranding({ brand, development, hostedAppChannel })).toMatchObject({
        baseName,
        displayName,
      });
    },
  );

  it("changes only the display names in the web manifest", () => {
    const manifest = '{ "id": "/", "name": "T3 Code", "short_name": "T3 Code" }';
    expect(formatWebManifest(manifest, "")).toBe(manifest);
    expect(JSON.parse(formatWebManifest(manifest, "j3"))).toEqual({
      id: "/",
      name: "J3 Code",
      short_name: "J3 Code",
    });
  });
});
