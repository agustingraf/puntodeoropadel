// api/twilio.js
// Webhook de WhatsApp vía Twilio para el CRM de pádel.
//
// Variables de entorno necesarias en Vercel (Project Settings → Environment Variables):
//   ANTHROPIC_API_KEY    -> ya la tenés
//   SUPABASE_URL         -> ya la tenés
//   SUPABASE_SERVICE_KEY -> ya la tenés

const DIAS_MAP = { domingo:0, lunes:1, martes:2, miercoles:3, "miércoles":3, jueves:4, viernes:5, sabado:6, "sábado":6 };
const DIAS_MAP_TURNOS = { lunes:0, martes:1, miercoles:2, "miércoles":2, jueves:3, viernes:4, sabado:5, "sábado":5, domingo:6 };
const DIAS_NOMBRE = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send("<Response></Response>");
  }

  try {
    const texto = (req.body?.Body || "").trim();
    const from = req.body?.From || "";
    console.log("Mensaje de:", from, "| Texto:", texto);

    const students = await sbFetch("students?select=id,name&active=eq.true");
    const interpretado = await interpretarMensaje(texto, students);
    console.log("Interpretado:", JSON.stringify(interpretado));

    const resultado = await ejecutarAccion(interpretado, students);

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(resultado.respuesta)}</Message></Response>`
    );
  } catch (e) {
    console.error("Error en webhook:", e);
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>⚠️ Tuve un error interno, probá de nuevo en un rato.</Message></Response>`
    );
  }
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

async function interpretarMensaje(texto, students) {
  const nombresExistentes = students.map((s) => s.name).join(", ") || "(ninguno todavía)";
  const systemPrompt = `Interpretás mensajes de WhatsApp de un profesor de pádel para su CRM.
Alumnos ya cargados: ${nombresExistentes}

Devolvé SOLO un JSON (sin texto extra, sin markdown) con esta forma exacta:

Para un alumno nuevo:
{"action":"nuevo_alumno","name":"...","phone":"" ,"category":"","format":"individual|dupla|grupal|cancha_libre","monthly_fee":null,"notes":""}

Para un turno/clase (día y horario fijo semanal):
{"action":"nuevo_turno","day":"lunes|martes|miercoles|jueves|viernes|sabado|domingo","start_time":"HH:MM","duration_minutes":60,"format":"individual|dupla|grupal|cancha_libre","student_names":["..."],"notes":""}

Para un pago (SIEMPRE preguntá o identificá a quién le pagaron: a vos -"agus"- o a Marce -"marce"-; si el mensaje no lo aclara, dejá "pagado_a":null):
{"action":"nuevo_pago","student_name":"...","amount":0,"period":"YYYY-MM","method":"efectivo|transferencia|mp","status":"pendiente|pagado","pagado_a":"agus|marce|null"}

Para una cancha abierta con fecha concreta (número de día, ej "26/7"):
{"action":"nueva_cancha_abierta","nombre":"Cancha abierta","fecha":"YYYY-MM-DD","hora":"HH:MM","hora_fin":"HH:MM","cupo":16,"precio":20000,"categorias":"","organizador":"","player_names":["...","..."]}

Para una cancha RECURRENTE (dice "todos los", "cada" + día):
{"action":"cancha_recurrente","nombre":"Cancha abierta","day":"lunes|martes|miercoles|jueves|viernes|sabado|domingo","hora":"HH:MM","hora_fin":"HH:MM","cupo":16,"precio":20000,"categorias":"","organizador":"","player_names":["...","..."]}

Para sumar gente a una cancha que probablemente ya existe (menciona un día SIN "todos" ni fecha numérica):
{"action":"agregar_a_cancha","day":"lunes|martes|miercoles|jueves|viernes|sabado|domingo","fecha":null,"player_names":["...","..."]}

Para una LIQUIDACIÓN con Marce (cuando VOS le das plata a Marce para saldar cuenta, o Marce te da plata a VOS — no es un pago de un alumno, es entre vos y Marce):
{"action":"liquidacion_marce","monto":0,"direccion":"agus_a_marce|marce_a_agus","notas":""}

Para eliminar un alumno:
{"action":"eliminar_alumno","student_name":"..."}

Para CUALQUIER PREGUNTA (el mensaje pregunta algo en vez de dar una orden — empieza o incluye "qué", "cuánto", "cuándo", "quién", "cuántos", "tengo", "hay", "cómo va", etc.):
{"action":"consulta","pregunta":"<el mensaje textual del usuario>"}

Si no entendés el mensaje o falta información clave:
{"action":"desconocido","motivo":"..."}

Reglas:
- Si dice "pagó" o "pago hecho", status es "pagado". Si solo dice el monto sin confirmar, status "pendiente".
- Si no dice el período del pago, usá el mes actual.
- IMPORTANTE: si el mensaje es una PREGUNTA (busca información, no da una orden de cargar/sumar/eliminar algo), SIEMPRE usá "consulta", nunca otra acción.
- Para pagos: interpretá quién recibió el dinero. Si dice "me pagó", "le pagué a él", "cobré yo" → pagado_a:"agus". Si dice "le pagó a Marce", "pagó a Marce", "cobró Marce" → pagado_a:"marce". Si no está claro, dejá pagado_a:null.
- IMPORTANTE: distinguí "nuevo_pago" (un ALUMNO pagando una clase) de "liquidacion_marce" (VOS entregándole plata a Marce para saldar, o Marce entregándote a VOS). Si el mensaje dice "le di plata a Marce", "le pagué a Marcelo", "le llevé/entregué X a Marce" → es "liquidacion_marce" con direccion "agus_a_marce". Si dice "Marce me dio/pagó" → "liquidacion_marce" con direccion "marce_a_agus".
- No confundas "nuevo_alumno" con las acciones de cancha: "nuevo_alumno" es SOLO para agregar alguien a la lista fija de alumnos de clases.
- Usá "cancha_recurrente" solo si dice "todos los"/"cada" + día. Usá "nueva_cancha_abierta" solo con fecha numérica concreta. Usá "agregar_a_cancha" en cualquier otro caso de sumar gente a una cancha/partido de un día sin fecha numérica.
- Matcheá nombres contra los alumnos ya cargados si son parecidos. No inventes datos que no están en el mensaje.`;

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

async function responderPregunta(pregunta) {
  const [students, slots, slotStudents, payments, canchas, recurrentes, liquidaciones] = await Promise.all([
    sbFetch("students?select=*&active=eq.true"),
    sbFetch("class_slots?select=*&active=eq.true"),
    sbFetch("slot_students?select=*"),
    sbFetch("payments?select=*&order=period.desc"),
    sbFetch("canchas_abiertas?select=*&activo=eq.true&order=fecha.asc"),
    sbFetch("canchas_recurrentes?select=*&active=eq.true"),
    sbFetch("liquidaciones_marce?select=*&order=fecha.desc"),
  ]);

  const nombreDe = (id) => (students || []).find((s) => s.id === id)?.name || "?";

  const DIAS_NOMBRE_TURNOS = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
  const turnosTexto = (slots || [])
    .map((s) => {
      const nombres = (slotStudents || [])
        .filter((x) => x.slot_id === s.id)
        .map((x) => nombreDe(x.student_id));
      return `${DIAS_NOMBRE_TURNOS[s.day_of_week]} ${s.start_time?.slice(0, 5)}hs (${s.format || ""}): ${nombres.join(", ") || "sin alumnos"}`;
    })
    .join("\n");

  const alumnosTexto = (students || [])
    .map((s) => `${s.name} — ${s.category || "sin categoría"} — ${s.format || ""} — cuota: ${s.monthly_fee || "?"} — tel: ${s.phone || "?"} — notas: ${s.notes || "-"}`)
    .join("\n");

  const pagosTexto = (payments || [])
    .slice(0, 60)
    .map((p) => `${nombreDe(p.student_id)} — $${p.amount} — ${p.period} — ${p.status} — pagado a: ${p.pagado_a || "?"}`)
    .join("\n");

  let debeAMarce = 0;
  let debeMarce = 0;
  (payments || []).forEach((p) => {
    const mitad = Number(p.amount || 0) / 2;
    if (p.pagado_a === "agus") debeAMarce += mitad;
    else if (p.pagado_a === "marce") debeMarce += mitad;
  });
  (liquidaciones || []).forEach((l) => {
    if (l.direccion === "agus_a_marce") debeAMarce -= Number(l.monto || 0);
    else if (l.direccion === "marce_a_agus") debeMarce -= Number(l.monto || 0);
  });
  const balanceNeto = debeMarce - debeAMarce;
  const liquidacionesTexto = (liquidaciones || [])
    .slice(0, 30)
    .map((l) => `${l.fecha} — ${l.direccion === "agus_a_marce" ? "Agus le dio a Marce" : "Marce le dio a Agus"} $${l.monto}`)
    .join("\n");
  const balanceTexto =
    `Total cobrado por Agus (antes de liquidaciones): la mitad le corresponde a Marce\n` +
    `Total cobrado por Marce (antes de liquidaciones): la mitad le corresponde a Agus\n` +
    `Liquidaciones ya hechas entre ellos:\n${liquidacionesTexto || "(ninguna)"}\n` +
    `Saldo pendiente después de restar liquidaciones: ${balanceNeto >= 0 ? `Marce le debe a Agus $${balanceNeto.toLocaleString("es-AR")}` : `Agus le debe a Marce $${Math.abs(balanceNeto).toLocaleString("es-AR")}`}`;

  const canchasTexto = (canchas || [])
    .map((c) => `${c.fecha} ${c.hora}hs: ${c.nombre || "Cancha abierta"} (cupo ${c.cupo})`)
    .join("\n");

  const recurrentesTexto = (recurrentes || [])
    .map((r) => `Todos los ${DIAS_NOMBRE[r.day_of_week]} ${r.hora}hs: ${(r.player_names || []).join(", ")}`)
    .join("\n");

  const contexto = `ALUMNOS:\n${alumnosTexto || "(ninguno)"}\n\nTURNOS SEMANALES:\n${turnosTexto || "(ninguno)"}\n\nPAGOS (más recientes primero):\n${pagosTexto || "(ninguno)"}\n\nCUENTA CORRIENTE CON MARCE (50/50 sobre cada pago):\n${balanceTexto}\n\nCANCHAS ABIERTAS PROGRAMADAS:\n${canchasTexto || "(ninguna)"}\n\nCANCHAS RECURRENTES:\n${recurrentesTexto || "(ninguna)"}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: `Sos el asistente de WhatsApp de un profesor de pádel. Respondé la pregunta del usuario usando SOLO estos datos reales de su CRM (no inventes nada que no esté acá):\n\n${contexto}\n\nRespondé corto y directo, en tono natural de WhatsApp, en español. Si el dato que pide no está en la información de arriba, decilo con honestidad en vez de inventar.`,
      messages: [{ role: "user", content: pregunta }],
    }),
  });
  const data = await r.json();
  return data?.content?.[0]?.text?.trim() || "No pude procesar la pregunta, probá de nuevo.";
}

async function ejecutarAccion(data, students) {
  if (data.action === "consulta") {
    const respuesta = await responderPregunta(data.pregunta || "");
    return { respuesta };
  }

  if (data.action === "nuevo_alumno") {
    if (!data.name) return { respuesta: "❌ No entendí el nombre del alumno." };
    await sbFetch("students", "POST", {
      id: "al" + Date.now(),
      name: data.name,
      phone: data.phone || "",
      category: data.category || "",
      format: data.format || "individual",
      monthly_fee: data.monthly_fee || null,
      notes: data.notes || "",
      active: true,
    });
    return { respuesta: `✅ Alumno cargado: ${data.name}${data.category ? " (" + data.category + ")" : ""}` };
  }

  if (data.action === "nuevo_turno") {
    if (!data.day || !data.start_time) {
      return { respuesta: "❌ Me faltó el día o el horario. Probá: 'Pablo lunes 18hs individual'." };
    }
    const dow = DIAS_MAP_TURNOS[data.day.toLowerCase()];
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
    const idsFinales = [];
    const creados = [];
    for (const n of nombres) {
      let sid = matchStudent(n, students);
      if (!sid) {
        sid = "al" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        await sbFetch("students", "POST", {
          id: sid,
          name: n,
          phone: "",
          category: "",
          format: data.format || "individual",
          monthly_fee: null,
          notes: "",
          active: true,
        });
        students.push({ id: sid, name: n });
        creados.push(n);
      }
      idsFinales.push(sid);
    }
    if (idsFinales.length) {
      await sbFetch("slot_students", "POST", idsFinales.map((sid) => ({ slot_id: slotId, student_id: sid })));
    }
    return {
      respuesta: `✅ Turno cargado: ${data.day} ${data.start_time}hs${nombres.length ? " — " + nombres.join(", ") : ""}${creados.length ? " (creé de alumno nuevo a: " + creados.join(", ") + ")" : ""}`,
    };
  }

  if (data.action === "nuevo_pago") {
    if (!data.student_name || !data.amount) {
      return { respuesta: "❌ Me faltó el nombre o el monto. Probá: 'Pablo me pagó 25000 julio' o 'Pablo le pagó a Marce 25000 julio'." };
    }
    if (!data.pagado_a) {
      return { respuesta: `❓ ¿A quién le pagó ${data.student_name}, a vos o a Marce? Respondé de nuevo aclarando eso.` };
    }
    const studentId = matchStudent(data.student_name, students);
    if (!studentId) return { respuesta: `❌ No encontré a "${data.student_name}".` };
    const period = data.period || new Date().toISOString().slice(0, 7);
    await sbFetch("payments", "POST", {
      id: "pg" + Date.now(),
      student_id: studentId,
      amount: Number(data.amount),
      period,
      method: data.method || "efectivo",
      status: data.status || "pendiente",
      pagado_a: data.pagado_a,
      paid_on: data.status === "pagado" ? new Date().toISOString().slice(0, 10) : null,
    });
    const mitad = Number(data.amount) / 2;
    const debeExplicacion =
      data.pagado_a === "agus"
        ? `Le debés $${mitad.toLocaleString("es-AR")} a Marce.`
        : `Marce te debe $${mitad.toLocaleString("es-AR")} a vos.`;
    return { respuesta: `✅ Pago cargado: ${data.student_name} — $${data.amount} (${data.status === "pagado" ? "pagado" : "pendiente"}, a ${data.pagado_a === "agus" ? "vos" : "Marce"}). ${debeExplicacion}` };
  }

  if (data.action === "nueva_cancha_abierta") {
    if (!data.fecha) return { respuesta: "❌ Me faltó la fecha. Probá: 'Cancha abierta sábado 26/7, 9hs, Pablo, Andrea'." };
    const existentes = await sbFetch("canchas_abiertas?select=id&fecha=eq." + data.fecha + "&activo=eq.true");
    let canchaId = existentes && existentes[0] ? existentes[0].id : null;
    let creadaNueva = false;
    if (!canchaId) {
      canchaId = "ca" + Date.now();
      await sbFetch("canchas_abiertas", "POST", {
        id: canchaId,
        nombre: data.nombre || "Cancha abierta",
        fecha: data.fecha,
        hora: data.hora || "09:00",
        hora_fin: data.hora_fin || "",
        cupo: data.cupo || 16,
        precio: data.precio || 20000,
        categorias: data.categorias || "",
        organizador: data.organizador || "",
        activo: true,
      });
      creadaNueva = true;
    }
    const nombres = data.player_names || [];
    if (nombres.length) {
      await sbFetch(
        "canchas_inscriptos",
        "POST",
        nombres.map((n) => ({
          id: "ca" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          cancha_id: canchaId,
          nombre: n,
          tel: "",
          metodo: "admin",
          es_admin: true,
          estado: "confirmada",
          fecha: new Date().toLocaleDateString("es-AR"),
        }))
      );
    }
    return {
      respuesta: `✅ ${creadaNueva ? "Cancha creada" : "Sumados a la cancha existente"}: ${data.fecha} ${data.hora || ""}hs${nombres.length ? " (" + nombres.join(", ") + ")" : ""}`,
    };
  }

  if (data.action === "cancha_recurrente") {
    if (!data.day) return { respuesta: "❌ Me faltó el día." };
    const dow = DIAS_MAP[data.day.toLowerCase()];
    const nombresNuevos = data.player_names || [];
    const existentes = await sbFetch("canchas_recurrentes?select=*&day_of_week=eq." + dow + "&active=eq.true");
    const existente = existentes && existentes[0] ? existentes[0] : null;
    if (existente) {
      const yaTiene = (existente.player_names || []).map((n) => n.toLowerCase());
      const aAgregar = nombresNuevos.filter((n) => !yaTiene.includes(n.toLowerCase()));
      const listaFinal = [...(existente.player_names || []), ...aAgregar];
      await sbFetch("canchas_recurrentes?id=eq." + existente.id, "PATCH", { player_names: listaFinal });
      return { respuesta: aAgregar.length ? `✅ Sumados: ${aAgregar.join(", ")}` : `ℹ️ Ya estaban: ${listaFinal.join(", ")}` };
    }
    await sbFetch("canchas_recurrentes", "POST", {
      id: "cr" + Date.now(),
      day_of_week: dow,
      nombre: data.nombre || "Cancha abierta",
      hora: data.hora || "09:00",
      hora_fin: data.hora_fin || "",
      cupo: data.cupo || 16,
      precio: data.precio || 20000,
      categorias: data.categorias || "",
      organizador: data.organizador || "",
      player_names: nombresNuevos,
      active: true,
    });
    return { respuesta: `✅ Cancha recurrente creada: todos los ${data.day} ${data.hora || ""}hs con ${nombresNuevos.join(", ") || "sin jugadores todavía"}.` };
  }

  if (data.action === "agregar_a_cancha") {
    const nombresNuevos = data.player_names || [];
    if (!nombresNuevos.length) return { respuesta: "❌ No entendí a quién sumar." };
    if (!data.day && !data.fecha) return { respuesta: "❌ No entendí para qué día." };
    const dow = data.day ? DIAS_MAP[data.day.toLowerCase()] : null;
    const fechaObjetivo = data.fecha || (dow !== null ? proximaFechaDia(dow) : null);

    if (fechaObjetivo) {
      const existentes = await sbFetch("canchas_abiertas?select=id&fecha=eq." + fechaObjetivo + "&activo=eq.true");
      if (existentes && existentes[0]) {
        const canchaId = existentes[0].id;
        await sbFetch(
          "canchas_inscriptos",
          "POST",
          nombresNuevos.map((n) => ({
            id: "ca" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            cancha_id: canchaId,
            nombre: n,
            tel: "",
            metodo: "admin",
            es_admin: true,
            estado: "confirmada",
            fecha: new Date().toLocaleDateString("es-AR"),
          }))
        );
        return { respuesta: `✅ Sumados a la cancha del ${fechaObjetivo}: ${nombresNuevos.join(", ")}` };
      }
    }
    if (dow !== null) {
      const recurrentes = await sbFetch("canchas_recurrentes?select=*&day_of_week=eq." + dow + "&active=eq.true");
      const rec = recurrentes && recurrentes[0] ? recurrentes[0] : null;
      if (rec) {
        const yaTiene = (rec.player_names || []).map((n) => n.toLowerCase());
        const aAgregar = nombresNuevos.filter((n) => !yaTiene.includes(n.toLowerCase()));
        const listaFinal = [...(rec.player_names || []), ...aAgregar];
        await sbFetch("canchas_recurrentes?id=eq." + rec.id, "PATCH", { player_names: listaFinal });
        return { respuesta: aAgregar.length ? `✅ Sumados: ${aAgregar.join(", ")}` : `ℹ️ Ya estaban: ${listaFinal.join(", ")}` };
      }
    }
    return { respuesta: `❌ No encontré ninguna cancha cargada para ese día. Creála primero.` };
  }

  if (data.action === "liquidacion_marce") {
    if (!data.monto || !data.direccion) {
      return { respuesta: "❌ Me faltó el monto o si fue de vos a Marce o al revés. Probá: 'Le di 18000 a Marcelo' o 'Marcelo me dio 18000'." };
    }
    await sbFetch("liquidaciones_marce", "POST", {
      id: "lq" + Date.now(),
      monto: Number(data.monto),
      direccion: data.direccion,
      notas: data.notas || "",
      fecha: new Date().toISOString().slice(0, 10),
    });
    return {
      respuesta: `✅ Liquidación registrada: ${data.direccion === "agus_a_marce" ? "le diste" : "te dio"} $${Number(data.monto).toLocaleString("es-AR")} ${data.direccion === "agus_a_marce" ? "a Marce" : "Marce"}. Preguntame "¿cuánto le debo a Marce?" para ver el saldo actualizado.`,
    };
  }

  if (data.action === "eliminar_alumno") {
    if (!data.student_name) return { respuesta: "❌ No entendí a quién eliminar." };
    const studentId = matchStudent(data.student_name, students);
    if (!studentId) return { respuesta: `❌ No encontré a "${data.student_name}".` };
    await sbFetch("students?id=eq." + studentId, "DELETE");
    return { respuesta: `✅ Alumno eliminado: ${data.student_name}` };
  }

  return {
    respuesta: `🤔 No entendí bien ese mensaje${data.motivo ? " (" + data.motivo + ")" : ""}. Probá algo como:\n• "Nuevo alumno Pablo, 5ta"\n• "Pablo lunes 18hs individual"\n• "Pablo pagó 25000 julio"\n• "Cancha abierta sábado 26/7, 9hs, Pablo, Andrea"\n• "¿Cuántos alumnos tengo?"`,
  };
}

function matchStudent(name, students) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const exact = students.find((s) => s.name.toLowerCase() === n);
  if (exact) return exact.id;
  const partial = students.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase().split(" ")[0]));
  return partial ? partial.id : null;
}

function proximaFechaDia(dayOfWeek) {
  const hoy = new Date();
  let diff = dayOfWeek - hoy.getDay();
  if (diff < 0) diff += 7;
  const fecha = new Date(hoy);
  fecha.setDate(hoy.getDate() + diff);
  return fecha.toISOString().slice(0, 10);
}
