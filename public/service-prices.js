// Cotizaciones de referencia de OfiMatch: servicios más comunes de cada
// oficio, con precio de referencia "desde $". Son precios orientativos en
// pesos mexicanos (CDMX); el profesional confirma la cotización final en
// el chat, antes de que el cliente confirme el servicio. No son precios
// fijos ni obligatorios para el profesional.
const SERVICE_PRICES = {
  "Plomero": [
    { name: "Desazolve de baño (WC tapado)", price: 600 },
    { name: "Cambio de llave de lavabo", price: 450 },
    { name: "Reparación de fuga de agua", price: 500 },
    { name: "Instalación de WC", price: 900 },
    { name: "Cambio de flotador y herrajes", price: 350 }
  ],
  "Electricista": [
    { name: "Instalación de contacto o apagador", price: 350 },
    { name: "Instalación de lámpara o candil", price: 450 },
    { name: "Revisión y reparación de corto circuito", price: 600 },
    { name: "Instalación de ventilador de techo", price: 650 },
    { name: "Instalación de centro de carga", price: 1200 }
  ],
  "Aire Acondicionado": [
    { name: "Mantenimiento preventivo", price: 800 },
    { name: "Instalación de minisplit", price: 2500 },
    { name: "Recarga de gas refrigerante", price: 900 },
    { name: "Reparación de aire acondicionado", price: 750 },
    { name: "Limpieza profunda", price: 600 }
  ],
  "Carpintero": [
    { name: "Reparación de puerta", price: 600 },
    { name: "Instalación de repisa o estante", price: 450 },
    { name: "Clóset a la medida", price: 3500 },
    { name: "Cambio de chapa o cerradura", price: 400 },
    { name: "Mueble a la medida", price: 2800 }
  ],
  "Pintor": [
    { name: "Pintura por m²", price: 120 },
    { name: "Pintura de recámara", price: 2500 },
    { name: "Resane de pared", price: 400 },
    { name: "Pintura de fachada", price: 4500 },
    { name: "Barniz de puerta", price: 600 }
  ],
  "Albañil": [
    { name: "Resane de muro", price: 500 },
    { name: "Levantar muro (por m²)", price: 450 },
    { name: "Colocación de piso (por m²)", price: 350 },
    { name: "Impermeabilización", price: 1800 },
    { name: "Reparación de grietas", price: 600 }
  ],
  "Limpieza": [
    { name: "Limpieza general de casa", price: 600 },
    { name: "Limpieza profunda", price: 1200 },
    { name: "Limpieza de alfombra", price: 400 },
    { name: "Limpieza post-obra", price: 1500 },
    { name: "Lavado de colchón", price: 500 }
  ],
  "Mecánico": [
    { name: "Cambio de aceite y filtro", price: 600 },
    { name: "Afinación completa", price: 1200 },
    { name: "Cambio de balatas (frenos)", price: 900 },
    { name: "Revisión general / diagnóstico", price: 400 },
    { name: "Cambio de batería", price: 800 }
  ],
  "Tecnología": [
    { name: "Instalación y configuración de WiFi", price: 500 },
    { name: "Reparación de celular (pantalla)", price: 700 },
    { name: "Configuración de Smart TV", price: 400 },
    { name: "Instalación de cámaras de seguridad", price: 1500 },
    { name: "Soporte y limpieza de computadora", price: 500 }
  ],
  "Mudanzas": [
    { name: "Mudanza local (depa o casa)", price: 1800 },
    { name: "Mudanza con carga pesada", price: 2500 },
    { name: "Servicio de embalaje", price: 600 },
    { name: "Flete sencillo", price: 800 },
    { name: "Subir y bajar muebles", price: 500 }
  ],
  "Jardinería": [
    { name: "Corte de pasto", price: 400 },
    { name: "Poda de árbol", price: 800 },
    { name: "Diseño de jardín", price: 1500 },
    { name: "Instalación de riego automático", price: 2000 },
    { name: "Limpieza de jardín", price: 500 }
  ],
  "Más servicios": [
    { name: "Instalación de TV en pared", price: 500 },
    { name: "Armado de muebles", price: 450 },
    { name: "Instalación de cortinas o persianas", price: 400 },
    { name: "Reparación de electrodomésticos", price: 600 },
    { name: "Servicio de cerrajería", price: 450 }
  ]
};
