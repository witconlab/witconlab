// Photo downscale before upload. Output is JPEG 0.85, longest side <= 1800px.
export function fitWithin(w, h, max = 1800) {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

const UNREADABLE = '이 사진 형식은 열 수 없어요';

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
