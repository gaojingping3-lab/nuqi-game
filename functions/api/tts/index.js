// Edge TTS Proxy - 转发到 Cloudflare Worker
// POST /api/tts  body: { text, voiceId, speed }

export async function onRequestPost(context) {
  const { request } = context;
  try {
    const body = await request.json();

    const edgeResponse = await fetch("https://raspy-violet-a1c0.gaojingping3.workers.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": "Bearer sk-edge-tts-2026",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: body.text,
        voice: body.voiceId || "shimmer",
        speed: body.speed || 1.0
      })
    });

    if (!edgeResponse.ok) {
      const errText = await edgeResponse.text();
      return new Response(JSON.stringify({ error: `Edge TTS error: ${errText}` }), {
        status: edgeResponse.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(edgeResponse.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
