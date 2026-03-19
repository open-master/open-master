import { NextResponse } from 'next/server';
import crypto from 'crypto';

interface WebhookStore {
  events: Array<{ type: string; timestamp: number; payload?: Record<string, unknown> }>;
  listeners: Set<ReadableStreamDefaultController>;
}

const store: WebhookStore = {
  events: [],
  listeners: new Set(),
};

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return !secret;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-openclaw-signature');
    const secret = process.env.OPENCLAW_WEBHOOK_SECRET || '';

    if (secret && !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const normalized = {
      type: event.type || 'custom.triggered',
      timestamp: event.timestamp ? new Date(event.timestamp).getTime() : Date.now(),
      payload: event.data || event.payload || {},
    };

    store.events.push(normalized);
    if (store.events.length > 200) {
      store.events = store.events.slice(-100);
    }

    const chunk = `data: ${JSON.stringify(normalized)}\n\n`;
    const encoder = new TextEncoder();
    for (const controller of store.listeners) {
      try {
        controller.enqueue(encoder.encode(chunk));
      } catch {
        store.listeners.delete(controller);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      store.listeners.add(controller);

      const encoder = new TextEncoder();
      const recent = store.events.slice(-20);
      if (recent.length > 0) {
        const init = `data: ${JSON.stringify({ type: 'init', events: recent })}\n\n`;
        controller.enqueue(encoder.encode(init));
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          store.listeners.delete(controller);
        }
      }, 30_000);

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
      );
    },
    cancel(controller) {
      store.listeners.delete(controller as ReadableStreamDefaultController);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
