# Деплой BeatyBOT на Railway

Один сервіс: NestJS API + React Mini App роздаються з одного домену. Postgres і Redis — плагіни Railway. Схема БД створюється автоматично міграціями при старті.

> Дії з акаунтом, секретами і git робиш ти. Весь код і конфіги для деплою вже в репозиторії: `Dockerfile`, `railway.json`, `.dockerignore`, `.env.production.example`, initial-міграція.

---

## 0. Передумови

- Акаунт на [railway.app](https://railway.app) і встановлений Railway CLI (`npm i -g @railway/cli`) — за бажанням.
- Репозиторій на GitHub (Railway найзручніше деплоїть із GitHub). Якщо ще немає git:
  ```bash
  cd <корінь проєкту>
  git init && git add . && git commit -m "init"
  # створи репозиторій на GitHub і:
  git remote add origin git@github.com:<ти>/beatybot.git
  git push -u origin main
  ```
  Переконайся, що `.env` НЕ потрапив у коміт (він у `.gitignore`).

---

## 1. Проєкт + бази

1. Railway → **New Project** → **Deploy from GitHub repo** → обери репозиторій BeatyBOT.
2. У проєкті: **New** → **Database** → **Add PostgreSQL**.
3. Ще раз **New** → **Database** → **Add Redis**.

Тепер у проєкті три «сервіси»: твій застосунок, Postgres, Redis.

---

## 2. Налаштування сервісу застосунку

Відкрий сервіс застосунку → **Settings**:

- **Root Directory**: залиш порожнім (корінь репо) — там лежать `Dockerfile` і `railway.json`.
- **Build**: Railway сам підхопить `Dockerfile` (так задано в `railway.json`).
- Healthcheck вже налаштований на `/api/v1/health`.

---

## 3. Змінні середовища

Сервіс застосунку → **Variables** → додай (orієнтир — `.env.production.example`):

| Змінна | Значення |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `DATABASE_SSL` | `false` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `PLATFORM_BOT_TOKEN` | токен платформного бота з @BotFather |
| `JWT_SECRET` | довгий випадковий рядок (≥32 символи) |
| `PAYMENT_PROVIDER_TOKEN` | (необовʼязково) |

`${{Postgres.DATABASE_URL}}` і `${{Redis.REDIS_URL}}` — це **посилання Railway** на плагіни (підключення через приватну мережу, без SSL). `PORT` Railway задає сам.

`MINI_APP_URL` і `WEBHOOK_BASE_URL` поки **не став** — їх додамо після того, як зʼявиться домен.

---

## 4. Домен → і фінальні змінні

1. Сервіс → **Settings → Networking → Generate Domain**. Отримаєш щось на кшталт `https://beatybot-production.up.railway.app`.
2. Додай у **Variables** (обидві = цей домен):
   - `MINI_APP_URL` = `https://…up.railway.app`
   - `WEBHOOK_BASE_URL` = `https://…up.railway.app`
3. **Redeploy** сервіс.

---

## 5. Що станеться на старті (автоматично)

- Виконається міграція `InitialSchema` → створяться всі таблиці (бо `migrationsRun=true` у проді).
- Платформний бот зареєструє webhook на `WEBHOOK_BASE_URL`.
- Боти майстрів (якщо вже є в БД) перереєструють webhook на новий домен.
- Mini App роздається з того ж домену.

Перевірка: відкрий `https://…up.railway.app/api/v1/health` → має бути `{"status":"ok","db":true}`.

---

## 6. Telegram

- Платформний бот: напиши йому `/start` — кнопка «Зареєструватись як майстер» відкриє онбординг на проді.
- Майстри реєструють своїх ботів через онбординг (вони вводять токен свого бота). Дані з локальної дев-БД у прод **не переносяться** — майстри реєструються заново (або окремо мігруй дані дампом, якщо треба).

---

## 7. Оновлення в майбутньому

`git push` у `main` → Railway автоматично перебилдить і передеплоїть. Нові зміни схеми БД додавай **новою міграцією** (не редагуй `InitialSchema`):
```bash
cd apps/api
npm run migration:generate -- src/database/migrations/NazvaZminy
```
(локально, проти дев-БД), закоміть і запуш — у проді вона застосується сама.

---

## Типові проблеми

- **`/health` каже db:false або сервіс падає** → перевір, що `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` і `DATABASE_SSL=false`.
- **Черги/нагадування не працюють** → перевір `REDIS_URL=${{Redis.REDIS_URL}}`.
- **Mini App не відкривається / 404** → переконайся, що `MINI_APP_URL` = згенерований домен і зробив Redeploy після його встановлення.
- **Бот не відповідає** → `WEBHOOK_BASE_URL` має дорівнювати домену; глянь логи сервісу (там видно реєстрацію webhook).
- **Білд падає на `npm ci`** → онови `package-lock.json` локально (`npm install`) і запуш.
