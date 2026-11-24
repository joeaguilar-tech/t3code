import { msg } from "gt-react-native";
import { m, type MessageResolver } from "../i18n/messages";

export function resolveMobileStageLabel(
  appVariant: unknown,
  override?: unknown,
  resolve: MessageResolver = m,
): string {
  if (typeof override === "string" && override.length > 0) return override;
  if (appVariant === "development")
    return resolve(msg("Dev", { $context: "app build stage label" }));
  if (appVariant === "preview")
    return resolve(msg("Nightly", { $context: "app build stage label" }));
  return resolve(msg("Beta", { $context: "app build stage label" }));
}
