// OfiMatch frontend — vanilla JS. La fórmula de cobro vive en el servidor
// (/api/pricing); aquí solo se muestra lo que el servidor calcula.
const API = '';
let token = localStorage.getItem('ofimatch_token') || '';
let me = null, config = {}, pros = [], currentConv = null, currentService = null, currentPro = null, rateStars = 5, trackTimer = null;
const $ = id => document.getElementById(id);
const money = n => '$' + Number(n || 0).toLocaleString('es-MX');
async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Error ' + r.status);
  return data;
}
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const map = { home: 'screen-home', deck: 'screen-deck', match: 'screen-match', chat: 'screen-chat', services: 'screen-services', pay: 'screen-pay', track: 'screen-track', rate: 'screen-rate', pro: 'screen-pro', profile: 'screen-profile', auth: 'screen-auth' };
  (document.getElementById(map[name] || 'screen-home') || {}).classList?.add('active');
  if (name === 'services') loadServices();
  if (name === 'pro') loadProView();
  if (name === 'profile') loadProfile();
  if (name === 'home') loadPros();
  if (name === 'chat' && !currentConv) loadConversations();
}
async function openConversations() {
  currentConv = null;
  $('chatBox').innerHTML = ''; $('quoteBox').innerHTML = '';
  $('convList').style.display = ''; $('backToConvs').style.display = 'none';
  show('chat'); // show() carga la lista de conversaciones
}
async function loadConversations() {
  try {
    const d = await api('/api/conversations');
    const list = d.conversations || [];
    $('convList').innerHTML = list.length ? list.map(c => {
      const other = me.role === 'ofrezco' ? c.client_name : c.pro_name;
      const last = c.last && c.last.text ? c.last.text : 'Sin mensajes aún';
      return `<div class="card" onclick="openChat(${c.id})" style="cursor:pointer"><b>${other}</b> — ${c.trade}<br><span class="muted">${last}</span></div>`;
    }).join('') : '<div class="card"><p>No tienes conversaciones todavía. Haz match con un profesional desde Inicio.</p></div>';
  } catch (e) { $('convList').innerHTML = e.message; }
}
async function init() {
  config = await api('/api/config');
  $('payMode').innerHTML = config.paymentMode === 'demo'
    ? '<div class="demo">MODO DE PRUEBA: sin token de Mercado Pago. Los pagos se registran como prueba y NO se cobran de verdad.</div>'
    : '<div class="card">Pago real con Mercado Pago (solo tarjeta).</div>';
  const cats = [['Plomero','🚰'],['Electricista','⚡'],['Aire Acondicionado','❄️'],['Carpintero','🔨'],['Pintor','🎨'],['Albañil','🧱'],['Limpieza','🧹'],['Mecánico','🔧'],['Tecnología','💻'],['Mudanzas','📦'],['Jardinería','🌿'],['Más servicios','⋯']];
  $('cats').innerHTML = cats.map(([c, e]) => `<div class="cat" onclick="openDeck('${c}')"><b>${e}</b>${c}</div>`).join('');
  if (typeof SERVICE_PRICES !== 'undefined') {
    $('priceList').innerHTML = '<div class="card"><h3>💰 Cotizaciones de referencia</h3><p class="muted">Precios de referencia por oficio. Toca una categoría para ver sus servicios más comunes.</p>' + cats.map(([c]) => { const l = SERVICE_PRICES[c]; return l ? `<p><b>${c}</b> — desde ${money(Math.min(...l.map(s => s.price)))}</p>` : ''; }).join('') + '</div>';
  }
  if (token) { try { me = (await api('/api/auth/me')).user; } catch { token = ''; localStorage.removeItem('ofimatch_token'); } }
  if (me) { $('who').textContent = me.name; $('logoutBtn').style.display = ''; show('home'); } else show('auth');
}
async function register() {
  try { const d = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: $('a-name').value, phone: $('a-phone').value, email: $('a-email').value, password: $('a-pass').value, role: $('a-role').value }) }); token = d.token; localStorage.setItem('ofimatch_token', token); me = d.user; init(); }
  catch (e) { $('authMsg').textContent = e.message; }
}
async function login() {
  try { const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('a-email').value, password: $('a-pass').value }) }); token = d.token; localStorage.setItem('ofimatch_token', token); me = d.user; init(); }
  catch (e) { $('authMsg').textContent = e.message; }
}
$('logoutBtn').onclick = () => { token = ''; me = null; localStorage.removeItem('ofimatch_token'); location.reload(); };
async function loadPros() {
  try { const q = $('search').value; const d = await api('/api/professionals' + (q ? '?search=' + encodeURIComponent(q) : '')); pros = d.professionals;
    $('nearby').innerHTML = pros.length ? '<div class="card"><h3>Profesionales cercanos</h3>' + pros.slice(0, 4).map(p => `<p><b>${p.name}</b>${p.is_example ? ' 🧪 Ejemplo' : ''}${p.ai_reply ? ' 🤖 Responde con IA' : ''} — ${p.trade} · ${p.distance_km} km · ${p.avg_rating ? '★' + p.avg_rating + ' (' + p.review_count + ')' : 'Sin reseñas aún'} · Desde ${money(p.rate)}</p>`).join('') + '</div>' : '<div class="card"><p>No hay profesionales todavía. Sé el primero en registrarte como profesional.</p></div>';
  } catch (e) { $('nearby').innerHTML = '<div class="card">' + e.message + '</div>'; }
}
function priceListHTML(trade) {
  const list = (typeof SERVICE_PRICES !== 'undefined' && SERVICE_PRICES[trade]) || [];
  if (!list.length) return '';
  return '<div class="card"><h3>💰 Cotizaciones — ' + trade + '</h3><p class="muted">Servicios más comunes. Precios de referencia desde $; el profesional confirma la cotización final en el chat.</p>' + list.map(s => '<p><b>' + s.name + '</b> — Desde ' + money(s.price) + '</p>').join('') + '</div>';
}
function openDeck(trade) { $('deckTitle').textContent = trade + ' cerca de ti'; renderDeck(pros.filter(p => p.trade === trade)); $('deckPrices').innerHTML = priceListHTML(trade); show('deck'); }
function renderDeck(list) {
  if (!list.length) { $('deck').innerHTML = '<div class="card">No hay profesionales de este oficio todavía.</div>'; return; }
  const p = list[0]; currentPro = p;
  $('deck').innerHTML = `<div class="deck-card"><div class="deck-photo">${p.photo_url ? `<img src="${p.photo_url}">` : ''}<div class="inner"><span class="badge">Disponible ahora</span>${p.is_example ? ' <span class="badge">🧪 Prospecto de ejemplo</span>' : ''}${p.ai_reply ? ' <span class="badge">🤖 Responde con IA</span>' : ''}<h2 style="margin:6px 0 0">${p.name}</h2><p>${p.trade} · 📍 ${p.distance_km} km · ${p.avg_rating ? '★' + p.avg_rating + ' (' + p.review_count + ')' : 'Sin reseñas aún'}</p></div></div>
  <div style="padding:14px"><span class="chip">${p.eta_text || 'Disponible'}</span> <span class="chip">Desde ${money(p.rate)}</span><p class="muted">${p.experience || ''} · ${p.zone}</p>
  <div class="swipe-row"><button onclick="swipe('passed')" style="color:#ef4444">✕</button><button onclick="alert('Oficio: ${p.trade}\\nZona: ${p.zone}\\nTarifa desde ${money(p.rate)}\\n${p.experience || ''}')" style="color:#2563eb">i</button><button onclick="swipe('liked')" style="color:#22c55e">♥</button></div></div></div>`;
}
async function swipe(action) {
  try { const d = await api('/api/swipes', { method: 'POST', body: JSON.stringify({ professionalId: currentPro.id, action }) });
    if (d.matched) { currentConv = d.conversationId; $('matchText').textContent = 'Tú y ' + currentPro.name + ' están listos para trabajar juntos'; show('match'); }
    else { pros = pros.filter(p => p.id !== currentPro.id); renderDeck(pros); }
  } catch (e) { alert(e.message); }
}
async function openChat(convId) {
  currentConv = convId || currentConv; if (!currentConv) { alert('Primero haz match con un profesional.'); return; }
  show('chat'); $('convList').style.display = 'none'; $('backToConvs').style.display = ''; loadChat();
}
async function loadChat() {
  try { const d = await api('/api/conversations/' + currentConv + '/messages');
    $('chatBox').innerHTML = (d.ai_reply ? `<p class="muted">🤖 ${d.pro_name} responde automáticamente con IA.</p>` : '') + (d.messages.map(m => `<div class="msg ${m.sender_id === me.id ? 'me' : 'them'}">${m.image_url ? `<img src="${m.image_url}">` : ''}${m.text ? m.text : ''}</div>`).join('') || '<p class="muted">Hola, el baño se tapó y necesito ayuda hoy. ¿Podrías venir?</p>');
    const quote = d.messages.filter(m => m.kind.startsWith('quote:')).pop();
    $('quoteBox').innerHTML = quote ? `<div class="quote">Cotización: ${quote.text}<br><button class="btn-blue" onclick="confirmService()">Perfecto, confirmado</button></div>` : (me.role === 'ofrezco' ? `<div class="card"><input id="quotePrice" type="number" placeholder="Precio de la cotización $"><input id="quoteEta" type="number" placeholder="Llegada en minutos (ej. 40)"><button class="btn-primary" onclick="sendQuote()">Enviar cotización</button>${(currentPro && currentPro.trade && typeof SERVICE_PRICES !== 'undefined' && SERVICE_PRICES[currentPro.trade]) ? '<p class="muted">Servicios comunes — toca uno para usar su precio de referencia:</p>' + SERVICE_PRICES[currentPro.trade].map(s => `<button class="chip" onclick="document.getElementById('quotePrice').value=${s.price}">${s.name} — ${money(s.price)}</button>`).join(' ') : ''}</div>` : '');
  } catch (e) { $('chatBox').textContent = e.message; }
}
async function sendMsg() {
  let image_url = ''; const f = $('chatPhoto').files[0];
  if (f) { const fd = new FormData(); fd.append('photo', f); const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }); const d = await r.json(); image_url = d.url || ''; }
  await api('/api/conversations/' + currentConv + '/messages', { method: 'POST', body: JSON.stringify({ text: $('chatText').value, image_url }) });
  $('chatText').value = ''; $('chatPhoto').value = ''; loadChat();
}
async function sendQuote() { await api('/api/conversations/' + currentConv + '/quote', { method: 'POST', body: JSON.stringify({ price: Number($('quotePrice').value), etaMin: Number($('quoteEta').value || 40) }) }); loadChat(); }
async function confirmService() { const d = await api('/api/conversations/' + currentConv + '/confirm', { method: 'POST', body: JSON.stringify({}) }); currentService = d.service; openPay(d.service.id); }
async function openPay(id) { currentService = { id }; show('pay'); const d = await api('/api/services/' + id); const c = d.service.charges;
  $('payBox').innerHTML = `<h3>Servicio de ${d.service.category}</h3><p>${d.service.title} · ${money(d.service.service_price)}</p>
  <p>Precio del servicio: <b>${money(c.servicePrice)}</b><br>Comisión por uso del servicio (libre de comisión, sin IVA): <b>${money(c.commissionFixed)}</b><br>IVA (16%): <b>${money(c.iva)}</b><br>Comisión Mercado Pago (4%): <b>${money(c.mpFee)}</b><br>Total: <b>${money(c.total)}</b></p>
  <p class="muted">Solo con tarjeta por Mercado Pago. Cero efectivo.</p>
  <button class="btn-blue" onclick="pay(${id})">Pagar y confirmar</button>${config.paymentMode === 'demo' ? '<p class="demo">MODO DE PRUEBA: el pago se registrará como prueba, no se cobra de verdad.</p>' : ''}`;
}
async function pay(id) {
  const d = await api('/api/services/' + id + '/pay', { method: 'POST', body: JSON.stringify({}) });
  if (d.mode === 'mercadopago' && d.init_point) { window.open(d.init_point, '_blank'); alert('Completa el pago en Mercado Pago y luego pulsa "Ya pagué" en Mis servicios.'); }
  else { alert(d.message || 'Pago registrado.'); }
  loadServices(); show('services');
}
async function loadServices() {
  try { const d = await api('/api/services');
    $('services').innerHTML = d.services.length ? d.services.map(s => `<div class="card"><b>${s.title}</b> — ${s.status} · Pago: ${s.payment_status}<br>Tiempo trabajado: ${s.tracking.elapsedMinutes} min · quedan ${s.tracking.remainingMinutes} min de las 2 h incluidas<br>Total pagado / acumulado: ${money(s.charges.total)} ${s.payment_status === 'paid' ? '' : '(aún sin pagar)'}<br>
    ${s.payment_status === 'pending' ? `<button class="btn-blue" onclick="openPay(${s.id})">Pagar seguro</button>` : ''}
    ${s.payment_status === 'paid' ? `<button class="btn-primary" onclick="openTrack(${s.id})">📍 Rastrear servicio</button>` : '<p class="muted">El rastreo se activa cuando el servicio ya está contratado y pagado.</p>'}
    ${s.tracking_status === 'terminado' ? `<button class="btn-blue" onclick="openRate(${s.id})">Calificar el servicio</button>` : ''}</div>`).join('') : '<div class="card">No tienes servicios todavía.</div>';
  } catch (e) { $('services').innerHTML = e.message; }
}
async function openTrack(id) {
  currentService = { id }; show('track');
  try { const d = await api('/api/services/' + id + '/tracking');
    try { await api('/api/services/' + id + '/check-warning', { method: 'POST', body: JSON.stringify({}) }); } catch {}
    const steps = d.steps.map(s => `<li class="${d.steps.indexOf(s) < d.steps.indexOf(d.status) ? 'done' : s === d.status ? 'now' : ''}">${d.labels[s]}</li>`).join('');
    $('trackBox').innerHTML = `<div class="card"><div class="map-panel">📍 Mapa — el profesional va en camino hacia tu servicio<br><b>ETA: ${d.etaMin ? d.etaMin + ' min' : '—'}</b></div>
    <ul class="timeline">${steps}</ul>
    <p>Tiempo trabajado: <b>${d.elapsedMinutes} min</b> · Te quedan <b>${d.remainingMinutes} min</b> de las 2 horas incluidas</p>
    ${d.extraHours ? `<div class="notice">Horas extra: ${d.extraHours} · Cobro extra acumulado: ${money(d.extraHours * 250)}</div>` : ''}
    <p>Total acumulado hasta ahora: <b>${money(d.charges.total)}</b></p>
    <div id="warnBox"></div>
    ${me.role === 'ofrezco' ? `<div class="card"><b>Actualiza el avance del servicio</b><br>${d.steps.map(s => `<button class="chip" onclick="markTrack(${id},'${s}')">${d.labels[s]}</button>`).join('')}<br>ETA: ${[15, 30, 45, 60].map(m => `<button class="chip" onclick="markEta(${id},${m})">${m} min</button>`).join('')}</div>` : ''}
    <button class="btn-ghost" onclick="openChatFromService(${id})">Ir al chat</button></div>`;
    if (d.elapsedMinutes >= 115 && d.elapsedMinutes < 120) $('warnBox').innerHTML = '<div class="notice">⏰ Te quedan 5 minutos de las 2 horas incluidas. Si continúa, se cobrarán $250 por cada hora extra.</div>';
  } catch (e) { $('trackBox').innerHTML = '<div class="card">' + e.message + '</div>'; }
}
async function markTrack(id, status) { await api('/api/services/' + id + '/tracking', { method: 'POST', body: JSON.stringify({ status }) }); openTrack(id); }
async function markEta(id, m) { const s = (await api('/api/services/' + id)).service; await api('/api/services/' + id + '/tracking', { method: 'POST', body: JSON.stringify({ status: s.tracking_status || 'confirmado', etaMin: m }) }); openTrack(id); }
async function openChatFromService(id) { const s = (await api('/api/services/' + id)).service; openChat(s.conversation_id); }
function openRate(id) { currentService = { id }; $('stars').innerHTML = [1, 2, 3, 4, 5].map(n => `<button class="${n <= rateStars ? 'on' : ''}" onclick="rateStars=${n};openRate(${id})">★</button>`).join(''); show('rate'); }
async function submitReview() { await api('/api/services/' + currentService.id + '/review', { method: 'POST', body: JSON.stringify({ stars: rateStars, comment: $('rateComment').value }) }); alert('¡Gracias por calificar!'); show('services'); }
async function emergency() {
  const d = await api('/api/requests', { method: 'POST', body: JSON.stringify({ title: $('em-title').value, category: $('em-cat').value, zone: $('em-zone').value, budget: Number($('em-budget').value || 0), urgency: 'Lo necesito en menos de 1 hora', kind: 'emergency' }) });
  alert('Solicitud de emergencia enviada. Se notificará a los profesionales disponibles cerca de ti.'); loadServices();
}
async function savePro() {
  let photo_url = ''; const f = $('p-photo').files[0];
  if (f) { const fd = new FormData(); fd.append('photo', f); const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }); photo_url = (await r.json()).url || ''; }
  const d = await api('/api/professionals', { method: 'POST', body: JSON.stringify({ trade: $('p-trade').value, zone: $('p-zone').value, rate: Number($('p-rate').value), experience: $('p-exp').value, eta_text: $('p-eta').value, distance_km: Number($('p-dist').value || 1), photo_url }) });
  $('proMsg').textContent = 'Perfil guardado: ' + d.professional.trade + ' en ' + d.professional.zone;
}
async function loadProView() { show('pro'); try { const d = await api('/api/requests'); $('requests').innerHTML = '<div class="card"><h3>Solicitudes</h3>' + (d.requests.map(r => `<p><b>${r.title}</b> — ${r.zone} · Hasta ${money(r.budget)} · ${r.status}<br><button class="btn-ghost" onclick="respondReq(${r.id},false)">Rechazar</button> <button class="btn-green" onclick="respondReq(${r.id},true)">Me interesa</button></p>`).join('') || 'No hay solicitudes.') + '</div>'; } catch (e) { $('requests').textContent = e.message; } }
async function respondReq(id, accept) { const d = await api('/api/requests/' + id + '/respond', { method: 'POST', body: JSON.stringify({ accept }) }); if (d.conversationId) openChat(d.conversationId); else loadProView(); }
function toggleRole() { if ($('roleToggle').checked) show('pro'); else show('home'); }
async function loadProfile() { $('profileBox').innerHTML = me ? `<p><b>${me.name}</b><br>${me.email}<br>${me.phone}<br>Rol: ${me.role === 'ofrezco' ? 'Ofrezco un oficio' : 'Busco un oficio'}</p>` : 'Inicia sesión.'; }
init();
