import Head from "next/head";
import { notFound } from "next/navigation";
import { OverlayClient } from "@/components/overlay/OverlayClient";
import { loadOverlayState } from "@/lib/overlayData";

const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2";

function googleFontsUrl(family: string): string {
  const encoded = encodeURIComponent(family);
  return `${GOOGLE_FONTS_URL}?family=${encoded}:wght@400;700&display=swap`;
}

export const dynamic = "force-dynamic";

export default async function OverlayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await loadOverlayState(token);

  if (!state) notFound();

  const fontUrl = state.settings.fontFamily !== "system" ? googleFontsUrl(state.settings.fontFamily) : null;

  return (
    <>
      <Head>
        {fontUrl && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
        {fontUrl && <link rel="stylesheet" href={fontUrl} />}
      </Head>
      <OverlayClient token={token} initial={state} />
    </>
  );
}
