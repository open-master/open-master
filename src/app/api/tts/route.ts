export async function POST(req: Request) {
  try {
    const { text, apiKey, model, voiceId, speed } = await req.json();

    if (!text || !apiKey) {
      return new Response('text and apiKey required', { status: 400 });
    }

    const res = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'speech-2.8-hd',
        text: text.slice(0, 10000),
        stream: false,
        voice_setting: {
          voice_id: voiceId || 'male-qn-jingying',
          speed: speed ?? 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        language_boost: 'auto',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return new Response(errText || `MiniMax API error ${res.status}`, {
        status: res.status,
      });
    }

    const data = await res.json();

    if (data.base_resp?.status_code !== 0) {
      return Response.json(
        { error: data.base_resp?.status_msg || 'TTS failed' },
        { status: 500 }
      );
    }

    const hexAudio = data.data?.audio;
    if (!hexAudio) {
      return Response.json({ error: 'No audio data returned' }, { status: 500 });
    }

    const audioBytes = Buffer.from(hexAudio, 'hex');
    return new Response(audioBytes, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBytes.length),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
