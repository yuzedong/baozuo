const shapes = {
  play: '<path fill="currentColor" stroke="none" d="M8 4.8a1 1 0 0 0-1.5.86v12.68a1 1 0 0 0 1.5.86l10.3-6.34a1 1 0 0 0 0-1.72z"/>',
  pause: '<path stroke-width="3" d="M9 5v14m6-14v14"/>',
  prev: '<path d="M5 5v14m14-14L7 12l12 7z"/>',
  next: '<path d="M19 5v14M5 5l12 7-12 7z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  external: '<path d="M7 17 17 7M7 7h10v10"/>',
  music: '<path d="M9 18V5l11-2v13M9 18c0 1.1-1.6 2-3.5 2S2 19.1 2 18s1.6-2 3.5-2 3.5.9 3.5 2Zm11-2c0 1.1-1.6 2-3.5 2s-3.5-.9-3.5-2 1.6-2 3.5-2 3.5.9 3.5 2Z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  lyrics: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M7 12a5 5 0 0 1 5-5m5 5a5 5 0 0 1-5 5"/>'
};

export const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
