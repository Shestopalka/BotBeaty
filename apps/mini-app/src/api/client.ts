import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
});

/**
 * Отримати Telegram initData максимально надійно:
 * 1) з WebApp.initData (основне джерело);
 * 2) фолбек — з launch-хешу URL (#tgWebAppData=...), який Telegram додає при
 *    відкритті Mini App. Рятує, якщо SDK не встиг ініціалізуватись або
 *    window.Telegram недоступний.
 */
export function getInitData(): string {
  const fromSdk = window.Telegram?.WebApp?.initData;
  if (fromSdk) return fromSdk;
  try {
    const hash = window.location.hash.replace(/^#/, '');
    const fromHash = new URLSearchParams(hash).get('tgWebAppData');
    if (fromHash) return fromHash;
  } catch { /* ignore */ }
  return '';
}

// Передаємо Telegram initData в кожен запит для автентифікації
api.interceptors.request.use((config) => {
  const initData = getInitData();
  if (initData) {
    config.headers['X-Telegram-Init-Data'] = initData;
  }

  // Для клієнтських сторінок бронювання — передаємо masterId щоб backend
  // міг валідувати initData підписаний токеном бота майстра
  const bookMatch = window.location.pathname.match(/\/book\/([^/]+)/);
  if (bookMatch) {
    config.headers['X-Master-Id'] = bookMatch[1];
  }

  return config;
});

export default api;

// ─── Masters ─────────────────────────────────────────────────────────────────
export const mastersApi = {
  getById: (id: string) => api.get(`/masters/${id}`).then(r => r.data),
  update: (id: string, data: any) => api.patch(`/masters/${id}`, data).then(r => r.data),
};

// ─── Appointments ─────────────────────────────────────────────────────────────
export const appointmentsApi = {
  getByMaster: (masterId: string, date?: string) =>
    api.get(`/appointments/master/${masterId}`, { params: { date } }).then(r => r.data),
  updateStatus: (id: string, masterId: string, status: string) =>
    api.patch(`/appointments/${id}/status`, { masterId, status }).then(r => r.data),
  create: (data: any) => api.post('/appointments', data).then(r => r.data),
  // Майстер записує клієнта сам (телефонний/офлайн запис).
  createByMaster: (data: any) => api.post('/appointments/by-master', data).then(r => r.data),
  delete: (id: string) => api.delete(`/appointments/${id}`).then(r => r.data),
};

// ─── Slots ────────────────────────────────────────────────────────────────────
export const slotsApi = {
  getAvailable: (masterId: string, from: string, to: string) =>
    api.get(`/slots/available/${masterId}`, { params: { from, to } }).then(r => r.data),
  // Найближчий вільний слот (для вітального екрана). Повертає Slot або null.
  getNextAvailable: (masterId: string) =>
    api.get(`/slots/available/${masterId}/next`).then(r => r.data),
  // Усі слоти майстра (вільні + заброньовані) — для сторінки керування слотами
  getForMaster: (masterId: string, from: string, to: string) =>
    api.get(`/slots/master/${masterId}`, { params: { from, to } }).then(r => r.data),
  createBulk: (data: any) => api.post('/slots/bulk', data).then(r => r.data),
  delete: (id: string, masterId: string) =>
    api.delete(`/slots/${id}`, { params: { masterId } }).then(r => r.data),
};

// ─── Analytics ───────────────────────────────────────────────────────────────
export const analyticsApi = {
  getDashboard: (masterId: string) =>
    api.get(`/analytics/master/${masterId}`).then(r => r.data),
};

// ─── Clients ──────────────────────────────────────────────────────────────────
export const clientsApi = {
  getByMaster: (masterId: string, tag?: string) =>
    api.get(`/clients/master/${masterId}`, { params: { tag } }).then(r => r.data),
  updateTag: (id: string, masterId: string, tag: string) =>
    api.patch(`/clients/${id}/tag`, { masterId, tag }).then(r => r.data),
  updateNotes: (id: string, masterId: string, notes: string) =>
    api.patch(`/clients/${id}/notes`, { masterId, notes }).then(r => r.data),
  block: (id: string, masterId: string) =>
    api.post(`/clients/${id}/block`, { masterId }).then(r => r.data),
  delete: (id: string, masterId: string) =>
    api.delete(`/clients/${id}`, { params: { masterId } }).then(r => r.data),
};
