// Prospectos ficticios de OfiMatch: un perfil de ejemplo por oficio, para
// que el mazo no se vea vacío mientras llegan los primeros profesionales
// reales. Cada uno queda marcado como ejemplo (is_example=1) y la app lo
// muestra con el distintivo "🧪 Prospecto de ejemplo".
//
// Uso (contra el sitio en vivo o local):
//   OFIMATCH_URL=https://ofimatch-real-production.up.railway.app node scripts/seed-prospects.js
// Sin OFIMATCH_URL usa http://localhost:3000.
// Es seguro correrlo varias veces: salta los oficios que ya tienen un
// prospecto de ejemplo. Las cuentas son solo de ejemplo y comparten una
// contraseña de demostración (PROSPECT_PASSWORD o la de abajo); no son
// cuentas reales y no deben usarse para contratar de verdad.
const BASE = (process.env.OFIMATCH_URL || 'http://localhost:3000').replace(/\/$/, '');
const PASSWORD = process.env.PROSPECT_PASSWORD || 'Prospecto-Ejemplo-2026';

const PROSPECTS = [
  { name: 'Carlos Hernández', trade: 'Plomero', zone: 'Miguel Hidalgo, CDMX', rate: 350, years: 10, eta: 'Llegada en 30 min', dist: 1.2, ai: true },
  { name: 'Miguel Torres', trade: 'Electricista', zone: 'Benito Juárez, CDMX', rate: 350, years: 8, eta: 'Llegada en 40 min', dist: 0.8 },
  { name: 'Jorge Ramírez', trade: 'Aire Acondicionado', zone: 'Coyoacán, CDMX', rate: 800, years: 6, eta: 'Llegada en 45 min', dist: 1.5 },
  { name: 'José Martínez', trade: 'Carpintero', zone: 'Azcapotzalco, CDMX', rate: 450, years: 12, eta: 'Llegada en 50 min', dist: 2.1 },
  { name: 'Luis García', trade: 'Pintor', zone: 'Iztapalapa, CDMX', rate: 400, years: 7, eta: 'Llegada en 35 min', dist: 1.0 },
  { name: 'Pedro Sánchez', trade: 'Albañil', zone: 'Gustavo A. Madero, CDMX', rate: 350, years: 15, eta: 'Llegada en 60 min', dist: 2.4 },
  { name: 'María López', trade: 'Limpieza', zone: 'Cuauhtémoc, CDMX', rate: 600, years: 5, eta: 'Llegada en 25 min', dist: 0.6 },
  { name: 'Ricardo Flores', trade: 'Mecánico', zone: 'Tlalpan, CDMX', rate: 400, years: 9, eta: 'Llegada en 40 min', dist: 1.8 },
  { name: 'Daniel Ruiz', trade: 'Tecnología', zone: 'Álvaro Obregón, CDMX', rate: 400, years: 4, eta: 'Llegada en 30 min', dist: 0.9 },
  { name: 'Alejandro Vega', trade: 'Mudanzas', zone: 'Iztacalco, CDMX', rate: 800, years: 6, eta: 'Llegada en 60 min', dist: 3.0 },
  { name: 'Fernando Díaz', trade: 'Jardinería', zone: 'Xochimilco, CDMX', rate: 400, years: 11, eta: 'Llegada en 45 min', dist: 1.3 },
  { name: 'Ana Morales', trade: 'Más servicios', zone: 'Venustiano Carranza, CDMX', rate: 400, years: 3, eta: 'Llegada en 30 min', dist: 1.1 },
];

async function req(path, opts = {}, token) {
  const r = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}

(async () => {
  const list = await req('/api/professionals');
  if (list.status !== 200) { console.error('No se pudo leer profesionales:', list.status, JSON.stringify(list.d)); process.exit(1); }
  const existingExampleTrades = new Set((list.d.professionals || []).filter(p => p.is_example).map(p => p.trade));
  console.log(`Profesionales actuales: ${list.d.professionals.length} (${existingExampleTrades.size} ejemplos)`);
  let created = 0, skipped = 0;
  for (let i = 0; i < PROSPECTS.length; i++) {
    const p = PROSPECTS[i];
    // Carlos (Plomero) además responde con IA: aunque ya exista su perfil,
    // siempre se actualiza para activar ai_reply.
    if (existingExampleTrades.has(p.trade) && !p.ai) { console.log(`SKIP ${p.trade}: ya tiene prospecto de ejemplo`); skipped++; continue; }
    const slug = p.trade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '-');
    const email = `prospecto-${slug}@ejemplo.ofimatch.mx`;
    const phone = '55000000' + String(10 + i);
    let token;
    const reg = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: p.name, phone, email, password: PASSWORD, role: 'ofrezco' }) });
    if (reg.status === 201) token = reg.d.token;
    else if (reg.status === 409) {
      const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) });
      if (login.status !== 200) { console.error(`FAIL ${p.trade}: no se pudo entrar a la cuenta ${email}`); continue; }
      token = login.d.token;
    } else { console.error(`FAIL ${p.trade}: registro ${reg.status}`, JSON.stringify(reg.d)); continue; }
    const prof = await req('/api/professionals', { method: 'POST', body: JSON.stringify({ trade: p.trade, zone: p.zone, rate: p.rate, experience: `Prospecto ficticio (ejemplo) · ${p.years} años de experiencia`, eta_text: p.eta, distance_km: p.dist, is_example: true, ai_reply: !!p.ai }) }, token);
    if (prof.status === 201 || prof.status === 200) { console.log(`OK ${p.trade}: ${p.name} — desde $${p.rate} — ${p.dist} km`); created++; }
    else console.error(`FAIL ${p.trade}: perfil ${prof.status}`, JSON.stringify(prof.d));
  }
  console.log(`\nListo: ${created} creados, ${skipped} ya existían.`);
})();
