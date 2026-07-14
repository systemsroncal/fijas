/**
 * Export PNG robusto: incrusta escudos como data URL (mantiene crestas en UI).
 */

import { apiUrl } from '@/lib/paths';
import { isAllowedMediaHost } from '@/lib/media-proxy';

const TRANSPARENT_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
    // Absolute same-origin for fetch
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
      return apiUrl(`/api/media/proxy?url=${encodeURIComponent(abs.href)}`);
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
  if (src.startsWith('data:')) return src;
  const url = toFetchUrl(src);
  const res = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size === 0) throw new Error('empty image');
  return blobToDataUrl(blob);
}

type ImgBackup = {
  el: HTMLImageElement | SVGImageElement;
  attr: 'src' | 'href' | 'xlink';
  value: string | null;
  srcset?: string | null;
};

/**
 * Reemplaza temporalmente <img> y <image> por data URLs same-origin.
 */
export async function inlineImagesForExport(root: HTMLElement): Promise<() => void> {
  const htmlImgs = Array.from(root.querySelectorAll('img'));
  const svgImgs = Array.from(root.querySelectorAll('image'));
  const backups: ImgBackup[] = [];

  await Promise.all([
    ...htmlImgs.map(async (img) => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      backups.push({
        el: img,
        attr: 'src',
        value: img.getAttribute('src'),
        srcset: img.getAttribute('srcset'),
      });
      if (!src) return;
      try {
        const dataUrl = await srcToDataUrl(src);
        img.removeAttribute('srcset');
        img.setAttribute('src', dataUrl);
        img.crossOrigin = 'anonymous';
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => undefined);
        }
      } catch {
        img.removeAttribute('srcset');
        img.setAttribute('src', TRANSPARENT_GIF);
      }
    }),
    ...svgImgs.map(async (img) => {
      const href =
        img.getAttribute('href') ||
        img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
        '';
      backups.push({
        el: img,
        attr: img.hasAttribute('href') ? 'href' : 'xlink',
        value: href || null,
      });
      if (!href || href.startsWith('data:')) return;
      try {
        const dataUrl = await srcToDataUrl(href);
        img.setAttribute('href', dataUrl);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
      } catch {
        img.setAttribute('href', TRANSPARENT_GIF);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', TRANSPARENT_GIF);
      }
    }),
  ]);

  return () => {
    for (const b of backups) {
      if (b.el instanceof HTMLImageElement) {
        if (b.value != null) b.el.setAttribute('src', b.value);
        else b.el.removeAttribute('src');
        if (b.srcset != null) b.el.setAttribute('srcset', b.srcset);
        else b.el.removeAttribute('srcset');
      } else {
        if (b.attr === 'xlink') {
          if (b.value != null) {
            b.el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', b.value);
          }
        } else if (b.value != null) {
          b.el.setAttribute('href', b.value);
        }
      }
    }
  };
}

export async function exportNodeToPng(root: HTMLElement): Promise<string> {
  const restore = await inlineImagesForExport(root);
  await waitFrames(3);
  try {
    const { toPng } = await import('html-to-image');
    const opts = {
      cacheBust: false,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: true,
      preferredFontFormat: 'woff2' as const,
      imagePlaceholder: TRANSPARENT_GIF,
      filter: (node: HTMLElement | Node) => {
        if (node instanceof HTMLElement && node.dataset.exportIgnore === '1') return false;
        return true;
      },
    };
    try {
      return await toPng(root, opts);
    } catch (first) {
      // Segundo intento: forzar placeholder en cualquier img residual
      const imgs = root.querySelectorAll('img');
      imgs.forEach((img) => {
        const s = img.getAttribute('src') || '';
        if (!s.startsWith('data:')) img.setAttribute('src', TRANSPARENT_GIF);
      });
      await waitFrames(2);
      try {
        return await toPng(root, opts);
      } catch {
        throw first;
      }
    }
  } finally {
    restore();
  }
}
