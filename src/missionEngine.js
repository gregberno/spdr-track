import { supabase } from "./supabase";

const N8N_WEBHOOK_URL = "https://n8n.srv872699.hstgr.cloud/webhook/mission-on-demand";

export async function loadMissions(userId) {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) { console.error("loadMissions error:", error); return []; }
  return data || [];
}

export async function acceptMission(missionId) {
  const { error } = await supabase
    .from("missions")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", missionId);
  if (error) console.error("acceptMission error:", error);
  return !error;
}

export async function refuseMission(missionId) {
  const { error } = await supabase
    .from("missions")
    .update({ status: "refused" })
    .eq("id", missionId);
  if (error) console.error("refuseMission error:", error);
  return !error;
}

export async function completeMission(missionId) {
  const { error } = await supabase
    .from("missions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", missionId);
  if (error) console.error("completeMission error:", error);
  return !error;
}

export async function requestMission(userId) {
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) { console.error("requestMission error:", res.status); return false; }
  return true;
}

export async function checkExpiredMissions(userId) {
  const { data, error } = await supabase
    .from("missions")
    .update({ status: "failed" })
    .eq("user_id", userId)
    .eq("status", "accepted")
    .lt("deadline", new Date().toISOString())
    .select("id");
  if (error) { console.error("checkExpiredMissions error:", error); return 0; }
  return data?.length || 0;
}
