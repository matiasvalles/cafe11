// api/create-preference.js
// Función serverless de Vercel: crea una preferencia de pago real en Mercado Pago.
//
// Requiere la variable de entorno MP_ACCESS_TOKEN configurada en:
// Vercel → tu proyecto → Settings → Environment Variables
// (usa el Access Token de producción o de prueba de tu cuenta de Mercado Pago).
//
// Esta función corre en el servidor, así que el Access Token nunca llega
// al navegador del comprador.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({
      error: "MP_ACCESS_TOKEN no está configurado en las variables de entorno de Vercel.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "El carrito está vacío o es inválido." });
    }

    // Nunca confiar en precios que vienen del cliente sin validar: se
    // reconstruyen y sanean los items antes de mandarlos a Mercado Pago.
    const preferenceItems = items.map((item) => ({
      title: String(item.title || "Producto").slice(0, 256),
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
      unit_price: Number(item.unit_price),
      currency_id: "ARS",
    }));

    const hasInvalidItem = preferenceItems.some(
      (it) => !Number.isFinite(it.unit_price) || it.unit_price <= 0
    );
    if (hasInvalidItem) {
      return res.status(400).json({ error: "Uno o más productos tienen un precio inválido." });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const preferenceBody = {
      items: preferenceItems,
      back_urls: {
        success: `${origin}/?mp_status=success`,
        failure: `${origin}/?mp_status=failure`,
        pending: `${origin}/?mp_status=pending`,
      },
      auto_return: "approved",
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Error de Mercado Pago:", data);
      return res.status(mpResponse.status).json({
        error: data.message || "Error al crear la preferencia de pago.",
      });
    }

    return res.status(200).json({
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
    });
  } catch (err) {
    console.error("Error inesperado creando la preferencia:", err);
    return res.status(500).json({ error: "Error interno al procesar el pago." });
  }
}
