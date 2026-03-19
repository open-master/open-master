import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';
import * as ed from '@noble/ed25519';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

// 通用指令接口：建立临时 WS 连接，发送一条指令，返回结果

const IDENTITY_FILE = path.join(homedir(), '.open-master', 'device-identity.json');
const SCOPES        = ['operator.admin', 'operator.approvals', 'operator.pairing'];
const CLIENT_ID     = 'openclaw-control-ui';

function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/'), 'base64'));
}
function b64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function loadIdentity() {
  if (existsSync(IDENTITY_FILE)) {
    const d = JSON.parse(readFileSync(IDENTITY_FILE, 'utf-8'));
    if (d.version === 1 && d.deviceId && d.publicKey && d.privateKey) return d;
  }
  // 若无密钥文件则实时生成（但不持久化，建议先通过 stream 接口初始化）
  const priv = ed.utils.randomSecretKey();
  const pub  = await ed.getPublicKeyAsync(priv);
  return { deviceId: sha256Hex(pub), publicKey: b64urlEncode(pub), privateKey: b64urlEncode(priv) };
}

interface GatewayMsg {
  type: string; event?: string; id?: string;
  ok?: boolean; payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

async function runCommand(
  endpoint: string, token: string, password: string,
  method: string, params: unknown
): Promise<unknown> {
  return new Promise(async (resolve, reject) => {
    const identity  = await loadIdentity();
    const url       = endpoint.replace(/^wss?:\/\//, 'http://');
    const parsedUrl = new URL(url);
    const origin    = `http://localhost:${parsedUrl.port || '80'}`;
    const signedAtMs = Date.now();

    const ws = new WebSocket(endpoint, { headers: { Origin: origin } });
    let reqId = 0;
    const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

    const request = (m: string, p: unknown) => new Promise<unknown>((res, rej) => {
      const id = String(++reqId);
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ type: 'req', id, method: m, params: p }));
      setTimeout(() => { pending.delete(id); rej(new Error('timeout')); }, 15_000);
    });

    const cleanup = () => { try { ws.terminate(); } catch { /* ignore */ } };
    const timer = setTimeout(() => { cleanup(); reject(new Error('连接超时')); }, 18_000);

    ws.on('message', async (raw) => {
      let msg: GatewayMsg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const payload  = msg.payload as { nonce: string };
        const nonce    = payload.nonce;
        const msgStr   = ['v2', identity.deviceId, CLIENT_ID, 'webchat', 'operator',
          SCOPES.join(','), String(signedAtMs), token || '', nonce].join('|');
        const privBytes = b64urlDecode(identity.privateKey);
        const sigBytes  = await ed.signAsync(Buffer.from(msgStr), privBytes);

        try {
          await request('connect', {
            minProtocol: 3, maxProtocol: 3,
            client: { id: CLIENT_ID, version: 'dev', platform: 'desktop', mode: 'webchat', instanceId: 'open-master' },
            role: 'operator', scopes: SCOPES, caps: [],
            device: { id: identity.deviceId, publicKey: identity.publicKey, signature: b64urlEncode(sigBytes), signedAt: signedAtMs, nonce },
            ...(token || password ? { auth: { token: token || '', password: password || '' } } : {}),
            userAgent: 'Open Master', locale: 'zh-CN',
          });
          // 连接成功，发送目标指令
          const result = await request(method, params);
          clearTimeout(timer);
          cleanup();
          resolve(result);
        } catch (e) {
          clearTimeout(timer);
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
        return;
      }

      if (msg.type === 'res') {
        const p = pending.get(msg.id ?? '');
        if (p) {
          pending.delete(msg.id ?? '');
          if (msg.ok) p.resolve(msg.payload);
          else {
            const err = new Error((msg.error?.message) ?? 'request failed');
            p.reject(err);
          }
        }
      }
    });

    ws.on('error', (e) => { clearTimeout(timer); cleanup(); reject(e); });
    ws.on('close', () => { clearTimeout(timer); });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      endpoint: string; token?: string; password?: string;
      method: string; params?: unknown;
    };

    const { endpoint, token = '', password = '', method, params = {} } = body;
    if (!endpoint || !method) {
      return NextResponse.json({ error: 'endpoint and method required' }, { status: 400 });
    }

    const result = await runCommand(endpoint, token, password, method, params);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
