import { PiDiscoveryTools } from "../adapters/pi-tools.ts";
import { AnchorRestore } from "../application/anchor-restore.ts";
import { CognitionMaintenance } from "../application/cognition-maintenance.ts";
import { ReadDiscovery } from "../application/read-discovery.ts";
import { RoutedBrainApplication } from "../application/routed-brain.ts";
import type { BrainRuntimeInfrastructure } from "./bootstrap.ts";

export function createBrainApplicationServices(
  infrastructure: BrainRuntimeInfrastructure,
  options: { sourceRoot?: string } = {},
) {
  const anchor = new AnchorRestore(
    infrastructure.store,
    infrastructure.operations,
    infrastructure.checkpoint,
  );
  const reads = new ReadDiscovery(
    infrastructure.store,
    new PiDiscoveryTools(infrastructure.binding),
    infrastructure.operations,
  );
  const maintenance = new CognitionMaintenance(infrastructure.store, infrastructure.operations);
  const base = {
    binding: infrastructure.binding,
    anchor,
    reads,
    maintenance,
    store: infrastructure.store,
    operations: infrastructure.operations,
  };
  return {
    ...base,
    ...(options.sourceRoot === undefined
      ? {}
      : {
          routed: new RoutedBrainApplication({
            sourceRoot: options.sourceRoot,
            ...base,
          }),
        }),
  };
}
