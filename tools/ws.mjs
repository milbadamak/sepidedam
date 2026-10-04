/**
 * کلاینت WebSocket سبک روی TLS خام (بدون هیچ بستهٔ npm)
 * فقط برای گرفتن صدا از سرویس TTS مایکروسافت.
 */

import tls from "node:tls";
import crypto from "node:crypto";

const OP_CONT = 0x0, OP_TEXT = 0x1, OP_BIN = 0x2;
const OP_CLOSE = 0x8, OP_PING = 0x9, OP_PONG = 0xa;

export function connect(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const secKey = crypto.randomBytes(16).toString("base64");

    const req =
      `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
      `Host: ${u.hostname}\r\n` +
      Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Key: ${secKey}\r\nSec-WebSocket-Version: 13\r\n\r\n`;

    const sock = tls.connect({
      host: u.hostname,
      port: Number(u.port) || 443,
      servername: u.hostname,
      rejectUnauthorized: false
    }, () => { sock.write(req); });
    sock.on("error", e => reject(e));

    const handlers = { message: [], close: [], error: [] };
    let buf = Buffer.alloc(0);
    let upgraded = false;
    let fragOp = 0, fragChunks = [];

    const api = {
      on(ev, fn) { handlers[ev].push(fn); return api; },
      send(str) {
        const payload = Buffer.from(str, "utf8");
        writeFrame(sock, OP_TEXT, payload);
      },
      close() { try { writeFrame(sock, OP_CLOSE, Buffer.alloc(0)); sock.end(); } catch (_) {} },
      raw: sock
    };
    const emit = (ev, ...a) => handlers[ev].forEach(f => { try { f(...a); } catch (_) {} });

    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);

      if (!upgraded) {
        const end = buf.indexOf("\r\n\r\n");
        if (end === -1) return;
        const head = buf.subarray(0, end).toString("utf8");
        if (!/^HTTP\/1\.1 101/.test(head)) {
          sock.destroy();
          return reject(new Error(head.split("\r\n")[0] || "handshake failed"));
        }
        buf = buf.subarray(end + 4);
        upgraded = true;
        resolve(api);
      }

      /* ── تجزیهٔ فریم‌ها ── */
      while (buf.length >= 2) {
        const b0 = buf[0], b1 = buf[1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let off = 2;

        if (len === 126) { if (buf.length < off + 2) return; len = buf.readUInt16BE(off); off += 2; }
        else if (len === 127) { if (buf.length < off + 8) return; len = Number(buf.readBigUInt64BE(off)); off += 8; }

        let mask = null;
        if (masked) { if (buf.length < off + 4) return; mask = buf.subarray(off, off + 4); off += 4; }

        if (buf.length < off + len) return;
        let payload = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);

        if (mask) { const p = Buffer.from(payload); for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3]; payload = p; }

        if (opcode === OP_CLOSE) { emit("close"); sock.end(); return; }
        if (opcode === OP_PING) { writeFrame(sock, OP_PONG, payload); continue; }
        if (opcode === OP_PONG) continue;

        if (opcode === OP_CONT) fragChunks.push(payload);
        else { fragOp = opcode; fragChunks = [payload]; }

        if (fin && fragChunks.length) {
          const full = Buffer.concat(fragChunks);
          fragChunks = [];
          if (fragOp === OP_TEXT) emit("message", full.toString("utf8"), false);
          else emit("message", full, true);
        }
      }
    });

    sock.on("error", e => { if (!upgraded) reject(e); else emit("error", e); });
    sock.on("close", () => emit("close"));
    setTimeout(() => reject(new Error("connect timeout")), 20000);
  });
}

function writeFrame(sock, opcode, payload) {
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;

  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];

  sock.write(Buffer.concat([header, mask, masked]));
}