import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function getMusicDir(sub: string): string {
  const appData =
    process.env.OPEN_MASTER_DATA_DIR ||
    path.join(os.homedir(), 'Library', 'Application Support', 'open-master');
  return path.join(appData, 'music', sub);
}

const MIME_MAP: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') || 'uploaded';
  const fileName = searchParams.get('file');

  if (source !== 'uploaded' && source !== 'generated') {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
  }

  if (!fileName) {
    return NextResponse.json({ error: 'file param required' }, { status: 400 });
  }

  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }

  const dir = getMusicDir(source);
  const filePath = path.join(dir, fileName);

  try {
    const stat = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
