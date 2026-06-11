export default () => ({
  app: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    // На хостингах (Railway/Render) зручніше один DATABASE_URL; локально — окремі поля.
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true',
  },
  redis: {
    // Підтримка REDIS_URL (Railway) або окремих полів.
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
  },
  telegram: {
    platformBotToken: process.env.PLATFORM_BOT_TOKEN,
    paymentProviderToken: process.env.PAYMENT_PROVIDER_TOKEN,
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
  },
  miniApp: {
    url: process.env.MINI_APP_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
});
