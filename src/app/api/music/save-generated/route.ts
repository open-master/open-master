import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getMusicDir, normalizeWorkStates, writeTrackMetadata } from '@/lib/dj/music-library';

const MAX_GENERATED = 50;

async function cleanupOldFiles(dir: string) {
  try {
    const files = await fs.readdir(dir);
    const audioFiles = files.filter((f) => /\.(mp3|m4a|wav|ogg|flac)$/i.test(f));

    if (audioFiles.length <= MAX_GENERATED) return;

    const withStats = await Promise.all(
      audioFiles.map(async (f) => {
        const stat = await fs.stat(path.join(dir, f));
        return { name: f, mtime: stat.mtimeMs };
      })
    );

    withStats.sort((a, b) => a.mtime - b.mtime);
    const toDelete = withStats.slice(0, withStats.length - MAX_GENERATED);

    for (const f of toDelete) {
      await fs.unlink(path.join(dir, f.name)).catch(() => {});
      await fs.unlink(path.join(dir, `${f.name}.json`)).catch(() => {});
    }
  } catch {
    // directory might not exist yet
  }
}

export async function POST(req: Request) {
  try {
    const { audioUrl, title, workStates } = await req.json();

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl required' }, { status: 400 });
    }

    const dir = getMusicDir('generated');
    await fs.mkdir(dir, { recursive: true });

    const res = await fetch(audioUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to download: ${res.status}` },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const filePath = path.join(dir, safeName);
    await fs.writeFile(filePath, buffer);
    await writeTrackMetadata(dir, safeName, {
      title: title || safeName,
      workStates: normalizeWorkStates(workStates),
      createdAt: Date.now(),
    });

    await cleanupOldFiles(dir);

    return NextResponse.json({
      id: safeName.replace('.mp3', ''),
      fileName: safeName,
      title: title || safeName,
      source: 'generated',
      size: buffer.length,
      workStates: normalizeWorkStates(workStates),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
