import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  getMusicDir,
  normalizeWorkStates,
  writeTrackMetadata,
} from '@/lib/dj/music-library';

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const source = (formData.get('source') as string) || 'uploaded';
    const title = (formData.get('title') as string) || '';
    const workStates = normalizeWorkStates(
      JSON.parse((formData.get('workStates') as string) || '[]')
    );

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const validTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
      'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac',
    ];
    const validExt = /\.(mp3|m4a|wav|ogg|flac|aac)$/i;
    if (!validTypes.includes(file.type) && !validExt.test(file.name)) {
      return NextResponse.json({ error: '不支持的音频格式' }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: '文件不能超过 50MB' }, { status: 400 });
    }

    const sub = source === 'generated' ? 'generated' : 'uploaded';
    const dir = getMusicDir(sub);
    await ensureDir(dir);

    const ext = path.extname(file.name) || '.mp3';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(dir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    await writeTrackMetadata(dir, safeName, {
      title: title || file.name.replace(/\.[^.]+$/, ''),
      workStates,
      createdAt: Date.now(),
      originalFileName: file.name,
    });

    return NextResponse.json({
      id: safeName.replace(ext, ''),
      fileName: safeName,
      title: title || file.name.replace(/\.[^.]+$/, ''),
      storedName: safeName,
      source: sub,
      size: file.size,
      workStates,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
