import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/cli";

import { resolveForkBrand } from "@t3tools/shared/forkBrand";
import { loadRepoEnv } from "../lib/public-config.ts";

class MissingForkBrandError extends Schema.TaggedError<
  MissingForkBrandError,
  { readonly brand: unique symbol }
>()("MissingForkBrandError", {}) {
  override get message() {
    return "Select a fork brand with T3CODE_BRAND.";
  }
}

const command = Command.make(
  "brand-field",
  { field: Argument.Literals("field", ["name", "statement"]) },
  ({ field }) => {
    const brand = resolveForkBrand(loadRepoEnv().T3CODE_BRAND);
    return brand ? Console.log(brand[field]) : Effect.fail(new MissingForkBrandError());
  },
);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
