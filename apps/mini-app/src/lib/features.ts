/**
 * Ключі фіч мають збігатися з backend-реєстром
 * (apps/api/src/modules/feature-flags/feature-flags.registry.ts).
 */
export const FEATURES = {
  CALENDAR_DAY_VIEW: 'calendar_day_view',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

/** Ефективний набір фіч приходить з /masters/me у полі `features`. */
export type FeatureMap = Partial<Record<string, boolean>>;

export function isFeatureOn(features: FeatureMap | undefined, key: FeatureKey): boolean {
  return features?.[key] === true;
}
