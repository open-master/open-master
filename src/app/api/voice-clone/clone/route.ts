export async function POST(req: Request) {
  try {
    const { apiKey, fileId, voiceId, text, model } = await req.json();

    if (!apiKey || !fileId || !voiceId) {
      return Response.json(
        { error: 'apiKey, fileId and voiceId are required' },
        { status: 400 }
      );
    }

    const res = await fetch('https://api.minimaxi.com/v1/voice_clone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        file_id: fileId,
        voice_id: voiceId,
        text: text || '你好，我是你的专属 AI 助手，很高兴为你服务。',
        model: model || 'speech-2.8-hd',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return Response.json(
        { error: errText || `MiniMax clone error ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    if (data.base_resp?.status_code !== 0) {
      return Response.json(
        { error: data.base_resp?.status_msg || 'Voice clone failed' },
        { status: 500 }
      );
    }

    const hexAudio = data.data?.audio;
    return Response.json({
      voiceId: data.data?.voice_id || voiceId,
      audioBase64: hexAudio
        ? Buffer.from(hexAudio, 'hex').toString('base64')
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
