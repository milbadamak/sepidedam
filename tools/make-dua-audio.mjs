/**
 * ساخت صوت «دعای گشایش»
 *
 *   node tools/make-dua-audio.mjs            →  خودکار: اول Edge/Bing، اگر نشد Google
 *   node tools/make-dua-audio.mjs --google   →  فقط Google (HTTP ساده، همه‌جا کار می‌کند)
 *   node tools/make-dua-audio.mjs --edge     →  فقط Edge/Bing (کیفیت بهتر، نیاز به WebSocket)
 *
 * خروجی: audio/dua-1.mp3 … audio/dua-13.mp3   (خط‌به‌خط، برای هایلایت خط در حال خواندن)
 */
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./ws.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "audio");

/* ── تنظیمات ── */
const VOICE = "ar-IQ-BasselNeural";   // صدای مرد عربی: آرام و مهربان
const RATE = "-18%";                   // آهسته‌تر، برای خواندن با حضور قلب
const PITCH = "+0Hz";
const VOLUME = "+0%";
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM = "143.0.3650.75";
const MAJOR = CHROMIUM.split(".")[0];
const GEC_VERSION = `1-${CHROMIUM}`;

/* ── متن دعا، خط‌به‌خط ── */
const LINES = [
  "اللَّهُمَّ إِنِّي كُنْتُ أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ",
  "فَارْحَمْنِي بِمَا صَنَعْتَ إِلَيَّ",
  "أَعُوذُ بِكَ أَنْ أَكِلَ أَوْ أَكْلَ أَوْ أُضْلَلَ أَوْ أُضَلَّ",
  "أَوْ أَذِلَّ أَوْ أُذِلَّ أَوْ أَظْلِمَ أَوْ أُظْلَمَ",
  "أَوْ أَجْهَلَ أَوْ يُجْهَلَ عَلَيَّ",
  "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْكَفْرِ وَالْفَقْرِ",
  "وَأَعُوذُ بِكَ مِنْ عَذَابِ الْقَبْرِ لَا إِلَٰهَ إِلَّا أَنْتَ",
  "سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ",
  "رَبَّنَا لَا تُؤَاخِذْنَا إِن نَّسِينَا أَوْ أَخْطَأْنَا",
  "رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِن قَبْلِنَا",
  "رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ",
  "وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا",
  "أَنْتَ الْمَوْلَىٰ فَأَنْصُرْنَا وَأَنْتَ النَّصِيرُ"
];

/* موتور TTS با اعراب کامل به‌هم می‌ریزد؛ فقط نشانه‌های اعراب را حذف می‌کنیم نه حروف را */
function stripTashkeel(s) {
  return s
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* ── موتور ۱: Edge/Bing عصبی (بهترین کیفیت) ── */
const WIN_EPOCH = 11644473600;

function secMsGec() {
  let ticks = Date.now() / 1000 + WIN_EPOCH;
  ticks -= ticks % 300;                 // گرد به پایین‌ترین ۵ دقیقه
  ticks *= 1e7;                        // واحد ۱۰۰ نانوثانیه
  return createHash("sha256")
    .update(`${Math.round(ticks)}${TOKEN}`, "ascii")
    .digest("hex")
    .toUpperCase();
}

function rfcDate() {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

async function speakEdge(text) {
  const gec = secMsGec();
  const muid = randomBytes(16).toString("hex").toUpperCase();
  const url =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
    `?TrustedClientToken=${TOKEN}` +
    `&ConnectionId=${randomUUID().replace(/-/g, "")}` +
    `&Sec-MS-GEC=${gec}` +
    `&Sec-MS-GEC-Version=${GEC_VERSION}`;

  const ws = await connect(url, {
    "User-Agent":
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
      `Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
    "Accept-Language": "en-US,en;q=0.9",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    Cookie: `muid=${muid};`
  });

  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 40000);
    let settled = false;

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        if (/Path:turn\.end/.test(data)) {
          clearTimeout(timer);
          settled = true;
          ws.close();
          chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error("پاسخ خالی"));
        }
        return;
      }
      /* فریم باینری: ۲ بایت طول هدر، سپس هدر، سپس داده */
      if (data.length < 2) return;
      const hlen = data.readUInt16BE(0);
      if (2 + hlen > data.length) return;
      const head = data.subarray(2, 2 + hlen).toString("utf8");
      if (!/Path:audio/i.test(head)) return;
      const payload = data.subarray(2 + hlen);
      if (payload.length) chunks.push(payload);
    });

    ws.on("close", () => {
      clearTimeout(timer);
      if (!settled && chunks.length) { settled = true; resolve(Buffer.concat(chunks)); }
      else if (!settled) reject(new Error("اتصال بسته شد"));
    });

    ws.on("error", e => { clearTimeout(timer); reject(e); });

    /* ۱) تنظیمات صدا */
    ws.send(
      `X-Timestamp:${rfcDate()}\r\n` +
      `Content-Type:application/json; charset=utf-8\r\n` +
      `Path:speech.config\r\n\r\n` +
      `{"context":{"synthesis":{"audio":{"metadataoptions":{` +
      `"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},` +
      `"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
    );

    /* ۲) متن */
    ws.send(
      `X-RequestId:${randomUUID()}\r\n` +
      `Content-Type:application/ssml+xml\r\n` +
      `X-Timestamp:${rfcDate()}Z\r\n` +
      `Path:ssml\r\n\r\n` +
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ar-IQ'>` +
      `<voice name='${VOICE}'>` +
      `<prosody pitch='${PITCH}' rate='${RATE}' volume='${VOLUME}'>${esc(text)}</prosody>` +
      `</voice></speak>`
    );
  });
}

/* ── موتور ۲: Google Translate TTS (HTTP ساده، همه‌جا کار می‌کند) ── */
async function speakGoogle(text) {
  const url = "https://translate.google.com/translate_tts" +
    `?ie=UTF-8&client=tw-ob&tl=ar&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) throw new Error("پاسخ خیلی کوتاه");
  return buf;
}

/* ── انتخاب موتور ── */
const arg = process.argv[2];
let engine = arg === "--google" ? "google" : arg === "--edge" ? "edge" : "auto";

async function probe(name) {
  try { const b = await (name === "edge" ? speakEdge : speakGoogle)("بِسْمِ اللَّهِ"); return b.length > 800; }
  catch (_) { return false; }
}

if (engine === "auto") {
  console.log("در حال بررسی موتورها…");
  if (await probe("edge")) { engine = "edge"; console.log("  ✓ Edge/Bing در دسترس است\n"); }
  else if (await probe("google")) { engine = "google"; console.log("  ✗ Edge/Bing در دسترس نیست (فقط HTTP اینترنت محدود است)\n  ✓ Google TTS در دسترس است\n"); }
  else { console.error("  ✗ هیچ موتور TTS در دسترس نیست."); process.exit(1); }
}

const speak = engine === "edge" ? speakEdge : speakGoogle;
console.log(`موتور: ${engine === "edge" ? `Edge/Bing (${VOICE}, ${RATE})` : "Google TTS (tl=ar)"}`);
console.log(`تعداد خطوط: ${LINES.length}\n`);

await mkdir(OUT, { recursive: true });

let total = 0, failed = 0;
for (let i = 0; i < LINES.length; i++) {
  const clean = stripTashkeel(LINES[i]);
  const name = `dua-${i + 1}.mp3`;
  try {
    const mp3 = await speak(clean);
    await writeFile(resolve(OUT, name), mp3);
    total += mp3.length;
    console.log(`  ✓ ${name.padEnd(11)} ${String(Math.round(mp3.length / 1024)).padStart(4)} KB   ${clean.slice(0, 46)}…`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}  ${e.message}`);
  }
  await wait(engine === "google" ? 900 : 400);
}

console.log(`\nمجموع: ${Math.round(total / 1024)} KB`);
if (failed) { console.log(`ناموفق: ${failed} خط`); process.exit(1); }
console.log("همهٔ خطوط ساخته شدند.");