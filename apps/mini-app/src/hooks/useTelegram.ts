export function useTelegram() {
  const tg = window.Telegram?.WebApp;

  const user = tg?.initDataUnsafe?.user;

  return {
    tg,
    user,
    isDark: tg?.colorScheme === 'dark',
    initData: tg?.initData ?? '',
    mainButton: tg?.MainButton,
    backButton: tg?.BackButton,
    haptic: tg?.HapticFeedback,
  };
}
