import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, 'data');
const dbFile = path.join(dataDir, 'db.json');
const port = Number(process.env.PORT || 3000);
const adminUsers = [
  { username: 'maryam-owner', role: 'owner', salt: '6e943b0180b693fc89030282711ce138', hash: '094fdcb7dddcd13bc40a45c22f324f11e3bb25888d260d51d60f542a1d34e35bcbf550507a2e4426877959b4ef33b96569a353bfe0e41525fe82c3a457f34679' },
  { username: 'manager-1', role: 'manager', salt: 'f8d4347b2d101d6324c3832582ac5147', hash: '87263286b897848aa8b4c0221de3fe45a3e27d029c03c136731ae3b3e1ba1683b47e8640645ad62d923c3fd01ab3b8555df894fe86d9427eb721bdbb51e35c34' },
  { username: 'manager-2', role: 'manager', salt: '463914dc0b97c5b967c897095366cf25', hash: '2a0db277fe30457a2adbb768bbc97062cf975bd41dd006fea300d5821334f0bc4cddc70b5dd71b8d78c04c435ead3955ee2ec2fa0c61741d85b64e5d99dabcf3' }
];
const sessions = new Map();
const loginAttempts = new Map();

const seed = {
  products: [
    { id: 'p1', name: 'Круассан классический', category: 'Круассаны', price: 12000, oldPrice: 0, description: 'Воздушный, сливочный, с хрустящей корочкой', image: '🥐', color: '#E9B76A', active: true, popular: true, stock: 40 },
    { id: 'p2', name: 'Синнабон с кремом', category: 'Сладкое', price: 16000, oldPrice: 18000, description: 'Корица, карамель и нежный сливочный крем', image: '🍥', color: '#C98E62', active: true, popular: true, stock: 28 },
    { id: 'p3', name: 'Самса с говядиной', category: 'Сытное', price: 14000, oldPrice: 0, description: 'Сочная начинка и тонкое слоёное тесто', image: '🥟', color: '#D89C4D', active: true, popular: true, stock: 35 },
    { id: 'p4', name: 'Багет ремесленный', category: 'Хлеб', price: 10000, oldPrice: 0, description: 'На закваске, с пористым мякишем', image: '🥖', color: '#B7773D', active: true, popular: false, stock: 22 },
    { id: 'p5', name: 'Улитка с изюмом', category: 'Сладкое', price: 13000, oldPrice: 0, description: 'Заварной крем и сочный изюм', image: '🌀', color: '#BE8656', active: true, popular: false, stock: 30 },
    { id: 'p6', name: 'Слойка с сыром', category: 'Сытное', price: 15000, oldPrice: 0, description: 'Три вида сыра в хрустящем тесте', image: '🧀', color: '#DAAA55', active: true, popular: true, stock: 24 }
  ],
  orders: [
    { id: 'MB-1042', createdAt: '2026-08-20T07:12:00.000Z', customer: 'Малика', phone: '+998 90 123 45 67', address: 'Дом 14, подъезд 2, кв. 31', building: 'Дом 14', deliveryDate: '2026-08-21', slot: '07:00–08:00', items: [{ productId: 'p1', qty: 2 }, { productId: 'p2', qty: 1 }], total: 40000, status: 'paid', payment: 'Click' },
    { id: 'MB-1041', createdAt: '2026-08-20T06:50:00.000Z', customer: 'Азиза', phone: '+998 93 555 21 00', address: 'Дом 7, подъезд 1, кв. 12', building: 'Дом 7', deliveryDate: '2026-08-21', slot: '08:00–09:00', items: [{ productId: 'p3', qty: 3 }, { productId: 'p4', qty: 1 }], total: 52000, status: 'preparing', payment: 'Payme' }
  ],
  settings: {
    bakeryName: 'Maryam Bakery', phone: '+998 90 000 00 00', callCenterPhone: '+998 90 123 45 67', orderDeadline: '21:00', minOrder: 30000,
    deliveryFee: 5000, freeDeliveryFrom: 100000, paymentProvider: 'test', cardNumber: '8600 1234 5678 9012', cardHolder: 'MARYAM BAKERY', clickMerchantId: '', paymeMerchantId: '',
    deliverySlots: ['07:00–08:00', '08:00–09:00'], buildings: ['Дом 7', 'Дом 9', 'Дом 12', 'Дом 14', 'Дом 18'], acceptingOrders: true
  }
};

async function ensureDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbFile)) await writeFile(dbFile, JSON.stringify(seed, null, 2));
}
async function getDb() { return JSON.parse(await readFile(dbFile, 'utf8')); }
async function saveDb(db) { await writeFile(dbFile, JSON.stringify(db, null, 2)); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
async function body(req) { let raw = ''; for await (const c of req) raw += c; return raw ? JSON.parse(raw) : {}; }
function getSession(req) { const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('maryam_session='))?.slice(15); const session = token && sessions.get(token); if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; } return session; }
function passwordMatches(password, user) { const actual = crypto.scryptSync(String(password), user.salt, 64); return crypto.timingSafeEqual(actual, Buffer.from(user.hash, 'hex')); }
function sessionCookie(req, token, clear = false) { const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production'; return `maryam_session=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 28800}${secure ? '; Secure' : ''}`; }
function validateTelegramInitData(raw) { if (!raw || !process.env.TELEGRAM_BOT_TOKEN) return null; try { const params = new URLSearchParams(raw), received = params.get('hash'); params.delete('hash'); params.delete('signature'); const check = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n'); const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest(); const expected = crypto.createHmac('sha256', secret).update(check).digest('hex'); const fresh = Date.now() / 1000 - Number(params.get('auth_date')) < 86400; if (!received || !fresh || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null; return JSON.parse(params.get('user') || 'null'); } catch { return null; } }
async function telegramApi(method, payload) { if (!process.env.TELEGRAM_BOT_TOKEN) return null; const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); return response.json(); }
function safeProduct(input, id) {
  const imageUrl = /^https?:\/\//i.test(String(input.imageUrl || '').trim()) ? String(input.imageUrl).trim() : '';
  return { id, name: String(input.name || '').trim(), category: String(input.category || 'Другое'), price: Number(input.price || 0), oldPrice: Number(input.oldPrice || 0), description: String(input.description || ''), image: String(input.image || '🥐'), imageUrl, color: String(input.color || '#C9905B'), active: input.active !== false, popular: Boolean(input.popular), stock: Number(input.stock || 0) };
}

await ensureDb();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'healthy', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
    if (url.pathname === '/api/store' && req.method === 'GET') { const db = await getDb(); const { clickMerchantId, paymeMerchantId, ...settings } = db.settings; return json(res, 200, { products: db.products.filter(p => p.active), settings }); }
    if (url.pathname === '/api/data' && req.method === 'GET') { const db = await getDb(); if (getSession(req)) return json(res, 200, db); const { clickMerchantId, paymeMerchantId, ...settings } = db.settings; return json(res, 200, { products: db.products.filter(p => p.active), settings }); }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') { const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0]; const attempt = loginAttempts.get(ip) || { count: 0, until: 0 }; if (attempt.until > Date.now()) return json(res, 429, { error: 'Слишком много попыток. Попробуйте через 15 минут.' }); const input = await body(req); const user = adminUsers.find(x => x.username === String(input.username || '').trim().toLowerCase()); if (!user || !passwordMatches(input.password || '', user)) { attempt.count++; if (attempt.count >= 5) { attempt.until = Date.now() + 15 * 60_000; attempt.count = 0; } loginAttempts.set(ip, attempt); return json(res, 401, { error: 'Неверный логин или пароль' }); } loginAttempts.delete(ip); const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { username: user.username, role: user.role, expires: Date.now() + 8 * 60 * 60_000 }); res.setHeader('Set-Cookie', sessionCookie(req, token)); return json(res, 200, { username: user.username, role: user.role }); }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') { const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('maryam_session='))?.slice(15); if (token) sessions.delete(token); res.setHeader('Set-Cookie', sessionCookie(req, '', true)); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/telegram/webhook' && req.method === 'POST') {
      if (!process.env.TELEGRAM_WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) return json(res, 403, { error: 'Forbidden' });
      const update = await body(req); const message = update.message;
      if (message?.chat?.id && message.text === '/id') await telegramApi('sendMessage', { chat_id: message.chat.id, text: `Ваш Telegram Chat ID: ${message.chat.id}` }).catch(console.error);
      if (message?.chat?.id && (message.text === '/start' || message.text?.startsWith('/start '))) { const appUrl = process.env.APP_URL || 'https://maryam-production.up.railway.app/'; await telegramApi('sendMessage', { chat_id: message.chat.id, text: `Добро пожаловать в Maryam Bakery, ${message.from?.first_name || ''}! 🥐\n\nЗакажите свежую выпечку к утру — один раз или по подписке.`, reply_markup: { inline_keyboard: [[{ text: '🥐 Заказать выпечку', web_app: { url: appUrl } }]] } }).catch(console.error); }
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/orders' && req.method === 'POST') {
      const input = await body(req); const db = await getDb();
      const telegramUser = validateTelegramInitData(input.telegramInitData);
      if (input.telegramInitData && !telegramUser) return json(res, 401, { error: 'Сессия Telegram устарела. Откройте приложение заново.' });
      if (!input.customer || !input.phone || !input.address || !Array.isArray(input.items) || !input.items.length) return json(res, 400, { error: 'Заполните контактные данные и корзину' });
      const phoneDigits = String(input.phone).replace(/\D/g, '');
      if (!/^998(33|50|55|61|62|65|66|67|69|70|71|72|73|74|75|76|77|78|79|88|90|91|93|94|95|97|98|99)\d{7}$/.test(phoneDigits)) return json(res, 400, { error: 'Введите действующий номер Узбекистана: +998 XX XXX XX XX' });
      const total = input.items.reduce((sum, i) => { const p = db.products.find(x => x.id === i.productId && x.active); return sum + (p ? p.price * Math.max(1, Number(i.qty)) : 0); }, 0);
      if (total < db.settings.minOrder) return json(res, 400, { error: `Минимальный заказ ${db.settings.minOrder}` });
      const delivery = total >= db.settings.freeDeliveryFrom ? 0 : db.settings.deliveryFee;
      const requestedDates = Array.isArray(input.schedule?.dates) ? input.schedule.dates.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 31) : [];
      const scheduleDates = [...new Set(requestedDates.length ? requestedDates : [String(input.deliveryDate || '')])].sort();
      if (!scheduleDates[0]) return json(res, 400, { error: 'Выберите дату доставки' });
      const scheduleType = ['once', 'week', 'month', 'custom'].includes(input.schedule?.type) ? input.schedule.type : 'once';
      const perDeliveryTotal = total + delivery;
      const order = { id: `MB-${1043 + db.orders.length}`, createdAt: new Date().toISOString(), customer: String(input.customer), phone: `+${phoneDigits}`, telegram: telegramUser ? { id: telegramUser.id, username: telegramUser.username || '', firstName: telegramUser.first_name || '' } : null, address: String(input.address), building: String(input.building || ''), deliveryDate: scheduleDates[0], schedule: { type: scheduleType, dates: scheduleDates, weekdays: Array.isArray(input.schedule?.weekdays) ? input.schedule.weekdays : [] }, slot: String(input.slot || ''), items: input.items.map(i => ({ productId: i.productId, qty: Math.max(1, Number(i.qty)) })), perDeliveryTotal, total: perDeliveryTotal * scheduleDates.length, status: db.settings.paymentProvider === 'test' || db.settings.paymentProvider === 'cash' ? 'new' : 'paid', payment: db.settings.paymentProvider === 'cash' ? 'При получении' : db.settings.paymentProvider === 'test' ? 'Перевод на карту · ожидает подтверждения' : db.settings.paymentProvider };
      db.orders.unshift(order); await saveDb(db); const summary = `🧾 Новый заказ ${order.id}\n👤 ${order.customer} · ${order.phone}\n📍 ${order.address}\n🥐 ${order.items.reduce((s,i)=>s+i.qty,0)} шт. · ${scheduleDates.length} доставок\n💰 ${order.total.toLocaleString('ru-RU')} сум`; if (process.env.TELEGRAM_ADMIN_CHAT_ID) telegramApi('sendMessage', { chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID, text: summary }).catch(console.error); if (telegramUser?.id) telegramApi('sendMessage', { chat_id: telegramUser.id, text: `Спасибо! Заказ ${order.id} принят. Мы перезвоним вам для подтверждения. 🥐` }).catch(console.error); return json(res, 201, order);
    }
    const session = getSession(req);
    if (url.pathname === '/admin' || url.pathname === '/admin.html') { if (!session) { res.writeHead(302, { Location: '/login' }); return res.end(); } }
    if (url.pathname.startsWith('/api/') && !session) return json(res, 401, { error: 'Требуется вход в админку' });
    if (url.pathname === '/api/auth/me' && req.method === 'GET') return json(res, 200, session);
    if (url.pathname === '/api/products' && req.method === 'POST') { const db = await getDb(); const input = await body(req); const product = safeProduct(input, `p${Date.now()}`); db.products.push(product); await saveDb(db); return json(res, 201, product); }
    const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch && req.method === 'PUT') { const db = await getDb(); const i = db.products.findIndex(p => p.id === productMatch[1]); if (i < 0) return json(res, 404, { error: 'Товар не найден' }); db.products[i] = safeProduct(await body(req), db.products[i].id); await saveDb(db); return json(res, 200, db.products[i]); }
    if (productMatch && req.method === 'DELETE') { const db = await getDb(); db.products = db.products.filter(p => p.id !== productMatch[1]); await saveDb(db); return json(res, 200, { ok: true }); }
    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderMatch && req.method === 'PATCH') { const db = await getDb(); const o = db.orders.find(x => x.id === orderMatch[1]); if (!o) return json(res, 404, { error: 'Заказ не найден' }); Object.assign(o, await body(req)); await saveDb(db); return json(res, 200, o); }
    if (url.pathname === '/api/settings' && req.method === 'PUT') { const db = await getDb(); db.settings = { ...db.settings, ...(await body(req)) }; await saveDb(db); return json(res, 200, db.settings); }

    const rel = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' ? 'admin.html' : url.pathname === '/login' ? 'login.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir)) return json(res, 403, { error: 'Forbidden' });
    const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    try { const content = await readFile(file); res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); res.end(content); } catch { json(res, 404, { error: 'Not found' }); }
  } catch (e) { console.error(e); json(res, 500, { error: 'Ошибка сервера' }); }
});
server.listen(port, async () => {
  console.log(`Maryam Bakery: http://localhost:${port}`);
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET && process.env.APP_URL) {
    const webhook = `${process.env.APP_URL.replace(/\/$/, '')}/api/telegram/webhook`;
    try { const result = await telegramApi('setWebhook', { url: webhook, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: false }); await telegramApi('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Заказать выпечку', web_app: { url: process.env.APP_URL } } }); console.log(result?.ok ? `Telegram webhook connected: ${webhook}` : 'Telegram webhook error', result); } catch (error) { console.error('Telegram webhook setup failed:', error.message); }
  }
});
