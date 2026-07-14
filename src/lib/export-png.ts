/**
 * Export PNG fiable (como antes del live-stats):
 * - Escudos → monograma canvas (data URL), sin fetch HTTP
 * - Charts Apex se excluyen (data-export-ignore) o se quitan del clon
 * - Colores oklch aplanados a rgb
 */

import { teamMonogram } from '@/lib/match-display';

const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W5aUAAAAASUVORK5CYII=';

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function monogramDataUrl(letter: string, size = 72): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return TRANSPARENT_PNG;
  ctx.fillStyle = '#1565c0';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.38)}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((letter || '?').slice(0, 2).toUpperCase(), size / 2, size / 2 + 1);
  return canvas.toDataURL('image/png');
}

function flattenComputedColors(root: HTMLElement) {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of nodes) {
    try {
      const cs = window.getComputedStyle(el);
      if (cs.color) el.style.color = cs.color;
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        el.style.backgroundColor = cs.backgroundColor;
      }
      if (cs.borderColor) el.style.borderColor = cs.borderColor;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        el.style.backgroundImage = 'none';
      }
    } catch {
      /* ignore */
    }
  }
}

function stripBrokenMedia(clone: HTMLElement) {
  // Quitar charts Apex del clon (rompen html-to-image)
  clone
    .querySelectorAll(
      '.apexcharts-canvas, .apexcharts-svg, [data-export-ignore="1"], canvas'
    )
    .forEach((n) => n.remove());

  // Toda <img> → monograma data URL (sin red; igual que el PNG que te funcionaba)
  clone.querySelectorAll('img').forEach((img) => {
    const fromAlt = img.getAttribute('alt')?.trim();
    const fromAvatar = img
      .closest('[class*="MuiAvatar"]')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
    const letter = teamMonogram(fromAlt || fromAvatar || '?');
    const size = Math.max(img.width || 36, img.clientWidth || 36, 36);
    img.removeAttribute('srcset');
    img.removeAttribute('crossorigin');
    img.setAttribute('src', monogramDataUrl(letter, size));
  });

  clone.querySelectorAll('image').forEach((n) => n.remove());
  clone.querySelectorAll('svg').forEach((svg) => {
    // Iconos Tabler pequeños OK; SVGs enormes de charts ya removidos
    if (svg.closest('.apexcharts-canvas')) svg.remove();
  });
}

export async function exportNodeToPng(root: HTMLElement): Promise<string> {
  const width = Math.max(root.scrollWidth, root.offsetWidth, 360);
  const clone = root.cloneNode(true) as HTMLElement;

  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed',
    'left:-16000px',
    'top:0',
    `width:${width}px`,
    'background:#ffffff',
    'z-index:-1',
    'pointer-events:none',
  ].join(';');
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    stripBrokenMedia(clone);
    flattenComputedColors(clone);
    await wait(60);

    const { toPng, toCanvas } = await import('html-to-image');
    const opts = {
      cacheBust: false,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: true,
      imagePlaceholder: TRANSPARENT_PNG,
      filter: (node: Node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.dataset.exportIgnore === '1') return false;
        if (node.classList?.contains('apexcharts-canvas')) return false;
        if (node.tagName === 'SCRIPT' || node.tagName === 'LINK') return false;
        return true;
      },
    };

    try {
      return await toPng(clone, opts);
    } catch {
      const canvas = await toCanvas(clone, opts);
      return canvas.toDataURL('image/png');
    }
  } finally {
    host.remove();
  }
}
