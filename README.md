# OfiMatch — versión real para publicar

App real para contratar oficios en CDMX: registro propio, match tipo Tinder,
chat, pago con tarjeta por Mercado Pago, rastreo tipo Rappi y calificación.
**No es un demo ni una tarjeta de Muse: es código que se puede publicar.**

## Qué incluye

- **Registro propio e inicio de sesión** para los dos lados: "Busco un oficio"
  (cliente) y "Ofrezco un oficio" (profesional). Nombre, teléfono, correo y
  contraseña (con hash, nunca en texto plano). Cada cuenta solo ve sus
  propios servicios, chats y pagos. No hay contraseña maestra.
- **Flujo en orden:** categorías → mazo para deslizar (✕ / i / ♥) → ¡MATCH! →
  chat (con foto adjunta y cotización) → confirmar servicio → Pago seguro →
  rastreo → calificación (5 estrellas + comentario, solo de reseñas reales).
- **Cotizaciones de referencia:** cada oficio muestra sus 5 servicios más
  comunes con precio de referencia "desde $" (en `public/service-prices.js`),
  en Inicio, en el mazo de cada categoría y como atajos al cotizar en el chat.
  Son precios orientativos; el profesional confirma la cotización final en
  el chat antes de que el cliente confirme el servicio.
- **Prospectos ficticios (ejemplos):** un perfil de ejemplo por oficio
  (12 en total), creados con `scripts/seed-prospects.js` y marcados con el
  distintivo "🧪 Prospecto de ejemplo" en el mazo y en Profesionales
  cercanos, para que la página no se vea vacía mientras llegan los primeros
  profesionales reales. No son personas reales y no responden mensajes; los
  profesionales reales que se registren aparecen sin el distintivo.
- **Pagos: solo con tarjeta, cero efectivo.** Pasarela: Mercado Pago.
- **Precios (fórmula única en `lib/pricing.js`):** precio del servicio +
  $150 de comisión fija por cada lado. Los $150 son **libres de comisión,
  sin IVA**: no llevan IVA ni comisión de Mercado Pago. IVA 16% y comisión
  de Mercado Pago (4% cerrados) se cobran sobre el precio del servicio
  (y sobre el servicio de horas extra). Ejemplo verificado:
  servicio $600 → IVA $96, comisión MP $28, total **$874**.
- **Duración: 2 horas incluidas.** El temporizador empieza cuando el
  profesional marca "Trabajando". Hora extra: $250 por hora ($200 de
  servicio + $50 de comisión). A la 1 h 55 el cliente recibe el aviso de
  que faltan 5 minutos y que seguir costará $250 por hora extra; el aviso
  queda registrado una sola vez en el chat del servicio.
- **Rastreo tipo Rappi para ambos lados, SOLO después de contratar y pagar.**
  Antes de contratar solo se ve la distancia aproximada (ej. 1.2 km), sin
  ubicación en vivo, sin pin exacto, sin dirección y sin pantalla de
  rastreo. Razón: si no, cualquiera sabría dónde vive el profesional y
  podría ir a buscarlo sin usar el servicio. Después de pagar, ambos ven
  "Rastrear servicio" con mapa, ETA y estados: confirmado, en camino,
  llegó, trabajando, terminado. El profesional avanza con el botón
  "Marcar: …" y chips de ETA 15/30/45/60.
- **Cero profesionales ficticios:** la app empieza con **cero**
  profesionales. No hay Carlos, Luis ni nadie inventado. El script
  `scripts/seed-demo.js` es solo demo, está apagado por defecto y nunca
  corre solo.

## Limitaciones que debes saber

- El mapa de rastreo es un panel estilizado con la distancia y el ETA
  registrados; **no es GPS en vivo** ni un mapa cartográfico real.
- Sin el token de producción de Mercado Pago, los pagos corren en
  **modo de prueba claramente etiquetado**: se registran como prueba y
  **no se cobra de verdad**. No se finge un cobro real.
- La comisión de Mercado Pago usada es 4% cerrados, por decisión de
  Alberto, no la tarifa estándar de Mercado Pago. Si quieres cambiarla,
  cambia `MP_RATE` en `lib/pricing.js`.

## Cómo correrlo en tu computadora

```bash
cd ofimatch-real
npm install
cp .env.example .env
# Edita .env: pon un JWT_SECRET largo y, si ya lo tienes, tu
# MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_PUBLIC_KEY de producción.
npm start
# Abre http://localhost:3000
```

Prueba rápida del flujo completo:

```bash
npm run smoke
```

## Cómo publicar (recomendado: Railway)

1. Crea una cuenta en [Railway](https://railway.app) y un proyecto nuevo
   desde este repositorio (o sube esta carpeta a GitHub y conéctala).
2. En Railway, en **Variables**, pon: `JWT_SECRET` (uno largo y aleatorio),
   `MERCADOPAGO_ACCESS_TOKEN` (producción) y `MERCADOPAGO_PUBLIC_KEY`.
   Railway asigna el `PORT` solo; la app lo lee de la variable `PORT`.
3. Despliega. Railway te dará una URL pública, por ejemplo
   `https://ofimatch.up.railway.app`. Esa ya es tu página real.
4. Prueba el flujo con dos cuentas (una de cliente y una de profesional)
   y un pago de prueba con tarjeta de prueba de Mercado Pago antes de
   cobrar de verdad.

Alternativa: Render (mismo procedimiento: servicio web con `npm start`,
variables de entorno iguales, disco persistente para `data/` si quieres
que los datos sobrevivan a cada despliegue; en Railway usa un volumen
para la carpeta `data/`).

## Cómo poner un dominio

1. Compra el dominio (por ejemplo `ofimatch.mx`) en tu registrador.
2. En Railway (o Render), en el servicio, abre **Settings → Domains** y
   agrega tu dominio. Te dará los registros DNS (CNAME) que debes poner
   en tu registrador.
3. Espera a que el DNS se propague (puede tardar minutos u horas) y
   verifica que `https://ofimatch.mx` abre la app. El certificado
   HTTPS lo pone el host automáticamente.

## Cómo conectar Mercado Pago (cobro real)

1. Entra a [Mercado Pago Developers](https://www.mercadopago.com.mx/developers),
   **Tus integraciones**, crea una aplicación para OfiMatch.
2. En **Credenciales** copia el **Access Token de producción** y la
   **Public Key**. El de prueba no cobra de verdad.
3. Ponlos en las variables de entorno `MERCADOPAGO_ACCESS_TOKEN` y
   `MERCADOPAGO_PUBLIC_KEY` (en Railway, en Variables; en local, en `.env`).
   **Nunca** los escribas en el chat, en el código ni en un repositorio
   público, y nunca pongas el Access Token en el frontend.
4. Haz un pago real de prueba con tu propia tarjeta por un monto pequeño
   y verifica que el dinero llegue a tu cuenta de Mercado Pago y que el
   servicio pase a "pagado" y se active el rastreo.

## Qué falta para el lanzamiento real

- [ ] Token de producción de Mercado Pago de Alberto (aún no entregado).
- [ ] Dominio y hosting (cuenta de Railway o Render).
- [ ] Primeros profesionales reales registrados (la app empieza en cero).
- [ ] Términos y condiciones y aviso de privacidad (textos legales).
- [ ] Prueba de un servicio real completo de principio a fin.

## Estructura

```
ofimatch-real/
  server.js            # API + servidor (Express + SQLite)
  lib/pricing.js       # Fórmula única de cobro
  public/              # Frontend (index.html, app.js, styles.css)
  scripts/smoke-test.js# Prueba automática del flujo completo
  scripts/seed-demo.js # Solo demo, apagado por defecto
  uploads/             # Fotos subidas por usuarios
  data/                # Base de datos SQLite (no se sube a git)
  .env.example         # Variables necesarias, sin valores reales
```
