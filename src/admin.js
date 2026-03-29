import { supabase } from "./supabase";

export const ADMIN_EMAIL = "gregbernopo@gmail.com";

export async function adminGetStats() {
  const { data, error } = await supabase.rpc("admin_get_stats");
  if (error) { console.error("adminGetStats:", error); return null; }
  return data;
}

export async function adminGetUsers() {
  const { data, error } = await supabase.rpc("admin_get_users");
  if (error) { console.error("adminGetUsers:", error); return []; }
  return data || [];
}

export async function adminGetUserEntries(uid) {
  const { data, error } = await supabase.rpc("admin_get_user_entries", { target_uid: uid });
  if (error) { console.error("adminGetUserEntries:", error); return []; }
  return data || [];
}

export async function adminGetUserMissions(uid) {
  const { data, error } = await supabase.rpc("admin_get_user_missions", { target_uid: uid });
  if (error) { console.error("adminGetUserMissions:", error); return []; }
  return data || [];
}

export async function adminInsertMission(uid, title, description, category, emoji, points, durationHours) {
  const { data, error } = await supabase.rpc("admin_insert_mission", {
    target_uid: uid,
    p_title: title,
    p_description: description,
    p_category: category,
    p_emoji: emoji,
    p_points: points,
    p_duration_hours: durationHours,
  });
  if (error) { console.error("adminInsertMission:", error); return null; }
  return data;
}
