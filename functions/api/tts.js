// Edge TTS API Proxy - Cloudflare Pages Function
// GET /api/tts?text=你好&voice=zh-CN-XiaoxiaoNeural

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491F643";
const WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

function generateRequestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSsml(text, voice, rate = 0, pitch = 0) {
  return `<speak version='1.0' xml:lang='zh-CN'>
    <voice name='${voice}'>
      <prosody pitch='${pitch > 0 ? "+" : ""}${pitch}Hz' rate='${rate > 0 ? "+" : ""}${rate}%'>
        ${text}
      </prosody>
    </voice>
  </speak>`;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const text = url.searchParams.get("text");
  const voice = url.searchParams.get("voice") || "zh-CN-XiaoxiaoNeural";
  const rate = parseInt(url.searchParams.get("rate") || "0");
  const pitch = parseInt(url.searchParams.get("pitch") || "0");

  if (!text) {
    return new Response(JSON.stringify({ error: "Missing text parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const requestId = generateRequestId();
  const wssUrl = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

  try {
    const ws = new WebSocket(wssUrl);

    const audioChunks = [];
    let audioLength = 0;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("TTS timeout"));
      }, 15000);

      ws.onopen = () => {
        // Send config
        const config = {
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        };
        ws.send(JSON.stringify(config));

        // Send SSML
        const ssml = generateSsml(text, voice, rate, pitch);
        const ssmlMessage = `Content-Type:application/json;charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}`;
        ws.send(ssmlMessage);

        const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          // First 2 bytes are header size
          const headerSize = (bytes[0] << 8) | bytes[1];
          const header = new TextDecoder().decode(bytes.slice(2, 2 + headerSize));

          if (header.includes("Path:audio")) {
            audioChunks.push(bytes.slice(2 + headerSize));
            audioLength += bytes.slice(2 + headerSize).length;
          }

          if (header.includes("Path:turn.end")) {
            clearTimeout(timeout);
            ws.close();

            const audioBuffer = new Uint8Array(audioLength);
            let offset = 0;
            for (const chunk of audioChunks) {
              audioBuffer.set(chunk, offset);
              offset += chunk.length;
            }

            resolve(new Response(audioBuffer, {
              headers: {
                "Content-Type": "audio/mpeg",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600",
              },
            }));
          }
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error("WebSocket error"));
      };
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
