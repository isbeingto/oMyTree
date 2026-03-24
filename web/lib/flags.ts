import features from "@/config/features.json";

type FeatureMap = Record<string, boolean>;

const featureMap: FeatureMap = features as FeatureMap;

export type FeatureFlagName = keyof typeof featureMap;

export function getFlag(name: FeatureFlagName): boolean;
export function getFlag(name: string): boolean;
export function getFlag(name: string): boolean {
  if (Object.prototype.hasOwnProperty.call(featureMap, name)) {
    return Boolean(featureMap[name]);
  }
  return true;
}

export function listFlags(): FeatureMap {
  return { ...featureMap };
}
