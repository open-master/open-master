import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  type StoredMessage,
} from '@/lib/memory/chat-history';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const masterId = searchParams.get('masterId');
  const chatKey = parseInt(searchParams.get('chatKey') ?? '0', 10);

  if (!masterId) return Response.json({ messages: [] });

  try {
    const messages = loadChatHistory(masterId, chatKey);
    return Response.json({ messages });
  } catch (err) {
    return Response.json({ messages: [], error: String(err) });
  }
}

export async function POST(req: Request) {
  try {
    const { masterId, chatKey, messages } = await req.json();
    if (!masterId || !Array.isArray(messages)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    saveChatHistory(masterId, chatKey ?? 0, messages as StoredMessage[]);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const masterId = body.masterId as string | undefined;
    const chatKey = body.chatKey as number | undefined;
    if (!masterId) {
      return Response.json({ error: 'masterId required' }, { status: 400 });
    }
    clearChatHistory(masterId, chatKey);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
