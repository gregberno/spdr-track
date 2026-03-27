import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "./supabase";

/* ═══ UTILS ═══ */
const fmt = d => d.toISOString().split("T")[0];
const wkS = d => { const y = d.getDay(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - y + (y === 0 ? -6 : 1)); };
const wkE = d => { const s = wkS(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); };
const rng = (a, b) => { const r = []; const c = new Date(a); while (c <= b) { r.push(new Date(c)); c.setDate(c.getDate() + 1); } return r; };
const DJ = ["L","M","M","J","V","S","D"];
const MO = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
const DF = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

/* ═══ DATA ═══ */
const HA = [
  { k:"steps", l:"10K Pas", t:"boolean", i:"🏃", n:"bonus", p:10 },
  { k:"fap", l:"Fap", t:"boolean", i:"💀", n:"malus", p:-20 },
  { k:"deepwork", l:"Deep Work", t:"number", i:"⚡", n:"bonus", p:8 },
  { k:"social", l:"Social", t:"number", i:"🤝", n:"bonus", p:5 },
  { k:"approaches", l:"Abordages", t:"number", i:"💬", n:"bonus", p:12 },
  { k:"trainings", l:"Training", t:"number", i:"💪", n:"bonus", p:10 },
  { k:"restaurants", l:"Restos", t:"number", i:"🍽️", n:"malus", p:-10 },
];
const DD = { steps:false, fap:false, deepwork:0, social:0, approaches:0, trainings:0, restaurants:0 };
const GD = { steps:true, fap:0, deepwork:2, social:1, restaurants:0, approaches:1, trainings:1, bonus_goal_hit:5 };

/* ═══ POINTS ═══ */
function calc(e, g) {
  if (!e) return { t:0, b:[] };
  let t = 0; const b = [], bh = g.bonus_goal_hit || 5;
  HA.forEach(h => {
    const v = e[h.k], gl = g[h.k];
    if (h.n === "malus") {
      if (h.t === "boolean" && v) { t += h.p; b.push({ l:h.l, i:h.i, p:h.p, c:"m" }); }
      else if (h.t === "number" && v > 0) { const p = h.p*v; t += p; b.push({ l:`${h.l}×${v}`, i:h.i, p, c:"m" }); }
      if (h.k === "fap" && !v) { t += 15; b.push({ l:"No Fap", i:"🧠", p:15, c:"b" }); }
      if (h.t === "number" && v <= (gl||0)) { t += bh; b.push({ l:`${h.l} ✓`, i:"🎯", p:bh, c:"g" }); }
    } else {
      if (h.t === "boolean" && v) { t += h.p; b.push({ l:h.l, i:h.i, p:h.p, c:"b" }); if (v===gl) { t+=bh; b.push({l:`${h.l} ✓`,i:"🎯",p:bh,c:"g"}); } }
      else if (h.t === "number" && v > 0) { const p = h.p*v; t += p; b.push({ l:`${h.l}×${v}`, i:h.i, p, c:"b" }); if (v>=gl&&gl>0) { t+=bh; b.push({l:`${h.l} ✓`,i:"🎯",p:bh,c:"g"}); } }
    }
  });
  return { t, b };
}

/* ═══ DB ═══ */
const DB = {
  async ld() { const { data } = await supabase.from("daily_entries").select("*"); const m = {}; (data||[]).forEach(r => m[r.date] = r); return m; },
  async lg() { const { data } = await supabase.from("goals").select("*").limit(1).single(); return data; },
  async sv(d, e) { const r = { date:d, ...e }; delete r.id; delete r.created_at; await supabase.from("daily_entries").upsert(r, { onConflict:"date" }); },
  async sg(g) { const r = { ...g }; delete r.created_at; if (r.id) await supabase.from("goals").update(r).eq("id",r.id); else { delete r.id; await supabase.from("goals").upsert(r); } },
};

/* ═══ DESIGN TOKENS ═══ */
const mono = "'JetBrains Mono','SF Mono',monospace";
const sans = "'SF Pro Display','Inter',-apple-system,sans-serif";
const G = "#34d399", M = "#f87171", GO = "#fbbf24", R = "#ef4444";
const glass = "rgba(255,255,255,.03)";
const border = "rgba(255,255,255,.06)";
const dim = "rgba(255,255,255,.3)";
const faint = "rgba(255,255,255,.08)";

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

/* ═══ HABIT ROW ═══ */
function HabitRow({ h, v, set, goal, bgh, compact }) {
  const on = h.t === "boolean" ? v : v > 0;
  const bad = h.n === "malus";
  const nf = h.k === "fap" && !v;
  const gh = h.t === "boolean" ? (bad ? !v : v === goal) : (bad ? v <= (goal||0) : v >= goal && goal > 0);

  return <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:compact?"12px 0":"16px 0", borderBottom:`1px solid ${border}` }}>
    <div style={{ display:"flex", alignItems:"center", gap:compact?10:14, flex:1, minWidth:0 }}>
      <div style={{ width:42, height:42, borderRadius:12, background:on?(bad?"rgba(248,113,113,.1)":"rgba(52,211,153,.1)"):faint, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{h.i}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:15, fontWeight:600, color:on?"#fff":"rgba(255,255,255,.35)", display:"flex", alignItems:"center", gap:6 }}>
          {h.l}
          {bad && <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:"rgba(248,113,113,.12)", color:M, fontWeight:700, fontFamily:mono }}>−</span>}
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
function Spark({ data, color = G, h = 40 }) {
  if (data.length < 2) return <div style={{ height:h }} />;
  const w = 200;
  const mx = Math.max(...data, 1), mn = Math.min(...data, 0), r = mx - mn || 1;
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h-4-((v-mn)/r)*(h-8)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", height:h, display:"block" }}>
    <defs><linearGradient id="spk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#spk)" />
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
function Cal({ year, month, entries, goals, onClick }) {
  const f = new Date(year, month, 1), l = new Date(year, month + 1, 0);
  const pad = (f.getDay() + 6) % 7;
  const days = [...Array(pad).fill(null), ...Array.from({ length: l.getDate() }, (_, i) => i + 1)];
  return <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
    {DJ.map(d => <div key={d} style={{ fontSize:12, color:"rgba(255,255,255,.15)", textAlign:"center", padding:4, fontFamily:mono, fontWeight:600 }}>{d}</div>)}
    {days.map((d, i) => {
      if (!d) return <div key={`p${i}`} />;
      const ds = fmt(new Date(year, month, d)), e = entries[ds], td = ds === fmt(new Date()), fu = ds > fmt(new Date());
      const { t } = e ? calc(e, goals) : { t:0 };
      const bg = fu ? "transparent" : !e ? "rgba(255,255,255,.015)" : t >= 40 ? "rgba(52,211,153,.4)" : t >= 20 ? "rgba(96,165,250,.35)" : t > 0 ? "rgba(251,191,36,.2)" : t < 0 ? "rgba(248,113,113,.3)" : "rgba(255,255,255,.02)";
      return <div key={d} onClick={() => !fu && e && onClick(ds)} style={{
        aspectRatio:"1", borderRadius:10, background:bg, display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:13, fontFamily:mono, color:e&&t!==0?"rgba(255,255,255,.85)":"rgba(255,255,255,.12)",
        fontWeight:td?800:500, cursor:e&&!fu?"pointer":"default",
        outline:td?"2px solid rgba(255,255,255,.4)":"none", outlineOffset:-2, transition:"all .15s",
      }}>{d}</div>;
    })}
  </div>;
}

/* ═══ POPUP ═══ */
function Popup({ ds, entry, goals, close }) {
  const { t, b } = calc(entry, goals);
  const d = new Date(ds + "T12:00:00");
  return <div onClick={close} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16, backdropFilter:"blur(12px)" }}>
    <div onClick={e => e.stopPropagation()} style={{ background:"#0f0f18", border:`1px solid ${border}`, borderRadius:24, padding:32, width:"100%", maxWidth:420, maxHeight:"85vh", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <div style={{ fontSize:14, color:dim, marginBottom:2 }}>{DF[(d.getDay()+6)%7]}</div>
          <div style={{ fontSize:30, fontWeight:800, fontFamily:mono, letterSpacing:"-.02em" }}>{d.getDate()} {MO[d.getMonth()]}</div>
        </div>
        <div style={{ fontSize:40, fontWeight:800, fontFamily:mono, color:t>0?G:t<0?M:"rgba(255,255,255,.1)", lineHeight:1 }}>{t>0?"+":""}{t}</div>
      </div>
      {!entry ? <div style={{ color:dim, textAlign:"center", padding:40, fontSize:15 }}>Pas de données</div> :
        <div>{b.map((x, i) => <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"12px 0", borderBottom:i<b.length-1?`1px solid ${border}`:"none" }}>
          <span style={{ fontSize:15, color:"rgba(255,255,255,.45)" }}>{x.i} {x.l}</span>
          <span style={{ fontSize:15, fontWeight:700, fontFamily:mono, color:x.c==="m"?M:x.c==="g"?GO:G }}>{x.p>0?"+":""}{x.p}</span>
        </div>)}</div>}
      <div onClick={close} style={{ marginTop:24, textAlign:"center", padding:14, borderRadius:12, background:faint, color:"rgba(255,255,255,.5)", fontSize:15, cursor:"pointer", fontWeight:600 }}>Fermer</div>
    </div>
  </div>;
}

/* ═══ MAIN APP ═══ */
export default function App() {
  const [view, setView] = useState("today");
  const [date, setDate] = useState(new Date());
  const [all, setAll] = useState({});
  const [goals, setGoals] = useState({ ...GD });
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stab, setStab] = useState("cal");
  const [popup, setPopup] = useState(null);
  const W = useW();
  const dk = W >= 900;
  const md = W >= 600;

  const ds = fmt(date), ws = wkS(date), we = wkE(date), wd = rng(ws, we), td = ds === fmt(new Date());
  const data = all[ds] || { ...DD };

  useEffect(() => { (async () => { try { const [d, g] = await Promise.all([DB.ld(), DB.lg()]); setAll(d); if (g) setGoals(g); } catch(e) { console.error(e); } setLoading(false); })(); }, []);

  const save = useCallback((k, v) => {
    const u = { ...(all[ds] || { ...DD }), [k]: v }; setAll(p => ({ ...p, [ds]: u })); DB.sv(ds, u);
    const h = HA.find(x => x.k === k);
    if (h?.n === "malus" && v === true) flash(`${h.i} malus`);
    else if (h?.t === "boolean" && v) flash(`${h.i} +${h.p}`);
  }, [all, ds]);

  const sG = useCallback((k, v) => { const u = { ...goals, [k]: v }; setGoals(u); DB.sg(u); }, [goals]);
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 1500); };
  const go = n => { const d = new Date(date); d.setDate(d.getDate() + n); if (d <= new Date()) setDate(d); };

  const dp = useMemo(() => calc(data, goals), [data, goals]);
  const wt = useMemo(() => { let s = 0; wd.forEach(d => { const k = fmt(d); if (k > fmt(new Date())) return; const e = all[k]; if (e) s += calc(e, goals).t; }); return s; }, [all, wd, goals]);
  const at = useMemo(() => { let s = 0; Object.values(all).forEach(e => s += calc(e, goals).t); return s; }, [all, goals]);
  const spark7 = useMemo(() => { const t = new Date(), d = []; for (let i = 6; i >= 0; i--) { const x = new Date(t); x.setDate(x.getDate()-i); const k = fmt(x); const e = all[k]; d.push(e ? calc(e, goals).t : 0); } return d; }, [all, goals]);

  const trend = useMemo(() => {
    const t = new Date(), days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(t); d.setDate(d.getDate()-i); days.push(d); }
    const sc = days.map(d => { const k = fmt(d); const e = all[k]; return { l:`${d.getDate()}/${d.getMonth()+1}`, v:e?calc(e,goals).t:0 }; });
    const ph = {}; HA.filter(h => h.t === "number").forEach(h => { ph[h.k] = days.map(d => { const k = fmt(d); const e = all[k]; return { l:`${d.getDate()}/${d.getMonth()+1}`, v:e?(e[h.k]||0):0 }; }); });
    return { sc, ph };
  }, [all, goals]);

  /* ═══ RENDER ═══ */
  if (loading) return <div style={{ minHeight:"100vh", background:"#060610", display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ width:24, height:24, border:"2px solid rgba(255,255,255,.1)", borderTop:`2px solid ${G}`, borderRadius:"50%", animation:"spin 1s linear infinite" }} />
  </div>;

  const navItems = [
    { id:"today", l:"Jour" },
    { id:"week", l:"Semaine" },
    { id:"stats", l:"Stats" },
    { id:"goals", l:"Config" },
  ];

  return <div style={{ minHeight:"100vh", background:"#060610", color:"#fff", fontFamily:sans }}>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

    {popup && <Popup ds={popup} entry={all[popup]} goals={goals} close={() => setPopup(null)} />}
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
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 16px", borderRadius:10, background:at>=0?"rgba(52,211,153,.06)":"rgba(248,113,113,.06)", border:`1px solid ${at>=0?"rgba(52,211,153,.12)":"rgba(248,113,113,.12)"}` }}>
        <span style={{ fontSize:17, fontWeight:800, fontFamily:mono, color:at>=0?G:M }}>{at>0?"+":""}{at}</span>
        <span style={{ fontSize:12, color:dim }}>pts</span>
      </div>
    </div>

    {/* ═══ CONTENT ═══ */}
    <div style={{ padding:dk?"24px":md?"20px":"16px", maxWidth:1400, margin:"0 auto" }}>

      {/* ─── TODAY ─── */}
      {view === "today" && <>
        {/* Score banner — full width on top */}
        <Tile style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:dk?"24px 32px":"20px 24px", marginBottom:dk?16:12, flexWrap:"wrap", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:dk?32:20 }}>
            {/* Score */}
            <div>
              <div style={{ fontSize:56, fontWeight:900, fontFamily:mono, lineHeight:1, color:dp.t>0?G:dp.t<0?M:"rgba(255,255,255,.08)" }}>{dp.t>0?"+":""}{dp.t}</div>
              <div style={{ fontSize:12, color:dim, marginTop:4, textTransform:"uppercase", letterSpacing:".1em" }}>score du jour</div>
            </div>
            {/* Date nav */}
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
          {/* Sparkline */}
          <div style={{ textAlign:"right", minWidth:140 }}>
            <div style={{ fontSize:12, color:dim }}>7 jours</div>
            <div style={{ width:140, marginTop:4, marginLeft:"auto" }}><Spark data={spark7} h={36} /></div>
          </div>
        </Tile>

        {/* Bonus + Malus side by side */}
        <div style={{ display:"grid", gridTemplateColumns:md?"1fr 1fr":"1fr", gap:dk?16:12 }}>
          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Bonus</div>
            {HA.filter(h => h.n === "bonus").map(h => <HabitRow key={h.k} h={h} v={data[h.k]} set={v => save(h.k, v)} goal={goals[h.k]} bgh={goals.bonus_goal_hit||5} compact={!dk} />)}
          </Tile>

          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Malus</div>
            {HA.filter(h => h.n === "malus").map(h => <HabitRow key={h.k} h={h} v={data[h.k]} set={v => save(h.k, v)} goal={goals[h.k]} bgh={goals.bonus_goal_hit||5} compact={!dk} />)}
          </Tile>
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
            <div style={{ fontSize:12, color:dim, textTransform:"uppercase", letterSpacing:".1em", marginBottom:8 }}>Total</div>
            <div style={{ fontSize:36, fontWeight:900, fontFamily:mono, color:wt>0?G:wt<0?M:"rgba(255,255,255,.08)" }}>{wt>0?"+":""}{wt}</div>
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
                if (e) { if (h.t === "boolean") ok = bad ? !e[h.k] : e[h.k]; else ok = bad ? e[h.k] <= (goals[h.k]||0) : e[h.k] >= (goals[h.k]||1); }
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
          <div style={{ fontSize:14, color:dim, marginTop:10 }}>score total all-time</div>
        </Tile>

        {stab === "cal" && <Tile style={{ padding:dk?32:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
            <div onClick={() => { const d = new Date(date); d.setMonth(d.getMonth()-1); setDate(d); }} style={{ cursor:"pointer", color:dim, fontSize:20, padding:"4px 12px" }}>‹</div>
            <div style={{ fontSize:18, fontWeight:700 }}>{MO[date.getMonth()]} {date.getFullYear()}</div>
            <div onClick={() => { const d = new Date(date); d.setMonth(d.getMonth()+1); if (d <= new Date()) setDate(d); }} style={{ cursor:"pointer", color:dim, fontSize:20, padding:"4px 12px" }}>›</div>
          </div>
          <Cal year={date.getFullYear()} month={date.getMonth()} entries={all} goals={goals} onClick={ds => setPopup(ds)} />
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

      {/* ─── GOALS ─── */}
      {view === "goals" && <>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:26, fontWeight:800 }}>Configuration</div>
          <div style={{ fontSize:14, color:dim, marginTop:6 }}>Objectif atteint = +{goals.bonus_goal_hit} bonus · No fap = +15 auto</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:dk?"1fr 1fr 1fr":md?"1fr 1fr":"1fr", gap:14 }}>
          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Bonus</div>
            {HA.filter(h => h.n === "bonus").map(h => <div key={h.k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:`1px solid ${border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:20 }}>{h.i}</span>
                <div>
                  <div style={{ fontSize:15, fontWeight:600 }}>{h.l}</div>
                  <div style={{ fontSize:12, color:G, fontFamily:mono, marginTop:2 }}>+{h.p}{h.t==="boolean"?" pts":"/unité"}</div>
                </div>
              </div>
              {h.t === "boolean" ? <Tog on={goals[h.k]} set={v => sG(h.k, v)} /> : <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:11, color:dim, fontFamily:mono }}>min</span><Num v={goals[h.k]} set={v => sG(h.k, v)} />
              </div>}
            </div>)}
          </Tile>

          <Tile style={{ padding:"12px 24px" }}>
            <div style={{ fontSize:13, color:dim, textTransform:"uppercase", letterSpacing:".1em", padding:"14px 0 6px", fontWeight:600 }}>Malus</div>
            {HA.filter(h => h.n === "malus").map(h => <div key={h.k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:`1px solid ${border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:20 }}>{h.i}</span>
                <div>
                  <div style={{ fontSize:15, fontWeight:600 }}>{h.l}</div>
                  <div style={{ fontSize:12, color:M, fontFamily:mono, marginTop:2 }}>{h.p}{h.t==="boolean"?" pts":"/unité"}</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ fontSize:11, color:dim, fontFamily:mono }}>max</span><Num v={goals[h.k]||0} set={v => sG(h.k, v)} /></div>
            </div>)}
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
      </>}

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