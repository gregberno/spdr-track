import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "./supabase";
import AuthPage from "./AuthPage";
import { loadMissions, acceptMission, refuseMission, completeMission, checkExpiredMissions, requestMission } from "./missionEngine";
import { loadLeaderboard } from "./leaderboard";
import { ADMIN_EMAIL, adminGetStats, adminGetUsers, adminGetUserEntries, adminGetUserMissions, adminInsertMission } from "./admin";

/* ═══ UTILS ═══ */
const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const wkS = d => { const y = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - y + (y === 0 ? -6 : 1)); };
const wkE = d => { const s = wkS(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); };
const rng = (a, b) => { const r = []; const c = new Date(a); while (c <= b) { r.push(new Date(c)); c.setDate(c.getDate() + 1); } return r; };
const DJ = ["L","M","M","J","V","S","D"];
const MO = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
const DF = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

/* ═══ DATA ═══ */
const BUILTIN_HA = [
  { k:"steps", l:"10K Pas", t:"boolean", i:"🏃", n:"bonus", p:10 },
  { k:"fap", l:"Fap", t:"boolean", i:"💀", n:"malus", p:-20 },
  { k:"deepwork", l:"Deep Work", t:"number", i:"⚡", n:"bonus", p:8 },
  { k:"social", l:"Social", t:"number", i:"🤝", n:"bonus", p:5 },
  { k:"approaches", l:"Abordages", t:"number", i:"💬", n:"bonus", p:12 },
  { k:"trainings", l:"Training", t:"number", i:"💪", n:"bonus", p:10 },
  { k:"restaurants", l:"Restos", t:"number", i:"🍽️", n:"malus", p:-10 },
];
const BUILTIN_KEYS = new Set(BUILTIN_HA.map(h => h.k));
const GD = { steps:true, fap:0, deepwork:2, social:1, restaurants:0, approaches:1, trainings:1, bonus_goal_hit:5, removed_habits:[] };

/* ═══ EMOJI DATA ═══ */
const EMOJI_CATS = [
  { l:"Sport", e:["🏃","💪","🏋️","⚽","🏀","🎾","🏊","🚴","🧘","🥊","🏈","⛹️","🤸","🏄","🎯","🏆","🥇","🧗","🤾","⛷️"] },
  { l:"Santé", e:["❤️","🧠","💊","🩺","😴","💤","🧘","🫀","🫁","🦷","👁️","💉","🩹","🏥","♻️","🌿","☀️","💧","🫧","🧴"] },
  { l:"Travail", e:["⚡","💻","📚","✏️","📝","🎓","💡","🔬","📊","📈","🗂️","📁","🖊️","🧑‍💻","👨‍🔬","🔧","⚙️","🛠️","📐","🧮"] },
  { l:"Social", e:["🤝","💬","👥","🗣️","❤️‍🔥","💌","🎉","🥂","👋","🫂","😊","😎","🤗","🥰","😇","🧑‍🤝‍🧑","👫","👨‍👩‍👧","📞","📱"] },
  { l:"Nourriture", e:["🍽️","🥗","🍎","🥑","🍳","🥩","🍕","🍔","🍜","☕","🧃","🍺","🍷","🥤","🧁","🍰","🍫","🌮","🥐","🫖"] },
  { l:"Loisirs", e:["🎮","🎵","🎬","📖","🎨","🎸","🎹","🎲","♟️","🎭","📸","🎤","🎧","🕹️","🎻","🖼️","🎶","📺","🎪","🧩"] },
  { l:"Argent", e:["💰","💸","💳","🏦","📉","📈","🪙","💎","🛒","🛍️","💵","🧾","📦","🏠","🚗","✈️","🎟️","🔑","🏷️","⭐"] },
  { l:"Négatif", e:["💀","👎","🚫","⛔","🔴","😡","😤","🤬","💢","🚬","🍺","📵","🙅","❌","⚠️","☠️","🥀","😈","👿","🤮"] },
];
const LIMITS = { bonus:10, malus:10, objectif:5 };

/* ═══ POINTS ═══ */
/* Habit-only score for a single day entry */
function calc(e, g, habits) {
  if (!e) return { t:0, b:[] };
  let t = 0; const b = [], bh = g.bonus_goal_hit || 5;
  habits.forEach(h => {
    const v = e[h.k], gl = g[h.k];
    if (h.n === "malus") {
      if (h.t === "boolean" && v) { t += h.p; b.push({ l:h.l, i:h.i, p:h.p, c:"m" }); }
      else if (h.t === "number" && v > 0) { const p = h.p*v; t += p; b.push({ l:`${h.l}×${v}`, i:h.i, p, c:"m" }); }
      if (h.k === "fap" && !v) { t += 15; b.push({ l:"No Fap", i:"🧠", p:15, c:"b" }); }
      if (h.t === "number" && v <= (gl||0)) { t += bh; b.push({ l:`${h.l} ✓`, i:"🎯", p:bh, c:"g" }); }
    } else if (h.n === "objectif") {
      if (h.t === "boolean" && v) { t += h.p; b.push({ l:h.l, i:h.i, p:h.p, c:"b" }); }
      else if (h.t === "number" && v > 0) { const p = h.p*v; t += p; b.push({ l:`${h.l}×${v}`, i:h.i, p, c:"b" }); }
    } else {
      if (h.t === "boolean" && v) { t += h.p; b.push({ l:h.l, i:h.i, p:h.p, c:"b" }); if (v===gl) { t+=bh; b.push({l:`${h.l} ✓`,i:"🎯",p:bh,c:"g"}); } }
      else if (h.t === "number" && v > 0) { const p = h.p*v; t += p; b.push({ l:`${h.l}×${v}`, i:h.i, p, c:"b" }); if (v>=gl&&gl>0) { t+=bh; b.push({l:`${h.l} ✓`,i:"🎯",p:bh,c:"g"}); } }
    }
  });
  return { t, b };
}

/* Mission points for a single date string (YYYY-MM-DD) */
function missionPtsForDate(missions, dateStr) {
  let s = 0;
  missions.forEach(m => {
    if (m.status === "completed" && m.completed_at && m.completed_at.slice(0, 10) === dateStr) s += m.points;
    if (m.status === "failed") {
      const failDate = (m.deadline || m.created_at || "").slice(0, 10);
      if (failDate === dateStr) s -= m.points;
    }
  });
  return s;
}

/* Total score for a date = habits + missions */
function dayScore(dateStr, entries, goals, habits, missions) {
  const e = entries[dateStr];
  return calc(e, goals, habits).t + missionPtsForDate(missions, dateStr);
}

/* ═══ DB ═══ */
const normDate = d => typeof d === "string" ? d.slice(0, 10) : d;
const DB = {
  async ld(uid) {
    const { data, error } = await supabase.from("daily_entries").select("*").eq("user_id", uid);
    if (error) { console.error("DB.ld error:", error); return {}; }
    const m = {};
    (data || []).forEach(r => {
      const cd = r.custom_data || {};
      delete r.custom_data;
      m[normDate(r.date)] = { ...r, ...cd, date: normDate(r.date) };
    });
    return m;
  },
  async lg(uid) {
    const { data, error } = await supabase.from("goals").select("*").eq("user_id", uid).limit(1).single();
    if (error && error.code !== "PGRST116") console.error("DB.lg error:", error);
    return data;
  },
  async sv(d, e, habits, uid) {
    const r = { date: d, user_id: uid };
    const cd = {};
    habits.forEach(h => {
      if (e[h.k] !== undefined) {
        if (BUILTIN_KEYS.has(h.k)) r[h.k] = e[h.k];
        else cd[h.k] = e[h.k];
      }
    });
    r.custom_data = cd;
    const { error } = await supabase.from("daily_entries").upsert(r, { onConflict: "user_id,date" });
    if (error) console.error("DB.sv error:", error);
    return !error;
  },
  async sg(g, uid) {
    const r = { ...g, user_id: uid };
    delete r.created_at;
    let res;
    if (r.id) { res = await supabase.from("goals").update(r).eq("id", r.id); }
    else { delete r.id; res = await supabase.from("goals").upsert(r, { onConflict: "user_id" }); }
    if (res.error) console.error("DB.sg error:", res.error);
  },
};

/* ═══ DESIGN TOKENS ═══ */
const mono = "'JetBrains Mono','SF Mono',monospace";
const sans = "'SF Pro Display','Inter',-apple-system,sans-serif";
const G = "#34d399", M = "#f87171", GO = "#fbbf24";
const glass = "rgba(255,255,255,.03)";
const border = "rgba(255,255,255,.06)";
const dim = "rgba(255,255,255,.3)";
const faint = "rgba(255,255,255,.08)";
const CAT_COLORS = { sport: G, social: "#60a5fa", culture: "#a78bfa" };
const catColor = c => CAT_COLORS[c] || dim;

/* ═══ RESPONSIVE ═══ */
function useW() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 400);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return w;
}

/* ═══ TILE ═══ */
const Tile = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{
    background: glass, border: `1px solid ${border}`, borderRadius: 16,
    padding: 24, position: "relative", overflow: "hidden",
    ...style,
  }}>{children}</div>
);

/* ═══ MICRO COMPONENTS ═══ */
function Tog({ on, set, bad }) {
  return <div onClick={() => set(!on)} style={{ width:52, height:30, borderRadius:15, background:on?(bad?"rgba(248,113,113,.25)":"rgba(52,211,153,.25)"):faint, cursor:"pointer", position:"relative", transition:"all .2s", border:`1px solid ${on?(bad?"rgba(248,113,113,.3)":"rgba(52,211,153,.3)"):"transparent"}`, flexShrink:0 }}>
    <div style={{ width:24, height:24, borderRadius:12, background:on?(bad?M:G):"rgba(255,255,255,.2)", position:"absolute", top:2, left:on?25:2, transition:"all .2s cubic-bezier(.4,0,.2,1)" }} />
  </div>;
}

function Num({ v, set }) {
  const btn = { width:34, height:34, borderRadius:10, border:`1px solid ${border}`, background:glass, color:"#fff", fontSize:17, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", userSelect:"none", transition:"background .15s" };
  return <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
    <div onClick={() => set(Math.max(0,v-1))} style={btn}>−</div>
    <span style={{ fontSize:20, fontWeight:700, width:30, textAlign:"center", fontFamily:mono, color:v>0?"#fff":"rgba(255,255,255,.12)" }}>{v}</span>
    <div onClick={() => set(v+1)} style={btn}>+</div>
  </div>;
}

/* ═══ EMOJI PICKER ═══ */
function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(0);
  return <div style={{ position:"relative" }}>
    <div onClick={() => setOpen(!open)} style={{ width:44, height:44, borderRadius:12, background:faint, border:`1px solid ${border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, cursor:"pointer", userSelect:"none", transition:"border-color .15s" }}>
      {value || <span style={{ fontSize:14, color:dim }}>😀</span>}
    </div>
    {open && <>
      <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, zIndex:300 }} />
      <div style={{ position:"fixed", bottom:"auto", left:"50%", top:"50%", transform:"translate(-50%,-50%)", width:"min(320px, calc(100vw - 32px))", background:"#16162a", border:`1px solid ${border}`, borderRadius:16, padding:14, zIndex:301, boxShadow:"0 12px 40px rgba(0,0,0,.6)" }}>
        <div style={{ display:"flex", gap:4, marginBottom:10, overflowX:"auto", paddingBottom:4 }}>
          {EMOJI_CATS.map((c, i) => <div key={i} onClick={() => setCat(i)} style={{ padding:"4px 10px", borderRadius:8, background:cat===i?faint:"transparent", border:`1px solid ${cat===i?border:"transparent"}`, color:cat===i?"#fff":dim, fontSize:11, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all .15s" }}>{c.l}</div>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
          {EMOJI_CATS[cat].e.map((em, i) => <div key={i} onClick={() => { onChange(em); setOpen(false); }} style={{ width:38, height:38, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, cursor:"pointer", transition:"background .1s", background:"transparent" }} onMouseEnter={e => e.currentTarget.style.background=faint} onMouseLeave={e => e.currentTarget.style.background="transparent"}>{em}</div>)}
        </div>
      </div>
    </>}
  </div>;
}

/* ═══ HABIT ROW ═══ */
function HabitRow({ h, v, set, goal, bgh, compact }) {
  const on = h.t === "boolean" ? v : v > 0;
  const bad = h.n === "malus";
  const nf = h.k === "fap" && !v;
  const isObj = h.n === "objectif";
  const gh = isObj ? false : h.t === "boolean" ? (bad ? !v : v === goal) : (bad ? v <= (goal||0) : v >= goal && goal > 0);

  return <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:compact?"12px 0":"16px 0", borderBottom:`1px solid ${border}` }}>
    <div style={{ display:"flex", alignItems:"center", gap:compact?10:14, flex:1, minWidth:0 }}>
      <div style={{ width:42, height:42, borderRadius:12, background:on?(bad?"rgba(248,113,113,.1)":"rgba(52,211,153,.1)"):faint, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{h.i}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:15, fontWeight:600, color:on?"#fff":"rgba(255,255,255,.35)", display:"flex", alignItems:"center", gap:6 }}>
          {h.l}
          {bad && <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:"rgba(248,113,113,.12)", color:M, fontWeight:700, fontFamily:mono }}>−</span>}
          {isObj && <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:"rgba(96,165,250,.12)", color:"#60a5fa", fontWeight:700, fontFamily:mono }}>obj</span>}
        </div>
        {(on || nf || gh) && <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
          {on && <span style={{ fontSize:12, fontFamily:mono, color:bad?M:G, fontWeight:600 }}>{h.t==="boolean"?(bad?h.p:`+${h.p}`):`${bad?"":"+"}${h.p*v}`}</span>}
          {nf && <span style={{ fontSize:11, fontFamily:mono, color:G, fontWeight:600, background:"rgba(52,211,153,.08)", padding:"2px 6px", borderRadius:4 }}>+15 nofap</span>}
          {gh && <span style={{ fontSize:11, fontFamily:mono, color:GO, fontWeight:600, background:"rgba(251,191,36,.08)", padding:"2px 6px", borderRadius:4 }}>+{bgh}</span>}
        </div>}
      </div>
    </div>
    {h.t === "boolean" ? <Tog on={v} set={set} bad={bad} /> : <Num v={v} set={set} />}
  </div>;
}

/* ═══ SPARKLINE ═══ */
let _spkId = 0;
function Spark({ data, color = G, h = 40 }) {
  const [id] = useState(() => `spk${++_spkId}`);
  if (data.length < 2) return <div style={{ height:h }} />;
  const w = 200;
  const mx = Math.max(...data, 1), mn = Math.min(...data, 0), r = mx - mn || 1;
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h-4-((v-mn)/r)*(h-8)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", height:h, display:"block" }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`} />
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/* ═══ CHART ═══ */
function Chart({ data, label, color, icon }) {
  if (data.length < 2) return null;
  const W = 300, HH = 90, P = 6;
  const mx = Math.max(...data.map(d=>d.v),1), mn = Math.min(...data.map(d=>d.v),0), r = mx-mn||1;
  const ps = data.map((d,i) => ({ x:P+(i/(data.length-1))*(W-P*2), y:HH-P-((d.v-mn)/r)*(HH-P*2) }));
  const avg = (data.reduce((s,d)=>s+d.v,0)/data.length).toFixed(1);
  return <Tile style={{ padding:18 }}>
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
      <span style={{ fontSize:14, color:dim }}>{icon} {label}</span>
      <span style={{ fontSize:13, fontFamily:mono, color, fontWeight:600 }}>ø{avg}</span>
    </div>
    <svg viewBox={`0 0 ${W} ${HH}`} style={{ width:"100%", height:80 }}>
      <defs><linearGradient id={`ch${label.replace(/\W/g,"")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".12"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`${P},${HH-P} ${ps.map(p=>`${p.x},${p.y}`).join(" ")} ${W-P},${HH-P}`} fill={`url(#ch${label.replace(/\W/g,"")})`}/>
      <polyline points={ps.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  </Tile>;
}

/* ═══ CALENDAR ═══ */
function Cal({ year, month, entries, goals, habits, missions, onClick }) {
  const f = new Date(year, month, 1), l = new Date(year, month + 1, 0);
  const pad = (f.getDay() + 6) % 7;
  const days = [...Array(pad).fill(null), ...Array.from({ length: l.getDate() }, (_, i) => i + 1)];
  return <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
    {DJ.map(d => <div key={d} style={{ fontSize:12, color:"rgba(255,255,255,.15)", textAlign:"center", padding:4, fontFamily:mono, fontWeight:600 }}>{d}</div>)}
    {days.map((d, i) => {
      if (!d) return <div key={`p${i}`} />;
      const ds = fmt(new Date(year, month, d)), e = entries[ds], td = ds === fmt(new Date()), fu = ds > fmt(new Date());
      const t = dayScore(ds, entries, goals, habits, missions);
      const hasData = e || t !== 0;
      const bg = fu ? "transparent" : !hasData ? "rgba(255,255,255,.015)" : t >= 40 ? "rgba(52,211,153,.4)" : t >= 20 ? "rgba(96,165,250,.35)" : t > 0 ? "rgba(251,191,36,.2)" : t < 0 ? "rgba(248,113,113,.3)" : "rgba(255,255,255,.02)";
      return <div key={d} onClick={() => !fu && hasData && onClick(ds)} style={{
        aspectRatio:"1", borderRadius:10, background:bg, display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:13, fontFamily:mono, color:hasData&&t!==0?"rgba(255,255,255,.85)":"rgba(255,255,255,.12)",
        fontWeight:td?800:500, cursor:hasData&&!fu?"pointer":"default",
        outline:td?"2px solid rgba(255,255,255,.4)":"none", outlineOffset:-2, transition:"all .15s",
      }}>{d}</div>;
    })}
  </div>;
}

/* ═══ POPUP ═══ */
function Popup({ ds, entry, goals, habits, missions, close }) {
  const { t: habitT, b } = calc(entry, goals, habits);
  const mp = missionPtsForDate(missions, ds);
  const t = habitT + mp;
  const d = new Date(ds + "T12:00:00");
  const mBreak = [];
  if (mp !== 0) {
    missions.forEach(m => {
      if (m.status === "completed" && m.completed_at && m.completed_at.slice(0, 10) === ds) mBreak.push({ l:`${m.emoji||"🎯"} ${m.title}`, i:"✅", p:m.points, c:"b" });
      if (m.status === "failed" && (m.deadline || m.created_at || "").slice(0, 10) === ds) mBreak.push({ l:`${m.emoji||"🎯"} ${m.title}`, i:"❌", p:-m.points, c:"m" });
    });
  }
  const allB = [...b, ...mBreak];
  return <div onClick={close} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16, backdropFilter:"blur(12px)" }}>
    <div onClick={e => e.stopPropagation()} style={{ background:"#0f0f18", border:`1px solid ${border}`, borderRadius:24, padding:32, width:"100%", maxWidth:420, maxHeight:"85vh", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <div style={{ fontSize:14, color:dim, marginBottom:2 }}>{DF[(d.getDay()+6)%7]}</div>
          <div style={{ fontSize:30, fontWeight:800, fontFamily:mono, letterSpacing:"-.02em" }}>{d.getDate()} {MO[d.getMonth()]}</div>
        </div>
        <div style={{ fontSize:40, fontWeight:800, fontFamily:mono, color:t>0?G:t<0?M:"rgba(255,255,255,.1)", lineHeight:1 }}>{t>0?"+":""}{t}</div>
      </div>
      {!entry && allB.length === 0 ? <div style={{ color:dim, textAlign:"center", padding:40, fontSize:15 }}>Pas de données</div> :
        <div>{allB.map((x, i) => <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", borderBottom:i<allB.length-1?`1px solid ${border}`:"none" }}>
          <span style={{ fontSize:15, color:"rgba(255,255,255,.45)" }}>{x.i} {x.l}</span>
          <span style={{ fontSize:15, fontWeight:700, fontFamily:mono, color:x.c==="m"?M:x.c==="g"?GO:G }}>{x.p>0?"+":""}{x.p}</span>
        </div>)}</div>}
      <div onClick={close} style={{ marginTop:24, textAlign:"center", padding:14, borderRadius:12, background:faint, color:"rgba(255,255,255,.5)", fontSize:15, cursor:"pointer", fontWeight:600 }}>Fermer</div>
    </div>
  </div>;
}

/* ═══ DEADLINE HELPERS ═══ */
function deadlineProg(mission) {
  const start = new Date(mission.accepted_at || mission.proposed_at || mission.created_at).getTime();
  const end = new Date(mission.deadline).getTime();
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (end - now) / total));
}
function deadlineLabel(mission) {
  const diff = new Date(mission.deadline).getTime() - Date.now();
  if (diff <= 0) return "Expiré";
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h${m.toString().padStart(2,"0")} restantes` : `${m}min restantes`;
}
function progColor(p) { return p > .5 ? G : p > .25 ? GO : M; }

/* ═══ MISSION CARD ═══ */
function MissionCard({ m, actions, children }) {
  const cc = catColor(m.category);
  return <Tile style={{ padding:"20px 24px" }}>
    <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
      <div style={{ width:48, height:48, borderRadius:14, background:`${cc}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{m.emoji || "🎯"}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:15, fontWeight:700, color:"#fff" }}>{m.title}</span>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background:`${cc}18`, color:cc, fontWeight:700, fontFamily:mono, textTransform:"uppercase" }}>{m.category}</span>
        </div>
        {children}
      </div>
      <div style={{ fontSize:18, fontWeight:800, fontFamily:mono, color:cc, flexShrink:0 }}>+{m.points}</div>
    </div>
    {actions && <div style={{ display:"flex", gap:8, marginTop:14 }}>{actions}</div>}
  </Tile>;
}

/* ═══ HOME VIEW ═══ */
function HomeView({ dp, spark7, data, HA, goals, missions, setView, reloadMissions, uid, dk, md, lg, flash, leaderboard, wt, at, focusMission, clearFocus }) {
  const [expanded, setExpanded] = useState(focusMission);
  useEffect(() => { if (focusMission) { setExpanded(focusMission); clearFocus(); } }, [focusMission, clearFocus]);
  const [requesting, setRequesting] = useState(false);
  const proposed = missions.filter(m => m.status === "proposed").slice(0, 5);
  const active = missions.filter(m => m.status === "accepted");
  const activeCount = missions.filter(m => m.status === "proposed" || m.status === "accepted").length;
  const maxed = activeCount >= 5;

  const doAccept = async id => { await acceptMission(id); await reloadMissions(); flash("Mission acceptée"); };
  const doRefuse = async id => { await refuseMission(id); await reloadMissions(); flash("Mission refusée"); };
  const doComplete = async id => { await completeMission(id); await reloadMissions(); flash("Mission validée !"); };
  const doRequest = async () => {
    if (maxed || requesting) return;
    setRequesting(true);
    await requestMission(uid);
    flash("Mission en cours de génération...");
    setTimeout(async () => { await reloadMissions(); setRequesting(false); }, 5000);
  };

  const btnAcc = { height:36, padding:"0 16px", borderRadius:10, border:`1px solid rgba(52,211,153,.3)`, background:"rgba(52,211,153,.15)", color:G, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:mono };
  const btnRef = { height:36, padding:"0 16px", borderRadius:10, border:`1px solid rgba(248,113,113,.2)`, background:"rgba(248,113,113,.08)", color:M, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:mono };
  const btnOutline = { height:38, width:"100%", borderRadius:10, border:`1px solid ${border}`, background:"transparent", color:dim, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:sans, transition:"border-color .15s" };

  const doneCount = HA.filter(h => { const v = data[h.k]; return h.t === "boolean" ? v : v > 0; }).length;
  const secLabel = { fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", fontWeight:600, marginBottom:14, display:"flex", alignItems:"center", gap:8 };

  return <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
    {/* ═══ ROW 1 : Scores + habits (full width) ═══ */}
    <Tile style={{ padding:dk?"24px 32px":"20px" }}>
      {/* ─ Score row ─ */}
      <div style={{ display:"flex", alignItems:"flex-end", gap:dk?32:16, flexWrap:"wrap", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:56, fontWeight:900, fontFamily:mono, lineHeight:1, color:dp.t>0?G:dp.t<0?M:"rgba(255,255,255,.08)" }}>{dp.t>0?"+":""}{dp.t}</div>
          <div style={{ fontSize:11, color:dim, marginTop:6, textTransform:"uppercase", letterSpacing:".1em" }}>Aujourd'hui · {doneCount}/{HA.length} habitudes</div>
        </div>
        <div style={{ display:"flex", gap:dk?24:16, alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:28, fontWeight:800, fontFamily:mono, lineHeight:1, color:wt>0?G:wt<0?M:"rgba(255,255,255,.08)" }}>{wt>0?"+":""}{wt}</div>
            <div style={{ fontSize:10, color:dim, marginTop:4, textTransform:"uppercase", letterSpacing:".1em" }}>Semaine</div>
          </div>
          <div>
            <div style={{ fontSize:28, fontWeight:800, fontFamily:mono, lineHeight:1, color:at>0?G:at<0?M:"rgba(255,255,255,.08)" }}>{at>0?"+":""}{at}</div>
            <div style={{ fontSize:10, color:dim, marginTop:4, textTransform:"uppercase", letterSpacing:".1em" }}>Total</div>
          </div>
        </div>
        {md && <div style={{ flex:"1 1 0", minWidth:100, maxWidth:220, marginLeft:"auto" }}>
          <div style={{ fontSize:10, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:4 }}>7 derniers jours</div>
          <Spark data={spark7} h={48} />
        </div>}
      </div>
      {!md && <div style={{ marginBottom:16 }}><Spark data={spark7} h={40} /></div>}
      {/* ─ Habit icons + CTA ─ */}
      <div style={{ display:md?"flex":"block", alignItems:"center", gap:16 }}>
        <div style={{ flex:"1 1 0", minWidth:0 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:md?0:14 }}>
            {HA.map(h => {
              const v = data[h.k];
              const on = h.t === "boolean" ? v : v > 0;
              return <div key={h.k} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, opacity:on?1:.25, transition:"all .15s" }}>
                <div style={{ width:36, height:36, borderRadius:10, background:on?"rgba(52,211,153,.12)":faint, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>{h.i}</div>
                <span style={{ fontSize:9, color:dim, fontWeight:600, maxWidth:44, textAlign:"center", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.l}</span>
              </div>;
            })}
          </div>
        </div>
        <div style={{ flex:"0 0 auto" }}>
          <div onClick={() => setView("today")} style={{ padding:"12px 24px", borderRadius:12, background:"rgba(52,211,153,.08)", border:`1px solid rgba(52,211,153,.25)`, color:G, fontSize:14, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", textAlign:"center" }}>
            Remplir mes habitudes →
          </div>
        </div>
      </div>
    </Tile>

    {/* ═══ ROW 2 : 3 columns ═══ */}
    <div style={{ display:"grid", gridTemplateColumns:lg?"1fr 1fr 1fr":md?"1fr 1fr":"1fr", gap:14, alignItems:"stretch" }}>

      {/* ─ COL 1 : Missions proposées ─ */}
      <Tile style={{ padding:"16px 20px", display:"flex", flexDirection:"column" }}>
        <div style={secLabel}>
          <span>Missions proposées</span>
          {proposed.length > 0 && <span style={{ fontSize:11, fontWeight:700, fontFamily:mono, padding:"2px 8px", borderRadius:5, background:"rgba(52,211,153,.12)", color:G }}>{proposed.length}</span>}
        </div>
        <div style={{ flex:1 }}>
          {proposed.length === 0 && <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 0", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>🎯</div>
            <div style={{ fontSize:14, fontWeight:600, color:"rgba(255,255,255,.35)" }}>Aucune mission</div>
            <div style={{ fontSize:12, color:dim, marginTop:4 }}>Les missions arrivent toutes les heures</div>
          </div>}
          {proposed.map(m => {
            const isOpen = expanded === m.id;
            const cc = catColor(m.category);
            return <div key={m.id} style={{ padding:"12px 0", borderBottom:`1px solid ${border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>{m.emoji || "🎯"}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600 }}>{m.title}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:3 }}>
                    <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background:`${cc}18`, color:cc, fontWeight:700, fontFamily:mono, textTransform:"uppercase" }}>{m.category}</span>
                    <span style={{ fontSize:12, fontWeight:700, fontFamily:mono, color:cc }}>+{m.points}</span>
                  </div>
                </div>
                <div onClick={() => setExpanded(isOpen ? null : m.id)} style={{ fontSize:12, color:dim, cursor:"pointer", padding:"4px 8px", flexShrink:0 }}>{isOpen ? "▾" : "›"}</div>
              </div>
              {isOpen && <div style={{ marginTop:10, paddingLeft:30 }}>
                {m.description && <div style={{ fontSize:13, color:"rgba(255,255,255,.45)", marginBottom:8 }}>{m.description}</div>}
                {m.deadline && <div style={{ fontSize:11, fontFamily:mono, color:dim, marginBottom:10 }}>Deadline : {deadlineLabel(m)}</div>}
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => doAccept(m.id)} style={btnAcc}>Accepter ✓</button>
                  <button onClick={() => doRefuse(m.id)} style={btnRef}>Refuser ✗</button>
                </div>
              </div>}
            </div>;
          })}
        </div>
        <button onClick={doRequest} disabled={maxed||requesting} style={{ ...btnOutline, marginTop:14, opacity:maxed?.4:1, cursor:maxed?"default":"pointer" }}>{requesting?"⏳ Génération...":maxed?"5/5 missions actives":"Demander une mission"}</button>
      </Tile>

      {/* ─ COL 2 : Missions en cours ─ */}
      <Tile style={{ padding:"16px 20px", display:"flex", flexDirection:"column" }}>
        <div style={secLabel}>Missions en cours</div>
        <div style={{ flex:1 }}>
          {active.length === 0 && <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 0", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>⏳</div>
            <div style={{ fontSize:14, fontWeight:600, color:"rgba(255,255,255,.35)" }}>Aucune mission en cours</div>
            <div style={{ fontSize:12, color:dim, marginTop:4 }}>Accepte une mission proposée</div>
          </div>}
          {active.map(m => {
            const p = deadlineProg(m);
            const pc = progColor(p);
            const cc = catColor(m.category);
            const dl = deadlineLabel(m);
            const urgent = p < .25;
            return <div key={m.id} style={{ padding:"12px 0", borderBottom:`1px solid ${border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>{m.emoji || "🎯"}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600 }}>{m.title}</div>
                  <div style={{ fontSize:12, fontFamily:mono, color:urgent?M:pc, marginTop:3 }}>{urgent?"⚠️ ":""}{dl}</div>
                </div>
                <span style={{ fontSize:13, fontWeight:700, fontFamily:mono, color:cc, flexShrink:0 }}>+{m.points}</span>
              </div>
              <div style={{ margin:"8px 0", height:4, borderRadius:2, background:faint }}>
                <div style={{ height:4, borderRadius:2, background:pc, width:`${p*100}%`, transition:"width .5s" }} />
              </div>
              <button onClick={() => doComplete(m.id)} style={{ ...btnAcc, width:"100%", height:34, fontSize:12 }}>Valider ✓</button>
            </div>;
          })}
        </div>
        <button onClick={doRequest} disabled={maxed||requesting} style={{ ...btnOutline, marginTop:14, opacity:maxed?.4:1, cursor:maxed?"default":"pointer" }}>{requesting?"⏳ Génération...":maxed?"5/5 missions actives":"Demander une mission"}</button>
      </Tile>

      {/* ─ COL 3 : Leaderboard ─ */}
      <Tile style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gridColumn:md&&!lg?"1 / -1":"auto" }}>
        <div style={secLabel}>🏆 Classement 7 jours</div>
        <div style={{ flex:1 }}>
          {(() => {
            /* Merge SQL leaderboard with client-side score for current user */
            const others = leaderboard.filter(u => u.user_id !== uid);
            const me = { user_id: uid, display_name: "Toi", total_score: wt };
            const merged = [...others, me].sort((a, b) => b.total_score - a.total_score).slice(0, 10);
            return merged.map((u, i) => {
              const isMe = u.user_id === uid;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              const name = isMe ? "Toi" : (u.display_name || "Anonyme");
              const sc = isMe ? wt : u.total_score;
              return <div key={u.user_id} style={{ display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${border}`, background:isMe?"rgba(52,211,153,.05)":"transparent", borderRadius:isMe?8:0, margin:isMe?"0 -8px":"0", padding:isMe?"10px 8px":"10px 0" }}>
                <div style={{ width:28, textAlign:"center", fontSize:medal?18:14, fontWeight:700, fontFamily:mono, color:dim, flexShrink:0 }}>{medal || (i+1)}</div>
                <div style={{ flex:1, minWidth:0, fontSize:14, fontWeight:isMe?700:500, color:isMe?G:"rgba(255,255,255,.6)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                <div style={{ fontSize:14, fontWeight:700, fontFamily:mono, color:isMe?G:dim, flexShrink:0 }}>{sc>0?"+":""}{sc}</div>
              </div>;
            });
          })()}
        </div>
      </Tile>
    </div>
  </div>;
}

/* ═══ MISSIONS VIEW ═══ */
function MissionsView({ missions, reloadMissions, uid, dk, md, flash }) {
  const [requesting, setRequesting] = useState(false);
  const active = missions.filter(m => m.status === "accepted");
  const completed = missions.filter(m => m.status === "completed");
  const failed = missions.filter(m => m.status === "failed");
  const history = [...completed, ...failed].sort((a, b) => new Date(b.completed_at || b.proposed_at) - new Date(a.completed_at || a.proposed_at));
  const activeCount = missions.filter(m => m.status === "proposed" || m.status === "accepted").length;
  const maxed = activeCount >= 5;

  const doComplete = async id => { await completeMission(id); await reloadMissions(); flash("Mission validée !"); };
  const doRequest = async () => {
    if (maxed || requesting) return;
    setRequesting(true);
    await requestMission(uid);
    flash("Mission en cours de génération...");
    setTimeout(async () => { await reloadMissions(); setRequesting(false); }, 5000);
  };

  const reqBtn = { height:40, padding:"0 20px", borderRadius:10, border:`1px solid ${border}`, background:"transparent", color:dim, fontSize:13, fontWeight:600, cursor:maxed?"default":"pointer", fontFamily:sans, opacity:maxed?.4:1, transition:"border-color .15s" };

  return <>
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
      <div style={{ fontSize:26, fontWeight:800 }}>Missions</div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={doRequest} disabled={maxed||requesting} style={reqBtn}>{requesting?"⏳ Génération...":maxed?"5/5 missions actives":"Demander une mission"}</button>
        <div style={{ padding:"6px 14px", borderRadius:8, background:faint, border:`1px solid ${border}`, fontSize:13, fontFamily:mono, color:dim }}><span style={{ color:"#fff", fontWeight:700 }}>{activeCount}</span>/5 actives</div>
      </div>
    </div>

    {/* ─ EN COURS ─ */}
    <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:12, fontWeight:600 }}>En cours</div>
    {active.length === 0 && <Tile style={{ padding:24, textAlign:"center", marginBottom:20 }}><div style={{ fontSize:14, color:dim }}>Aucune mission en cours</div></Tile>}
    <div style={{ display:"grid", gridTemplateColumns:dk?"1fr 1fr":"1fr", gap:12, marginBottom:24 }}>
      {active.map(m => {
        const p = deadlineProg(m);
        const pc = progColor(p);
        return <MissionCard key={m.id} m={m} actions={
          <button onClick={() => doComplete(m.id)} style={{ height:38, padding:"0 20px", borderRadius:10, border:`1px solid rgba(52,211,153,.3)`, background:"rgba(52,211,153,.15)", color:G, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:mono }}>Valider ✓</button>
        }>
          <div style={{ marginTop:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontFamily:mono, color:pc, marginBottom:4 }}>
              <span>{deadlineLabel(m)}</span>
              <span>{Math.round(p*100)}%</span>
            </div>
            <div style={{ height:4, borderRadius:2, background:faint }}>
              <div style={{ height:4, borderRadius:2, background:pc, width:`${p*100}%`, transition:"width .3s" }} />
            </div>
          </div>
        </MissionCard>;
      })}
    </div>

    {/* ─ HISTORIQUE ─ */}
    <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:12, fontWeight:600 }}>Historique</div>
    {history.length === 0 && <Tile style={{ padding:24, textAlign:"center" }}><div style={{ fontSize:14, color:dim }}>Aucune mission terminée</div></Tile>}
    <div style={{ display:"grid", gridTemplateColumns:dk?"1fr 1fr":"1fr", gap:10 }}>
      {history.map(m => {
        const won = m.status === "completed";
        const cc = won ? G : M;
        return <Tile key={m.id} style={{ padding:"14px 18px", opacity:.75 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:20 }}>{m.emoji || "🎯"}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:600, color:"rgba(255,255,255,.6)" }}>{m.title}</div>
              <div style={{ fontSize:11, fontFamily:mono, color:dim, marginTop:2 }}>{m.category}</div>
            </div>
            <span style={{ fontSize:15, fontWeight:800, fontFamily:mono, color:cc }}>{won?"+":"-"}{m.points}</span>
          </div>
        </Tile>;
      })}
    </div>
  </>;
}

/* ═══ ACCOUNT VIEW ═══ */
function AccountView({ user, uid, logout, flash, md }) {
  const [displayName, setDisplayName] = useState("");
  const [nameLoaded, setNameLoaded] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);

  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passBusy, setPassBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const feedback = (ok, text) => { if (ok) { setMsg(text); setErr(null); } else { setErr(text); setMsg(null); } setTimeout(() => { setMsg(null); setErr(null); }, 3000); };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("display_name").eq("id", uid).single();
      if (data) setDisplayName(data.display_name || "");
      setNameLoaded(true);
    })();
  }, [uid]);

  const saveName = async () => {
    setNameBusy(true);
    const { error } = await supabase.from("profiles").upsert({ id: uid, display_name: displayName }, { onConflict: "id" });
    if (error) feedback(false, error.message);
    else feedback(true, "Nom mis à jour");
    setNameBusy(false);
  };

  const changePass = async e => {
    e.preventDefault();
    if (newPass !== confirmPass) { feedback(false, "Les mots de passe ne correspondent pas"); return; }
    if (newPass.length < 6) { feedback(false, "6 caractères minimum"); return; }
    setPassBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) feedback(false, error.message);
    else { feedback(true, "Mot de passe modifié"); setNewPass(""); setConfirmPass(""); }
    setPassBusy(false);
  };

  const changeEmail = async e => {
    e.preventDefault();
    if (!newEmail) return;
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) feedback(false, error.message);
    else { feedback(true, "Email de confirmation envoyé"); setNewEmail(""); }
    setEmailBusy(false);
  };

  const deleteAccount = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteBusy(true);
    await supabase.from("missions").delete().eq("user_id", uid);
    await supabase.from("daily_entries").delete().eq("user_id", uid);
    await supabase.from("goals").delete().eq("user_id", uid);
    await supabase.from("profiles").delete().eq("id", uid);
    await supabase.auth.signOut();
    logout();
  };

  const iS = { width:"100%", height:44, borderRadius:12, background:faint, border:`1px solid ${border}`, padding:"0 14px", fontSize:14, color:"#fff", fontFamily:sans, outline:"none" };
  const secLabel = { fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:16, fontWeight:600 };
  const btn = { height:44, padding:"0 24px", borderRadius:12, border:`1px solid rgba(52,211,153,.3)`, background:"rgba(52,211,153,.15)", color:G, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:sans, transition:"background .15s" };
  const btnDanger = { height:44, padding:"0 24px", borderRadius:12, border:`1px solid rgba(248,113,113,.2)`, background:"rgba(248,113,113,.1)", color:M, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:sans, transition:"background .15s" };

  return <>
    <div style={{ textAlign:"center", marginBottom:24 }}>
      <div style={{ fontSize:26, fontWeight:800 }}>Mon compte</div>
      <div style={{ fontSize:14, color:dim, marginTop:6 }}>{user.email}</div>
    </div>

    {(msg || err) && <div style={{ marginBottom:16, fontSize:13, fontFamily:mono, padding:"10px 14px", borderRadius:10, background:msg?"rgba(52,211,153,.08)":"rgba(248,113,113,.08)", color:msg?G:M }}>{msg || err}</div>}

    <div style={{ display:"grid", gridTemplateColumns:md?"1fr 1fr":"1fr", gap:14 }}>
      {/* ─ PROFIL ─ */}
      <Tile style={{ padding:"12px 24px" }}>
        <div style={{ ...secLabel, padding:"14px 0 6px" }}>Profil</div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={nameLoaded ? "Nom d'affichage" : "..."} style={{ ...iS, flex:1 }} />
          <button onClick={saveName} disabled={nameBusy} style={btn}>{nameBusy ? "..." : "Enregistrer"}</button>
        </div>
      </Tile>

      {/* ─ EMAIL ─ */}
      <Tile style={{ padding:"12px 24px" }}>
        <div style={{ ...secLabel, padding:"14px 0 6px" }}>Changer d'email</div>
        <div style={{ fontSize:13, color:dim, marginBottom:12 }}>Actuel : {user.email}</div>
        <form onSubmit={changeEmail} style={{ display:"flex", gap:10, alignItems:"center" }}>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Nouvel email" required style={{ ...iS, flex:1 }} />
          <button type="submit" disabled={emailBusy} style={btn}>{emailBusy ? "..." : "Modifier"}</button>
        </form>
      </Tile>

      {/* ─ MOT DE PASSE ─ */}
      <Tile style={{ padding:"12px 24px" }}>
        <div style={{ ...secLabel, padding:"14px 0 6px" }}>Mot de passe</div>
        <form onSubmit={changePass} style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Nouveau mot de passe" minLength={6} required style={iS} />
          <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Confirmer" minLength={6} required style={iS} />
          <button type="submit" disabled={passBusy} style={{ ...btn, alignSelf:"flex-start" }}>{passBusy ? "..." : "Changer le mot de passe"}</button>
        </form>
      </Tile>

      {/* ─ SESSION ─ */}
      <Tile style={{ padding:"12px 24px" }}>
        <div style={{ ...secLabel, padding:"14px 0 6px" }}>Session</div>
        <button onClick={logout} style={{ ...btn, width:"100%" }}>Se déconnecter</button>
      </Tile>

      {/* ─ ZONE DANGER ─ */}
      <Tile style={{ padding:"12px 24px", gridColumn:md?"1 / -1":"auto", border:`1px solid rgba(248,113,113,.15)` }}>
        <div style={{ ...secLabel, padding:"14px 0 6px", color:M }}>Zone danger</div>
        <div style={{ fontSize:13, color:dim, marginBottom:16 }}>
          {deleteConfirm ? "Clique encore pour confirmer. Cette action est irréversible." : "Supprime toutes tes données et ton compte définitivement."}
        </div>
        <button onClick={deleteAccount} disabled={deleteBusy} style={{ ...btnDanger, width:"100%", background:deleteConfirm?"rgba(248,113,113,.25)":"rgba(248,113,113,.1)" }}>
          {deleteBusy ? "Suppression..." : deleteConfirm ? "Confirmer la suppression" : "Supprimer mon compte"}
        </button>
      </Tile>
    </div>
  </>;
}

/* ═══ ADMIN VIEW ═══ */
function AdminView({ user, dk, md, flash }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState({ entries:[], missions:[] });
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mForm, setMForm] = useState(null);
  const [mBusy, setMBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, u] = await Promise.all([adminGetStats(), adminGetUsers()]);
      setStats(s);
      setUsers(u);
    })();
  }, []);

  const selectUser = async u => {
    setSelected(u);
    setLoadingDetail(true);
    setMForm(null);
    const [entries, missions] = await Promise.all([adminGetUserEntries(u.user_id), adminGetUserMissions(u.user_id)]);
    setDetail({ entries, missions });
    setLoadingDetail(false);
  };

  const submitMission = async e => {
    e.preventDefault();
    if (!mForm?.title || !mForm?.points) return;
    setMBusy(true);
    const ok = await adminInsertMission(selected.user_id, mForm.title, mForm.description || "", mForm.category || "sport", mForm.emoji || "🎯", Number(mForm.points), Number(mForm.duration || 12));
    if (ok) { flash("Mission attribuée"); setMForm(null); const m = await adminGetUserMissions(selected.user_id); setDetail(d => ({ ...d, missions: m })); }
    else flash("⚠️ Erreur");
    setMBusy(false);
  };

  if (user.email !== ADMIN_EMAIL) return <Tile style={{ padding:40, textAlign:"center" }}><div style={{ fontSize:18, fontWeight:700, color:M }}>Accès refusé</div></Tile>;

  const iS = { width:"100%", height:40, borderRadius:10, background:faint, border:`1px solid ${border}`, padding:"0 12px", fontSize:13, color:"#fff", fontFamily:sans, outline:"none" };
  const secLabel = { fontSize:12, color:dim, textTransform:"uppercase", letterSpacing:".1em", fontWeight:600, marginBottom:12 };
  const statTile = (label, value, color) => <Tile style={{ textAlign:"center", padding:18 }}>
    <div style={{ fontSize:28, fontWeight:800, fontFamily:mono, color }}>{value}</div>
    <div style={{ fontSize:11, color:dim, marginTop:4, textTransform:"uppercase", letterSpacing:".08em" }}>{label}</div>
  </Tile>;

  return <>
    <div style={{ fontSize:26, fontWeight:800, marginBottom:20 }}>Admin</div>

    {/* ─ Stats globales ─ */}
    {stats && <div style={{ display:"grid", gridTemplateColumns:dk?"repeat(5,1fr)":md?"repeat(3,1fr)":"repeat(2,1fr)", gap:12, marginBottom:24 }}>
      {statTile("Utilisateurs", stats.total_users, "#fff")}
      {statTile("Actifs 7j", stats.active_this_week, G)}
      {statTile("Missions", stats.missions_total, "#60a5fa")}
      {statTile("Complétées", stats.missions_completed, G)}
      {statTile("Échouées", stats.missions_failed, M)}
    </div>}

    <div style={{ display:"grid", gridTemplateColumns:selected&&md?"1fr 1fr":"1fr", gap:16 }}>
      {/* ─ User list ─ */}
      <Tile style={{ padding:0, overflow:"hidden" }}>
        <div style={{ ...secLabel, padding:"16px 20px 0" }}>Utilisateurs</div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              {["Nom","Entries 7j","Missions","Dernier login"].map(h => <th key={h} style={{ padding:"10px 14px", fontSize:11, color:dim, textTransform:"uppercase", fontWeight:600, textAlign:"left", borderBottom:`1px solid ${border}` }}>{h}</th>)}
            </tr></thead>
            <tbody>{users.map(u => <tr key={u.user_id} onClick={() => selectUser(u)} style={{ cursor:"pointer", background:selected?.user_id===u.user_id?"rgba(52,211,153,.06)":"transparent", transition:"background .1s" }}>
              <td style={{ padding:"12px 14px", fontSize:14, fontWeight:600, borderBottom:`1px solid ${border}` }}>
                {u.display_name || u.email}
                {u.display_name && <div style={{ fontSize:11, color:dim, marginTop:2 }}>{u.email}</div>}
              </td>
              <td style={{ padding:"12px 14px", fontSize:14, fontFamily:mono, borderBottom:`1px solid ${border}` }}>{u.week_entries}</td>
              <td style={{ padding:"12px 14px", fontSize:14, fontFamily:mono, borderBottom:`1px solid ${border}` }}>{u.mission_active}</td>
              <td style={{ padding:"12px 14px", fontSize:12, color:dim, borderBottom:`1px solid ${border}` }}>{u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString("fr") : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Tile>

      {/* ─ User detail ─ */}
      {selected && <Tile style={{ padding:"16px 20px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:700 }}>{selected.display_name || selected.email}</div>
            {selected.display_name && <div style={{ fontSize:12, color:dim }}>{selected.email}</div>}
          </div>
          <div onClick={() => setSelected(null)} style={{ cursor:"pointer", color:dim, fontSize:18, padding:"4px 8px" }}>✕</div>
        </div>

        {loadingDetail ? <div style={{ textAlign:"center", padding:24, color:dim }}>Chargement...</div> : <>
          {/* Entries 7j */}
          <div style={secLabel}>Habitudes — 7 derniers jours</div>
          {detail.entries.length === 0 && <div style={{ fontSize:13, color:dim, marginBottom:16 }}>Aucune entrée</div>}
          {detail.entries.map(e => <div key={e.date} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${border}`, fontSize:13 }}>
            <span style={{ fontFamily:mono, color:dim, width:80, flexShrink:0 }}>{e.date?.slice(5)}</span>
            <span>{e.steps?"🏃":""} {!e.fap?"🧠":""} {e.deepwork?`⚡${e.deepwork}`:""} {e.social?`🤝${e.social}`:""} {e.trainings?`💪${e.trainings}`:""} {e.approaches?`💬${e.approaches}`:""}</span>
          </div>)}

          {/* Missions */}
          <div style={{ ...secLabel, marginTop:20 }}>Missions</div>
          {detail.missions.length === 0 && <div style={{ fontSize:13, color:dim, marginBottom:16 }}>Aucune mission</div>}
          {detail.missions.slice(0, 10).map(m => {
            const sc = m.status === "completed" ? G : m.status === "failed" ? M : m.status === "accepted" ? "#60a5fa" : dim;
            return <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:`1px solid ${border}`, fontSize:13 }}>
              <span style={{ fontSize:16 }}>{m.emoji || "🎯"}</span>
              <span style={{ flex:1, color:"rgba(255,255,255,.7)" }}>{m.title}</span>
              <span style={{ fontSize:11, fontFamily:mono, color:sc, fontWeight:600 }}>{m.status}</span>
              <span style={{ fontSize:12, fontFamily:mono, fontWeight:700, color:sc }}>{m.points>0?"+":""}{m.points}</span>
            </div>;
          })}

          {/* Assign mission */}
          <div style={{ ...secLabel, marginTop:20 }}>Attribuer une mission</div>
          {!mForm ? <button onClick={() => setMForm({ title:"", description:"", category:"sport", emoji:"🎯", points:"25", duration:"12" })} style={{ height:38, padding:"0 20px", borderRadius:10, border:`1px solid ${border}`, background:"transparent", color:dim, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:sans }}>+ Nouvelle mission</button>
          : <form onSubmit={submitMission} style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"flex", gap:8 }}>
              <input value={mForm.emoji} onChange={e => setMForm({...mForm, emoji:e.target.value})} placeholder="Emoji" style={{ ...iS, width:50, textAlign:"center", padding:0 }} />
              <input value={mForm.title} onChange={e => setMForm({...mForm, title:e.target.value})} placeholder="Titre" required style={{ ...iS, flex:1 }} />
            </div>
            <input value={mForm.description} onChange={e => setMForm({...mForm, description:e.target.value})} placeholder="Description" style={iS} />
            <div style={{ display:"flex", gap:8 }}>
              <select value={mForm.category} onChange={e => setMForm({...mForm, category:e.target.value})} style={{ ...iS, width:"auto" }}>
                <option value="sport">Sport</option>
                <option value="social">Social</option>
                <option value="culture">Culture</option>
              </select>
              <input type="number" value={mForm.points} onChange={e => setMForm({...mForm, points:e.target.value})} placeholder="Pts" required min={1} style={{ ...iS, width:70, fontFamily:mono, textAlign:"center" }} />
              <input type="number" value={mForm.duration} onChange={e => setMForm({...mForm, duration:e.target.value})} placeholder="Heures" min={1} style={{ ...iS, width:70, fontFamily:mono, textAlign:"center" }} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button type="submit" disabled={mBusy} style={{ height:38, padding:"0 20px", borderRadius:10, border:`1px solid rgba(52,211,153,.3)`, background:"rgba(52,211,153,.15)", color:G, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:mono }}>{mBusy?"...":"Attribuer"}</button>
              <button type="button" onClick={() => setMForm(null)} style={{ height:38, padding:"0 16px", borderRadius:10, border:`1px solid ${border}`, background:"transparent", color:dim, fontSize:13, cursor:"pointer", fontFamily:sans }}>Annuler</button>
            </div>
          </form>}
        </>}
      </Tile>}
    </div>
  </>;
}

/* ═══ MAIN APP ═══ */
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState("home");
  const [missions, setMissions] = useState([]);
  const [date, setDate] = useState(new Date());
  const [all, setAll] = useState({});
  const [goals, setGoals] = useState({ ...GD });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [focusMission, setFocusMission] = useState(null);
  const [stab, setStab] = useState("cal");
  const [popup, setPopup] = useState(null);
  const [customHabits, setCustomHabits] = useState([]);
  const [addForm, setAddForm] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const W = useW();
  const dk = W >= 900;
  const md = W >= 600;

  /* ─ Auth listener ─ */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const uid = user?.id;

  const removed = useMemo(() => new Set(goals.removed_habits || []), [goals.removed_habits]);
  const HA = useMemo(() => [...BUILTIN_HA, ...customHabits].filter(h => !removed.has(h.k)), [customHabits, removed]);
  const DD = useMemo(() => { const d = {}; HA.forEach(h => { d[h.k] = h.t === "boolean" ? false : 0; }); return d; }, [HA]);

  const ds = fmt(date), ws = wkS(date), we = wkE(date), wd = rng(ws, we), td = ds === fmt(new Date());
  const data = all[ds] || { ...DD };

  /* ─ Load data when user is authenticated ─ */
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        await checkExpiredMissions(uid);
        const today = new Date(), sevenAgo = new Date(today); sevenAgo.setDate(sevenAgo.getDate() - 6);
        const [d, g, m, lb] = await Promise.all([DB.ld(uid), DB.lg(uid), loadMissions(uid), loadLeaderboard(fmt(sevenAgo), fmt(today))]);
        setAll(d);
        setMissions(m);
        setLeaderboard(lb);
        if (g) {
          setGoals({ ...GD, ...g, removed_habits: g.removed_habits || [], custom_habits: g.custom_habits || [] });
          if (g.custom_habits) setCustomHabits(g.custom_habits);
        }
      } catch(e) { console.error("LOAD CRASH:", e); }
      setLoading(false);
    })();
  }, [uid]);

  /* ─ Realtime subscriptions ─ */
  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`sync_${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_entries", filter: `user_id=eq.${uid}` }, payload => {
        if (payload.eventType === "DELETE") {
          const key = normDate(payload.old.date);
          setAll(prev => { const next = { ...prev }; delete next[key]; return next; });
        } else {
          const r = payload.new;
          const cd = r.custom_data || {};
          const key = normDate(r.date);
          setAll(prev => ({ ...prev, [key]: { ...r, ...cd, date: key } }));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "missions", filter: `user_id=eq.${uid}` }, payload => {
        if (payload.eventType === "DELETE") {
          setMissions(prev => prev.filter(m => m.id !== payload.old.id));
        } else if (payload.eventType === "INSERT") {
          setMissions(prev => prev.some(m => m.id === payload.new.id) ? prev : [payload.new, ...prev]);
        } else {
          setMissions(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid]);

  const reloadMissions = useCallback(async () => {
    if (!uid) return;
    const today = new Date(), sevenAgo = new Date(today); sevenAgo.setDate(sevenAgo.getDate() - 6);
    const [m, lb] = await Promise.all([loadMissions(uid), loadLeaderboard(fmt(sevenAgo), fmt(today))]);
    setMissions(m);
    setLeaderboard(lb);
  }, [uid]);

  const save = useCallback(async (k, v) => {
    const u = { ...(all[ds] || { ...DD }), [k]: v };
    setAll(p => ({ ...p, [ds]: u }));
    const ok = await DB.sv(ds, u, HA, uid);
    const h = HA.find(x => x.k === k);
    if (!ok) { flash("⚠️ Erreur sauvegarde"); return; }
    if (h?.n === "malus" && v === true) flash(`${h.i} malus`);
    else if (h?.t === "boolean" && v) flash(`${h.i} +${h.p}`);
  }, [all, ds, HA, DD, uid]);

  const sG = useCallback((k, v) => { const u = { ...goals, [k]: v }; setGoals(u); DB.sg(u, uid); }, [goals, uid]);
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 1500); };
  const go = n => { const d = new Date(date); d.setDate(d.getDate() + n); if (d <= new Date()) setDate(d); };

  const addCustomHabit = useCallback((form) => {
    if (!form.l.trim() || !form.i.trim() || !form.p) return;
    const n = form.n;
    const p = n === "malus" ? -Math.abs(Number(form.p)) : Math.abs(Number(form.p));
    const t = n === "objectif" ? "boolean" : "number";
    const habit = { k:`c_${Date.now()}`, l:form.l.trim(), t, i:form.i.trim(), n, p };
    const updated = [...customHabits, habit];
    setCustomHabits(updated);
    const g = { ...goals, custom_habits: updated };
    setGoals(g);
    DB.sg(g, uid);
    setAddForm(null);
    flash(`${habit.i} ajouté`);
  }, [customHabits, goals, uid]);

  const removeHabit = useCallback((key) => {
    if (BUILTIN_KEYS.has(key)) {
      const rm = [...(goals.removed_habits || []), key];
      const g = { ...goals, removed_habits: rm };
      setGoals(g);
      DB.sg(g, uid);
    } else {
      const updated = customHabits.filter(h => h.k !== key);
      setCustomHabits(updated);
      const g = { ...goals, custom_habits: updated };
      setGoals(g);
      DB.sg(g, uid);
    }
    flash("Supprimé");
  }, [customHabits, goals, uid]);

  /* ─ Unified scores ─ */
  const dp = useMemo(() => {
    const h = calc(data, goals, HA);
    const mp = missionPtsForDate(missions, ds);
    return { t: h.t + mp, b: h.b, habitPts: h.t, missionPts: mp };
  }, [data, goals, HA, missions, ds]);

  const wt = useMemo(() => {
    let s = 0;
    wd.forEach(d => { const k = fmt(d); if (k > fmt(new Date())) return; s += dayScore(k, all, goals, HA, missions); });
    return s;
  }, [all, wd, goals, HA, missions]);

  const at = useMemo(() => {
    const allDates = new Set(Object.keys(all));
    missions.forEach(m => {
      if (m.status === "completed" && m.completed_at) allDates.add(m.completed_at.slice(0, 10));
      if (m.status === "failed") { const fd = (m.deadline || m.created_at || "").slice(0, 10); if (fd) allDates.add(fd); }
    });
    let s = 0;
    allDates.forEach(k => { s += dayScore(k, all, goals, HA, missions); });
    return s;
  }, [all, goals, HA, missions]);

  const spark7 = useMemo(() => {
    const t = new Date(), d = [];
    for (let i = 6; i >= 0; i--) { const x = new Date(t); x.setDate(x.getDate()-i); d.push(dayScore(fmt(x), all, goals, HA, missions)); }
    return d;
  }, [all, goals, HA, missions]);

  const trend = useMemo(() => {
    const t = new Date(), days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(t); d.setDate(d.getDate()-i); days.push(d); }
    const sc = days.map(d => { const k = fmt(d); return { l:`${d.getDate()}/${d.getMonth()+1}`, v:dayScore(k, all, goals, HA, missions) }; });
    const ph = {}; HA.filter(h => h.t === "number").forEach(h => { ph[h.k] = days.map(d => { const k = fmt(d); const e = all[k]; return { l:`${d.getDate()}/${d.getMonth()+1}`, v:e?(e[h.k]||0):0 }; }); });
    return { sc, ph };
  }, [all, goals, HA, missions]);

  const bonusCount = HA.filter(h => h.n === "bonus").length;
  const malusCount = HA.filter(h => h.n === "malus").length;
  const objCount = HA.filter(h => h.n === "objectif").length;

  const logout = async () => { await supabase.auth.signOut(); setUser(null); setAll({}); setGoals({ ...GD }); setCustomHabits([]); setMissions([]); };

  /* ─ Notifications ─ */
  const [readIds, setReadIds] = useState(() => {
    try { const s = localStorage.getItem("strack_read_notifs"); return s ? new Set(JSON.parse(s)) : new Set(); }
    catch { return new Set(); }
  });
  const updateReadIds = useCallback(next => { setReadIds(next); localStorage.setItem("strack_read_notifs", JSON.stringify([...next])); }, []);
  const [bellOpen, setBellOpen] = useState(false);

  const notifs = useMemo(() => {
    const now = Date.now(), out = [], DAY = 24 * 60 * 60 * 1000;
    missions.forEach(m => {
      if (m.status === "proposed") {
        const age = now - new Date(m.created_at).getTime();
        if (age < DAY) out.push({ id:`new_${m.id}`, icon:"🎯", text:`Nouvelle mission : ${m.title}`, time:m.created_at, missionId:m.id });
      }
      if (m.status === "accepted" && m.deadline) {
        const left = new Date(m.deadline).getTime() - now;
        if (left > 0 && left < 30 * 60 * 1000) out.push({ id:`exp_${m.id}`, icon:"⚠️", text:`${m.title} expire bientôt !`, time:m.deadline, missionId:m.id });
      }
      if (m.status === "failed") {
        const failTime = new Date(m.deadline || m.created_at).getTime();
        if (now - failTime < DAY) out.push({ id:`fail_${m.id}`, icon:"❌", text:`Mission échouée : ${m.title}`, time:m.deadline || m.created_at, missionId:m.id });
      }
    });
    out.sort((a, b) => new Date(b.time) - new Date(a.time));
    return out;
  }, [missions]);

  const unreadCount = notifs.filter(n => !readIds.has(n.id)).length;
  const markAllRead = () => { updateReadIds(new Set(notifs.map(n => n.id))); setBellOpen(false); };

  const timeAgo = t => {
    const d = Date.now() - new Date(t).getTime();
    if (d < 60000) return "à l'instant";
    if (d < 3600000) return `il y a ${Math.floor(d/60000)} min`;
    if (d < 86400000) return `il y a ${Math.floor(d/3600000)}h`;
    return `il y a ${Math.floor(d/86400000)}j`;
  };

  /* ═══ RENDER ═══ */
  if (!authReady) return <div style={{ minHeight:"100vh", background:"#060610", display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ width:24, height:24, border:"2px solid rgba(255,255,255,.1)", borderTop:`2px solid ${G}`, borderRadius:"50%", animation:"spin 1s linear infinite" }} />
  </div>;

  if (!user) return <AuthPage />;

  if (loading) return <div style={{ minHeight:"100vh", background:"#060610", display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ width:24, height:24, border:"2px solid rgba(255,255,255,.1)", borderTop:`2px solid ${G}`, borderRadius:"50%", animation:"spin 1s linear infinite" }} />
  </div>;

  const isAdmin = user.email === ADMIN_EMAIL;
  const navItems = [
    { id:"home", l:"Home" },
    { id:"today", l:"Jour" },
    { id:"week", l:"Semaine" },
    { id:"stats", l:"Stats" },
    { id:"missions", l:"Missions" },
    { id:"goals", l:"Config" },
    { id:"account", l:"Compte" },
    ...(isAdmin ? [{ id:"admin", l:"Admin" }] : []),
  ];

  const inputStyle = { height:44, borderRadius:12, background:faint, border:`1px solid ${border}`, padding:"0 12px", fontSize:14, color:"#fff", fontFamily:sans, outline:"none" };

  const renderAddForm = (cat) => {
    if (addForm?.n !== cat) return null;
    return <div style={{ padding:"14px 0", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      <EmojiPicker value={addForm.i} onChange={v => setAddForm({...addForm, i:v})} />
      <input value={addForm.l} onChange={e => setAddForm({...addForm, l:e.target.value})} placeholder="Nom" style={{ ...inputStyle, flex:1, minWidth:80 }} />
      <input type="number" value={addForm.p} onChange={e => setAddForm({...addForm, p:e.target.value})} placeholder="Pts" style={{ ...inputStyle, width:64, fontFamily:mono, textAlign:"center", padding:"0 8px" }} min={1} />
      <div onClick={() => addCustomHabit(addForm)} style={{ height:44, padding:"0 16px", borderRadius:12, background:"rgba(52,211,153,.15)", border:`1px solid rgba(52,211,153,.3)`, color:G, fontSize:14, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center" }}>✓</div>
      <div onClick={() => setAddForm(null)} style={{ height:44, padding:"0 12px", borderRadius:12, background:faint, border:`1px solid ${border}`, color:dim, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center" }}>✕</div>
    </div>;
  };

  const renderAddBtn = (cat, limit, count, label) => {
    if (addForm?.n === cat || count >= limit) return null;
    return <div onClick={() => setAddForm({ n:cat, i:"", l:"", p:"" })} style={{ padding:"14px 0", color:dim, fontSize:14, cursor:"pointer", textAlign:"center", borderBottom:`1px solid ${border}` }}>+ {label}</div>;
  };

  return <div style={{ minHeight:"100vh", background:"#060610", color:"#fff", fontFamily:sans }}>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

    {popup && <Popup ds={popup} entry={all[popup]} goals={goals} habits={HA} missions={missions} close={() => setPopup(null)} />}
    {toast && <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"rgba(15,15,24,.95)", border:`1px solid ${border}`, backdropFilter:"blur(20px)", color:"#fff", padding:"12px 28px", borderRadius:100, fontSize:14, fontWeight:600, zIndex:100, fontFamily:mono, animation:"fi .15s ease" }}>{toast}</div>}

    {/* ═══ TOP BAR ═══ */}
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 24px", borderBottom:`1px solid ${border}`, position:"sticky", top:0, background:"rgba(6,6,16,.9)", backdropFilter:"blur(40px)", zIndex:50 }}>
      <div style={{ display:"flex", alignItems:"center", gap:20 }}>
        <div style={{ fontSize:18, fontWeight:800, fontFamily:mono, letterSpacing:".06em" }}>
          <span style={{ color:G }}>●</span> <span style={{ color:"rgba(255,255,255,.5)" }}>STRACK</span>
        </div>
        <div style={{ display:"flex", gap:2, background:faint, borderRadius:10, padding:2 }}>
          {navItems.map(n => <button key={n.id} onClick={() => setView(n.id)} style={{
            padding:"8px 18px", borderRadius:8, border:"none", fontSize:14, fontWeight:600, cursor:"pointer",
            background:view===n.id?"rgba(255,255,255,.08)":"transparent",
            color:view===n.id?"#fff":"rgba(255,255,255,.3)",
            fontFamily:sans, transition:"all .15s",
          }}>{n.l}</button>)}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {/* ─ BELL ─ */}
        <div style={{ position:"relative" }}>
          <div onClick={() => setBellOpen(!bellOpen)} style={{ width:38, height:38, borderRadius:10, background:faint, border:`1px solid ${border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, cursor:"pointer", position:"relative", userSelect:"none" }}>
            🔔
            {unreadCount > 0 && <div style={{ position:"absolute", top:-4, right:-4, minWidth:18, height:18, borderRadius:9, background:"#ef4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, fontFamily:mono, color:"#fff", padding:"0 4px" }}>{unreadCount}</div>}
          </div>
          {bellOpen && <>
            <div onClick={() => setBellOpen(false)} style={{ position:"fixed", inset:0, zIndex:200 }} />
            <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, width:320, maxHeight:400, overflowY:"auto", background:"#16162a", border:`1px solid ${border}`, borderRadius:16, padding:0, zIndex:201, boxShadow:"0 12px 40px rgba(0,0,0,.6)" }}>
              <div style={{ padding:"14px 16px 10px", fontSize:13, fontWeight:700, color:dim, textTransform:"uppercase", letterSpacing:".08em", borderBottom:`1px solid ${border}` }}>Notifications</div>
              {notifs.length === 0 && <div style={{ padding:"28px 16px", textAlign:"center", fontSize:13, color:dim }}>Aucune notification</div>}
              {notifs.map(n => <div key={n.id} onClick={() => {
                const m = missions.find(x => x.id === n.missionId);
                const isProposed = m && m.status === "proposed";
                setView(isProposed ? "home" : "missions");
                if (isProposed) setFocusMission(n.missionId);
                setBellOpen(false);
                updateReadIds(new Set([...readIds, n.id]));
              }} style={{ padding:"12px 16px", borderBottom:`1px solid ${border}`, cursor:"pointer", background:readIds.has(n.id)?"transparent":"rgba(52,211,153,.03)", transition:"background .1s" }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{n.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:readIds.has(n.id)?"rgba(255,255,255,.4)":"rgba(255,255,255,.8)", fontWeight:readIds.has(n.id)?400:600, lineHeight:1.4 }}>{n.text}</div>
                    <div style={{ fontSize:11, color:dim, fontFamily:mono, marginTop:3 }}>{timeAgo(n.time)}</div>
                  </div>
                  {!readIds.has(n.id) && <div style={{ width:7, height:7, borderRadius:4, background:G, flexShrink:0, marginTop:6 }} />}
                </div>
              </div>)}
              {notifs.length > 0 && <div onClick={markAllRead} style={{ padding:"12px 16px", textAlign:"center", fontSize:13, color:G, fontWeight:600, cursor:"pointer", borderTop:`1px solid ${border}` }}>Tout marquer comme lu</div>}
            </div>
          </>}
        </div>
        {/* ─ SCORE ─ */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 16px", borderRadius:10, background:at>=0?"rgba(52,211,153,.06)":"rgba(248,113,113,.06)", border:`1px solid ${at>=0?"rgba(52,211,153,.12)":"rgba(248,113,113,.12)"}` }}>
          <span style={{ fontSize:17, fontWeight:800, fontFamily:mono, color:at>=0?G:M }}>{at>0?"+":""}{at}</span>
          <span style={{ fontSize:11, color:dim }}>total</span>
        </div>
      </div>
    </div>

    {/* ═══ CONTENT ═══ */}
    <div style={{ padding:dk?"24px":md?"20px":"16px", maxWidth:1400, margin:"0 auto" }}>

      {/* ─── HOME ─── */}
      {view === "home" && <HomeView dp={dp} spark7={spark7} data={data} HA={HA} goals={goals} missions={missions} setView={setView} reloadMissions={reloadMissions} uid={uid} dk={dk} md={md} lg={W>=1024} flash={flash} leaderboard={leaderboard} wt={wt} at={at} focusMission={focusMission} clearFocus={() => setFocusMission(null)} />}

      {/* ─── TODAY ─── */}
      {view === "today" && <>
        {/* Score banner */}
        <Tile style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:dk?"24px 32px":"20px 24px", marginBottom:dk?16:12, flexWrap:"wrap", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:dk?32:20 }}>
            <div>
              <div style={{ fontSize:56, fontWeight:900, fontFamily:mono, lineHeight:1, color:dp.t>0?G:dp.t<0?M:"rgba(255,255,255,.08)" }}>{dp.t>0?"+":""}{dp.t}</div>
              <div style={{ fontSize:12, color:dim, marginTop:4, textTransform:"uppercase", letterSpacing:".1em" }}>score du jour</div>
            </div>
            <div style={{ borderLeft:`1px solid ${border}`, paddingLeft:dk?32:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div onClick={() => go(-1)} style={{ cursor:"pointer", color:dim, fontSize:22, padding:"0 4px", lineHeight:1 }}>‹</div>
                <div>
                  <div style={{ fontSize:12, color:dim }}>{td?"Aujourd'hui":ds}</div>
                  <div style={{ fontSize:18, fontWeight:700 }}>{DF[(date.getDay()+6)%7]} {date.getDate()} {MO[date.getMonth()]}</div>
                </div>
                {!td && <div onClick={() => go(1)} style={{ cursor:"pointer", color:dim, fontSize:22, padding:"0 4px", lineHeight:1 }}>›</div>}
              </div>
            </div>
          </div>
          <div style={{ textAlign:"right", minWidth:140 }}>
            <div style={{ fontSize:12, color:dim }}>7 jours</div>
            <div style={{ width:140, marginTop:4, marginLeft:"auto" }}><Spark data={spark7} h={36} /></div>
          </div>
        </Tile>

        {/* Bonus + Malus + Objectifs */}
        <div style={{ display:"grid", gridTemplateColumns:md?(objCount>0?"1fr 1fr 1fr":"1fr 1fr"):"1fr", gap:dk?16:12 }}>
          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Bonus</div>
            {HA.filter(h => h.n === "bonus").map(h => <HabitRow key={h.k} h={h} v={data[h.k]} set={v => save(h.k, v)} goal={goals[h.k]} bgh={goals.bonus_goal_hit||5} compact={!dk} />)}
          </Tile>

          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Malus</div>
            {HA.filter(h => h.n === "malus").map(h => <HabitRow key={h.k} h={h} v={data[h.k]} set={v => save(h.k, v)} goal={goals[h.k]} bgh={goals.bonus_goal_hit||5} compact={!dk} />)}
          </Tile>

          {objCount > 0 && <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Objectifs</div>
            {HA.filter(h => h.n === "objectif").map(h => <HabitRow key={h.k} h={h} v={data[h.k]} set={v => save(h.k, v)} goal={goals[h.k]} bgh={goals.bonus_goal_hit||5} compact={!dk} />)}
          </Tile>}
        </div>


      </>}

      {/* ─── WEEK ─── */}
      {view === "week" && <>
        <div style={{ display:"grid", gridTemplateColumns:md?"1fr 1fr 1fr":"1fr 1fr", gap:12, marginBottom:16 }}>
          <Tile style={{ textAlign:"center" }}>
            <div style={{ fontSize:12, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:8 }}>Semaine</div>
            <div style={{ fontSize:15, fontWeight:600 }}>{ws.getDate()} {MO[ws.getMonth()]} → {we.getDate()} {MO[we.getMonth()]}</div>
          </Tile>
          <Tile style={{ textAlign:"center" }}>
            <div style={{ fontSize:12, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:8 }}>Score semaine</div>
            <div style={{ fontSize:36, fontWeight:900, fontFamily:mono, color:wt>0?G:wt<0?M:"rgba(255,255,255,.08)" }}>{wt>0?"+":""}{wt}</div>
            <div style={{ fontSize:11, color:dim, marginTop:4 }}>habitudes + missions</div>
          </Tile>
          {md && <Tile style={{ textAlign:"center" }}>
            <div style={{ fontSize:12, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:10 }}>Tendance</div>
            <Spark data={spark7} h={40} />
          </Tile>}
        </div>

        <Tile style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              <th style={{ textAlign:"left", padding:"12px 8px 12px 0", fontSize:14, color:dim, fontWeight:500 }}>Habitude</th>
              {wd.map((d, i) => <th key={i} style={{ padding:"12px 4px", fontSize:13, fontFamily:mono, color:fmt(d)===fmt(new Date())?"#fff":"rgba(255,255,255,.18)", fontWeight:fmt(d)===fmt(new Date())?700:400, textAlign:"center" }}>
                {DJ[i]}<br/><span style={{ fontSize:12, opacity:.5 }}>{d.getDate()}</span>
              </th>)}
            </tr></thead>
            <tbody>{HA.map(h => <tr key={h.k}>
              <td style={{ padding:"10px 12px 10px 0", fontSize:14, color:"rgba(255,255,255,.4)", whiteSpace:"nowrap" }}>{h.i} {h.l}</td>
              {wd.map((d, i) => {
                const k = fmt(d), e = all[k], past = k <= fmt(new Date()), bad = h.n === "malus";
                let ok = false;
                if (e) {
                  if (h.n === "objectif") ok = h.t === "boolean" ? e[h.k] : e[h.k] > 0;
                  else if (h.t === "boolean") ok = bad ? !e[h.k] : e[h.k];
                  else ok = bad ? e[h.k] <= (goals[h.k]||0) : e[h.k] >= (goals[h.k]||1);
                }
                return <td key={i} style={{ textAlign:"center", padding:4 }}>
                  <div style={{ width:32, height:32, borderRadius:8, margin:"0 auto",
                    background:!past?"transparent":!e?"rgba(255,255,255,.015)":ok?"rgba(52,211,153,.35)":"rgba(248,113,113,.2)",
                    outline:fmt(d)===fmt(new Date())?"2px solid rgba(255,255,255,.3)":"none", outlineOffset:-2,
                    transition:"background .2s" }} />
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </Tile>
      </>}

      {/* ─── STATS ─── */}
      {view === "stats" && <>
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {[{id:"cal",l:"📅 Calendrier"},{id:"trend",l:"📈 Tendances"}].map(t => <button key={t.id} onClick={() => setStab(t.id)} style={{
            padding:"10px 24px", borderRadius:10, border:`1px solid ${stab===t.id?border:"transparent"}`,
            background:stab===t.id?faint:"transparent", color:stab===t.id?"#fff":dim,
            fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:sans,
          }}>{t.l}</button>)}
        </div>

        <Tile style={{ textAlign:"center", marginBottom:16, padding:32 }}>
          <div style={{ fontSize:64, fontWeight:900, fontFamily:mono, color:at>0?G:at<0?M:"rgba(255,255,255,.06)", lineHeight:1 }}>{at>0?"+":""}{at}</div>
          <div style={{ fontSize:14, color:dim, marginTop:10 }}>Score total · habitudes + missions</div>
        </Tile>

        {stab === "cal" && <Tile style={{ padding:dk?32:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
            <div onClick={() => { const d = new Date(date); d.setMonth(d.getMonth()-1); setDate(d); }} style={{ cursor:"pointer", color:dim, fontSize:20, padding:"4px 12px" }}>‹</div>
            <div style={{ fontSize:18, fontWeight:700 }}>{MO[date.getMonth()]} {date.getFullYear()}</div>
            <div onClick={() => { const d = new Date(date); d.setMonth(d.getMonth()+1); if (d <= new Date()) setDate(d); }} style={{ cursor:"pointer", color:dim, fontSize:20, padding:"4px 12px" }}>›</div>
          </div>
          <Cal year={date.getFullYear()} month={date.getMonth()} entries={all} goals={goals} habits={HA} missions={missions} onClick={ds => setPopup(ds)} />
          <div style={{ display:"flex", gap:20, justifyContent:"center", marginTop:24 }}>
            {[{c:"rgba(52,211,153,.4)",l:"≥40"},{c:"rgba(96,165,250,.35)",l:"≥20"},{c:"rgba(251,191,36,.2)",l:">0"},{c:"rgba(248,113,113,.3)",l:"<0"}].map(x => <div key={x.l} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:12, height:12, borderRadius:4, background:x.c }} /><span style={{ fontSize:12, color:dim, fontFamily:mono }}>{x.l}</span>
            </div>)}
          </div>
        </Tile>}

        {stab === "trend" && <>
          <Chart data={trend.sc} label="Score/jour" color={G} icon="📊" />
          <div style={{ display:"grid", gridTemplateColumns:dk?"1fr 1fr 1fr":md?"1fr 1fr":"1fr 1fr", gap:12, marginTop:12 }}>
            {HA.filter(h => h.t === "number").map(h => <Chart key={h.k} data={trend.ph[h.k]} label={h.l} color={h.n==="malus"?M:G} icon={h.i} />)}
          </div>
          <div style={{ fontSize:12, color:dim, textTransform:"uppercase", letterSpacing:".1em", margin:"24px 0 12px", fontWeight:600 }}>Totaux all-time</div>
          <div style={{ display:"grid", gridTemplateColumns:dk?"repeat(5,1fr)":md?"repeat(5,1fr)":"repeat(3,1fr)", gap:10 }}>
            {HA.filter(h => h.t === "number").map(h => {
              const total = Object.values(all).reduce((s, e) => s + (e[h.k]||0), 0);
              return <Tile key={h.k} style={{ textAlign:"center", padding:18 }}>
                <div style={{ fontSize:20 }}>{h.i}</div>
                <div style={{ fontSize:26, fontWeight:800, fontFamily:mono, color:h.n==="malus"?M:"#fff", marginTop:6 }}>{total}</div>
                <div style={{ fontSize:12, color:dim, marginTop:4 }}>{h.l}</div>
              </Tile>;
            })}
          </div>
        </>}
      </>}

      {/* ─── GOALS / CONFIG ─── */}
      {view === "goals" && <>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:26, fontWeight:800 }}>Configuration</div>
          <div style={{ fontSize:14, color:dim, marginTop:6 }}>Objectif atteint = +{goals.bonus_goal_hit} bonus · No fap = +15 auto</div>
          <div style={{ display:"flex", gap:12, marginTop:14, flexWrap:"wrap" }}>
            {[
              { l:"Bonus", c:bonusCount, mx:LIMITS.bonus, color:G },
              { l:"Malus", c:malusCount, mx:LIMITS.malus, color:M },
              { l:"Objectifs", c:objCount, mx:LIMITS.objectif, color:"#60a5fa" },
            ].map(x => <div key={x.l} style={{ padding:"8px 16px", borderRadius:10, background:faint, border:`1px solid ${border}`, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:13, color:dim }}>{x.l}</span>
              <span style={{ fontSize:15, fontWeight:700, fontFamily:mono, color:x.color }}>{x.c}</span>
              <span style={{ fontSize:12, color:dim }}>/ {x.mx}</span>
            </div>)}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:dk?"1fr 1fr 1fr":md?"1fr 1fr":"1fr", gap:14 }}>
          {/* ─ BONUS ─ */}
          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Bonus ({bonusCount}/{LIMITS.bonus})</div>
            {HA.filter(h => h.n === "bonus").map(h => <div key={h.k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:`1px solid ${border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
                <span style={{ fontSize:20 }}>{h.i}</span>
                <div>
                  <div style={{ fontSize:15, fontWeight:600 }}>{h.l}</div>
                  <div style={{ fontSize:12, color:G, fontFamily:mono, marginTop:2 }}>+{h.p}{h.t==="boolean"?" pts":"/unité"}</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                {h.t === "boolean" ? <Tog on={goals[h.k]} set={v => sG(h.k, v)} /> : <><span style={{ fontSize:11, color:dim, fontFamily:mono }}>min</span><Num v={goals[h.k]||0} set={v => sG(h.k, v)} /></>}
                <div onClick={() => removeHabit(h.k)} style={{ width:28, height:28, borderRadius:8, background:"rgba(248,113,113,.1)", color:M, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:12, marginLeft:6, flexShrink:0 }}>✕</div>
              </div>
            </div>)}
            {renderAddForm("bonus")}
            {renderAddBtn("bonus", LIMITS.bonus, bonusCount, "Ajouter un bonus")}
          </Tile>

          {/* ─ MALUS ─ */}
          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Malus ({malusCount}/{LIMITS.malus})</div>
            {HA.filter(h => h.n === "malus").map(h => <div key={h.k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:`1px solid ${border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
                <span style={{ fontSize:20 }}>{h.i}</span>
                <div>
                  <div style={{ fontSize:15, fontWeight:600 }}>{h.l}</div>
                  <div style={{ fontSize:12, color:M, fontFamily:mono, marginTop:2 }}>{h.p}{h.t==="boolean"?" pts":"/unité"}</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:11, color:dim, fontFamily:mono }}>max</span><Num v={goals[h.k]||0} set={v => sG(h.k, v)} />
                <div onClick={() => removeHabit(h.k)} style={{ width:28, height:28, borderRadius:8, background:"rgba(248,113,113,.1)", color:M, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:12, marginLeft:6, flexShrink:0 }}>✕</div>
              </div>
            </div>)}
            {renderAddForm("malus")}
            {renderAddBtn("malus", LIMITS.malus, malusCount, "Ajouter un malus")}
          </Tile>

          {/* ─ OBJECTIFS + POINTS ─ */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Tile style={{ padding:"12px 24px" }}>
              <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Objectifs ({objCount}/{LIMITS.objectif})</div>
              {HA.filter(h => h.n === "objectif").length === 0 && !addForm?.n?.startsWith("objectif") && <div style={{ padding:"20px 0", color:"rgba(255,255,255,.12)", fontSize:14, textAlign:"center" }}>Aucun objectif</div>}
              {HA.filter(h => h.n === "objectif").map(h => <div key={h.k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:`1px solid ${border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
                  <span style={{ fontSize:20 }}>{h.i}</span>
                  <div>
                    <div style={{ fontSize:15, fontWeight:600 }}>{h.l}</div>
                    <div style={{ fontSize:12, color:"#60a5fa", fontFamily:mono, marginTop:2 }}>+{h.p} pts</div>
                  </div>
                </div>
                <div onClick={() => removeHabit(h.k)} style={{ width:28, height:28, borderRadius:8, background:"rgba(248,113,113,.1)", color:M, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:12, flexShrink:0 }}>✕</div>
              </div>)}
              {renderAddForm("objectif")}
              {renderAddBtn("objectif", LIMITS.objectif, objCount, "Ajouter un objectif")}
            </Tile>

            <Tile>
              <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:20, fontWeight:600 }}>Points</div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:700 }}>🎯 Bonus objectif</div>
                  <div style={{ fontSize:13, color:GO, fontFamily:mono, marginTop:6 }}>+{goals.bonus_goal_hit} par objectif atteint</div>
                </div>
                <Num v={goals.bonus_goal_hit||5} set={v => sG("bonus_goal_hit", v)} />
              </div>
            </Tile>
          </div>
        </div>
      </>}

      {/* ─── MISSIONS ─── */}
      {view === "missions" && <MissionsView missions={missions} reloadMissions={reloadMissions} uid={uid} dk={dk} md={md} flash={flash} />}

      {/* ─── ACCOUNT ─── */}
      {view === "account" && <AccountView user={user} uid={uid} logout={logout} flash={flash} md={md} />}

      {/* ─── ADMIN ─── */}
      {view === "admin" && <AdminView user={user} dk={dk} md={md} flash={flash} />}

      <div style={{ height:40 }} />
    </div>

    <style>{`
      @keyframes fi{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      @keyframes spin{to{transform:rotate(360deg)}}
      *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
      html,body,#root{background:#060610;min-height:100vh}
      button{font-family:inherit}
      ::-webkit-scrollbar{width:0;height:0}
    `}</style>
  </div>;
}
