// Photo downscale before upload. Output is JPEG 0.85, longest side <= 1800px.
export function fitWithin(w, h, max = 1800) {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

const UNREADABLE = '이 사진 형식은 열 수 없어요';

// 아이폰 HEIC/HEIF: 사파리 말고는 대부분의 브라우저가 못 읽는다 → 그때만 변환 도구를 불러 JPEG로 바꾼다.
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];
export function isHeic(head, name = '', type = '') {
  if (/image\/hei[cf]/i.test(type) || /\.hei[cf]$/i.test(name)) return true;
  if (!head || head.length < 12) return false;
  const tag = String.fromCharCode(...head.slice(4, 8));
  const brand = String.fromCharCode(...head.slice(8, 12));
  return tag === 'ftyp' && HEIC_BRANDS.includes(brand);
}
const HEIC2ANY_URL = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
let heicLib = null;
function loadHeicLib() {
  heicLib ||= new Promise((res, rej) => {
    if (globalThis.heic2any) return res(globalThis.heic2any);
    const s = document.createElement('script');
    s.src = HEIC2ANY_URL;
    s.onload = () => (globalThis.heic2any ? res(globalThis.heic2any) : rej(new Error('heic2any')));
    s.onerror = () => { heicLib = null; rej(new Error('heic2any')); }; // 다음에 다시 시도할 수 있게
    document.head.appendChild(s);
  });
  return heicLib;
}
async function heicToJpeg(file) {
  const lib = await loadHeicLib();
  const out = await lib({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(out) ? out[0] : out; // 여러 장이 든 HEIC면 첫 장
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

export async function resizeImage(file) {
  try {
    return await resizeDecodable(file);
  } catch (e) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!isHeic(head, file.name, file.type)) throw e;
    let jpeg;
    try { jpeg = await heicToJpeg(file); } catch { throw new Error('아이폰 사진(HEIC)을 바꾸지 못했어요. 인터넷 연결을 확인해 주세요.'); }
    return resizeDecodable(jpeg);
  }
}

async function resizeDecodable(file) {
  let src;
  let sw;
  let sh;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    sw = src.width; sh = src.height;
  } catch {
    try {
      src = await loadImg(file); // <img> applies EXIF orientation itself
      sw = src.naturalWidth; sh = src.naturalHeight;
    } catch {
      throw new Error(UNREADABLE);
    }
  }
  if (!sw || !sh) throw new Error(UNREADABLE);
  const { w, h } = fitWithin(sw, sh);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  canvas.width = canvas.height = 0; // free memory on iOS
  if (!blob) throw new Error(UNREADABLE);
  return blob;
}
