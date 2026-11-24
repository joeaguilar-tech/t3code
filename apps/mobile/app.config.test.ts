import type { ExpoConfig } from "expo/config";
import { DEFAULT_HOSTED_APP_URL } from "@t3tools/shared/connectAuth";
import { afterEach, expect, it, vi } from "vite-plus/test";

import appleAppSiteAssociation from "../web/public/.well-known/apple-app-site-association.json";
import assetLinks from "../web/public/.well-known/assetlinks.json";

// Keep config parsing independent of local env files and build credentials.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => process.env,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string | undefined, brand?: string) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("T3CODE_BRAND", brand);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be development, preview, or production.",
  );
});

it.each([
  [undefined, "com.t3tools.t3code"],
  ["development", "com.t3tools.t3code.dev"],
  ["preview", "com.t3tools.t3code.preview"],
  ["production", "com.t3tools.t3code"],
])("keeps the iOS and Android identifiers for APP_VARIANT=%j", async (value, identifier) => {
  const config = await loadConfig(value);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  // Copied thread links open this app only while app.t3.codes lists it.
  const host = new URL(DEFAULT_HOSTED_APP_URL).host;
  expect(config.ios?.associatedDomains).toContain(`applinks:${host}`);
  expect(appleAppSiteAssociation.applinks.details[0]?.appIDs).toContain(
    `${config.ios?.appleTeamId}.${identifier}`,
  );
  expect(config.android?.intentFilters?.[0]?.data).toEqual([
    { scheme: "https", host, pathPrefix: "/threads/" },
  ]);
  expect(assetLinks.map((link) => link.target.package_name)).toContain(identifier);
});

function pluginOptions(config: Awaited<ReturnType<typeof loadConfig>>, name: string) {
  return config.plugins?.find(
    (plugin): plugin is Extract<NonNullable<ExpoConfig["plugins"]>[number], unknown[]> =>
      Array.isArray(plugin) && plugin[0] === name,
  )?.[1];
}

function art(config: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    icon: config.icon,
    ios: config.ios?.icon,
    android: config.android?.icon,
    adaptive: config.android?.adaptiveIcon,
    splash: pluginOptions(config, "expo-splash-screen"),
    notifications: pluginOptions(config, "expo-notifications"),
  };
}

function identity(config: Awaited<ReturnType<typeof loadConfig>>) {
  const widgets = pluginOptions(config, "expo-widgets");
  return {
    name: config.name,
    slug: config.slug,
    scheme: config.scheme,
    version: config.version,
    runtimeVersion: config.runtimeVersion,
    bundleIdentifier: config.ios?.bundleIdentifier,
    appleTeam: config.ios?.appleTeamId,
    associatedDomains: config.ios?.associatedDomains,
    keychainGroups: config.ios?.entitlements?.["keychain-access-groups"],
    sharing: pluginOptions(config, "expo-sharing"),
    widgets: {
      ...widgets,
      widgets: widgets?.widgets.map(
        ({ description: _description, ...widget }: { description: string }) => widget,
      ),
    },
    eas: config.extra?.eas,
    owner: config.owner,
    updates: config.updates,
    androidPackage: config.android?.package,
  };
}

function usage(config: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    network: config.ios?.infoPlist?.NSLocalNetworkUsageDescription,
    library: config.ios?.infoPlist?.NSPhotoLibraryAddUsageDescription,
    audio: pluginOptions(config, "expo-audio")?.microphonePermission,
    camera: pluginOptions(config, "expo-camera")?.cameraPermission,
    picker: pluginOptions(config, "expo-image-picker")?.microphonePermission,
  };
}

it.each([
  {
    variant: "development",
    name: "T3 Code Dev",
    icon: "../../assets/dev/blueprint-ios-1024.png",
    composer: "../../assets/dev/app-icon.icon",
    background: "./assets/android-icon-background-dev.png",
    color: "#347FF8",
    splash: "./assets/android-splash-icon-dev.png",
    tint: "#00639B",
  },
  {
    variant: "preview",
    name: "T3 Code Preview",
    icon: "../../assets/nightly/nightly-ios-1024.png",
    composer: "../../assets/nightly/app-icon.icon",
    background: "./assets/android-icon-background-nightly.png",
    color: "#111533",
    splash: "./assets/android-splash-icon-nightly.png",
    tint: "#7565C7",
  },
  {
    variant: "production",
    name: "T3 Code",
    icon: "../../assets/prod/black-ios-1024.png",
    composer: "../../assets/prod/app-icon.icon",
    background: undefined,
    color: "#000000",
    splash: "./assets/android-splash-icon-prod.png",
    tint: "#FFFFFF",
  },
])("keeps upstream art and usage strings for $variant", async (expected) => {
  const config = await loadConfig(expected.variant);
  expect(config.name).toBe(expected.name);
  expect(config.extra?.brand).toBeUndefined();
  expect(art(config)).toEqual({
    icon: expected.icon,
    ios: expected.composer,
    android: expected.icon,
    adaptive: {
      backgroundColor: expected.color,
      backgroundImage: expected.background,
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-mark.png",
    },
    splash: {
      image: expected.icon,
      resizeMode: "contain",
      backgroundColor: "#ffffff",
      imageWidth: 220,
      dark: { image: expected.icon, backgroundColor: "#0a0a0a" },
      android: { image: expected.splash, imageWidth: 288, dark: { image: expected.splash } },
    },
    notifications: {
      icon: "./assets/android-notification-icon.png",
      color: expected.tint,
      mode: expected.variant === "development" ? "development" : "production",
    },
  });
  expect(usage(config)).toEqual({
    network: "Allow T3 Code to connect to T3 Code servers on your local network or tailnet.",
    library: "Allow T3 Code to save images to your photo library.",
    audio: "Allow T3 Code to use your microphone for voice input.",
    camera: "Allow T3 Code to access your camera so you can scan pairing QR codes.",
    picker: "Allow T3 Code to use your microphone for voice input.",
  });
});

it.each(["development", "preview", "production"])(
  "brands the $0 art and permissions while preserving mobile identity",
  async (variant) => {
    vi.stubEnv("T3CODE_IOS_BUNDLE_ID", "tech.example.mobile");
    vi.stubEnv("T3CODE_IOS_APPLE_TEAM_ID", "TEAM000001");
    vi.stubEnv("T3CODE_EAS_PROJECT_ID", "fork-project");
    vi.stubEnv("T3CODE_EAS_OWNER", "fork-owner");
    vi.stubEnv("T3CODE_MOBILE_STAGE_LABEL", "Local");
    const upstream = await loadConfig(variant);
    const branded = await loadConfig(variant, "j3");
    const root = "../../assets/fork/j3";
    const icon = `${root}/icon-1024.png`;
    const splash = `${root}/android-splash.png`;

    expect(identity(branded)).toEqual(identity(upstream));
    expect(pluginOptions(branded, "./plugins/withWidgetLogoAsset.cjs")).toEqual({
      sourcePath: "../../assets/fork/j3/widget-mark.svg",
    });
    expect(upstream.plugins).toContain("./plugins/withWidgetLogoAsset.cjs");
    expect(branded.extra).toMatchObject({ brand: "j3", stageLabel: "Local" });
    expect(art(branded)).toMatchObject({
      icon,
      ios: icon,
      android: icon,
      adaptive: {
        backgroundColor: "#0F5C5C",
        foregroundImage: `${root}/android-foreground.png`,
        monochromeImage: `${root}/android-monochrome.png`,
      },
      splash: {
        image: icon,
        dark: { image: icon },
        android: { image: splash, dark: { image: splash } },
      },
      notifications: { icon: `${root}/android-monochrome.png`, color: "#0F5C5C" },
    });
    expect(branded.android?.adaptiveIcon).not.toHaveProperty("backgroundImage");
    expect(usage(branded)).toEqual({
      network: "Allow J3 Code to connect to T3 Code servers on your local network or tailnet.",
      library: "Allow J3 Code to save images to your photo library.",
      audio: "Allow J3 Code to use your microphone for voice input.",
      camera: "Allow J3 Code to access your camera so you can scan pairing QR codes.",
      picker: "Allow J3 Code to use your microphone for voice input.",
    });
    expect(branded.ios?.infoPlist?.CFBundleDisplayName).toBe(
      upstream.ios?.infoPlist?.CFBundleDisplayName,
    );
  },
);

it.each([
  ["development", "T3 Code Dev"],
  ["preview", "T3 Code Preview"],
  ["production", "T3 Code"],
])("guards the branded %s Expo config against upstream branding", async (variant, nativeName) => {
  vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM", undefined);
  vi.stubEnv("T3CODE_IOS_DISPLAY_NAME", undefined);
  const config = await loadConfig(variant, "j3");
  const serialized = JSON.stringify(config, function (key, value) {
    // Expo uses the root name for native targets and extension identity.
    if (this === config && key === "name" && value === nativeName) return undefined;
    // This prompt describes the upstream servers the app can connect to.
    if (
      this === config.ios?.infoPlist &&
      key === "NSLocalNetworkUsageDescription" &&
      value === "Allow J3 Code to connect to T3 Code servers on your local network or tailnet."
    )
      return undefined;
    // This widget shows quotas from upstream environments, including on the fork.
    const widget = pluginOptions(config, "expo-widgets")?.widgets[0];
    if (
      this === widget &&
      key === "description" &&
      value === "Subscription quotas from your connected T3 Code environments."
    )
      return undefined;
    return value;
  });
  expect(serialized).not.toMatch(/T3 Code/u);
  expect(serialized).not.toMatch(
    /assets\/(?:prod\/|dev\/|nightly\/|android-|widget\/T3Mark\.svg)/u,
  );
});
