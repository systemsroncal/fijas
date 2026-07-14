/**
 * Export PNG a prueba de CORS/oklch:
 * 1) Clon offscreen
 * 2) Escudos dibujados en canvas (sin <img> HTTP)
 * 3) Charts rasterizados
 * 4) Colores computados a rgb()
 */

import { apiUrl } from '@/lib/paths';
import { isAllowedMediaHost } from '@/lib/media-proxy';

const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W5aUAAAAASUVORK5CYII=';

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function toFetchUrl(src: string): string {
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (src.includes('/api/media/proxy')) {
    if (src.startsWith('http')) return src;
    if (typeof window !== 'undefined') return new URL(src, window.location.origin).href;
    return src;
  }
  try {
    const abs = new URL(src, typeof window !== 'undefined' ? window.location.href : 'http://local');
    if (isAllowedMediaHost(abs.href)) {
      const path = apiUrl(`/api/media/proxy?url=${encodeURIComponent(abs.href)}`);
      return typeof window !== 'undefined' ? new URL(path, window.location.origin).href : path;
    }
    if (typeof window !== 'undefined' && abs.origin === window.location.origin) return abs.href;
  } catch {
    /* ignore */
  }
  return src;
}

async function fetchAsDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const res = await fetch(toFetchUrl(src), {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read fail'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img load'));
    img.src = dataUrl;
  });
}

/** Dibuja crest/monograma en canvas → data URL (html-to-image no vuelve a fetchear). */
async function bakeBadgeDataUrl(src: string | null, letter: string, size = 72): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return TRANSPARENT_PNG;

  ctx.fillStyle = '#1565c0';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  if (src) {
    const data = await fetchAsDataUrl(src);
    if (data) {
      try {
        const im = await loadImage(data);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(im, 0, 0, size, size);
        ctx.restore();
        return canvas.toDataURL('image/png');
      } catch {
        /* monograma */
      }
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.38)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((letter || '?').slice(0, 2).toUpperCase(), size / 2, size / 2 + 1);
  return canvas.toDataURL('image/png');
}

async function svgToPngDataUrl(svg: SVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.querySelectorAll('image').forEach((n) => n.remove());
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(rect.width || 320));
  const h = Math.max(1, Math.ceil(rect.height || 240));
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  try {
    const im = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return TRANSPARENT_PNG;
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(im, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } catch {
    return TRANSPARENT_PNG;
  }
}

function flattenComputedColors(root: HTMLElement) {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of nodes) {
    const cs = window.getComputedStyle(el);
    const color = cs.color;
    const bg = cs.backgroundColor;
    const bc = cs.borderColor;
    // Forzar rgb/hex ya resuelto por el motor (evita oklch en el clon serializado)
    if (color) el.style.color = color;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      el.style.backgroundColor = bg;
    }
    if (bc) el.style.borderColor = bc;
    // Quitar fondos con url() externas
    if (cs.backgroundImage && cs.backgroundImage.includes('url(')) {
      el.style.backgroundImage = 'none';
    }
  }
}

export async function exportNodeToPng(root: HTMLElement): Promise<string> {
  const width = Math.max(root.scrollWidth, root.offsetWidth, 360);

  // Raster charts en vivo
  const chartSvgs = Array.from(
    root.querySelectorAll('.apexcharts-svg, .apexcharts-canvas > svg')
  ) as SVGElement[];
  const chartPngs = await Promise.all(chartSvgs.map((s) => svgToPngDataUrl(s)));
  const canvasPngs = Array.from(root.querySelectorAll('canvas')).map((c) => {
    try {
      return c.toDataURL('image/png');
    } catch {
      return TRANSPARENT_PNG;
    }
  });

  // Pre-hornear escudos desde imgs vivos
  const liveImgs = Array.from(root.querySelectorAll('img'));
  const baked = await Promise.all(
    liveImgs.map(async (img) => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      const letter =
        img.getAttribute('alt')?.slice(0, 2) ||
        img.closest('[class*="MuiAvatar"]')?.textContent?.trim().slice(0, 2) ||
        '?';
      if (!src || src.startsWith('data:')) {
        return src || (await bakeBadgeDataUrl(null, letter));
      }
      return bakeBadgeDataUrl(src, letter, Math.max(img.width || 36, 36));
    })
  );

  const clone = root.cloneNode(true) as HTMLElement;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-16000px;top:0;width:${width}px;background:#fff;z-index:-1;`;
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    // Sustituir imgs del clone por data URL ya horneadas (mismo orden)
    Array.from(clone.querySelectorAll('img')).forEach((img, i) => {
      const data = baked[i] || TRANSPARENT_PNG;
      img.removeAttribute('srcset');
      img.removeAttribute('crossorigin');
      img.setAttribute('src', data);
    });

    // Canvases → img
    Array.from(clone.querySelectorAll('canvas')).forEach((c, i) => {
      const img = document.createElement('img');
      img.src = canvasPngs[i] || TRANSPARENT_PNG;
      img.style.display = 'block';
      img.style.maxWidth = '100%';
      c.replaceWith(img);
    });

    // Apex SVG → img
    Array.from(
      clone.querySelectorAll('.apexcharts-svg, .apexcharts-canvas > svg')
    ).forEach((svg, i) => {
      const img = document.createElement('img');
      img.src = chartPngs[i] || TRANSPARENT_PNG;
      img.style.width = '100%';
      img.style.display = 'block';
      svg.replaceWith(img);
    });

    // Cualquier <image> SVG restante
    clone.querySelectorAll('image').forEach((n) => n.remove());

    flattenComputedColors(clone);
    await wait(80);

    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(clone, {
      cacheBust: false,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: true,
      imagePlaceholder: TRANSPARENT_PNG,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.dataset.exportIgnore === '1') return false;
        if (node.tagName === 'SCRIPT' || node.tagName === 'LINK') return false;
        // Bloquear cualquier img que aún no sea data:
        if (node instanceof HTMLImageElement) {
          const s = node.getAttribute('src') || '';
          if (s && !s.startsWith('data:')) {
            node.setAttribute('src', TRANSPARENT_PNG);
          }
        }
        return true;
      },
    });
    return canvas.toDataURL('image/png');
  } finally {
    host.remove();
  }
}
