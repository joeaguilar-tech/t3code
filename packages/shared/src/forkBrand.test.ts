import { describe, expect, it } from "vite-plus/test";

import { resolveForkBrand } from "./forkBrand.ts";
import { upstreamReleaseVersion } from "./forkVersion.ts";

describe("fork brand", () => {
  it("uses the upstream defaults for unset, empty, and unknown selections", () => {
    for (const selection of [undefined, "", "unknown"]) {
      expect(resolveForkBrand(selection)).toBeNull();
    }
  });

  it("selects the fork display name, notice, and assets", () => {
    const brand = resolveForkBrand("j3");
    expect(brand?.name).toBe("J3 Code");
    expect(brand?.statement).toBe(
      "J3 Code is an unofficial fork based on the T3 Code source code. It is not affiliated with, endorsed by, or maintained by T3 Tools, Inc.",
    );
    expect(brand?.assets.source).toBe("assets/fork/j3/icon.svg");
  });

  it.each([
    ["0.0.33", "0.0.33"],
    ["0.0.33100", "0.0.33"],
    ["1.2.3101", "1.2.3"],
    ["0.0.33-nightly.20261123.1", "0.0.33-nightly.20261123.1"],
  ])("preserves the upstream update mapping for %s", (version, upstream) => {
    expect(upstreamReleaseVersion(version)).toBe(upstream);
  });
});
