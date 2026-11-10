// Fórmula ÚNICA de cobro de OfiMatch. Se usa en el servidor para todos los
// totales (Pago seguro, rastreo, Mis servicios) y se expone en /api/pricing.
// Reglas de Alberto:
//  - Comisión fija: $150 por uso del servicio, por cada lado.
//    Los $150 son "libres de comisión, sin IVA": NO llevan IVA ni comisión
//    de Mercado Pago encima.
//  - IVA: 16% sobre el precio del servicio (y sobre el servicio de horas extra).
//  - Comisión de Mercado Pago: 4% cerrados, calculada sobre
//    (servicio + IVA). Sin cargo fijo. No se aplica sobre los $150 ni sobre la comisión de
//    hora extra ($50).
//  - Hora extra: $250 por hora extra = $200 de servicio + $50 de comisión.
//    El IVA y la comisión de Mercado Pago se calculan sobre los $200 de
//    servicio; los $50 de comisión de hora extra se suman tal cual.
// Ejemplo verificado: servicio $600, 0 horas extra ->
//   IVA $96, comisión MP $28, total $600 + $96 + $28 + $150 = $874.
const COMMISSION_FIXED = 150;
const IVA_RATE = 0.16;
const MP_RATE = 0.04;
const MP_FIXED = 0;
const INCLUDED_MINUTES = 120;
const OVERTIME_SERVICE_PER_HOUR = 200;
const OVERTIME_COMMISSION_PER_HOUR = 50;

function chargesFor(servicePrice, extraHours = 0) {
  const price = Math.max(0, Number(servicePrice) || 0);
  const extra = Math.max(0, Math.floor(Number(extraHours) || 0));
  // Base sobre la que se calculan IVA y comisión de Mercado Pago:
  // precio del servicio + servicio de horas extra ($200 por hora).
  const base = price + extra * OVERTIME_SERVICE_PER_HOUR;
  const overtimeCommission = extra * OVERTIME_COMMISSION_PER_HOUR;
  const iva = Math.round(base * IVA_RATE);
  const mpFee = Math.round((base + iva) * MP_RATE);
  const total = base + iva + mpFee + COMMISSION_FIXED + overtimeCommission;
  return {
    servicePrice: price,
    extraHours: extra,
    overtimeService: extra * OVERTIME_SERVICE_PER_HOUR,
    overtimeCommission,
    base,
    iva,
    mpFee,
    commissionFixed: COMMISSION_FIXED,
    total,
    currency: 'MXN',
  };
}

// Horas extra a cobrar según minutos trabajados (por hora iniciada).
function extraHoursFor(elapsedMinutes) {
  const over = Math.max(0, (elapsedMinutes || 0) - INCLUDED_MINUTES);
  return over <= 0 ? 0 : Math.ceil(over / 60);
}

module.exports = {
  chargesFor,
  extraHoursFor,
  COMMISSION_FIXED,
  IVA_RATE,
  MP_RATE,
  MP_FIXED,
  INCLUDED_MINUTES,
  OVERTIME_SERVICE_PER_HOUR,
  OVERTIME_COMMISSION_PER_HOUR,
};
