import { NextRequest } from 'next/server';
import WebSocket from 'ws';
import * as ed from '@noble/ed25519';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

// 服务端代理：Node.js 连接 OpenClaw WebSocket，转发事件给前端（SSE）
// 优势：可自由设置 Origin 头，并在 Node.js 内完成 Ed25519 设备签名

// ── 设备身份（持久化到 ~/.open-master/device-identity.json）──────────────────
const IDENTITY_DIR  = path.join(homedir(), '.open-master');
const IDENTITY_FILE = path.join(IDENTITY_DIR, 'device-identity.json');

interface DeviceIdentity {
  deviceId: string;
  publicKey: string;   // base64url（32 字节）
  privateKey: string;  // base64url（32 字节）
}

function b64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/'), 'base64'));
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

let cachedIdentity: DeviceIdentity | null = null;

async function loadOrCreateIdentity(): Promise<DeviceIdentity> {
  if (cachedIdentity) return cachedIdentity;
  try {
    if (existsSync(IDENTITY_FILE)) {
      const data = JSON.parse(readFileSync(IDENTITY_FILE, 'utf-8'));
      if (data.version === 1 && data.deviceId && data.publicKey && data.privateKey) {
        cachedIdentity = { deviceId: data.deviceId, publicKey: data.publicKey, privateKey: data.privateKey };
        return cachedIdentity;
      }
    }
  } catch { /* regenerate */ }

  const privBytes = ed.utils.randomSecretKey();
  const pubBytes  = await ed.getPublicKeyAsync(privBytes);
  const deviceId  = sha256Hex(pubBytes);
  const identity: DeviceIdentity = {
    deviceId,
    publicKey:  b64urlEncode(pubBytes),
    privateKey: b64urlEncode(privBytes),
  };

  mkdirSync(IDENTITY_DIR, { recursive: true });
  writeFileSync(IDENTITY_FILE, JSON.stringify({ version: 1, ...identity }, null, 2), 'utf-8');
  cachedIdentity = identity;
  return identity;
}

// ── OpenClaw 协议类型 ────────────────────────────────────────────────────────
interface GatewayMsg {
  type: string;
  event?: string;
  payload?: unknown;
  id?: string;
  ok?: boolean;
  error?: {
    code: string;
    message: string;
    details?: { requestId?: string; code?: string; [k: string]: unknown };
  };
}

interface RequestError extends Error {
  code?: string;
  details?: { requestId?: string; [k: string]: unknown };
}

export const dynamic = 'force-dynamic';

const SCOPES  = ['operator.admin', 'operator.approvals', 'operator.pairing'];
const CLIENT_ID = 'openclaw-control-ui';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const endpoint = searchParams.get('endpoint')?.trim();
  const token    = searchParams.get('token')?.trim()    || '';
  const password = searchParams.get('password')?.trim() || '';

  if (!endpoint) {
    return new Response('missing endpoint', { status: 400 });
  }

  const safeEndpoint: string = endpoint;

  // 把 ws://host:port 转成 http://localhost:port 作为 Origin（匹配 allowedOrigins）
  const url = new URL(endpoint.replace(/^wss?:\/\//, 'http://'));
  const allowedOrigin = `http://localhost:${url.port || '80'}`;

  // 预加载设备身份（首次会生成并持久化）
  const identity = await loadOrCreateIdentity();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sse = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* 客户端已断开 */ }
      };

      let ws: WebSocket;
      let reqId   = 0;
      let closed  = false;
      const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

      function wsRequest(method: string, params: unknown): Promise<unknown> {
        return new Promise((resolve, reject) => {
          const id = String(++reqId);
          pending.set(id, { resolve, reject });
          ws.send(JSON.stringify({ type: 'req', id, method, params }));
          setTimeout(() => {
            if (pending.has(id)) {
              pending.delete(id);
              reject(new Error('timeout'));
            }
          }, 12_000);
        });
      }

      function connect() {
        if (closed) return;
        ws = new WebSocket(safeEndpoint, {
          headers: { 'Origin': allowedOrigin },
        });

        ws.on('message', async (raw) => {
          let msg: GatewayMsg;
          try { msg = JSON.parse(raw.toString()); } catch { return; }

          if (msg.type === 'event') {
            if (msg.event === 'connect.challenge') {
              const payload = msg.payload as { nonce: string; ts: number };
              const nonce       = payload.nonce;
              const signedAtMs  = Date.now();

              // Ed25519 签名：v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
              const msgStr = [
                'v2', identity.deviceId, CLIENT_ID, 'webchat', 'operator',
                SCOPES.join(','), String(signedAtMs), token || '', nonce,
              ].join('|');
              const privBytes = b64urlDecode(identity.privateKey);
              const sigBytes  = await ed.signAsync(Buffer.from(msgStr), privBytes);

              const connectParams = {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: CLIENT_ID,
                  version: 'dev',
                  platform: 'desktop',
                  mode: 'webchat',
                  instanceId: 'open-master',
                },
                role: 'operator',
                scopes: SCOPES,
                caps: [],
                device: {
                  id:        identity.deviceId,
                  publicKey: identity.publicKey,
                  signature: b64urlEncode(sigBytes),
                  signedAt:  signedAtMs,
                  nonce,
                },
                ...(token || password ? { auth: { token: token || '', password: password || '' } } : {}),
                userAgent: 'Open Master',
                locale:    'zh-CN',
              };

              try {
                await wsRequest('connect', connectParams);
                sse({ type: 'connected' });
                pollSessions();
              } catch (e) {
                const err = e as RequestError;
                if (err.code === 'NOT_PAIRED') {
                  // 设备未配对：通知前端显示 requestId，5 秒后自动重试
                  sse({ type: 'pairing_required', requestId: err.details?.requestId });
                  ws.close();
                } else {
                  sse({ type: 'error', message: err.message });
                  ws.close();
                }
              }
              return;
            }

            // 其他事件转发前端
            if (msg.event && msg.payload !== undefined) {
              sse({ type: msg.event, payload: msg.payload, timestamp: Date.now() });
            }
            return;
          }

          if (msg.type === 'res') {
            const p = pending.get(msg.id ?? '');
            if (p) {
              pending.delete(msg.id ?? '');
              if (msg.ok) {
                p.resolve(msg.payload);
              } else {
                const err = new Error(msg.error?.message ?? 'request failed') as RequestError;
                err.code    = msg.error?.code;
                err.details = msg.error?.details;
                p.reject(err);
              }
            }
          }
        });

        ws.on('close', () => {
          sse({ type: 'disconnected' });
          if (!closed) setTimeout(connect, 5_000);
        });

        ws.on('error', () => {
          sse({ type: 'disconnected' });
        });
      }

      async function pollSessions() {
        if (closed || ws?.readyState !== WebSocket.OPEN) return;
        try {
          const result = await wsRequest('sessions.list', {}) as { count?: number; sessions?: Array<{ running?: boolean; status?: string; lastActivityMs?: number; messageCount?: number }> } | null;

          if (result) {
            sse({ type: 'sessions.update', payload: result, timestamp: Date.now() });
          }
        } catch { /* 忽略 */ }
      }

      // 每 8 秒轮询 sessions
      const pollInterval = setInterval(() => {
        if (!closed && ws?.readyState === WebSocket.OPEN) {
          pollSessions();
        }
      }, 8_000);

      connect();

      // 客户端断开时清理
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(pollInterval);
        ws?.close();
        try { controller.close(); } catch { /* ignore */ }
      });

      // 心跳，防止 SSE 超时
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
