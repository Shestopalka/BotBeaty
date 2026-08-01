/**
 * Єдиний реєстр відомих фіч платформи.
 * Додаєш нову фічу → додаєш сюди один рядок, і вона зʼявляється
 * в адмінці прапорців та в ефективному наборі, що віддається mini-app.
 */
export const FEATURE_KEYS = {
  CALENDAR_DAY_VIEW: 'calendar_day_view',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export interface FeatureMeta {
  key: FeatureKey;
  title: string;
  description: string;
}

export const FEATURES: FeatureMeta[] = [
  {
    key: FEATURE_KEYS.CALENDAR_DAY_VIEW,
    title: "Календар (день-вʼю)",
    description: "Розклад дня у вигляді погодинного таймлайну, як у календарі iPhone",
  },
];

export const ALL_FEATURE_KEYS: FeatureKey[] = FEATURES.map((f) => f.key);

export function isKnownFeature(key: string): key is FeatureKey {
  return ALL_FEATURE_KEYS.includes(key as FeatureKey);
}
