import profilesData from '../data/model-profiles.json' with { type: 'json' };

export type ModelFormat = 'xml' | 'markdown' | 'numbered-steps';

export type ModelProfile = {
  displayName: string;
  format: ModelFormat;
  isReasoning: boolean;
  longContext: boolean;
  supportsToolUse: boolean;
};

type ProvidersFile = {
  providers: Record<
    string,
    { displayName: string; models: Record<string, ModelProfile> }
  >;
};

const data = profilesData as ProvidersFile;

const GENERIC: ModelProfile = data.providers.other!.models.generic!;

export function listProviders(): Array<{ id: string; displayName: string }> {
  return Object.entries(data.providers).map(([id, p]) => ({
    id,
    displayName: p.displayName,
  }));
}

export function listModelsForProvider(
  providerId: string,
): Array<{ id: string; displayName: string }> {
  const p = data.providers[providerId];
  if (!p) return [];
  return Object.entries(p.models).map(([id, m]) => ({
    id,
    displayName: m.displayName,
  }));
}

export function getModelProfile(providerId: string, modelId: string): ModelProfile {
  return data.providers[providerId]?.models[modelId] ?? GENERIC;
}
