import { describe, expect, it } from "vite-plus/test";

import {
  cliArchiveFileName,
  cliArchiveTarCommand,
  cliReleaseDownloadBaseUrl,
  newestCliReleaseVersion,
  parseChecksums,
} from "./cliRelease.ts";

describe("cliRelease", () => {
  it("parses sha256sum output including binary-mode markers", () => {
    const checksums = parseChecksums(
      [
        `${"a".repeat(64)}  t3-1.2.3-linux-x64.tar.gz`,
        `${"B".repeat(64)} *t3-1.2.3-win32-x64.zip`,
        "not a checksum line",
        "",
      ].join("\n"),
    );
    expect(checksums.get("t3-1.2.3-linux-x64.tar.gz")).toBe("a".repeat(64));
    expect(checksums.get("t3-1.2.3-win32-x64.zip")).toBe("b".repeat(64));
    expect(checksums.size).toBe(2);
  });

  it("extracts with the System32 bsdtar on Windows and plain tar elsewhere", () => {
    expect(cliArchiveTarCommand("linux", {})).toBe("tar");
    expect(cliArchiveTarCommand("win32", { SystemRoot: "D:\\Win" })).toBe(
      "D:\\Win\\System32\\tar.exe",
    );
    expect(cliArchiveTarCommand("win32", {})).toBe("C:\\Windows\\System32\\tar.exe");
  });

  it("picks the newest non-draft release on the requested channel", () => {
    const releases = [
      { tag_name: "v1.2.4-preview.20260912.9", draft: true },
      { tag_name: "v1.2.4-preview.20260912.8" },
      { tag_name: "v1.2.4-nightly.20260912.7" },
      { tag_name: "desktop-preview" },
      { tag_name: "v1.2.3" },
      { tag_name: "v1.2.3-nightly.20260911.2" },
    ];
    expect(newestCliReleaseVersion(releases, "preview")).toBe("1.2.4-preview.20260912.8");
    expect(newestCliReleaseVersion(releases, "nightly")).toBe("1.2.4-nightly.20260912.7");
    expect(newestCliReleaseVersion(releases, "stable")).toBe("1.2.3");
    expect(newestCliReleaseVersion([{ tag_name: "v1.2.3" }], "preview")).toBeUndefined();
  });

  // Fork builds use patch Z*1000+100+n, so they fetch the upstream Z runtime.
  it.each([
    ["0.1.5100", "0.1.5"],
    ["0.1.5103", "0.1.5"],
    ["0.2.100", "0.2.0"],
    ["0.1.5", "0.1.5"],
    ["0.0.45", "0.0.45"],
    ["0.1.6-nightly.20261029.3892", "0.1.6-nightly.20261029.3892"],
  ])("downloads the upstream runtime for app version %s", (appVersion, upstream) => {
    expect(cliReleaseDownloadBaseUrl(appVersion)).toBe(
      `https://github.com/pingdotgg/t3code/releases/download/v${upstream}`,
    );
    expect(cliArchiveFileName(appVersion, "darwin-arm64")).toBe(
      `t3-${upstream}-darwin-arm64.tar.gz`,
    );
  });
});
