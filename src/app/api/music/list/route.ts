import { NextResponse } from 'next/server';
import { listTracksBySource } from '@/lib/dj/music-library';

export async function GET() {
  const [generated, uploaded] = await Promise.all([
    listTracksBySource('generated'),
    listTracksBySource('uploaded'),
  ]);

  return NextResponse.json({ generated, uploaded });
}
