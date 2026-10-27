import type {
  CognitionMaintenance,
  EditRequest,
  FeedbackKind,
  MaintenanceResult,
} from "./cognition-maintenance.ts";
import type { LogicalArchivalPath, LogicalBrainPath } from "../brain/namespace.ts";
import type { StorageBinding } from "../persistence/storage.ts";
import type { SemanticIndex } from "../runtime/semantic-index.ts";

function archival(path: LogicalBrainPath): LogicalArchivalPath | undefined {
  return path.kind === "archival" ? path : undefined;
}

export class SemanticAwareMaintenance {
  constructor(
    private readonly base: CognitionMaintenance,
    private readonly binding: StorageBinding,
    private readonly index: SemanticIndex,
  ) {}

  async write(path: LogicalBrainPath, content: string): Promise<MaintenanceResult> {
    const result = await this.base.write(path, content);
    if (result.action === "created" || result.action === "overwrote") {
      await this.refresh(result.path);
    }
    return result;
  }

  async edit(request: EditRequest): Promise<MaintenanceResult> {
    const result = await this.base.edit(request);
    if (result.action === "edited" && result.changed) {
      const item = archival(result.path);
      if (item !== undefined) await this.refresh(item);
    }
    return result;
  }

  async move(src: LogicalBrainPath, dst: LogicalBrainPath): Promise<MaintenanceResult> {
    const result = await this.base.move(src, dst);
    if (result.action === "moved") {
      await this.refresh(result.from);
      await this.refresh(result.to);
    }
    return result;
  }

  async remove(path: LogicalBrainPath): Promise<MaintenanceResult> {
    const result = await this.base.remove(path);
    if (result.action === "removed") await this.refresh(result.path);
    return result;
  }

  async feedback(
    path: LogicalBrainPath,
    feedback: FeedbackKind,
    challenge?: string,
  ): Promise<MaintenanceResult> {
    const result = await this.base.feedback(path, feedback, challenge);
    if (result.action === "questioned" || result.action === "resolved") {
      await this.refresh(result.path);
    }
    return result;
  }

  private async refresh(path: LogicalArchivalPath): Promise<void> {
    try {
      await this.index.refreshPath(this.binding, path);
    } catch (error) {
      console.error("brain semantic index update degraded", error);
    }
  }
}
