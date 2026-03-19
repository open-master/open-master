import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { apiKey, events } = await req.json();

    if (!apiKey || !events) {
      return NextResponse.json({ error: 'apiKey and events required' }, { status: 400 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: `You are a work state analyzer. Given a list of OpenClaw AI agent events, determine the current work state. Respond with ONLY a JSON object: {"state": "<one of: working, task_complete, idle>", "label": "<short Chinese description>"}`,
        messages: [
          {
            role: 'user',
            content: `Analyze these recent OpenClaw events and determine the current work state:\n${JSON.stringify(events, null, 2)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Claude API error: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) {
      return NextResponse.json(
        { state: 'idle', label: '无法解析' },
        { status: 200 }
      );
    }

    const result = JSON.parse(match[0]);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
