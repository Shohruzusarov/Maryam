# Telegram Mini App

## Railway Variables

Добавьте в сервис Railway:

- `APP_URL=https://maryam-production.up.railway.app/`
- `TELEGRAM_BOT_TOKEN` — токен от BotFather
- `TELEGRAM_WEBHOOK_SECRET` — длинная случайная строка из латинских букв и цифр
- `TELEGRAM_ADMIN_CHAT_ID` — Telegram ID владельца или рабочего чата

После изменения Variables Railway перезапустит сервис.

## Webhook

Установите webhook методом Bot API `setWebhook`:

- URL: `https://maryam-production.up.railway.app/api/telegram/webhook`
- `secret_token`: то же значение, что в `TELEGRAM_WEBHOOK_SECRET`
- `allowed_updates`: `["message"]`

## BotFather

В `@BotFather` откройте бота:

1. **Bot Settings → Configure Mini App → Enable Mini App**.
2. Установите URL `https://maryam-production.up.railway.app/`.
3. В **Menu Button** установите кнопку `Заказать выпечку` с тем же URL.

Токен нельзя добавлять в GitHub или отправлять клиентской части приложения.
