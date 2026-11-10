// OfiMatch — app real (Node + Express + SQLite, sin dependencias exóticas).
// Registro propio, match, chat, pago con tarjeta por Mercado Pago,
// rastreo tipo Rappi solo después de contratar y pagar.
// Secretos SOLO por variables de entorno. Sin datos ficticios: empieza vacía.
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');
const { chargesFor, extraHoursFor, INCLUDED_MINUTES } = require('./lib/pricing');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion';
const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const MP_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY || '';
const PAYMENT_MODE = MP_TOKEN ? 'mercadopago' : 'demo';

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'ofimatch.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('busco','ofrezco')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS professionals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
  trade TEXT NOT NULL, zone TEXT NOT NULL, rate INTEGER NOT NULL,
  experience TEXT DEFAULT '', eta_text TEXT DEFAULT 'Disponible',
  distance_km REAL DEFAULT 1.0, photo_url TEXT DEFAULT '', available INTEGER DEFAULT 1,
  created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS swipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL, action TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(client_id, professional_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL,
  professional_id INTEGER NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(client_id, professional_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL, text TEXT DEFAULT '', image_url TEXT DEFAULT '',
  kind TEXT DEFAULT 'text', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL, professional_id INTEGER NOT NULL,
  title TEXT NOT NULL, category TEXT NOT NULL, service_price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmado',
  payment_status TEXT NOT NULL DEFAULT 'pending', payment_mode TEXT DEFAULT 'demo',
  mp_preference_id TEXT DEFAULT '', mp_init_point TEXT DEFAULT '',
  tracking_status TEXT, tracking_eta_min INTEGER,
  work_started_at TEXT, work_ended_at TEXT, warned_1h55 INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, service_id INTEGER NOT NULL UNIQUE,
  professional_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
  stars INTEGER NOT NULL, comment TEXT DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL,
  title TEXT NOT NULL, category TEXT NOT NULL, zone TEXT NOT NULL,
  budget INTEGER, urgency TEXT DEFAULT '', kind TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'abierta', professional_id INTEGER,
  created_at TEXT NOT NULL
);
`);

const CATEGORIES = ['Plomero','Electricista','Aire Acondicionado','Carpintero','Pintor','Albañil','Limpieza','Mecánico','Tecnología','Mudanzas','Jardinería','Más servicios'];
const TRACKING_STEPS = ['confirmado','en_camino','llego','trabajando','terminado'];
const TRACKING_LABELS = { confirmado:'Solicitud confirmada', en_camino:'Profesional en camino', llego:'Llegó', trabajando:'Trabajando', terminado:'Terminado' };

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const now = () => new Date().toISOString();
function sign(user) { return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' }); }
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Sesión inválida. Inicia sesión de nuevo.' }); }
}
function publicUser(u) { return u ? { id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role } : null; }
function proWithRating(row) {
  const r = db.prepare('SELECT AVG(stars) avg, COUNT(*) n FROM reviews WHERE professional_id=?').get(row.id);
  return { ...row, avg_rating: r.n ? Math.round(r.avg * 10) / 10 : null, review_count: r.n };
}
function trackingInfo(svc) {
  if (!svc.work_started_at) return { elapsedMinutes: 0, remainingMinutes: INCLUDED_MINUTES, extraHours: 0, charges: chargesFor(svc.service_price, 0) };
  const elapsed = Math.max(0, Math.floor((new Date(svc.work_ended_at || new Date()) - new Date(svc.work_started_at)) / 60000));
  const extra = extraHoursFor(elapsed);
  return { elapsedMinutes: elapsed, remainingMinutes: Math.max(0, INCLUDED_MINUTES - elapsed), extraHours: extra, charges: chargesFor(svc.service_price, extra) };
}

// ---- Config / salud ----
app.get('/api/health', (req, res) => res.json({ ok: true, paymentMode: PAYMENT_MODE }));
app.get('/api/config', (req, res) => res.json({ paymentMode: PAYMENT_MODE, mpPublicKey: MP_PUBLIC_KEY || null, categories: CATEGORIES, includedMinutes: INCLUDED_MINUTES }));
app.get('/api/pricing', (req, res) => {
  const price = Number(req.query.servicePrice || 0);
  const extra = Number(req.query.extraHours || 0);
  if (!price || price <= 0) return res.status(400).json({ error: 'servicePrice debe ser mayor a 0.' });
  res.json(chargesFor(price, extra));
});

// ---- Auth: registro propio, contraseña con hash, nunca en texto plano ----
app.post('/api/auth/register', (req, res) => {
  const { name, phone, email, password, role } = req.body || {};
  if (!name || !phone || !email || !password || !['busco','ofrezco'].includes(role))
    return res.status(400).json({ error: 'Faltan datos: nombre, teléfono, correo, contraseña y rol (busco u ofrezco).' });
  if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(String(email).toLowerCase()))
    return res.status(409).json({ error: 'Ese correo ya está registrado. Inicia sesión.' });
  const hash = bcrypt.hashSync(String(password), 10);
  const r = db.prepare('INSERT INTO users (name, phone, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)')
    .run(name, phone, String(email).toLowerCase(), hash, role, now());
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash))
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  res.json({ token: sign(user), user: publicUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

// ---- Subida de foto (perfil o chat) ----
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/api/upload', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna foto.' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ---- Profesionales (solo datos públicos; sin dirección exacta ni teléfono) ----
app.post('/api/professionals', auth, (req, res) => {
  if (req.user.role !== 'ofrezco') return res.status(403).json({ error: 'Solo una cuenta de "Ofrezco un oficio" puede crear un perfil de profesional.' });
  const { trade, zone, rate, experience, eta_text, distance_km, photo_url } = req.body || {};
  if (!trade || !zone || !rate) return res.status(400).json({ error: 'Faltan oficio, zona y tarifa.' });
  const existing = db.prepare('SELECT * FROM professionals WHERE user_id=?').get(req.user.id);
  if (existing) {
    db.prepare('UPDATE professionals SET trade=?, zone=?, rate=?, experience=?, eta_text=?, distance_km=?, photo_url=? WHERE user_id=?')
      .run(trade, zone, Number(rate), experience || '', eta_text || 'Disponible', Number(distance_km) || 1.0, photo_url || existing.photo_url, req.user.id);
    return res.json({ professional: proWithRating(db.prepare('SELECT * FROM professionals WHERE user_id=?').get(req.user.id)) });
  }
  const r = db.prepare('INSERT INTO professionals (user_id, trade, zone, rate, experience, eta_text, distance_km, photo_url, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, trade, zone, Number(rate), experience || '', eta_text || 'Disponible', Number(distance_km) || 1.0, photo_url || '', now());
  res.status(201).json({ professional: proWithRating(db.prepare('SELECT * FROM professionals WHERE id=?').get(r.lastInsertRowid)) });
});
app.get('/api/professionals', (req, res) => {
  // Sin registro previo no hay profesionales: empieza en CERO, sin ficticios.
  let rows = db.prepare('SELECT p.*, u.name FROM professionals p JOIN users u ON u.id=p.user_id WHERE p.available=1 ORDER BY p.distance_km ASC').all();
  if (req.query.trade) rows = rows.filter(r => r.trade === req.query.trade);
  if (req.query.search) rows = rows.filter(r => (r.trade + ' ' + r.name + ' ' + r.zone).toLowerCase().includes(String(req.query.search).toLowerCase()));
  res.json({ professionals: rows.map(r => { const { user_id, ...pub } = proWithRating(r); return pub; }) });
});
app.get('/api/professionals/me', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM professionals WHERE user_id=?').get(req.user.id);
  res.json({ professional: row ? proWithRating(row) : null });
});

// ---- Swipe / Match ----
app.post('/api/swipes', auth, (req, res) => {
  const { professionalId, action } = req.body || {};
  if (!['liked','passed'].includes(action)) return res.status(400).json({ error: 'Acción inválida.' });
  const pro = db.prepare('SELECT * FROM professionals WHERE id=?').get(professionalId);
  if (!pro) return res.status(404).json({ error: 'Profesional no encontrado.' });
  if (pro.user_id === req.user.id) return res.status(400).json({ error: 'No puedes deslizar tu propio perfil.' });
  db.prepare('INSERT OR REPLACE INTO swipes (client_id, professional_id, action, created_at) VALUES (?,?,?,?)')
    .run(req.user.id, professionalId, action, now());
  if (action !== 'liked') return res.json({ matched: false });
  let conv = db.prepare('SELECT * FROM conversations WHERE client_id=? AND professional_id=?').get(req.user.id, professionalId);
  if (!conv) {
    const r = db.prepare('INSERT INTO conversations (client_id, professional_id, created_at) VALUES (?,?,?)').run(req.user.id, professionalId, now());
    conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(r.lastInsertRowid);
  }
  res.json({ matched: true, conversationId: conv.id });
});

// ---- Chat ----
function conversationFor(user, id) {
  const c = db.prepare('SELECT * FROM conversations WHERE id=?').get(id);
  if (!c) return null;
  if (c.client_id !== user.id && db.prepare('SELECT user_id FROM professionals WHERE id=?').get(c.professional_id)?.user_id !== user.id) return null;
  return c;
}
app.get('/api/conversations', auth, (req, res) => {
  const rows = db.prepare(`SELECT c.*, u1.name client_name, u2.name pro_name, p.trade
    FROM conversations c JOIN users u1 ON u1.id=c.client_id
    JOIN professionals p ON p.id=c.professional_id JOIN users u2 ON u2.id=p.user_id
    WHERE c.client_id=? OR p.user_id=? ORDER BY c.id DESC`).all(req.user.id, req.user.id);
  res.json({ conversations: rows.map(c => ({ ...c, last: db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1').get(c.id) || null })) });
});
app.get('/api/conversations/:id/messages', auth, (req, res) => {
  const conv = conversationFor(req.user, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Chat no encontrado.' });
  res.json({ messages: db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id ASC').all(conv.id) });
});
app.post('/api/conversations/:id/messages', auth, (req, res) => {
  const conv = conversationFor(req.user, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Chat no encontrado.' });
  const { text, image_url } = req.body || {};
  if (!text && !image_url) return res.status(400).json({ error: 'Escribe un mensaje o adjunta una foto.' });
  const r = db.prepare('INSERT INTO messages (conversation_id, sender_id, text, image_url, kind, created_at) VALUES (?,?,?,?,?,?)')
    .run(conv.id, req.user.id, text || '', image_url || '', image_url ? 'image' : 'text', now());
  res.status(201).json({ message: db.prepare('SELECT * FROM messages WHERE id=?').get(r.lastInsertRowid) });
});
// Cotización (la envía el profesional) y confirmación (la hace el cliente)
app.post('/api/conversations/:id/quote', auth, (req, res) => {
  const conv = conversationFor(req.user, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Chat no encontrado.' });
  const pro = db.prepare('SELECT * FROM professionals WHERE id=?').get(conv.professional_id);
  if (pro.user_id !== req.user.id) return res.status(403).json({ error: 'Solo el profesional puede enviar la cotización.' });
  const price = Number(req.body?.price);
  if (!price || price <= 0) return res.status(400).json({ error: 'La cotización necesita un precio mayor a 0.' });
  const eta = Number(req.body?.etaMin || 40);
  const text = `El precio sería $${price}. Puedo llegar en ${eta} min.`;
  const r = db.prepare('INSERT INTO messages (conversation_id, sender_id, text, image_url, kind, created_at) VALUES (?,?,?,?,?,?)')
    .run(conv.id, req.user.id, text, '', 'quote:' + price, now());
  res.status(201).json({ message: db.prepare('SELECT * FROM messages WHERE id=?').get(r.lastInsertRowid), quotePrice: price });
});
app.post('/api/conversations/:id/confirm', auth, (req, res) => {
  const conv = conversationFor(req.user, req.params.id);
  if (!conv) return res.status(404).json({ error: 'Chat no encontrado.' });
  if (conv.client_id !== req.user.id) return res.status(403).json({ error: 'Solo el cliente confirma el servicio.' });
  const quote = db.prepare("SELECT * FROM messages WHERE conversation_id=? AND kind LIKE 'quote:%' ORDER BY id DESC LIMIT 1").get(conv.id);
  if (!quote) return res.status(400).json({ error: 'Primero el profesional debe enviar una cotización.' });
  const price = Number(quote.kind.split(':')[1]);
  const pro = db.prepare('SELECT * FROM professionals WHERE id=?').get(conv.professional_id);
  const r = db.prepare(`INSERT INTO services (conversation_id, client_id, professional_id, title, category, service_price, status, payment_status, created_at)
    VALUES (?,?,?,?,?,?,'confirmado','pending',?)`).run(conv.id, conv.client_id, conv.professional_id, `${pro.trade} — ${req.user.name}`, pro.trade, price, now());
  db.prepare('INSERT INTO messages (conversation_id, sender_id, text, image_url, kind, created_at) VALUES (?,?,?,?,?,?)')
    .run(conv.id, req.user.id, 'Perfecto, confirmado 👍', '', 'text', now());
  res.status(201).json({ service: db.prepare('SELECT * FROM services WHERE id=?').get(r.lastInsertRowid) });
});

// ---- Servicios / Pago seguro (solo tarjeta, cero efectivo) ----
function serviceFor(user, id) {
  const s = db.prepare('SELECT * FROM services WHERE id=?').get(id);
  if (!s) return null;
  const proUser = db.prepare('SELECT user_id FROM professionals WHERE id=?').get(s.professional_id)?.user_id;
  if (s.client_id !== user.id && proUser !== user.id) return null;
  return s;
}
app.get('/api/services', auth, (req, res) => {
  const rows = db.prepare(`SELECT s.*, u.name pro_name, p.trade FROM services s
    JOIN professionals p ON p.id=s.professional_id JOIN users u ON u.id=p.user_id
    WHERE s.client_id=? OR p.user_id=? ORDER BY s.id DESC`).all(req.user.id, req.user.id);
  res.json({ services: rows.map(s => ({ ...s, charges: chargesFor(s.service_price, trackingInfo(s).extraHours), tracking: trackingInfo(s) })) });
});
app.get('/api/services/:id', auth, (req, res) => {
  const s = serviceFor(req.user, req.params.id);
  if (!s) return res.status(404).json({ error: 'Servicio no encontrado.' });
  res.json({ service: { ...s, charges: chargesFor(s.service_price, trackingInfo(s).extraHours), tracking: trackingInfo(s) } });
});
app.post('/api/services/:id/pay', auth, async (req, res) => {
  const s = serviceFor(req.user, req.params.id);
  if (!s) return res.status(404).json({ error: 'Servicio no encontrado.' });
  if (s.client_id !== req.user.id) return res.status(403).json({ error: 'Solo el cliente paga el servicio.' });
  if (s.payment_status === 'paid') return res.json({ service: s, mode: s.payment_mode, alreadyPaid: true });
  const charges = chargesFor(s.service_price, 0);
  // MODO DEMO: sin token de Mercado Pago no hay cobro real. Se marca como
  // pago de prueba, etiquetado claramente, y NUNCA se finge un cobro real.
  if (!MP_TOKEN) {
    db.prepare("UPDATE services SET payment_status='paid', payment_mode='demo' WHERE id=?").run(s.id);
    return res.json({ mode: 'demo', demo: true, message: 'MODO DE PRUEBA: no hay token de Mercado Pago, el pago quedó registrado como prueba y NO se cobró de verdad.', charges, service: db.prepare('SELECT * FROM services WHERE id=?').get(s.id) });
  }
  try {
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + MP_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ title: s.title, quantity: 1, unit_price: charges.total, currency_id: 'MXN' }],
        back_urls: { success: (process.env.PUBLIC_URL || '') + '/mis-servicios', failure: (process.env.PUBLIC_URL || '') + '/mis-servicios' },
        auto_return: 'approved',
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Mercado Pago rechazó la preferencia de pago.', detail: data?.message || 'Error de Mercado Pago' });
    db.prepare("UPDATE services SET payment_status='pending_mp', payment_mode='mercadopago', mp_preference_id=?, mp_init_point=? WHERE id=?")
      .run(data.id, data.init_point, s.id);
    res.json({ mode: 'mercadopago', init_point: data.init_point, preference_id: data.id, charges });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo contactar a Mercado Pago.', detail: String(e.message || e) });
  }
});
// Webhook / confirmación manual de pago (Mercado Pago redirige aquí; en demo no se usa)
app.post('/api/services/:id/mark-paid', auth, (req, res) => {
  const s = serviceFor(req.user, req.params.id);
  if (!s) return res.status(404).json({ error: 'Servicio no encontrado.' });
  db.prepare("UPDATE services SET payment_status='paid', tracking_status='confirmado' WHERE id=?").run(s.id);
  res.json({ service: db.prepare('SELECT * FROM services WHERE id=?').get(s.id) });
});

// ---- Rastreo tipo Rappi: SOLO después de contratar y pagar ----
app.get('/api/services/:id/tracking', auth, (req, res) => {
  const s = serviceFor(req.user, req.params.id);
  if (!s) return res.status(404).json({ error: 'Servicio no encontrado.' });
  // Privacidad: antes de contratar y pagar NO hay rastreo. Si no, cualquiera
  // sabría dónde vive el profesional y podría ir a buscarlo sin usar el servicio.
  if (s.payment_status !== 'paid') return res.status(403).json({ error: 'El rastreo se activa cuando el servicio ya está contratado y pagado.' });
  const info = trackingInfo(s);
  res.json({ serviceId: s.id, status: s.tracking_status || 'confirmado', etaMin: s.tracking_eta_min ?? null, steps: TRACKING_STEPS, labels: TRACKING_LABELS, ...info, charges: chargesFor(s.service_price, info.extraHours) });
});
app.post('/api/services/:id/tracking', auth, (req, res) => {
  const s = serviceFor(req.user, req.params.id);
  if (!s) return res.status(404).json({ error: 'Servicio no encontrado.' });
  const proUser = db.prepare('SELECT user_id FROM professionals WHERE id=?').get(s.professional_id)?.user_id;
  if (proUser !== req.user.id) return res.status(403).json({ error: 'Solo el profesional actualiza el avance del servicio.' });
  if (s.payment_status !== 'paid') return res.status(403).json({ error: 'El rastreo se activa cuando el servicio ya está contratado y pagado.' });
  const { status, etaMin } = req.body || {};
  if (!TRACKING_STEPS.includes(status)) return res.status(400).json({ error: 'Estado inválido.' });
  const patch = { status, eta: etaMin != null ? Number(etaMin) : s.tracking_eta_min };
  if (status === 'trabajando' && !s.work_started_at) patch.started = now();
  if (status === 'terminado' && !s.work_ended_at) patch.ended = now();
  db.prepare('UPDATE services SET tracking_status=?, tracking_eta_min=?, work_started_at=COALESCE(work_started_at,?), work_ended_at=COALESCE(work_ended_at,?) WHERE id=?')
    .run(patch.status, patch.eta, patch.started || null, patch.ended || null, s.id);
  const updated = db.prepare('SELECT * FROM services WHERE id=?').get(s.id);
  res.json({ service: updated, tracking: trackingInfo(updated) });
});
// Aviso al cliente 5 minutos antes de las 2 horas (a la 1 h 55). Una sola vez.
app.post('/api/services/:id/check-warning', auth, (req, res) => {
  const s = serviceFor(req.user, req.params.id);
  if (!s) return res.status(404).json({ error: 'Servicio no encontrado.' });
  if (!s.work_started_at || s.warned_1h55) return res.json({ warned: false, already: !!s.warned_1h55 });
  const elapsed = Math.floor((Date.now() - new Date(s.work_started_at)) / 60000);
  if (elapsed < 115) return res.json({ warned: false, elapsedMinutes: elapsed });
  db.prepare('UPDATE services SET warned_1h55=1 WHERE id=?').run(s.id);
  db.prepare('INSERT INTO messages (conversation_id, sender_id, text, image_url, kind, created_at) VALUES (?,?,?,?,?,?)')
    .run(s.conversation_id, s.client_id, '⏰ Te quedan 5 minutos de las 2 horas incluidas. Si el servicio continúa, se cobrarán $250 por cada hora extra ($200 del servicio + $50 de comisión).', '', 'warning', now());
  res.json({ warned: true, elapsedMinutes: elapsed });
});

// ---- Calificación: solo reseñas reales, solo después de terminar ----
app.post('/api/services/:id/review', auth, (req, res) => {
  const s = serviceFor(req.user, req.params.id);
  if (!s) return res.status(404).json({ error: 'Servicio no encontrado.' });
  if (s.client_id !== req.user.id) return res.status(403).json({ error: 'Solo el cliente califica el servicio.' });
  if (s.tracking_status !== 'terminado') return res.status(400).json({ error: 'Solo se puede calificar un servicio terminado.' });
  const stars = Number(req.body?.stars);
  if (![1,2,3,4,5].includes(stars)) return res.status(400).json({ error: 'La calificación es de 1 a 5 estrellas.' });
  try {
    db.prepare('INSERT INTO reviews (service_id, professional_id, client_id, stars, comment, created_at) VALUES (?,?,?,?,?,?)')
      .run(s.id, s.professional_id, s.client_id, stars, req.body?.comment || '', now());
  } catch { return res.status(409).json({ error: 'Este servicio ya fue calificado.' }); }
  res.status(201).json({ ok: true });
});

// ---- Solicitudes (Modo Emergencia y normales) ----
app.post('/api/requests', auth, (req, res) => {
  const { title, category, zone, budget, urgency, kind } = req.body || {};
  if (!title || !category || !zone) return res.status(400).json({ error: 'Faltan título, categoría y zona.' });
  const r = db.prepare('INSERT INTO requests (client_id, title, category, zone, budget, urgency, kind, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.user.id, title, category, zone, budget || null, urgency || '', kind || 'normal', now());
  res.status(201).json({ request: db.prepare('SELECT * FROM requests WHERE id=?').get(r.lastInsertRowid) });
});
app.get('/api/requests', auth, (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.name client_name FROM requests r JOIN users u ON u.id=r.client_id
    WHERE r.status='abierta' OR r.client_id=? ORDER BY r.id DESC`).all(req.user.id);
  res.json({ requests: rows });
});
app.post('/api/requests/:id/respond', auth, (req, res) => {
  const rq = db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.id);
  if (!rq) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (req.user.role !== 'ofrezco') return res.status(403).json({ error: 'Solo un profesional responde solicitudes.' });
  const pro = db.prepare('SELECT * FROM professionals WHERE user_id=?').get(req.user.id);
  if (!pro) return res.status(400).json({ error: 'Primero crea tu perfil de profesional.' });
  if (req.body?.accept) {
    db.prepare("UPDATE requests SET status='aceptada', professional_id=? WHERE id=?").run(pro.id, rq.id);
    let conv = db.prepare('SELECT * FROM conversations WHERE client_id=? AND professional_id=?').get(rq.client_id, pro.id);
    if (!conv) { const r = db.prepare('INSERT INTO conversations (client_id, professional_id, created_at) VALUES (?,?,?)').run(rq.client_id, pro.id, now()); conv = { id: r.lastInsertRowid }; }
    return res.json({ ok: true, conversationId: conv.id });
  }
  db.prepare("UPDATE requests SET status='rechazada' WHERE id=?").run(rq.id);
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`OfiMatch real en http://localhost:${PORT} — pago: ${PAYMENT_MODE}`));
