import type { DesktopAppBranding } from "@t3tools/contracts";
import { resolveHostedAppChannelLabel, resolveWebBranding } from "./branding.logic";

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge?.getAppBranding() ?? null;
}

const injectedDesktopAppBranding = readInjectedDesktopAppBranding();
const hostedAppChannel = import.meta.env.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();

export const HOSTED_APP_CHANNEL =
  hostedAppChannel === "latest" || hostedAppChannel === "nightly" ? hostedAppChannel : null;
export const HOSTED_APP_CHANNEL_LABEL = resolveHostedAppChannelLabel(HOSTED_APP_CHANNEL);
const webBranding = resolveWebBranding({
  brand: import.meta.env.T3CODE_BRAND,
  hostedAppChannel: HOSTED_APP_CHANNEL,
  development: import.meta.env.DEV,
});
export const APP_FORK_BRAND = webBranding.forkBrand;
export const APP_BASE_NAME = injectedDesktopAppBranding?.baseName ?? webBranding.baseName;
export const APP_STAGE_LABEL = injectedDesktopAppBranding?.stageLabel ?? webBranding.stageLabel;
export const APP_DISPLAY_NAME = injectedDesktopAppBranding?.displayName ?? webBranding.displayName;
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
export const DESKTOP_DOWNLOAD_URL = "https://t3.codes/download";
// Redirects to the App Store or Google Play to match the phone that opens it.
export const MOBILE_APP_URL = "https://t3.codes/mobile";
