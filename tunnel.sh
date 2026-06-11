#!/bin/bash
# Запускає cloudflared і автоматично оновлює .env з новим URL

ENV_FILE="$(dirname "$0")/apps/api/.env"

echo "🚇 Запускаємо Cloudflare Tunnel..."

# Запускаємо cloudflared і читаємо URL з логів
cloudflared tunnel --url http://localhost:3000 --protocol http2 2>&1 | while IFS= read -r line; do
  echo "$line"

  # Шукаємо рядок з URL
  if echo "$line" | grep -q "trycloudflare.com"; then
    URL=$(echo "$line" | grep -o 'https://[^ ]*trycloudflare\.com')
    if [ -n "$URL" ]; then
      echo ""
      echo "✅ Новий URL: $URL"
      echo "📝 Оновлюємо .env..."

      # Оновлюємо MINI_APP_URL
      sed -i '' "s|MINI_APP_URL=.*|MINI_APP_URL=$URL|" "$ENV_FILE"
      # Оновлюємо WEBHOOK_BASE_URL
      sed -i '' "s|WEBHOOK_BASE_URL=.*|WEBHOOK_BASE_URL=$URL|" "$ENV_FILE"

      echo "✅ .env оновлено!"
      echo "⚠️  Перезапусти API щоб webhook переключився на новий URL"
      echo ""
    fi
  fi
done
