import { clearSession } from "@/lib/sessionCookie";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSession();
  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}
