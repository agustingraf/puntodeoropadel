// api/whatsapp.js
// Webhook de WhatsApp Business (Meta) para cargar el CRM por mensaje de texto.
//
// Variables de entorno necesarias en Vercel (Project Settings → Environment Variables):
//   WHATSAPP_TOKEN          -> token de acceso de Meta (WhatsApp → API Setup)
//   WHATSAPP_PHONE_ID       -> Phone number ID de Meta
//   WHATSAPP_VERIFY_TOKEN   -> inventá una palabra clave vos mismo, ej: "puntodeoro2026"
//   ANTHROPIC_API_KEY       -> tu clave de console.anthropic.com
//   SUPABASE_URL            -> https://wrwryytqtzetxdbynykp.supabase.co
//   SUPABASE_SERVICE_KEY    -> Supabase → Settings → API → "service_role" key (NO la anon/publishable)
//
// La service_role key nunca se expone al navegador: solo vive acá, en el servidor.
// Eso es más seguro que la anon key que usa el sitio.

const DIAS_MAP = { domingo:0, lunes:1, martes:2, miercoles:3, "miércoles":3, jueves:4, viernes:5, sabado:6, "sábado":6 };

export default async function handler(req, res) {
  // Verificación del webhook (Meta la pide una sola vez al configurar)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = req.body;
    const entry = body?.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];
    if (!message || message.type !== "text") {
      return res.status(200).json({ ok: true }); // ignorar (status updates, etc.)
    }

    const from = message.from; // número de quien escribió
    const texto = message.text.body;

    // 1. Traer alumnos existentes para poder matchear nombres
    const students = await sbFetch("students?select=id,name&active=eq.true");

    // 2. Pedirle a Claude que interprete el mensaje
    const interpretado = await interpretarMensaje(texto, students);

    // 3. Ejecutar la acción correspondiente
    const resultado = await ejecutarAccion(interpretado, students);

    // 4. Responder por WhatsApp
    await enviarWhatsApp(from, resultado.respuesta);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Error en webhook:", e);
    return res.status(200).json({ ok: true }); // siempre 200 para que Meta no reintente en loop
  }
}

// ---------- Supabase (con service_role key, server-side only) ----------
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

// ---------- Interpretación con Claude ----------
async function interpretarMensaje(texto, students) {
  const nombresExistentes = students.map((s) => s.name).join(", ") || "(ninguno todavía)";
  const systemPrompt = `Interpretás mensajes de WhatsApp de un profesor de pádel para cargar su CRM.
Alumnos ya cargados: ${nombresExistentes}

Devolvé SOLO un JSON (sin texto extra, sin markdown) con esta forma exacta:

Para un alumno nuevo:
{"action":"nuevo_alumno","name":"...","phone":"" ,"category":"","format":"individual|dupla|grupal|cancha_libre","monthly_fee":null,"notes":""}

Para un turno/clase (día y horario fijo semanal):
{"action":"nuevo_turno","day":"lunes|martes|miercoles|jueves|viernes|sabado|domingo","start_time":"HH:MM","duration_minutes":60,"format":"individual|dupla|grupal|cancha_libre","student_names":["..."],"notes":""}

Para un pago:
{"action":"nuevo_pago","student_name":"...","amount":0,"period":"YYYY-MM","method":"efectivo|transferencia|mp","status":"pendiente|pagado"}

Si no entendés el mensaje o falta información clave (ej. no dice el nombre):
{"action":"desconocido","motivo":"..."}

Reglas:
- Si dice "pagó" o "pago hecho", status es "pagado". Si solo dice el monto sin confirmar, status "pendiente".
- Si no dice el período del pago, usá el mes actual.
- Matcheá student_name / student_names contra los alumnos ya cargados si el nombre es parecido (aunque esté mal escrito o incompleto). Si no hay match razonable, usá el nombre tal cual lo escribió.
- No inventes datos que no están en el mensaje: dejalos vacíos/null.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: texto }],
    }),
  });
  const data = await r.json();
  const raw = data?.content?.[0]?.text?.trim() || "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    return { action: "desconocido", motivo: "no pude interpretar la respuesta" };
  }
}

// ---------- Ejecutar en Supabase ----------
async function ejecutarAccion(data, students) {
  if (data.action === "nuevo_alumno") {
    if (!data.name) return { respuesta: "❌ No entendí el nombre del alumno. Probá de nuevo con más detalle." };
    const payload = {
      id: "al" + Date.now(),
      name: data.name,
      phone: data.phone || "",
      category: data.category || "",
      format: data.format || "individual",
      monthly_fee: data.monthly_fee || null,
      notes: data.notes || "",
      active: true,
    };
    await sbFetch("students", "POST", payload);
    return { respuesta: `✅ Alumno cargado: ${data.name}${data.category ? " (" + data.category + ")" : ""}` };
  }

  if (data.action === "nuevo_turno") {
    if (!data.day || !data.start_time) {
      return { respuesta: "❌ Me faltó el día o el horario del turno. Probá: 'Pablo lunes 18hs individual'." };
    }
    const dow = DIAS_MAP[data.day.toLowerCase()];
    const slotId = "sl" + Date.now();
    await sbFetch("class_slots", "POST", {
      id: slotId,
      day_of_week: dow,
      start_time: data.start_time,
      duration_minutes: data.duration_minutes || 60,
      format: data.format || "individual",
      notes: data.notes || "",
      active: true,
    });
    const nombres = data.student_names || [];
    const ids = nombres
      .map((n) => matchStudent(n, students))
      .filter(Boolean);
    if (ids.length) {
      await sbFetch(
        "slot_students",
        "POST",
        ids.map((sid) => ({ slot_id: slotId, student_id: sid }))
      );
    }
    return {
      respuesta: `✅ Turno cargado: ${data.day} ${data.start_time}hs${nombres.length ? " — " + nombres.join(", ") : ""}${ids.length < nombres.length ? " (algún nombre no lo encontré, revisalo en el panel)" : ""}`,
    };
  }

  if (data.action === "nuevo_pago") {
    if (!data.student_name || !data.amount) {
      return { respuesta: "❌ Me faltó el nombre o el monto. Probá: 'Pablo pagó 25000 julio'." };
    }
    const studentId = matchStudent(data.student_name, students);
    if (!studentId) {
      return { respuesta: `❌ No encontré a "${data.student_name}" entre los alumnos cargados. Cargalo primero.` };
    }
    const period = data.period || new Date().toISOString().slice(0, 7);
    await sbFetch("payments", "POST", {
      id: "pg" + Date.now(),
      student_id: studentId,
      amount: Number(data.amount),
      period,
      method: data.method || "efectivo",
      status: data.status || "pendiente",
      paid_on: data.status === "pagado" ? new Date().toISOString().slice(0, 10) : null,
    });
    return { respuesta: `✅ Pago cargado: ${data.student_name} — $${data.amount} (${data.status === "pagado" ? "pagado" : "pendiente"})` };
  }

  return { respuesta: `🤔 No entendí bien ese mensaje${data.motivo ? " (" + data.motivo + ")" : ""}. Contame de otra forma, por ejemplo:\n• "Nuevo alumno Pablo, 5ta, individual"\n• "Pablo lunes 18hs individual"\n• "Pablo pagó 25000 julio"` };
}

function matchStudent(name, students) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const exact = students.find((s) => s.name.toLowerCase() === n);
  if (exact) return exact.id;
  const partial = students.find(
    (s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase().split(" ")[0])
  );
  return partial ? partial.id : null;
}

// ---------- Enviar mensaje de WhatsApp ----------
async function enviarWhatsApp(to, texto) {
  await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.WHATSAPP_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: texto },
    }),
  });
}
