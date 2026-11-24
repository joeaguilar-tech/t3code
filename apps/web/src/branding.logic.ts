import { formatForkDisplayName, resolveForkBrand } from "@t3tools/shared/forkBrand";

const NIGHTLY_SERVER_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+$/;

function formatAppDisplayName(input: {
  readonly baseName: string;
  readonly stageLabel: string;
}): string {
  if (input.stageLabel.trim().toLowerCase() === "latest") {
    return input.baseName;
  }

  return `${input.baseName} (${input.stageLabel})`;
}

export function resolveHostedAppChannelLabel(channel: string | null | undefined): string | null {
  const normalized = channel?.trim().toLowerCase();
  // oxlint-disable-next-line t3code/no-untranslated-copy -- release channel name, part of the product name
  return normalized === "nightly" ? "Nightly" : normalized === "latest" ? "Latest" : null;
}

export function resolveWebBranding(input: {
  readonly brand: string | undefined;
  readonly hostedAppChannel: string | null | undefined;
  readonly development: boolean;
}) {
  const forkBrand = resolveForkBrand(input.brand);
  const baseName = forkBrand?.name ?? "T3 Code";
  const stageLabel = resolveWebAppStageLabel(input);
  return {
    forkBrand,
    baseName,
    stageLabel,
    displayName: forkBrand
      ? formatForkDisplayName(baseName, stageLabel)
      : formatAppDisplayName({ baseName, stageLabel }),
  };
}

export function formatWebManifest(manifest: string, brand: string | undefined): string {
  const forkBrand = resolveForkBrand(brand);
  if (!forkBrand) return manifest;

  return (
    JSON.stringify(
      {
        ...JSON.parse(manifest),
        name: forkBrand.name,
        short_name: forkBrand.name,
      },
      null,
      2,
    ) + "\n"
  );
}

/** Stage label of a web build. vite.config.ts stamps it into index.html's title too. */
function resolveWebAppStageLabel(input: {
  readonly hostedAppChannel: string | null | undefined;
  readonly development: boolean;
}): string {
  return (
    // oxlint-disable-next-line t3code/no-untranslated-copy -- release channel name, part of the product name
    resolveHostedAppChannelLabel(input.hostedAppChannel) ?? (input.development ? "Dev" : "Beta")
  );
}

export function resolveServerBackedAppStageLabel(input: {
  readonly primaryServerVersion: string | null | undefined;
  readonly fallbackStageLabel: string;
}): string {
  return input.primaryServerVersion &&
    NIGHTLY_SERVER_VERSION_PATTERN.test(input.primaryServerVersion)
    ? // oxlint-disable-next-line t3code/no-untranslated-copy -- release channel name, part of the product name
      "Nightly"
    : input.fallbackStageLabel;
}

export function resolveServerBackedAppDisplayName(input: {
  readonly baseName: string;
  readonly fallbackDisplayName: string;
  readonly fallbackStageLabel: string;
  readonly primaryServerVersion: string | null | undefined;
}): string {
  const stageLabel = resolveServerBackedAppStageLabel({
    primaryServerVersion: input.primaryServerVersion,
    fallbackStageLabel: input.fallbackStageLabel,
  });

  return stageLabel === input.fallbackStageLabel
    ? input.fallbackDisplayName
    : formatAppDisplayName({ baseName: input.baseName, stageLabel });
}

/**
 * Names the open thread: `project / thread` on desktop, where the OS already
 * shows the app, with the app name appended in browser tabs.
 */
export function resolveWindowTitle(input: {
  readonly appDisplayName: string;
  readonly projectTitle: string | null;
  readonly threadTitle: string | null;
  /** The screen reader title: status, then thread, then project, since a screen reader reads from the start. */
  readonly screenReader?: { readonly threadStatus: string | null };
  readonly desktop: boolean;
}): string {
  const threadTitle = input.threadTitle?.trim() ?? "";
  const status = input.screenReader?.threadStatus;
  if (threadTitle === "") {
    return status ? `${status}: ${input.appDisplayName}` : input.appDisplayName;
  }

  const projectTitle = input.projectTitle?.trim() ?? "";
  const context =
    projectTitle === ""
      ? threadTitle
      : input.screenReader
        ? `${threadTitle} - ${projectTitle}`
        : `${projectTitle} / ${threadTitle}`;
  const title = status ? `${status}: ${context}` : context;
  return input.desktop ? title : `${title} - ${input.appDisplayName}`;
}
