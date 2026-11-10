// Smoke test de OfiMatch real. Levanta el servidor en un puerto de prueba
// con su propia base temporal y verifica el flujo completo.
// Uso: npm run smoke   (requiere dependencias instaladas)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const BASE = `http://localhost:${PORT}`;
let failures = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ' — ' + extra : '')); if (!cond) failures++; }
async function req(p, opts = {}, token) {
  const r = await fetch(BASE + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}
(async () => {
  // Base temporal: no toca data/ofimatch.db
  const tmp = path.join(__dirname, '..', 'data', 'smoke.db');
  try { fs.unlinkSync(tmp); } catch {}
  const env = { ...process.env, PORT: String(PORT) };
  // El servidor usa data/ofimatch.db; para el smoke lo renombramos temporalmente si existe
  const realDb = path.join(__dirname, '..', 'data', 'ofimatch.db');
  const bakDb = realDb + '.bak-smoke';
  const hadReal = fs.existsSync(realDb);
  if (hadReal) fs.renameSync(realDb, bakDb);
  const child = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: 'pipe' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    let up = false;
    for (let i = 0; i < 30; i++) { await wait(500); try { const r = await fetch(BASE + '/api/health'); if (r.ok) { up = true; break; } } catch {} }
    check('servidor arranca y /api/health responde', up);
    if (!up) { console.log(child.stderr?.toString()); process.exit(1); }

    // 1. Fórmula de cobro: ejemplo $600 -> IVA $96, MP $28, total $874
    const pr = await req('/api/pricing?servicePrice=600&extraHours=0');
    check('pricing $600: IVA 96', pr.d.iva === 96, JSON.stringify(pr.d));
    check('pricing $600: comisión MP 28', pr.d.mpFee === 28, JSON.stringify(pr.d));
    check('pricing $600: total 874', pr.d.total === 874, JSON.stringify(pr.d));
    check('pricing $600: comisión $150 libre', pr.d.commissionFixed === 150);

    // 2. Registro y login de ambos roles
    const client = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Ana Cliente', phone: '5511111111', email: 'ana@test.mx', password: 'secreto1', role: 'busco' }) });
    check('registro cliente', client.status === 201, JSON.stringify(client.d));
    const pro = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Bruno Plomero', phone: '5522222222', email: 'bruno@test.mx', password: 'secreto1', role: 'ofrezco' }) });
    check('registro profesional', pro.status === 201, JSON.stringify(pro.d));
    const dup = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'X', phone: '1', email: 'ana@test.mx', password: 'secreto1', role: 'busco' }) });
    check('correo duplicado rechazado', dup.status === 409);
    const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ana@test.mx', password: 'secreto1' }) });
    check('login cliente', login.status === 200 && !!login.d.token);
    const badLogin = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ana@test.mx', password: 'mal' }) });
    check('login con contraseña mala rechazado', badLogin.status === 401);

    // 3. Cero profesionales al inicio: el perfil se crea con registro propio
    const empty = await req('/api/professionals');
    check('sin profesionales al inicio', empty.d.professionals.length === 0, 'n=' + empty.d.professionals.length);
    const prof = await req('/api/professionals', { method: 'POST', body: JSON.stringify({ trade: 'Plomero', zone: 'CDMX', rate: 600, experience: '10 años', eta_text: 'Llegada en 30 min', distance_km: 1.2 }) }, pro.d.token);
    check('profesional crea su perfil', prof.status === 201, JSON.stringify(prof.d));
    const list = await req('/api/professionals?trade=Plomero');
    check('mazo muestra 1 profesional', list.d.professionals.length === 1);
    check('mazo NO expone teléfono del profesional', !('phone' in (list.d.professionals[0] || {})) && !JSON.stringify(list.d).includes('5522222222'));
    check('profesional sin reseñas: avg null', list.d.professionals[0].avg_rating === null);

    // 4. Swipe -> MATCH -> chat -> cotización -> confirmar
    const swipe = await req('/api/swipes', { method: 'POST', body: JSON.stringify({ professionalId: list.d.professionals[0].id, action: 'liked' }) }, client.d.token);
    check('swipe corazón = MATCH', swipe.d.matched === true && !!swipe.d.conversationId, JSON.stringify(swipe.d));
    const conv = swipe.d.conversationId;
    const msg = await req(`/api/conversations/${conv}/messages`, { method: 'POST', body: JSON.stringify({ text: 'Hola, el baño se tapó, ¿podrías venir?' }) }, client.d.token);
    check('chat: cliente escribe', msg.status === 201);
    const quote = await req(`/api/conversations/${conv}/quote`, { method: 'POST', body: JSON.stringify({ price: 600, etaMin: 40 }) }, pro.d.token);
    check('profesional envía cotización $600', quote.status === 201 && quote.d.quotePrice === 600);
    const confirm = await req(`/api/conversations/${conv}/confirm`, { method: 'POST', body: JSON.stringify({}) }, client.d.token);
    check('cliente confirma servicio', confirm.status === 201, JSON.stringify(confirm.d));
    const svcId = confirm.d.service.id;

    // 5. Rastreo BLOQUEADO antes de pagar
    const trackBefore = await req(`/api/services/${svcId}/tracking`, {}, client.d.token);
    check('rastreo bloqueado antes de pagar (403)', trackBefore.status === 403, JSON.stringify(trackBefore.d));
    const trackProBefore = await req(`/api/services/${svcId}/tracking`, { method: 'POST', body: JSON.stringify({ status: 'en_camino' }) }, pro.d.token);
    check('profesional no puede avanzar rastreo antes de pagar', trackProBefore.status === 403);

    // 6. Pago seguro (modo demo, sin token: etiquetado, no es cobro real)
    const pay = await req(`/api/services/${svcId}/pay`, { method: 'POST', body: JSON.stringify({}) }, client.d.token);
    check('pago en modo demo etiquetado', pay.d.mode === 'demo' && pay.d.demo === true, JSON.stringify(pay.d));
    check('pago demo total $874', pay.d.charges.total === 874);

    // 7. Rastreo DESPUÉS de pagar: ambos lados lo ven, profesional lo avanza
    const trackAfter = await req(`/api/services/${svcId}/tracking`, {}, client.d.token);
    check('rastreo visible después de pagar', trackAfter.status === 200 && trackAfter.d.status === 'confirmado', JSON.stringify(trackAfter.d));
    const adv = await req(`/api/services/${svcId}/tracking`, { method: 'POST', body: JSON.stringify({ status: 'en_camino', etaMin: 30 }) }, pro.d.token);
    check('profesional marca en camino con ETA 30', adv.status === 200 && adv.d.service.tracking_status === 'en_camino');
    const adv2 = await req(`/api/services/${svcId}/tracking`, { method: 'POST', body: JSON.stringify({ status: 'trabajando' }) }, pro.d.token);
    check('profesional marca trabajando (inicia temporizador)', adv2.status === 200 && !!adv2.d.service.work_started_at);
    const warn = await req(`/api/services/${svcId}/check-warning`, { method: 'POST', body: JSON.stringify({}) }, client.d.token);
    check('aviso 1h55 NO se dispara antes de tiempo', warn.d.warned === false, JSON.stringify(warn.d));
    const done = await req(`/api/services/${svcId}/tracking`, { method: 'POST', body: JSON.stringify({ status: 'terminado' }) }, pro.d.token);
    check('profesional marca terminado', done.status === 200);

    // 8. Calificación solo con reseña real, después de terminar
    const rev = await req(`/api/services/${svcId}/review`, { method: 'POST', body: JSON.stringify({ stars: 5, comment: 'Llegó puntual, muy profesional.' }) }, client.d.token);
    check('cliente califica 5 estrellas', rev.status === 201, JSON.stringify(rev.d));
    const list2 = await req('/api/professionals?trade=Plomero');
    check('rating ahora es 5.0 (1 reseña real)', list2.d.professionals[0].avg_rating === 5 && list2.d.professionals[0].review_count === 1);

    // 9. Horas extra: fórmula con 1 hora extra
    const pr2 = await req('/api/pricing?servicePrice=600&extraHours=1');
    check('1 hora extra: base 800, IVA 128, MP 37, total 1165', pr2.d.total === 1165 && pr2.d.iva === 128 && pr2.d.mpFee === 37, JSON.stringify(pr2.d));

    // 10. Páginas principales sirven
    const home = await fetch(BASE + '/');
    check('página principal sirve (HTML)', home.ok && (await home.text()).includes('OfiMatch'));
    const prices = await fetch(BASE + '/service-prices.js');
    const pricesText = prices.ok ? await prices.text() : '';
    check('cotizaciones de referencia sirven', prices.ok && pricesText.includes('SERVICE_PRICES') && pricesText.includes('Desazolve de baño'));
    check('cotizaciones cubren los 12 oficios', ['Plomero', 'Electricista', 'Aire Acondicionado', 'Carpintero', 'Pintor', 'Albañil', 'Limpieza', 'Mecánico', 'Tecnología', 'Mudanzas', 'Jardinería', 'Más servicios'].every(t => pricesText.includes('"' + t + '"')));
  } finally {
    child.kill();
    await wait(500);
    try { fs.unlinkSync(realDb); } catch {}
    if (hadReal) fs.renameSync(bakDb, realDb);
  }
  console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FALLÓ: ${failures} checks`);
  process.exit(failures === 0 ? 0 : 1);
})();
