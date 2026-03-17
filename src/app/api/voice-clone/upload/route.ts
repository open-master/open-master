export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const apiKey = formData.get('apiKey') as string;
    const file = formData.get('file') as File;

    if (!apiKey || !file) {
      return Response.json({ error: 'apiKey and file are required' }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.append('purpose', 'voice_clone');
    uploadForm.append('file', file, file.name);

    const res = await fetch('https://api.minimaxi.com/v1/files/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: uploadForm,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return Response.json(
        { error: errText || `MiniMax upload error ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const fileId = data.file?.file_id;
    if (!fileId) {
      return Response.json({ error: 'No file_id returned' }, { status: 500 });
    }

    return Response.json({ fileId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
