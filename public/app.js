import { icon } from './icons.js';

const audio = document.getElementById('site-audio');
const status = document.querySelector('.status');
const menuButton = document.querySelector('.header-menu');
const navigationFeedback = document.querySelector('.navigation-feedback');
const navigationMessage = navigationFeedback?.querySelector('span');
const navigationError = '页面暂时打不开，请再点一次重试。';
const lyricCache = new Map();
let catalogRequest;
let current;
let queue = [];
let queueId = '';
let navigation;
let stopFeedLoading;
let noticeTimer;
let pendingSeek = null;
let playAttempt = 0;
let wantsPlayback = false;

function catalog() {
  catalogRequest ??= fetch('/catalog.json').then(response => {
    if (!response.ok) throw new Error('目录不可用');
    return response.json();
  }).then(({ tracks, albums }) => ({
    tracks: new Map(tracks.map(track => [track.id, track])),
    albums: new Map(albums.map(album => [album.id, album]))
  })).catch(error => {
    catalogRequest = undefined;
    throw error;
  });
  return catalogRequest;
}

function notify(message) {
  clearTimeout(noticeTimer);
  status.hidden = false;
  status.textContent = message;
  noticeTimer = setTimeout(() => {
    status.hidden = true;
    status.textContent = '';
  }, 6000);
}

function setButton(button, playing, label) {
  const glyph = playing ? 'pause' : 'play';
  const name = playing ? '暂停' : label;
  if (button.dataset.glyph === glyph && button.dataset.renderedLabel === name) return;
  button.dataset.glyph = glyph;
  button.dataset.renderedLabel = name;
  const span = button.querySelector('[data-play-label]');
  button.querySelector('svg').outerHTML = icon(glyph);
  if (span) span.textContent = name;
  button.setAttribute('aria-label', [name, button.dataset.playTitle].filter(Boolean).join(' '));
}

function refreshControls() {
  const playing = Boolean(current && wantsPlayback && !audio.ended);
  for (const button of document.querySelectorAll('[data-play]')) {
    setButton(button, playing && matchesPlayback(button), button.dataset.label);
  }
  for (const row of document.querySelectorAll('[data-album-track]')) {
    const selected = row.dataset.albumTrack === current?.id && row.dataset.albumId === queueId;
    if (selected) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
    const timeline = row.querySelector('.album-track-timeline');
    if (timeline) {
      timeline.hidden = !selected;
      if (selected) syncTimeline(timeline);
    }
  }
  if (current) navigator.mediaSession && (navigator.mediaSession.playbackState = playing ? 'playing' : 'paused');
}

function matchesPlayback(button) {
  const albumId = button.dataset.queue;
  if (albumId && albumId !== queueId) return false;
  return button.hasAttribute('data-album-play') || button.dataset.play === current?.id;
}

function pause() {
  playAttempt += 1;
  wantsPlayback = false;
  audio.pause();
  refreshControls();
}

async function resume() {
  if (!current) return;
  for (const video of document.querySelectorAll('video')) video.pause();
  const attempt = ++playAttempt;
  wantsPlayback = true;
  if (audio.error) audio.load();
  refreshControls();
  try {
    await audio.play();
  } catch (error) {
    if (attempt !== playAttempt) return;
    pause();
    if (error.name !== 'AbortError' && !audio.error) {
      notify(error.name === 'NotAllowedError' ? '请再次点按播放。' : '音频暂时无法播放，请稍后重试。');
    }
  }
}

function choose(track, items, albumId, time = null) {
  if (!track?.audio) return;
  queue = items;
  queueId = albumId;
  if (current?.id !== track.id) {
    current = track;
    pendingSeek = time;
    audio.src = track.audio;
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: '宝座乐团',
        artwork: [{ src: new URL(track.cover, location.href).href }]
      });
    }
  } else if (time !== null) {
    seek(time);
  }
  syncTime();
  void resume();
}

function seek(time) {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Math.max(0, Math.min(time, audio.duration));
    pendingSeek = null;
    syncTime();
  } else {
    pendingSeek = time;
  }
}

function step(direction) {
  const next = queue[queue.indexOf(current) + direction];
  if (next) choose(next, queue, queueId);
}

function timeLabel(seconds) {
  const total = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function syncTimeline(timeline) {
  const trackId = timeline.dataset.track;
  const selected = current && (!trackId || trackId === current.id);
  const ready = selected && Number.isFinite(audio.duration) && audio.duration > 0;
  const elapsed = ready ? audio.currentTime : 0;
  const progress = timeline.querySelector('input');
  const label = timeLabel(elapsed);
  progress.disabled = !ready;
  progress.max = ready ? audio.duration : 0;
  progress.value = elapsed;
  progress.style.setProperty('--fill', ready ? (100 * elapsed / audio.duration) + '%' : '0%');
  timeline.querySelector('[data-time="elapsed"]').textContent = label;
  timeline.querySelector('[data-time="total"]').textContent = ready
    ? timeLabel(audio.duration)
    : (selected ? current.duration : timeline.dataset.duration) || '0:00';
  progress.setAttribute('aria-valuetext', label);
}

function syncTime() {
  for (const timeline of document.querySelectorAll('.timeline:not([hidden])')) syncTimeline(timeline);
  for (const box of document.querySelectorAll('[data-lyrics][data-loaded]')) {
    if (box.hidden) continue;
    let active;
    if (box.dataset.loaded === current?.id) {
      for (const line of box.querySelectorAll('[data-timecode]')) {
        if (Number(line.dataset.timecode) > audio.currentTime) break;
        active = line;
      }
    }
    const previous = box.querySelector('[aria-current="true"]');
    if (active === previous || (!active && !previous)) continue;
    previous?.removeAttribute('aria-current');
    if (active) {
      active.setAttribute('aria-current', 'true');
      const line = active.getBoundingClientRect();
      const area = box.getBoundingClientRect();
      if (line.bottom > area.bottom || line.top < area.top) {
        box.scrollTop += line.top - area.top - (area.height - line.height) / 2;
      }
    }
  }
}

function lyricSource(track) {
  if (track.lyrics) return Promise.resolve(track.lyrics);
  if (!track.lrc) return Promise.resolve('');
  if (!lyricCache.has(track.id)) {
    lyricCache.set(track.id, fetch(track.lrc).then(response => {
      if (!response.ok) throw new Error('歌词不可用');
      return response.text();
    }).catch(error => {
      lyricCache.delete(track.id);
      throw error;
    }));
  }
  return lyricCache.get(track.id);
}

function parseLyrics(text) {
  const offset = Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  const timed = [];
  const plain = [];
  for (const row of text.split(/\r?\n/)) {
    const tags = [...row.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const words = row.replace(/\[[^\]]+\]/g, '').trim();
    if (!words) continue;
    if (!tags.length) plain.push({ words });
    for (const [, minutes, seconds, fraction = '0'] of tags) {
      timed.push({ time: Math.max(0, 60 * Number(minutes) + Number(seconds) + Number('0.' + fraction) + offset), words });
    }
  }
  timed.sort((a, b) => a.time - b.time);
  return timed.length ? timed : plain;
}

async function showLyrics(box, track) {
  box.dataset.requested = track.id;
  delete box.dataset.loaded;
  box.textContent = '正在加载歌词…';
  try {
    const lines = parseLyrics(await lyricSource(track));
    if (box.dataset.requested !== track.id) return;
    box.replaceChildren(...lines.map(({ time, words }) => {
      const line = document.createElement(time !== undefined && track.audio ? 'button' : 'p');
      line.className = 'lyric-line';
      line.textContent = words;
      if (time !== undefined) line.dataset.timecode = time;
      if (line.tagName === 'BUTTON') {
        line.type = 'button';
        line.dataset.seekTrack = track.id;
        line.setAttribute('aria-label', timeLabel(time) + ' ' + words);
      }
      return line;
    }));
    if (!lines.length) box.textContent = '歌词待整理。';
    box.dataset.loaded = track.id;
    syncTime();
  } catch {
    if (box.dataset.requested === track.id) box.textContent = '歌词暂时无法加载，重新打开页面后可再试。';
  }
}

async function loadPageLyrics(box) {
  try {
    const { tracks } = await catalog();
    if (box.isConnected) await showLyrics(box, tracks.get(box.dataset.lyrics));
  } catch {
    box.textContent = '歌词暂时无法加载。';
  }
}

function toggleAlbumLyrics(button) {
  const open = button.closest('.album-playlist').querySelector('[data-album-lyrics][aria-expanded="true"]');
  if (open) {
    document.getElementById(open.getAttribute('aria-controls')).hidden = true;
    open.setAttribute('aria-expanded', 'false');
  }
  if (open === button) return;
  const box = document.getElementById(button.getAttribute('aria-controls'));
  box.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  if (box.dataset.loaded) syncTime();
  else void loadPageLyrics(box);
}

function initHomeSearch(form) {
  const input = form.elements.q;
  const panel = form.querySelector('[data-search-panel]');
  const status = form.querySelector('[data-search-status]');
  const normalize = value => value.normalize('NFKC').toLowerCase();
  const entries = Array.from(panel.querySelectorAll('[data-search-text]'), entry => ({
    entry, text: normalize(entry.dataset.searchText)
  }));
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';

  function updateResults() {
    const words = normalize(input.value).trim().split(/\s+/).filter(Boolean);
    const searching = words.length > 0;
    let count = 0;
    for (const { entry, text } of entries) {
      const visible = searching && words.every(word => text.includes(word));
      entry.hidden = !visible;
      if (visible) count++;
    }
    panel.hidden = !searching;
    status.textContent = searching
      ? count ? `找到 ${count} 项作品` : '没有找到匹配的歌曲或专辑，试试其他关键词。'
      : '';
  }

  function saveSearch() {
    const url = new URL(location.href);
    const query = input.value.trim();
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    url.searchParams.delete('type');
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }

  input.addEventListener('input', event => { if (!event.isComposing) updateResults(); });
  input.addEventListener('compositionend', updateResults);
  input.addEventListener('change', saveSearch);
  input.addEventListener('focus', updateResults);
  form.addEventListener('focusout', event => {
    if (event.relatedTarget && !form.contains(event.relatedTarget)) panel.hidden = true;
  });
  form.addEventListener('keydown', event => {
    if (event.isComposing || panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      input.focus();
      panel.hidden = true;
    } else if (event.key === 'ArrowDown' && event.target === input) {
      const firstResult = panel.querySelector('li:not([hidden]) a');
      if (firstResult) {
        event.preventDefault();
        firstResult.focus();
      }
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    updateResults();
    saveSearch();
  });
  updateResults();
  form.hidden = false;
}

async function initFeed(main, restoredBatches) {
  const more = main.querySelector('[data-feed-more]');
  if (!more) return;
  const feed = main.querySelector('.feed');
  const message = main.querySelector('[data-feed-status]');
  const moreLabel = more.textContent;
  const controller = new AbortController();
  let loading = false;
  let loadedBatches = 0;
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) void loadMore();
  }, { rootMargin: '0px 0px 160px' }) : null;
  stopFeedLoading = () => {
    observer?.disconnect();
    controller.abort();
  };

  async function appendBatch() {
    if (loading || more.hidden || controller.signal.aborted) return false;
    loading = true;
    observer?.unobserve(more);
    message.textContent = '';
    more.setAttribute('aria-disabled', 'true');
    more.textContent = '正在加载作品…';
    try {
      const response = await fetch(more.href, { signal: controller.signal });
      if (!response.ok) throw new Error('无法加载作品');
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (controller.signal.aborted) return false;
      const entries = next.querySelectorAll('.feed > .feed-entry');
      if (!entries.length) throw new Error('未找到更多作品');
      const nextLink = next.querySelector('[data-feed-more]');
      feed.append(...entries);
      main.dataset.feedBatches = String(++loadedBatches);
      if (document.activeElement === more) entries[0].querySelector('.entry-link').focus();
      if (nextLink) more.href = nextLink.getAttribute('href');
      else more.hidden = true;
      message.textContent = nextLink ? '' : '已显示全部作品。';
      refreshControls();
      return true;
    } catch {
      if (!controller.signal.aborted) message.textContent = '加载失败，请点击下方按钮重试。';
      return false;
    } finally {
      loading = false;
      more.textContent = moreLabel;
      more.removeAttribute('aria-disabled');
    }
  }

  async function loadMore() {
    if (await appendBatch() && !more.hidden && !controller.signal.aborted) observer?.observe(more);
  }

  more.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void loadMore();
  });
  for (let batch = 0; batch < restoredBatches && !more.hidden; batch++) {
    if (!await appendBatch()) return;
  }
  if (!more.hidden && !controller.signal.aborted) observer?.observe(more);
}

function initPage(restoredBatches = 0) {
  const main = document.querySelector('main');
  const savePoster = main.querySelector('[data-save-poster]');
  if (savePoster) savePoster.hidden = false;
  const search = main.querySelector('[data-home-search]');
  if (search) initHomeSearch(search);
  const box = document.querySelector('main [data-lyrics]:not(.album-lyrics)');
  if (box) void loadPageLyrics(box);
  for (const video of document.querySelectorAll('main video')) {
    video.addEventListener('play', () => {
      pause();
      for (const other of document.querySelectorAll('video')) if (other !== video) other.pause();
    });
    video.addEventListener('error', () => { video.nextElementSibling.hidden = false; });
    video.addEventListener('loadeddata', () => { video.nextElementSibling.hidden = true; });
  }
  refreshControls();
  syncTime();
  return initFeed(main, restoredBatches);
}

async function navigate(url, { push = true, scrollY = 0, link } = {}) {
  if (push && navigation?.href === url.href) return;
  navigation?.controller.abort();
  navigation?.link?.removeAttribute('data-opening');
  const controller = new AbortController();
  const active = { controller, href: url.href, link };
  navigation = active;
  if (status.textContent === navigationError) {
    status.hidden = true;
    status.textContent = '';
  }
  link?.setAttribute('data-opening', '');
  navigationFeedback?.setAttribute('data-loading', '');
  const showMessage = setTimeout(() => {
    if (navigation === active && navigationMessage) navigationMessage.textContent = '正在打开页面…';
  }, 350);
  const deadline = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.pathname + url.search, { signal: controller.signal });
    if (response.status >= 500) throw new Error('页面暂时不可用');
    const next = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (navigation !== active) return;
    clearTimeout(deadline);
    const main = next.querySelector('main');
    const nav = next.querySelector('.site-header nav');
    const footerNav = next.querySelector('.footer-links');
    if (!response.ok || !main || !nav || !footerNav) {
      if (push) location.assign(url);
      else location.reload();
      return;
    }
    const previousMain = document.querySelector('main');
    if (push) {
      history.replaceState({
        ...history.state, scrollY: window.scrollY, feedBatches: Number(previousMain.dataset.feedBatches || 0)
      }, '');
      history.pushState(null, '', url);
    }
    stopFeedLoading?.();
    stopFeedLoading = undefined;
    for (const video of document.querySelectorAll('main video')) video.pause();
    previousMain.replaceWith(main);
    document.querySelector('.site-header nav').replaceWith(nav);
    document.querySelector('.footer-links').replaceWith(footerNav);
    const controls = main.querySelectorAll(queueId ? '[data-album-play]' : '[data-play]');
    if (wantsPlayback && !Array.from(controls).some(matchesPlayback)) pause();
    menuButton.setAttribute('aria-expanded', 'false');
    document.title = next.title;
    await initPage(push ? 0 : history.state?.feedBatches);
    if (navigation !== active) return;
    main.focus({ preventScroll: true });
    const anchor = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
    if (anchor) anchor.scrollIntoView();
    else window.scrollTo(0, scrollY);
    if (push) main.classList.add('navigation-enter');
  } catch {
    if (navigation === active) {
      if (!push || location.href === url.href) location.reload();
      else notify(navigationError);
    }
  } finally {
    clearTimeout(showMessage);
    clearTimeout(deadline);
    if (navigation === active) {
      navigation = undefined;
      link?.removeAttribute('data-opening');
      navigationFeedback?.removeAttribute('data-loading');
      if (navigationMessage) navigationMessage.textContent = '';
    }
  }
}

function queueFor(track, album, tracks) {
  return album ? album.tracks.map(id => tracks.get(id)).filter(item => item.audio) : [track];
}

async function downloadPoster(button) {
  button.disabled = true;
  try {
    const image = button.closest('.share-section').querySelector('.share-poster-image');
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('海报转换失败');
    const url = URL.createObjectURL(png);
    const download = document.createElement('a');
    download.href = url;
    download.download = button.dataset.savePoster;
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch {
    notify('保存海报失败，请尝试查看原图。');
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', async event => {
  const searchPanel = document.querySelector('[data-search-panel]:not([hidden])');
  if (searchPanel && !searchPanel.closest('form').contains(event.target)) searchPanel.hidden = true;

  const menuOpen = menuButton.getAttribute('aria-expanded') === 'true';
  if (menuButton.contains(event.target)) {
    menuButton.setAttribute('aria-expanded', String(!menuOpen));
    return;
  }
  if (menuOpen && (!event.target.closest('.site-header') || event.target.closest('#main-nav a'))) {
    menuButton.setAttribute('aria-expanded', 'false');
  }

  const savePoster = event.target.closest('[data-save-poster]');
  if (savePoster) {
    void downloadPoster(savePoster);
    return;
  }
  const lyricsToggle = event.target.closest('[data-album-lyrics]');
  if (lyricsToggle) {
    toggleAlbumLyrics(lyricsToggle);
    return;
  }
  const button = event.target.closest('[data-play], [data-seek-track]');
  if (button) {
    try {
      const { tracks, albums } = await catalog();
      const track = tracks.get(button.dataset.play || button.dataset.seekTrack);
      if (!track?.audio) return;
      if (button.dataset.seekTrack) {
        const sameTrack = current?.id === track.id;
        const albumId = button.closest('[data-lyrics]').dataset.queue ?? (sameTrack ? queueId : track.albums[0] || '');
        const items = sameTrack && albumId === queueId ? queue : queueFor(track, albums.get(albumId), tracks);
        choose(track, items, albumId, Number(button.dataset.timecode));
      } else if (matchesPlayback(button) && wantsPlayback) {
        pause();
      } else if (button.hasAttribute('data-album-play') && matchesPlayback(button) && !audio.ended) {
        void resume();
      } else {
        const albumId = button.dataset.queue;
        choose(track, queueFor(track, albums.get(albumId), tracks), albumId);
      }
    } catch {
      notify('音乐目录暂时无法加载，请稍后重试。');
    }
    return;
  }
  const anchor = event.target.closest('a[href]');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
    event.shiftKey || event.altKey || anchor.target || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
  event.preventDefault();
  if (url.href === location.href) {
    window.scrollTo(0, 0);
  } else {
    void navigate(url, { link: anchor });
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.defaultPrevented
    && menuButton.getAttribute('aria-expanded') === 'true' && menuButton.getClientRects().length) {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.focus();
  }
});
history.scrollRestoration = 'manual';
window.addEventListener('popstate', event => {
  void navigate(new URL(location.href), { push: false, scrollY: event.state?.scrollY });
});
document.addEventListener('input', event => {
  const progress = event.target;
  if (progress.matches('.timeline input') && !progress.disabled) seek(Number(progress.value));
});
audio.addEventListener('loadedmetadata', () => {
  if (pendingSeek !== null) seek(pendingSeek);
  syncTime();
});
audio.addEventListener('timeupdate', syncTime);
audio.addEventListener('durationchange', syncTime);
audio.addEventListener('pause', () => {
  if (audio.paused && !audio.ended && audio.readyState > 0) {
    wantsPlayback = false;
    refreshControls();
  }
});
audio.addEventListener('ended', () => {
  if (queue.indexOf(current) < queue.length - 1) step(1);
  else pause();
});
audio.addEventListener('error', () => {
  pause();
  notify('音频暂时无法播放，请稍后重试。');
});
if ('mediaSession' in navigator) {
  for (const [name, handler] of Object.entries({
    play: resume, pause, previoustrack: () => step(-1), nexttrack: () => step(1),
    seekto: event => { if (Number.isFinite(event.seekTime)) seek(event.seekTime); }
  })) {
    try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* 浏览器支持的操作可能不同。 */ }
  }
}

void catalog().catch(() => {});
document.documentElement.classList.add('menu-ready');
void initPage();
