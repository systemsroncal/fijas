/**
 * Export PNG: clona el nodo fuera de pantalla, incrusta escudos como data URL
 * y rasteriza charts. La UI en vivo no se toca (escudos siguen visibles).
 */

import { apiUrl } from '@/lib/paths';
import { isAllowedMediaHost } from '@/lib/media-proxy';

const TRANSPARENT_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function waitFrames(n = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

function toFetchUrl(src: string): string {
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (src.includes('/api/media/proxy')) {
    if (src.startsWith('http')) return src;
    if (typeof window !== 'undefined') {
      return new URL(src, window.location.origin).href;
    }
    return src;
  }
  try {
    const abs = new URL(
      src,
      typeof window !== 'undefined' ? window.location.href : 'http://local'
    );
    if (isAllowedMediaHost(abs.href)) {
      const path = apiUrl(`/api/media/proxy?url=${encodeURIComponent(abs.href)}`);
      return typeof window !== 'undefined'
        ? new URL(path, window.location.origin).href
        : path;
    }
    if (typeof window !== 'undefined' && abs.origin === window.location.origin) {
      return abs.href;
    }
  } catch {
    /* ignore */
  }
  return src;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function srcToDataUrl(src: string): Promise<string> {
  if (!src || src === TRANSPARENT_GIF) return TRANSPARENT_GIF;
  if (src.startsWith('data:')) return src;
  const url = toFetchUrl(src);
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    mode: 'cors',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size === 0) throw new Error('empty image');
  // Forzar tipo imagen si el proxy mandó octet-stream
  const typed =
    blob.type.startsWith('image/') || blob.type === ''
      ? blob
      : new Blob([blob], { type: 'image/png' });
  return blobToDataUrl(typed);
}

async function safeImgDataUrl(src: string): Promise<string> {
  try {
    return await srcToDataUrl(src);
  } catch {
    return TRANSPARENT_GIF;
  }
}

/** Rasteriza <canvas> del nodo vivo (ApexCharts a veces usa canvas). */
function snapshotCanvases(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('canvas')).map((c) => {
    try {
      return c.toDataURL('image/png');
    } catch {
      return TRANSPARENT_GIF;
    }
  });
}

/** Serializa SVG de charts a data URL PNG vía canvas. */
async function svgElementToPngDataUrl(svg: SVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(rect.width || Number(svg.getAttribute('width')) || 320));
  const h = Math.max(1, Math.ceil(rect.height || Number(svg.getAttribute('height')) || 240));
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  // Quitar imágenes externas del SVG (evitan tainted / error)
  clone.querySelectorAll('image').forEach((img) => {
    const href =
      img.getAttribute('href') ||
      img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      '';
    if (href && !href.startsWith('data:')) {
      img.setAttribute('href', TRANSPARENT_GIF);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', TRANSPARENT_GIF);
    }
  });

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(TRANSPARENT_GIF);
          return;
        }
        ctx.scale(2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(TRANSPARENT_GIF);
      }
    };
    image.onerror = () => resolve(TRANSPARENT_GIF);
    image.src = svgUrl;
  });
}

async function prepareClone(root: HTMLElement): Promise<HTMLElement> {
  const width = Math.max(root.scrollWidth, root.offsetWidth, 320);
  const canvasSnaps = snapshotCanvases(root);

  // Rasterizar SVG de ApexCharts en el nodo vivo (solo lectura → data URLs)
  const chartSvgs = Array.from(
    root.querySelectorAll('.apexcharts-svg, .apexcharts-canvas > svg, svg.apexcharts-svg')
  ) as SVGElement[];
  const chartSnaps = await Promise.all(chartSvgs.map((svg) => svgElementToPngDataUrl(svg)));

  const clone = root.cloneNode(true) as HTMLElement;

  const host = document.createElement('div');
  host.setAttribute('data-export-host', '1');
  host.style.cssText = [
    'position:fixed',
    'left:-14000px',
    'top:0',
    `width:${width}px`,
    'background:#ffffff',
    'z-index:-1',
    'pointer-events:none',
    'opacity:1',
  ].join(';');
  host.appendChild(clone);
  document.body.appendChild(host);

  // Sustituir canvases del clone por <img>
  const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
  cloneCanvases.forEach((c, i) => {
    const dataUrl = canvasSnaps[i] ?? TRANSPARENT_GIF;
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '';
    img.style.width = `${c.width || c.clientWidth || 100}px`;
    img.style.height = `${c.height || c.clientHeight || 100}px`;
    img.style.display = 'block';
    c.replaceWith(img);
  });

  // Sustituir SVG de charts por <img> rasterizado
  const cloneChartSvgs = Array.from(
    clone.querySelectorAll('.apexcharts-svg, .apexcharts-canvas > svg, svg.apexcharts-svg')
  );
  cloneChartSvgs.forEach((svg, i) => {
    const dataUrl = chartSnaps[i] ?? TRANSPARENT_GIF;
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'chart';
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    const parent = svg.parentElement;
    if (parent) parent.replaceChild(img, svg);
    else svg.replaceWith(img);
  });

  // Incrustar escudos / imgs HTTP como data URL (los charts ya son data:)
  await Promise.all(
    Array.from(clone.querySelectorAll('img')).map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;
      img.removeAttribute('srcset');
      img.removeAttribute('crossorigin');
      img.referrerPolicy = 'no-referrer';
      img.setAttribute('src', await safeImgDataUrl(src));
    })
  );

  // SVG <image> residuales
  for (const image of Array.from(clone.querySelectorAll('image'))) {
    const href =
      image.getAttribute('href') ||
      image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      '';
    if (!href || href.startsWith('data:')) continue;
    const dataUrl = await safeImgDataUrl(href);
    image.setAttribute('href', dataUrl);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
  }

  await waitFrames(3);
  await wait(50);
  return host;
}

function stripModernColorFunctions(root: HTMLElement) {
  // html-to-image falla con oklch/lab/color-mix en algunos navegadores
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of all) {
    const style = el.getAttribute('style');
    if (!style) continue;
    if (/oklch|oklab|lab\(|lch\(|color-mix/i.test(style)) {
      el.setAttribute(
        'style',
        style
          .replace(/oklch\([^)]+\)/gi, '#222222')
          .replace(/oklab\([^)]+\)/gi, '#222222')
          .replace(/lab\([^)]+\)/gi, '#222222')
          .replace(/lch\([^)]+\)/gi, '#222222')
          .replace(/color-mix\([^)]+\)/gi, '#666666')
      );
    }
  }
}

export async function exportNodeToPng(root: HTMLElement): Promise<string> {
  const host = await prepareClone(root);
  const clone = host.firstElementChild as HTMLElement;

  // Silenciar errores de img globales durante la captura
  const swallow = (e: Event) => {
    if (e.target instanceof HTMLImageElement) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };
  window.addEventListener('error', swallow, true);

  try {
    stripModernColorFunctions(clone);
    const { toPng, toCanvas } = await import('html-to-image');
    const opts = {
      cacheBust: false,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: true,
      preferredFontFormat: 'woff2' as const,
      imagePlaceholder: TRANSPARENT_GIF,
      includeQueryParams: true,
      filter: (node: HTMLElement | Node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.dataset.exportIgnore === '1') return false;
        if (node.tagName === 'SCRIPT') return false;
        return true;
      },
    };

    try {
      return await toPng(clone, opts);
    } catch {
      // Fallback: canvas → data URL
      const canvas = await toCanvas(clone, opts);
      return canvas.toDataURL('image/png');
    }
  } finally {
    window.removeEventListener('error', swallow, true);
    host.remove();
  }
}
