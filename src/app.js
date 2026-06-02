import { useState, useEffect } from "react";

// ─── Storage ──────────────────────────────────────────────────────────────
const KEY = "pdopadel_v1";
const persist = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
const restore = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };

// ─── Constantes ───────────────────────────────────────────────────────────
const CATS = ["9ª", "8ª", "7ª", "6ª", "5ª", "4ª", "3ª", "2ª", "1ª"];
const CAT_IDX = Object.fromEntries(CATS.map((c, i) => [c, i]));
const TIPOS = ["Caballeros", "Damas", "Mixto"];
const TIPO_COLOR = { Caballeros: "#3b82f6", Damas: "#ec4899", Mixto: "#8b5cf6" };
const TIPO_ICON  = { Caballeros: "♂", Damas: "♀", Mixto: "⚤" };
const ADMIN_PASS = "pdoadmin";

const SEED_SLOTS = [
  { id: "s1", fecha: "2026-06-07", hora: "09:00", tipo: null, catBase: null, inscriptos: [], cupo: 4, activo: true },
  { id: "s2", fecha: "2026-06-07", hora: "10:30", tipo: null, catBase: null, inscriptos: [], cupo: 4, activo: true },
  { id: "s3", fecha: "2026-06-07", hora: "15:00", tipo: "Mixto", catBase: "8ª",
    inscriptos: [
      { nombre: "Pau", telefono: "1122334455", tipo: "Mixto", cat: "8ª", genero: "F" },
      { nombre: "Claudio", telefono: "1155667788", tipo: "Mixto", cat: "9ª", genero: "M" },
    ], cupo: 4, activo: true },
  { id: "s4", fecha: "2026-06-08", hora: "11:00", tipo: null, catBase: null, inscriptos: [], cupo: 4, activo: true },
];

function fmtFecha(str) {
  const [y, m, d] = str.split("-");
  const dias = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const dt = new Date(+y, +m - 1, +d);
  return `${dias[dt.getDay()]} ${+d} ${meses[+m - 1]}`;
}

function whatsappLink(slot) {
  const names = slot.inscriptos.map(i => i.nombre).join(", ");
  const msg = `🎾 *Partido completo – Punto de Oro Pádel*\n📅 ${fmtFecha(slot.fecha)} a las ${slot.hora}\n🏷 ${slot.tipo} · ${slot.catBase}\n👥 ${names}\n¡Los esperamos en cancha!`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// ─── Componente: badge tipo ───────────────────────────────────────────────
function TipoBadge({ tipo }) {
  if (!tipo) return <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>por definir</span>;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: `${TIPO_COLOR[tipo]}22`, color: TIPO_COLOR[tipo], border: `1px solid ${TIPO_COLOR[tipo]}44`,
      letterSpacing: 0.3,
    }}>{TIPO_ICON[tipo]} {tipo}</span>
  );
}

// ─── Componente: avatar jugador ───────────────────────────────────────────
function Avatar({ nombre, genero }) {
  const c = genero === "F" ? "#ec4899" : genero === "M" ? "#3b82f6" : "#8b5cf6";
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      background: `${c}18`, border: `1.5px solid ${c}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 700, color: c,
    }}>{nombre[0].toUpperCase()}</div>
  );
}

// ─── Vista pública: card de turno ─────────────────────────────────────────
function SlotCard({ slot, onAnot }) {
  const lleno = slot.inscriptos.length >= slot.cupo;
  const pct   = (slot.inscriptos.length / slot.cupo) * 100;

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${lleno ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 16, padding: "16px 18px", marginBottom: 12,
      transition: "border-color 0.2s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',cursive", letterSpacing: 2, color: "#fff" }}>
            {slot.hora}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{fmtFecha(slot.fecha)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <TipoBadge tipo={slot.tipo} />
          {slot.catBase && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              cat. {slot.catBase} ±1
            </span>
          )}
        </div>
      </div>

      {/* Barra progreso */}
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 4, marginBottom: 10 }}>
        <div style={{
          height: 4, borderRadius: 4, transition: "width 0.4s",
          width: `${pct}%`,
          background: lleno ? "#34d399" : "#818cf8",
        }} />
      </div>

      {/* Inscriptos */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, minHeight: 32, alignItems: "center" }}>
        {slot.inscriptos.length === 0
          ? <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>Sé el primero en anotarte</span>
          : slot.inscriptos.map((ins, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Avatar nombre={ins.nombre} genero={ins.genero} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{ins.nombre}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{ins.cat}</div>
              </div>
            </div>
          ))
        }
        {/* Lugares vacíos */}
        {Array.from({ length: slot.cupo - slot.inscriptos.length }).map((_, i) => (
          <div key={`empty-${i}`} style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "1.5px dashed rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "rgba(255,255,255,0.15)",
          }}>+</div>
        ))}
      </div>

      {lleno ? (
        <div style={{ textAlign: "center", padding: "8px 0", fontSize: 13, color: "#34d399", fontWeight: 700 }}>
          ✓ Partido completo
        </div>
      ) : (
        <button onClick={() => onAnot(slot)} style={{
          width: "100%", padding: "10px 0", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg, #4f46e5, #818cf8)",
          color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
          fontFamily: "'Bebas Neue',cursive", letterSpacing: 1.5,
        }}>ANOTARSE</button>
      )}
    </div>
  );
}

// ─── Modal: anotarse ──────────────────────────────────────────────────────
function ModalAnot({ slot, onClose, onConfirm }) {
  const esPrimero = slot.inscriptos.length === 0;
  const [nombre,   setNombre]   = useState("");
  const [tel,      setTel]      = useState("");
  const [tipo,     setTipo]     = useState(slot.tipo || "");
  const [cat,      setCat]      = useState(slot.catBase || "");
  const [genero,   setGenero]   = useState("");
  const [error,    setError]    = useState("");

  // Categorías permitidas
  const catsPermitidas = () => {
    const base = slot.catBase || cat;
    if (!base) return CATS;
    const idx = CAT_IDX[base];
    return CATS.filter((_, i) => Math.abs(i - idx) <= 1);
  };

  // Para mixto: validar que el partido no quede desequilibrado (máx 2 de cada género)
  const generoOk = () => {
    if (!tipo || tipo !== "Mixto") return true;
    if (!genero) return false;
    const cnt = slot.inscriptos.filter(i => i.genero === genero).length;
    return cnt < slot.cupo / 2;
  };

  const submit = () => {
    if (!nombre.trim()) return setError("Ingresá tu nombre.");
    if (!tel.trim() || tel.length < 8) return setError("Ingresá un teléfono válido.");
    if (!tipo) return setError("Elegí el tipo de partido.");
    if (!cat) return setError("Elegí tu categoría.");
    if (tipo === "Mixto" && !genero) return setError("Indicá tu género para el mixto.");
    if (!generoOk()) return setError(`Ya hay 2 ${genero === "M" ? "hombres" : "damas"} anotados.`);
    onConfirm({ nombre: nombre.trim(), telefono: tel.trim(), tipo, cat, genero: genero || "M" });
  };

  const inp = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 13px", color: "#fff", fontSize: 14, outline: "none", width: "100%" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0f0f1a", borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 22, letterSpacing: 2, color: "#fff" }}>ANOTARSE</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{slot.hora} · {fmtFecha(slot.fecha)}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.5)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input style={inp} placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
          <input style={inp} placeholder="WhatsApp (ej: 1155667788)" value={tel} onChange={e => setTel(e.target.value.replace(/\D/g, ""))} type="tel" />

          {/* Tipo */}
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>TIPO DE PARTIDO</div>
            <div style={{ display: "flex", gap: 6 }}>
              {TIPOS.map(t => {
                const locked = !!slot.tipo && slot.tipo !== t;
                return (
                  <button key={t} onClick={() => !locked && setTipo(t)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 9, cursor: locked ? "not-allowed" : "pointer",
                    border: `1.5px solid ${tipo === t ? TIPO_COLOR[t] : "rgba(255,255,255,0.08)"}`,
                    background: tipo === t ? `${TIPO_COLOR[t]}18` : "transparent",
                    color: locked ? "rgba(255,255,255,0.15)" : tipo === t ? TIPO_COLOR[t] : "rgba(255,255,255,0.35)",
                    fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                  }}>{TIPO_ICON[t]} {t}</button>
                );
              })}
            </div>
            {!esPrimero && slot.tipo && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 5 }}>
                El tipo ya fue definido por el primer inscripto.
              </div>
            )}
          </div>

          {/* Categoría */}
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>TU CATEGORÍA</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(esPrimero ? CATS : catsPermitidas()).map(c => (
                <button key={c} onClick={() => setCat(c)} style={{
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                  border: `1.5px solid ${cat === c ? "#818cf8" : "rgba(255,255,255,0.08)"}`,
                  background: cat === c ? "rgba(129,140,248,0.18)" : "transparent",
                  color: cat === c ? "#818cf8" : "rgba(255,255,255,0.4)",
                  fontSize: 13, fontWeight: 700, transition: "all 0.15s",
                }}>{c}</button>
              ))}
            </div>
            {!esPrimero && slot.catBase && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 5 }}>
                Permitido: ±1 categoría de la {slot.catBase}.
              </div>
            )}
          </div>

          {/* Género (solo mixto) */}
          {tipo === "Mixto" && (
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>TU GÉNERO</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ v: "M", l: "♂ Caballero" }, { v: "F", l: "♀ Dama" }].map(g => {
                  const cnt = slot.inscriptos.filter(i => i.genero === g.v).length;
                  const full = cnt >= slot.cupo / 2;
                  return (
                    <button key={g.v} onClick={() => !full && setGenero(g.v)} style={{
                      flex: 1, padding: "8px 0", borderRadius: 9, cursor: full ? "not-allowed" : "pointer",
                      border: `1.5px solid ${genero === g.v ? (g.v === "M" ? "#3b82f6" : "#ec4899") : "rgba(255,255,255,0.08)"}`,
                      background: genero === g.v ? `${g.v === "M" ? "#3b82f640" : "#ec489940"}` : "transparent",
                      color: full ? "rgba(255,255,255,0.2)" : genero === g.v ? (g.v === "M" ? "#3b82f6" : "#ec4899") : "rgba(255,255,255,0.4)",
                      fontSize: 13, fontWeight: 700, transition: "all 0.15s",
                    }}>{g.l} {full ? "(lleno)" : `(${cnt}/2)`}</button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: "#f87171", padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>⚠️ {error}</div>}

          <button onClick={submit} style={{
            marginTop: 4, padding: "13px 0", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg,#4f46e5,#818cf8)",
            color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
            fontFamily: "'Bebas Neue',cursive", letterSpacing: 2,
          }}>CONFIRMAR INSCRIPCIÓN</button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel admin ──────────────────────────────────────────────────────────
function AdminPanel({ slots, setSlots, onLogout }) {
  const [form, setForm] = useState({ fecha: "", hora: "", cupo: 4 });
  const [msg,  setMsg]  = useState("");

  const addSlot = () => {
    if (!form.fecha || !form.hora) return setMsg("Completá fecha y hora.");
    const nuevo = {
      id: `s${Date.now()}`, fecha: form.fecha, hora: form.hora,
      tipo: null, catBase: null, inscriptos: [], cupo: +form.cupo, activo: true,
    };
    setSlots(ss => [nuevo, ...ss]);
    setForm({ fecha: "", hora: "", cupo: 4 });
    setMsg("✓ Turno agregado.");
    setTimeout(() => setMsg(""), 2000);
  };

  const toggleSlot = (id) => setSlots(ss => ss.map(s => s.id === id ? { ...s, activo: !s.activo } : s));

  const removeInscripto = (slotId, idx) =>
    setSlots(ss => ss.map(s => {
      if (s.id !== slotId) return s;
      const ins = s.inscriptos.filter((_, i) => i !== idx);
      // Si se vacía, resetear tipo/cat
      return { ...s, inscriptos: ins, tipo: ins.length ? s.tipo : null, catBase: ins.length ? s.catBase : null };
    }));

  const inp = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 20, letterSpacing: 2, color: "#f59e0b" }}>PANEL ADMIN</div>
        <button onClick={onLogout} style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Salir</button>
      </div>

      {/* Nuevo turno */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>+ Nuevo turno</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={{ ...inp, flex: 1, minWidth: 130, colorScheme: "dark" }} />
          <input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} style={{ ...inp, width: 100, colorScheme: "dark" }} />
          <select value={form.cupo} onChange={e => setForm(f => ({ ...f, cupo: +e.target.value }))} style={{ ...inp, width: 80 }}>
            {[4, 6, 8].map(n => <option key={n} value={n} style={{ background: "#1a1a2e" }}>{n} cupos</option>)}
          </select>
          <button onClick={addSlot} style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Agregar</button>
        </div>
        {msg && <div style={{ marginTop: 8, fontSize: 12, color: "#34d399" }}>{msg}</div>}
      </div>

      {/* Lista turnos */}
      {slots.map(slot => (
        <div key={slot.id} style={{
          background: "rgba(255,255,255,0.02)", border: `1px solid ${slot.activo ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)"}`,
          borderRadius: 14, padding: "14px 16px", marginBottom: 10,
          opacity: slot.activo ? 1 : 0.45,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 18, letterSpacing: 1, color: "#fff" }}>{slot.hora}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{fmtFecha(slot.fecha)}</span>
              <TipoBadge tipo={slot.tipo} />
              {slot.catBase && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{slot.catBase} ±1</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {slot.inscriptos.length === slot.cupo && (
                <a href={whatsappLink(slot)} target="_blank" rel="noreferrer" style={{
                  fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7,
                  background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.3)",
                  color: "#25d366", textDecoration: "none",
                }}>📲 WA</a>
              )}
              <button onClick={() => toggleSlot(slot.id)} style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                background: slot.activo ? "rgba(239,68,68,0.1)" : "rgba(52,211,153,0.1)",
                border: `1px solid ${slot.activo ? "rgba(239,68,68,0.25)" : "rgba(52,211,153,0.25)"}`,
                color: slot.activo ? "#f87171" : "#34d399", fontWeight: 700,
              }}>{slot.activo ? "Pausar" : "Activar"}</button>
            </div>
          </div>

          {/* Inscriptos admin */}
          {slot.inscriptos.length === 0
            ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>Sin inscriptos</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {slot.inscriptos.map((ins, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                    <Avatar nombre={ins.nombre} genero={ins.genero} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>{ins.nombre}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>📞 {ins.telefono} · {ins.cat}</span>
                    </div>
                    <button onClick={() => removeInscripto(slot.id, i)} style={{ background: "transparent", border: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer", fontSize: 16 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            {slot.inscriptos.length}/{slot.cupo} inscriptos
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Login admin ──────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [pass, setPass] = useState("");
  const [err,  setErr]  = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "40px 20px" }}>
      <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 24, letterSpacing: 3, color: "#f59e0b", textAlign: "center" }}>ACCESO ADMIN</div>
      <input type="password" placeholder="Contraseña" value={pass}
        onChange={e => { setPass(e.target.value); setErr(false); }}
        onKeyDown={e => e.key === "Enter" && (pass === ADMIN_PASS ? onLogin() : setErr(true))}
        style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${err ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none" }}
      />
      {err && <div style={{ fontSize: 12, color: "#f87171" }}>Contraseña incorrecta.</div>}
      <button onClick={() => pass === ADMIN_PASS ? onLogin() : setErr(true)} style={{
        background: "#f59e0b", color: "#000", border: "none", borderRadius: 10,
        padding: "12px 0", fontWeight: 800, cursor: "pointer", fontSize: 14,
        fontFamily: "'Bebas Neue',cursive", letterSpacing: 2,
      }}>INGRESAR</button>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>Demo: contraseña = pdoadmin</div>
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────────────────
export default function App() {
  const [slots,     setSlots]     = useState(SEED_SLOTS);
  const [view,      setView]      = useState("public"); // public | admin
  const [adminAuth, setAdminAuth] = useState(false);
  const [modal,     setModal]     = useState(null); // slot activo para modal
  const [toast,     setToast]     = useState("");
  const [filtroFecha, setFiltroFecha] = useState("todos");

  useEffect(() => {
    const d = restore();
    if (d?.slots) setSlots(d.slots);
  }, []);

  useEffect(() => { persist({ slots }); }, [slots]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const handleAnot = (slot, datos) => {
    setSlots(ss => ss.map(s => {
      if (s.id !== slot.id) return s;
      const ins  = [...s.inscriptos, datos];
      const lleno = ins.length >= s.cupo;
      // Primer inscripto define tipo y catBase
      const tipo    = s.inscriptos.length === 0 ? datos.tipo : s.tipo;
      const catBase = s.inscriptos.length === 0 ? datos.cat  : s.catBase;
      if (lleno) setTimeout(() => {
        showToast("🎾 ¡Partido completo! Abrí WhatsApp para avisar a todos.");
        window.open(whatsappLink({ ...s, inscriptos: ins, tipo, catBase }), "_blank");
      }, 300);
      return { ...s, inscriptos: ins, tipo, catBase };
    }));
    setModal(null);
    showToast(`✓ ${datos.nombre} anotado/a`);
  };

  const slotsActivos = slots.filter(s => s.activo);
  const fechas = [...new Set(slotsActivos.map(s => s.fecha))].sort();
  const slotsFiltrados = filtroFecha === "todos"
    ? slotsActivos
    : slotsActivos.filter(s => s.fecha === filtroFecha);

  return (
    <div style={{ minHeight: "100vh", background: "#080810", fontFamily: "'Inter',sans-serif", color: "#fff", paddingBottom: 48 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        select option, input { background: #12121f; }
        a { color: inherit; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(180deg,#0f0f1a,#080810)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "18px 16px 0" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 28, letterSpacing: 3, color: "#f59e0b" }}>PUNTO DE ORO</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: 3 }}>PÁDEL</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>📍 Av. Boyacá 1766</div>
            </div>
            <button onClick={() => setView(v => v === "admin" ? "public" : "admin")} style={{
              fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
              background: view === "admin" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${view === "admin" ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: view === "admin" ? "#f59e0b" : "rgba(255,255,255,0.4)", cursor: "pointer",
            }}>{view === "admin" ? "⚙ Admin" : "⚙"}</button>
          </div>

          {view === "public" && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "14px 0 0", paddingBottom: 0 }}>
              <button onClick={() => setFiltroFecha("todos")} style={{
                flexShrink: 0, padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                background: filtroFecha === "todos" ? "#f59e0b" : "rgba(255,255,255,0.05)",
                color: filtroFecha === "todos" ? "#000" : "rgba(255,255,255,0.4)",
              }}>Todos</button>
              {fechas.map(f => (
                <button key={f} onClick={() => setFiltroFecha(f)} style={{
                  flexShrink: 0, padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                  background: filtroFecha === f ? "#f59e0b" : "rgba(255,255,255,0.05)",
                  color: filtroFecha === f ? "#000" : "rgba(255,255,255,0.4)",
                }}>{fmtFecha(f)}</button>
              ))}
            </div>
          )}

          <div style={{ height: 14 }} />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 14px" }}>

        {/* Vista pública */}
        {view === "public" && (
          <div>
            {slotsFiltrados.length === 0
              ? <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>No hay turnos disponibles</div>
              : slotsFiltrados.map(slot => (
                <SlotCard key={slot.id} slot={slot} onAnot={setModal} />
              ))
            }
          </div>
        )}

        {/* Vista admin */}
        {view === "admin" && (
          adminAuth
            ? <AdminPanel slots={slots} setSlots={setSlots} onLogout={() => { setAdminAuth(false); setView("public"); }} />
            : <AdminLogin onLogin={() => setAdminAuth(true)} />
        )}
      </div>

      {/* Modal inscripción */}
      {modal && (
        <ModalAnot
          slot={modal}
          onClose={() => setModal(null)}
          onConfirm={(datos) => handleAnot(modal, datos)}
        />
      )}
    </div>
  );
}
