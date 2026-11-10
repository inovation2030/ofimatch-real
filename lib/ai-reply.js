// Respuestas automáticas con IA de OfiMatch (sin servicio externo: el
// propio servidor entiende el mensaje del cliente, lo relaciona con los
// servicios y precios de referencia del oficio, y contesta como el
// profesional). Solo responde en conversaciones cuyo profesional tiene
// ai_reply=1 (hoy solo Carlos, el prospecto de ejemplo de Plomero).
// Devuelve { text, quotePrice } — quotePrice solo cuando el mensaje
// identifica un servicio concreto, para que el cliente pueda confirmarlo
// con el botón de la cotización. Las respuestas se marcan con 🤖 para que
// siempre se vea que son automáticas.
const PLOMERO_SERVICES = [
  { name: 'Desazolve de baño (WC tapado)', price: 600, keys: ['baño', 'wc', 'tapado', 'tapo', 'desazolve', 'inodoro', 'taza'] },
  { name: 'Cambio de llave de lavabo', price: 450, keys: ['llave', 'lavabo', 'grifo', 'mezcladora'] },
  { name: 'Reparación de fuga de agua', price: 500, keys: ['fuga', 'gotea', 'gotera', 'tira agua', 'humedad'] },
  { name: 'Instalación de WC', price: 900, keys: ['instalar wc', 'instalar baño', 'cambiar wc', 'nuevo wc', 'poner wc'] },
  { name: 'Cambio de flotador y herrajes', price: 350, keys: ['flotador', 'herrajes', 'no deja de correr', 'no corta el agua'] },
  { name: 'Destapar drenaje', price: 700, keys: ['drenaje', 'coladera', 'desagüe', 'desague'] },
];

const GENERIC_SERVICES = {
  'Electricista': 'revisión de corto circuito ($600), instalación de contacto ($350) o de lámpara ($450)',
  'Aire Acondicionado': 'mantenimiento preventivo ($800), instalación de minisplit ($2,500) o recarga de gas ($900)',
  'Carpintero': 'reparación de puerta ($600), instalación de repisa ($450) o clóset a la medida ($3,500)',
  'Pintor': 'pintura por m² ($120), pintura de recámara ($2,500) o resane de pared ($400)',
  'Albañil': 'resane de muro ($500), levantar muro ($450 por m²) o impermeabilización ($1,800)',
  'Limpieza': 'limpieza general ($600), limpieza profunda ($1,200) o limpieza post-obra ($1,500)',
  'Mecánico': 'cambio de aceite ($600), afinación completa ($1,200) o cambio de balatas ($900)',
  'Tecnología': 'instalación de WiFi ($500), reparación de celular ($700) o instalación de cámaras ($1,500)',
  'Mudanzas': 'mudanza local ($1,800), mudanza con carga pesada ($2,500) o flete sencillo ($800)',
  'Jardinería': 'corte de pasto ($400), poda de árbol ($800) o diseño de jardín ($1,500)',
  'Más servicios': 'instalación de TV en pared ($500), armado de muebles ($450) o reparación de electrodomésticos ($600)',
};

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function aiReplyFor(trade, text, proName, etaText, hasQuote) {
  const t = norm(text);
  const eta = etaText || 'Llegada en 30 min';
  const name = proName || 'el profesional';
  const money = n => '$' + Number(n).toLocaleString('es-MX');

  if (/\bgracias\b/.test(t)) {
    return { text: `🤖 ¡De nada! Aquí estoy para lo que necesites. Soy ${name}, tu plomero de OfiMatch.`, quotePrice: null };
  }
  if (/\b(si|sí|confirmo|confirmado|va|de acuerdo|perfecto|acepto)\b/.test(t) && hasQuote) {
    return { text: '🤖 ¡Perfecto! Ya tienes la cotización arriba, solo pulsa "Perfecto, confirmado" y pasamos al pago seguro. Te veo pronto.', quotePrice: null };
  }
  if (/\b(cuanto|cuesta|precio|cotiz|vale|tarifa)\b/.test(t) || /\bcuanto\b/.test(t)) {
    const svc = matchService(trade, t);
    if (svc) return { text: `🤖 Claro, ${svc.name.toLowerCase()} te sale desde ${money(svc.price)}. ¿Te lo confirmo? Puedo llegar en ${eta.toLowerCase().replace('llegada en ', '')}.`, quotePrice: svc.price };
    return { text: `🤖 Estos son mis servicios más comunes: ${GENERIC_SERVICES[trade] || 'pregúntame por el servicio que necesitas y te cotizo'}. ¿Cuál necesitas?`, quotePrice: null };
  }
  const svc = matchService(trade, t);
  if (svc) {
    return { text: `🤖 ¡Hola! Claro que sí, yo te ayudo con eso. ${svc.name} te sale desde ${money(svc.price)}. ¿Te lo confirmo? Puedo llegar en ${eta.toLowerCase().replace('llegada en ', '')}.`, quotePrice: svc.price };
  }
  if (/\b(hola|buenas|que tal|qué tal|buenos dias|buenas tardes|buenas noches)\b/.test(t)) {
    return { text: `🤖 ¡Hola! Soy ${name}, tu ${trade.toLowerCase()} de OfiMatch. Cuéntame qué necesitas y te cotizo en este momento.`, quotePrice: null };
  }
  if (/\b(llegas|llegada|cuando|cuándo|hora|tardas)\b/.test(t)) {
    return { text: `🤖 ${eta}. En cuanto confirmes la cotización me pongo en camino y ves mi avance en el rastreo.`, quotePrice: null };
  }
  return { text: `🤖 Cuéntame un poco más, ¿qué se descompuso o qué necesitas? Mis servicios más comunes son: ${GENERIC_SERVICES[trade] || 'pregúntame y te cotizo en este momento'}.`, quotePrice: null };
}

function matchService(trade, t) {
  if (trade !== 'Plomero') return null;
  let best = null, bestScore = 0;
  for (const s of PLOMERO_SERVICES) {
    let score = 0;
    for (const k of s.keys) if (t.includes(k)) score += k.length;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore > 0 ? best : null;
}

module.exports = { aiReplyFor };
