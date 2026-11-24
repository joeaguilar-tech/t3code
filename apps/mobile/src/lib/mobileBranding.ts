export function resolveMobileStageLabel(appVariant: unknown, override?: unknown): string {
  if (typeof override === "string" && override.length > 0) return override;
  if (appVariant === "development") return "Dev";
  if (appVariant === "preview") return "Nightly";
  return "Beta";
}
