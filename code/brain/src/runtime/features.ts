export interface BrainRuntimeFeatures {
  readonly semanticSearch: boolean;
}

export const DEFAULT_BRAIN_RUNTIME_FEATURES: BrainRuntimeFeatures = {
  semanticSearch: false,
};
