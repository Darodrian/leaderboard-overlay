import { loadOverlayState } from "@/lib/overlayData";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const state = await loadOverlayState(token);

  if (!state) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json(state);
}
