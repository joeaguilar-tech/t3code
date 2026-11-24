const root = "assets/fork/j3";
const icon1024 = `${root}/icon-1024.png`;

const j3Brand = {
  name: "J3 Code",
  statement:
    "J3 Code is an unofficial fork based on the T3 Code source code. It is not affiliated with, endorsed by, or maintained by T3 Tools, Inc.",
  assets: {
    source: `${root}/icon.svg`,
    macIconPng: icon1024,
    linuxIconPng: icon1024,
    windowsIconIco: `${root}/windows.ico`,
    mobile: {
      iconPng: icon1024,
      backgroundColor: "#0F5C5C",
      androidForegroundPng: `${root}/android-foreground.png`,
      androidMonochromePng: `${root}/android-monochrome.png`,
      androidSplashPng: `${root}/android-splash.png`,
    },
    web: {
      faviconIco: `${root}/favicon.ico`,
      favicon16Png: `${root}/favicon-16x16.png`,
      favicon32Png: `${root}/favicon-32x32.png`,
      appleTouchIconPng: `${root}/apple-touch-icon.png`,
      icon192Png: `${root}/icon-192x192.png`,
      icon512Png: `${root}/icon-512x512.png`,
    },
  },
} as const;

export function resolveForkBrand(selection: string | null | undefined) {
  return selection === "j3" ? j3Brand : null;
}

export function formatForkDisplayName(name: string, stage: string): string {
  return stage === "Beta" || stage === "Latest" ? name : `${name} (${stage})`;
}
