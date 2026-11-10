// Script DEMO, APAGADO POR DEFECTO. Solo corre si DEMO_SEED=1.
// Crea cuentas de ejemplo con nombres genéricos "Demo", NUNCA Carlos/Luis
// ni personas reales. No se ejecuta automáticamente al iniciar la app.
// Uso: DEMO_SEED=1 npm run seed:demo
if (process.env.DEMO_SEED !== '1') {
  console.log('Demo seed apagado. Para activarlo: DEMO_SEED=1 npm run seed:demo');
  process.exit(0);
}
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'ofimatch.db'));
const hash = bcrypt.hashSync('demo1234', 10);
const now = new Date().toISOString();
for (const [name, email, role] of [['Demo Cliente', 'demo.cliente@ejemplo.mx', 'busco'], ['Demo Profesional', 'demo.profesional@ejemplo.mx', 'ofrezco']]) {
  const r = db.prepare('INSERT OR IGNORE INTO users (name, phone, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)')
    .run(name, '5500000000', email, hash, role, now);
  console.log('Demo:', email, '(contraseña demo1234)');
  if (role === 'ofrezco') {
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    db.prepare('INSERT OR IGNORE INTO professionals (user_id, trade, zone, rate, experience, eta_text, distance_km, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(u.id, 'Plomero', 'CDMX', 350, 'Demo de ejemplo', 'Llegada en 30 min', 1.2, now);
  }
}
console.log('Seed DEMO terminado. Borra estos datos antes de lanzar en real.');
