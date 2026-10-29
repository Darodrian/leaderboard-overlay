import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * Overlay access is licensed: a bound key that is active and unexpired. The
 * dashboard hides the URL until a key is bound, and this check keeps a leaked
 * or guessed token from serving a leaderboard without a purchase.
 */
export async function licenseIsActive(
  licenseKey: string | null,
): Promise<boolean> {
  if (!licenseKey) return false;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("licenses")
    .select("is_active,expires_at")
    .eq("key", licenseKey)
    .maybeSingle();

  if (error || !data || !data.is_active) return false;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return false;
  }
  return true;
}
