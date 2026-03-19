import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { apiKey, prompt, lyrics, isInstrumental } = await req.json();

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: 'apiKey and prompt required' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      model: 'music-2.5+',
      prompt,
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format: 'mp3',
      },
      output_format: 'url',
    };

    if (isInstrumental) {
      payload.is_instrumental = true;
    } else if (lyrics) {
      payload.lyrics = lyrics;
    } else {
      payload.lyrics_optimizer = true;
    }

    const res = await fetch('https://api.minimaxi.com/v1/music_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `MiniMax API error: ${errText || res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    if (data.base_resp?.status_code !== 0) {
      return NextResponse.json(
        { error: data.base_resp?.status_msg || 'Music generation failed' },
        { status: 500 }
      );
    }

    const audioUrl = data.data?.audio_url || data.data?.audio;
    if (!audioUrl) {
      return NextResponse.json(
        { error: 'No audio returned from API' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      audioUrl,
      duration: data.data?.duration,
      taskId: data.data?.task_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
