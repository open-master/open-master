const MEM0_SERVICE_URL =
  process.env.MEM0_SERVICE_URL || 'http://127.0.0.1:3010';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const masterId = searchParams.get('masterId') ?? undefined;

  try {
    const res = await fetch(`${MEM0_SERVICE_URL}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterId }),
      cache: 'no-store',
    });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ total: 0 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${MEM0_SERVICE_URL}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
