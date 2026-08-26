import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, 'data');
const dbFile = path.join(dataDir, 'db.json');
const port = Number(process.env.PORT || 3000);

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
function safeProduct(input, id) {
  return { id, name: String(input.name || '').trim(), category: String(input.category || 'Другое'), price: Number(input.price || 0), oldPrice: Number(input.oldPrice || 0), description: String(input.description || ''), image: String(input.image || '🥐'), color: String(input.color || '#C9905B'), active: input.active !== false, popular: Boolean(input.popular), stock: Number(input.stock || 0) };
}

await ensureDb();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'healthy', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
    if (url.pathname === '/api/data' && req.method === 'GET') return json(res, 200, await getDb());
    if (url.pathname === '/api/orders' && req.method === 'POST') {
      const input = await body(req); const db = await getDb();
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
      const order = { id: `MB-${1043 + db.orders.length}`, createdAt: new Date().toISOString(), customer: String(input.customer), phone: `+${phoneDigits}`, address: String(input.address), building: String(input.building || ''), deliveryDate: scheduleDates[0], schedule: { type: scheduleType, dates: scheduleDates, weekdays: Array.isArray(input.schedule?.weekdays) ? input.schedule.weekdays : [] }, slot: String(input.slot || ''), items: input.items.map(i => ({ productId: i.productId, qty: Math.max(1, Number(i.qty)) })), perDeliveryTotal, total: perDeliveryTotal * scheduleDates.length, status: db.settings.paymentProvider === 'test' || db.settings.paymentProvider === 'cash' ? 'new' : 'paid', payment: db.settings.paymentProvider === 'cash' ? 'При получении' : db.settings.paymentProvider === 'test' ? 'Перевод на карту · ожидает подтверждения' : db.settings.paymentProvider };
      db.orders.unshift(order); await saveDb(db); return json(res, 201, order);
    }
    if (url.pathname === '/api/products' && req.method === 'POST') { const db = await getDb(); const input = await body(req); const product = safeProduct(input, `p${Date.now()}`); db.products.push(product); await saveDb(db); return json(res, 201, product); }
    const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch && req.method === 'PUT') { const db = await getDb(); const i = db.products.findIndex(p => p.id === productMatch[1]); if (i < 0) return json(res, 404, { error: 'Товар не найден' }); db.products[i] = safeProduct(await body(req), db.products[i].id); await saveDb(db); return json(res, 200, db.products[i]); }
    if (productMatch && req.method === 'DELETE') { const db = await getDb(); db.products = db.products.filter(p => p.id !== productMatch[1]); await saveDb(db); return json(res, 200, { ok: true }); }
    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderMatch && req.method === 'PATCH') { const db = await getDb(); const o = db.orders.find(x => x.id === orderMatch[1]); if (!o) return json(res, 404, { error: 'Заказ не найден' }); Object.assign(o, await body(req)); await saveDb(db); return json(res, 200, o); }
    if (url.pathname === '/api/settings' && req.method === 'PUT') { const db = await getDb(); db.settings = { ...db.settings, ...(await body(req)) }; await saveDb(db); return json(res, 200, db.settings); }

    const rel = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' ? 'admin.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir)) return json(res, 403, { error: 'Forbidden' });
    const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    try { const content = await readFile(file); res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); res.end(content); } catch { json(res, 404, { error: 'Not found' }); }
  } catch (e) { console.error(e); json(res, 500, { error: 'Ошибка сервера' }); }
});
server.listen(port, () => console.log(`Maryam Bakery: http://localhost:${port}`));
