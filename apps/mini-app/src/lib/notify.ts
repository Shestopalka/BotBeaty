// Показ зрозумілого повідомлення про помилку API (бек повертає текст у message).
export function showApiError(e: any, fallback: string) {
  const msg = e?.response?.data?.message ?? fallback;
  const text = Array.isArray(msg) ? msg.join(', ') : msg;
  const a: any = window.Telegram?.WebApp;
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error');
  if (a?.showAlert) a.showAlert(text);
  else alert(text);
}
