/**
 * Demo capture mode: lets the web preview (where the camera is blocked) try the
 * photo, liveness and skill-video flows with placeholder media. Enabled in
 * development and when built with EXPO_PUBLIC_DEMO=1. Never in store builds.
 */
export const DEMO_CAPTURE = __DEV__ || process.env.EXPO_PUBLIC_DEMO === '1';

const PALETTE = ['#0EA5E9', '#0B3D91', '#0284C7', '#15803D', '#B45309'];

/** Inline SVG placeholder photo (no network needed). */
export function demoPhoto(label: string): string {
  const color = PALETTE[label.length % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="${color}"/><circle cx="300" cy="330" r="110" fill="none" stroke="white" stroke-width="18"/><rect x="170" y="230" width="260" height="200" rx="30" fill="none" stroke="white" stroke-width="18"/><text x="300" y="560" font-family="sans-serif" font-size="40" fill="white" text-anchor="middle">Demo photo</text><text x="300" y="620" font-family="sans-serif" font-size="30" fill="white" text-anchor="middle">${label.replace(/[^a-z_ ]/gi, '')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
