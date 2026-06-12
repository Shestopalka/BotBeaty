// Чи має майстер доступ до Pro/Year-фіч.
// Тріал = повний доступ (щоб спробувати преміум). 'standard' — історичні (грандфазер).
export function isProPlus(m?: { subscriptionStatus?: string; plan?: string } | null): boolean {
  if (!m) return false;
  if (m.subscriptionStatus === 'trialing') return true;
  if (m.subscriptionStatus !== 'active') return false;
  return m.plan === 'pro' || m.plan === 'year' || m.plan === 'standard';
}
