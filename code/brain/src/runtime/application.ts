import { PiDiscoveryTools } from "../adapters/pi-tools.ts";
import { AnchorRestore } from "../application/anchor-restore.ts";
import { CognitionMaintenance } from "../application/cognition-maintenance.ts";
import { ReadDiscovery } from "../application/read-discovery.ts";
import type { BrainRuntimeInfrastructure } from "./bootstrap.ts";

export function createBrainApplicationServices(infrastructure: BrainRuntimeInfrastructure) {
  return {
    binding: infrastructure.binding,
    anchor: new AnchorRestore(
      infrastructure.store,
      infrastructure.operations,
      infrastructure.checkpoint,
    ),
    reads: new ReadDiscovery(
      infrastructure.store,
      new PiDiscoveryTools(infrastructure.binding),
      infrastructure.operations,
    ),
    maintenance: new CognitionMaintenance(infrastructure.store, infrastructure.operations),
  };
}
