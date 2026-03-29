import { supabase } from "./supabase";

export async function loadLeaderboard(startDate, endDate) {
  const { data, error } = await supabase.rpc("get_leaderboard", { start_date: startDate, end_date: endDate });
  if (error) {
    // RPC may not exist yet — return empty gracefully
    if (error.code === "42883" || error.message?.includes("function")) return [];
    console.error("loadLeaderboard error:", error);
    return [];
  }
  return data || [];
}
