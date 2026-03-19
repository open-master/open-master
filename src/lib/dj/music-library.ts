import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { MusicSource, MusicTrack, WorkState } from './types';

const AUDIO_EXTS = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac'];
const DEFAULT_WORK_STATES: WorkState[] = ['working', 'task_complete', 'idle'];

export interface StoredTrackMeta {
  title?: string;
  workStates?: WorkState[];
  createdAt?: number;
  originalFileName?: string;
}

export function getMusicDir(sub: MusicSource): string {
  const appData =
    process.env.OPEN_MASTER_DATA_DIR ||
    path.join(os.homedir(), 'Library', 'Application Support', 'open-master');
  return path.join(appData, 'music', sub);
}

export function isAudioFile(fileName: string) {
  return AUDIO_EXTS.includes(path.extname(fileName).toLowerCase());
}

export function normalizeWorkStates(value: unknown): WorkState[] {
  if (!Array.isArray(value)) return [...DEFAULT_WORK_STATES];
  const allowed = new Set<WorkState>(DEFAULT_WORK_STATES);
  const states = value.filter(
    (item): item is WorkState => typeof item === 'string' && allowed.has(item as WorkState)
  );
  return states.length > 0 ? [...new Set(states)] : [...DEFAULT_WORK_STATES];
}

function metadataPath(dir: string, fileName: string) {
  return path.join(dir, `${fileName}.json`);
}

export async function readTrackMetadata(dir: string, fileName: string): Promise<StoredTrackMeta> {
  try {
    const raw = await fs.readFile(metadataPath(dir, fileName), 'utf8');
    return JSON.parse(raw) as StoredTrackMeta;
  } catch {
    return {};
  }
}

export async function writeTrackMetadata(dir: string, fileName: string, meta: StoredTrackMeta) {
  await fs.writeFile(
    metadataPath(dir, fileName),
    JSON.stringify(
      {
        ...meta,
        workStates: normalizeWorkStates(meta.workStates),
      },
      null,
      2
    ),
    'utf8'
  );
}

export async function listTracksBySource(source: MusicSource): Promise<MusicTrack[]> {
  const dir = getMusicDir(source);
  try {
    const files = await fs.readdir(dir);
    const audioFiles = files.filter(isAudioFile);

    const tracks = await Promise.all(
      audioFiles.map(async (fileName) => {
        const stat = await fs.stat(path.join(dir, fileName));
        const meta = await readTrackMetadata(dir, fileName);
        return {
          id: fileName.replace(path.extname(fileName), ''),
          fileName,
          source,
          title: meta.title || fileName.replace(path.extname(fileName), ''),
          createdAt: meta.createdAt || stat.mtimeMs,
          workStates: normalizeWorkStates(meta.workStates),
        } satisfies MusicTrack;
      })
    );

    return tracks.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}
