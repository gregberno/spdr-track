import { useState } from "react";
import { supabase } from "./supabase";

const mono = "'JetBrains Mono','SF Mono',monospace";
const sans = "'SF Pro Display','Inter',-apple-system,sans-serif";
const G = "#34d399", M = "#f87171";
const border = "rgba(255,255,255,.06)";
const dim = "rgba(255,255,255,.3)";
const faint = "rgba(255,255,255,.08)";

const inputStyle = {
  width: "100%", height: 48, borderRadius: 12, background: faint,
  border: `1px solid ${border}`, padding: "0 16px", fontSize: 15,
  color: "#fff", fontFamily: sans, outline: "none",
};

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const switchMode = () => { setMode(m => m === "login" ? "signup" : "login"); setErr(null); setMsg(null); setConfirm(""); };

  const submit = async e => {
    e.preventDefault();
    setErr(null); setMsg(null);

    if (mode === "signup" && pass !== confirm) {
      setErr("Les mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password: pass });
      if (error) setErr(error.message);
      else setMsg("Vérifie ton email pour confirmer ton compte.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) setErr(error.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#060610", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: mono, letterSpacing: ".06em" }}>
            <span style={{ color: G }}>●</span>{" "}
            <span style={{ color: "rgba(255,255,255,.5)" }}>STRACK</span>
          </div>
          <div style={{ fontSize: 14, color: dim, marginTop: 10 }}>
            {mode === "login" ? "Connexion" : "Créer un compte"}
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required style={inputStyle} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Mot de passe" required minLength={6} style={inputStyle} />
          {mode === "signup" && (
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirmer le mot de passe" required minLength={6} style={inputStyle} />
          )}

          {err && <div style={{ fontSize: 13, color: M, fontFamily: mono, padding: "8px 12px", borderRadius: 8, background: "rgba(248,113,113,.08)" }}>{err}</div>}
          {msg && <div style={{ fontSize: 13, color: G, fontFamily: mono, padding: "8px 12px", borderRadius: 8, background: "rgba(52,211,153,.08)" }}>{msg}</div>}

          <button type="submit" disabled={busy} style={{
            height: 48, borderRadius: 12, border: "none", background: G, color: "#060610",
            fontSize: 15, fontWeight: 700, cursor: busy ? "wait" : "pointer",
            fontFamily: sans, opacity: busy ? .6 : 1, transition: "opacity .15s",
          }}>
            {busy ? "..." : mode === "signup" ? "Créer un compte" : "Se connecter"}
          </button>
        </form>

        <div onClick={switchMode} style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: dim, cursor: "pointer" }}>
          {mode === "signup" ? "Déjà un compte ? Se connecter" : "Pas de compte ? S'inscrire"}
        </div>
      </div>
    </div>
  );
}
