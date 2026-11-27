// Photo downscale before upload. Output is JPEG 0.85, longest side <= 1800px.
export function fitWithin(w, h, max = 1800) {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

const UNREADABLE = '이 사진 형식은 열 수 없어요';

// HEIC/HEIF(아이폰·삼성 등): 사파리 말고는 대부분의 브라우저가 못 읽는다 → 그때만 해석기를 불러 직접 푼다.
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avci', 'miaf'];
export function isHeic(head, name = '', type = '') {
  if (/image\/hei[cf]/i.test(type) || /\.hei[cf]$/i.test(name)) return true;
  if (!head || head.length < 12) return false;
  const tag = String.fromCharCode(...head.slice(4, 8));
  const brand = String.fromCharCode(...head.slice(8, 12));
  return tag === 'ftyp' && HEIC_BRANDS.includes(brand);
}
// 최신 libheif(삼성 HEIC 등 여러 형식 지원). 처음 HEIC를 만날 때 한 번만 받는다.
const LIBHEIF_URL = 'https://cdn.jsdelivr.net/npm/libheif-js@1.23.5/libheif-wasm/libheif-bundle.js';
let heifLib = null;
function loadLibheif() {
  heifLib ||= new Promise((res, rej) => {
    const ready = () => Promise.resolve(globalThis.libheif()).then(res, rej);
    if (typeof globalThis.libheif === 'function') return ready();
    const s = document.createElement('script');
    s.src = LIBHEIF_URL;
    s.onload = () => (typeof globalThis.libheif === 'function' ? ready() : rej(new Error('libheif')));
    s.onerror = () => rej(new Error('libheif'));
    document.head.appendChild(s);
  }).catch((e) => { heifLib = null; throw e; }); // 실패하면 다음에 다시 받을 수 있게
  return heifLib;
}
// HEIC 첫 장(회전 정보 반영)을 캔버스로 푼다.
async function decodeHeic(file) {
  const lh = await loadLibheif();
  const images = new lh.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  if (!images || !images.length) throw new Error('heic');
  const im = images[0];
  const w = im.get_width(), h = im.get_height();
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(w, h);
  await new Promise((res, rej) => im.display(data, (d) => (d ? res() : rej(new Error('heic')))));
  ctx.putImageData(data, 0, 0);
  images.forEach((x) => x.free && x.free());
  return canvas;
}

function loadImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(UNREADABLE)); };
    img.src = url;
  });
}

async function decode(file) {
  try {
    const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { src: b, w: b.width, h: b.height };
  } catch { /* 아래로 */ }
  try {
    const img = await loadImg(file); // <img> applies EXIF orientation itself
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  } catch { /* 아래로 */ }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isHeic(head, file.name, file.type)) throw new Error(UNREADABLE);
  let c;
  try { c = await decodeHeic(file); } catch { throw new Error('HEIC 사진을 바꾸지 못했어요. 인터넷 연결을 확인하거나 다른 사진을 골라 주세요.'); }
  return { src: c, w: c.width, h: c.height };
}

export async function resizeImage(file) {
  const { src, w: sw, h: sh } = await decode(file);
  if (!sw || !sh) throw new Error(UNREADABLE);
  const { w, h } = fitWithin(sw, sh);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  if (src instanceof HTMLCanvasElement) src.width = src.height = 0; // free memory on phones
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  canvas.width = canvas.height = 0; // free memory on iOS
  if (!blob) throw new Error(UNREADABLE);
  return blob;
}
