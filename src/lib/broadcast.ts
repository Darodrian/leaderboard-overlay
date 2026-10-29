import "server-only";

export type BroadcastPayload = Record<string, unknown>;

/**
 * Server-side Realtime broadcast over Supabase's HTTP endpoint. This avoids
 * holding a websocket open in a short-lived serverless invocation.
 */
export async function broadcastToOverlay(
  obsToken: string,
  event: string,
  payload: BroadcastPayload,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment is not configured");
  }

  const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `overlay:${obsToken}`,
          event,
          payload,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Realtime broadcast failed with status ${response.status}`);
  }
}
