// api/cron-canchas.js
// Corre automáticamente todos los días (configurado en vercel.json) y crea
// la próxima ocurrencia de cada cancha abierta recurrente, si todavía no existe.
//
// Usa las mismas variables de entorno SUPABASE_URL y SUPABASE_SERVICE_KEY
// que ya configuraste para api/whatsapp.js — no hace falta agregar nada nuevo.

export default async function handler(req, res) {
  // Seguridad: Vercel Cron manda el header Authorization automáticamente.
  // También se acepta ?secret=... en la URL para poder probarlo a mano
  // desde el navegador.
  const auth = req.headers.authorization;
  const querySecret = req.query.secret;
  const autorizado =
    !process.env.CRON_SECRET ||
    auth === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;
  if (!autorizado) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const recurrentes = await sbFetch("canchas_recurrentes?select=*&active=eq.true");
    const creadas = [];

    for (const r of recurrentes || []) {
      const proximaFecha = proximaFechaDia(r.day_of_week);
      if (r.last_created_fecha === proximaFecha) continue; // ya está creada, no duplicar

      const canchaId = "ca" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

      // Buscar si ya existe una cancha abierta para esa fecha (ej. si Agus la cargó a mano)
      const existentes = await sbFetch("canchas_abiertas?select=id&fecha=eq." + proximaFecha + "&activo=eq.true");
      const idFinal = existentes && existentes[0] ? existentes[0].id : canchaId;

      if (!existentes || !existentes[0]) {
        await sbFetch("canchas_abiertas", "POST", {
          id: canchaId,
          nombre: r.nombre || "Cancha abierta",
          fecha: proximaFecha,
          hora: r.hora,
          hora_fin: r.hora_fin || "",
          cupo: r.cupo || 16,
          precio: r.precio || 20000,
          categorias: r.categorias || "",
          organizador: r.organizador || "",
          activo: true,
        });
      }

      const nombres = r.player_names || [];
      if (nombres.length) {
        const filas = nombres.map((n) => ({
          id: "ca" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          cancha_id: idFinal,
          nombre: n,
          tel: "",
          metodo: "admin",
          es_admin: true,
          estado: "confirmada",
          fecha: new Date().toLocaleDateString("es-AR"),
        }));
        await sbFetch("canchas_inscriptos", "POST", filas);
      }

      await sbFetch("canchas_recurrentes?id=eq." + r.id, "PATCH", { last_created_fecha: proximaFecha });
      creadas.push({ recurrente_id: r.id, fecha: proximaFecha, jugadores: nombres.length });
    }

    return res.status(200).json({ ok: true, creadas });
  } catch (e) {
    console.error("Error en cron de canchas:", e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}

// Calcula la próxima fecha (YYYY-MM-DD) para un día de la semana dado (0=domingo…6=sábado).
// Si hoy es ese día, devuelve hoy.
function proximaFechaDia(dayOfWeek) {
  const hoy = new Date();
  const hoyDow = hoy.getDay();
  let diff = dayOfWeek - hoyDow;
  if (diff < 0) diff += 7;
  const fecha = new Date(hoy);
  fecha.setDate(hoy.getDate() + diff);
  return fecha.toISOString().slice(0, 10);
}

async function sbFetch(path, method = "GET", payload = null) {
  const opts = {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + process.env.SUPABASE_SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
  if (payload) opts.body = JSON.stringify(payload);
  const r = await fetch(process.env.SUPABASE_URL + "/rest/v1/" + path, opts);
  if (!r.ok) {
    const err = await r.text();
    console.error("Supabase error:", method, path, err);
    return null;
  }
  if (method === "GET") return r.json();
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}
