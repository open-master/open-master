export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mem0ServiceUrl =
      process.env.MEM0_SERVICE_URL || 'http://127.0.0.1:3010';

    const response = await fetch(`${mem0ServiceUrl}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('[mem0-extract] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
