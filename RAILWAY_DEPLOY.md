# Maryam Bakery — Railway

## Развёртывание

1. Загрузите проект в приватный GitHub-репозиторий.
2. В Railway выберите **New Project → Deploy from GitHub repo**.
3. Выберите репозиторий Maryam Bakery. Railway запустит `npm start` автоматически.
4. В сервисе откройте **Settings → Networking → Generate Domain**.
5. Проверьте адреса:
   - `https://ваш-домен.railway.app/`
   - `https://ваш-домен.railway.app/admin`
   - `https://ваш-домен.railway.app/health`

## Постоянное хранение данных

Текущая MVP-база — JSON-файл. Чтобы товары, настройки и заказы не исчезали после нового деплоя:

1. На канвасе Railway нажмите правой кнопкой на сервис.
2. Выберите **Attach Volume**.
3. Установите Mount Path: `/data`.

Railway автоматически передаст приложению `RAILWAY_VOLUME_MOUNT_PATH`. При первом запуске база будет создана на подключённом томе.

## Telegram Mini App

После получения публичного HTTPS-адреса:

1. Откройте `@BotFather`.
2. Выберите бота → **Bot Settings → Menu Button** или выполните `/setmenubutton`.
3. Текст кнопки: `Заказать выпечку`.
4. URL: публичный Railway-адрес витрины.

Для production необходимо дополнительно подключить Telegram WebApp SDK, серверную проверку `initData`, авторизацию админки и хранение секретов в Railway Variables.
