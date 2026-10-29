import { notFound } from "next/navigation";
import { OverlayClient } from "@/components/overlay/OverlayClient";
import { loadOverlayState } from "@/lib/overlayData";

export const dynamic = "force-dynamic";

export default async function OverlayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await loadOverlayState(token);

  if (!state) notFound();

  return <OverlayClient token={token} initial={state} />;
}
