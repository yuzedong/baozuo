import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { icon } from '../public/icons.js';
import { posterText, renderSharePoster } from './share-poster.mjs';

const demo = process.argv.includes('--demo');
const out = resolve('dist');
const catalog = JSON.parse(await readFile('content/catalog.json', 'utf8'));
const { site, tracks, albums, posts = [] } = catalog;
const bankTransfers = site.bankTransfers || [];
if (demo) {
  const example = JSON.parse(await readFile('content/demo.json', 'utf8'));
  albums.push(example.album);
  tracks.push(...example.tracks);
}
const lookup = new Map(tracks.map(track => [track.id, track]));
const albumById = new Map(albums.map(album => [album.id, album]));
const band = '宝座乐团';
const copyrightYear = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date());
const singleListPath = '/music/singles/';
const albumListPath = '/music/';
const songPath = id => '/songs/' + id + '/';
const albumPath = id => '/albums/' + id + '/';
const postPath = id => '/posts/' + id + '/';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function asset(value, base = '') {
  if (!value) return '';
  if (/^\/(?!\/)/.test(value) && !/[\\?#]/.test(value)) {
    if (value.split('/').some(part => part === '..' || part === '.')) throw new Error('无效资源路径 ' + value);
    return value;
  }
  const url = new URL(value, base || undefined);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('资源须使用 HTTPS ' + value);
  return url.href;
}

for (const list of [tracks, albums, posts]) {
  const ids = new Set();
  for (const item of list) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id) || !item.title?.trim()) {
      throw new Error('请检查作品 ID 或标题 ' + item.id);
    }
    ids.add(item.id);
    if (item.date && (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isFinite(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0, 10) !== item.date)) {
      throw new Error('发行日期须为有效的 YYYY-MM-DD ' + item.id);
    }
    for (const key of ['cover', 'audio', 'video', 'lrc']) {
      item[key] = asset(item[key], site.mediaBase);
    }
  }
}
for (const post of posts) {
  if (typeof post.body !== 'string' || !post.body.trim()) throw new Error('请填写文章正文 ' + post.id);
  if (post.tracks !== undefined && (!Array.isArray(post.tracks) || post.tracks.some(id => !lookup.has(id)))) {
    throw new Error('请检查文章推荐曲目 ' + post.id);
  }
}
for (const album of albums) {
  if (album.year && !/^\d{4}$/.test(album.year)) throw new Error('请检查专辑发行年份 ' + album.id);
  if (!Array.isArray(album.tracks) || !album.tracks.length || new Set(album.tracks).size !== album.tracks.length ||
    album.tracks.some(id => !lookup.has(id))) throw new Error('请检查专辑曲目 ' + album.id);
}
for (const track of tracks) {
  track.albums = albums.filter(album => album.tracks.includes(track.id)).map(album => album.id);
  track.cover ||= albumById.get(track.albums[0])?.cover || '/assets/spring.jpg';
  for (const image of track.storyImages || []) {
    if (!image.title?.trim() || !image.src) throw new Error('作品资料图片须填写标题与路径 ' + track.id);
    image.src = asset(image.src, site.mediaBase);
  }
}
for (const payment of Object.values(site.donations)) {
  payment.qr = asset(payment.qr, site.mediaBase);
  payment.link = asset(payment.link);
}
if (site.featuredAlbum && !albumById.has(site.featuredAlbum)) throw new Error('首页专辑 ID 不存在');
const publicRoot = resolve('public');
const storyImages = tracks.flatMap(track => track.storyImages || []);
const resources = [...tracks, ...albums, ...posts, ...Object.values(site.donations), ...storyImages];
for (const item of resources) {
  for (const key of ['cover', 'audio', 'video', 'lrc', 'qr', 'src']) {
    const url = item[key];
    if (!url?.startsWith('/') || (demo && url.startsWith('/demo-media/'))) continue;
    const file = resolve(publicRoot, '.' + decodeURIComponent(url));
    if (!file.startsWith(publicRoot + sep) || !(await stat(file)).isFile()) throw new Error('找不到资源 ' + url);
  }
}
const cover = (item, cls = '', eager = false) => `<img class="${cls}" src="${esc(item.cover || '/assets/spring.jpg')}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const link = (href, label, cls = 'button secondary', glyph = 'arrow') => `<a class="${cls}" href="${esc(href)}">${esc(label)} ${icon(glyph)}</a>`;
const outside = (href, label) => `<a class="button secondary" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ${icon('external')}</a>`;
const play = (track, album = '', label = '播放', cls = 'button primary', { wholeAlbum = false, content } = {}) => {
  const title = wholeAlbum ? albumById.get(album).title : track.title;
  const text = content ?? (cls.includes('icon-only') ? '' : `<span data-play-label>${esc(label)}</span>`);
  return `<button type="button" class="${cls}" data-play="${track.id}" data-queue="${album}" data-label="${esc(label)}" data-play-title="${esc(title)}"${wholeAlbum ? ' data-album-play' : ''} aria-label="${esc(label + ' ' + title)}">${icon('play')}${text}</button>`;
};
const textBlock = value => value.split(/\n+/).filter(Boolean).map(line => `<p>${esc(line)}</p>`).join('');
const date = value => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value)) : '';
const albumMeta = album => [album.date?.slice(0, 4) || album.year, '专辑', album.tracks.length + ' 首歌曲'].filter(Boolean).join('　·　');
const avatar = size => `<span class="avatar"><img src="/assets/logo.png" alt="" width="${size}" height="${size}"></span>`;
const dateTag = value => value ? `<time datetime="${value}">${date(value)}</time>` : '';

function timeline(track, { inAlbum = false } = {}) {
  return `<div class="timeline${inAlbum ? ' album-track-timeline' : ''}"${inAlbum ? ' hidden' : ''} data-track="${track.id}" data-duration="${esc(track.duration)}">
    <span data-time="elapsed">0:00</span>
    <input type="range" min="0" max="0" step="0.1" value="0" aria-label="播放进度" disabled>
    <span data-time="total">${esc(track.duration || '0:00')}</span>
  </div>`;
}

function rows(items, album = '') {
  return `<ol class="tracklist">${items.map((track, i) => `<li>
    <span class="track-index">${String(i + 1).padStart(2, '0')}</span>
    <a class="track-link" href="${songPath(track.id)}">${esc(track.title)}</a>
    ${track.duration ? `<span class="duration">${esc(track.duration)}</span>` : ''}
    ${track.audio ? play(track, album, '播放', 'round icon-only') :
      `<a class="round icon-only" aria-label="查看 ${esc(track.title)}" href="${songPath(track.id)}">${icon('arrow')}</a>`}
  </li>`).join('')}</ol>`;
}

const navLinks = [['/', '首页'], [singleListPath, '单曲'], [albumListPath, '专辑'], ['/about/', '关于'], ['/support/', '支持我们']];
const mastheadArt = {
  [singleListPath]: 'singles',
  [albumListPath]: 'albums',
  '/videos/': 'videos',
  '/about/': 'about',
  '/support/': 'support'
};
function layout({
  path, navPath = path, title, description, body, image = '/assets/spring.jpg', error = false,
  heroTitle = title, heroArt = mastheadArt[navPath] || 'home'
}) {
  const canonical = new URL(path, site.domain).href;
  const nav = navLinks.map(([href, label]) => {
    const current = href === path ? 'page' : 'location';
    return `<a href="${href}"${href === navPath ? ` aria-current="${current}"` : ''}>${label}</a>`;
  }).join('');
  const fullTitle = path === '/' ? '宝座乐团｜Throne Worship' : title + '｜宝座乐团';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#ffffff">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}">
  ${error || demo ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(new URL(image, site.domain).href)}">
  <meta property="og:url" content="${esc(canonical)}">
  <link rel="icon" href="/assets/crown.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/style.css">
  <script type="module" src="/app.js"></script>
</head>
<body>
  <a class="skip" href="#main">跳至内容</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="/" aria-label="宝座乐团首页">
        <img class="header-logo" src="/assets/masthead/logo.png" alt="" width="715" height="656">
      </a>
      <button type="button" class="header-menu" aria-label="菜单" aria-expanded="false" aria-controls="main-nav">${icon('menu')}</button>
      <nav id="main-nav" aria-label="主要导航">
        ${nav}
      </nav>
    </div>
  </header>
  <main id="main" tabindex="-1" data-page="${esc(path)}">
    <header class="publication${heroArt === 'detail' ? ' publication-detail' : ''}">
      <div class="wrap publication-copy">
        <h1>${esc(heroTitle)}</h1>
      </div>
      <img class="publication-art" src="/assets/masthead/${heroArt}.jpg" alt="" fetchpriority="high">
    </header>
    ${body}
  </main>
  <footer class="site-footer">
    <div class="wrap footer-inner">
      <div class="footer-main">
        <a class="brand" href="/" aria-label="宝座乐团首页">
          <img class="footer-logo" src="/assets/masthead/logo.png" alt="" width="715" height="656" loading="lazy">
        </a>
        <nav class="footer-links" aria-label="页脚导航">
          <a href="${singleListPath}">单曲</a>
          <a href="${albumListPath}">专辑</a>
          ${demo ? '<a href="/albums/playback-demo/">播放器演示</a>' : ''}
          <a class="footer-support" href="/support/">${icon('heart')}支持创作</a>
        </nav>
      </div>
      <small class="footer-copyright">© ${copyrightYear} ${band} · 保留所有权利</small>
    </div>
  </footer>
  <audio id="site-audio" preload="metadata" hidden></audio>
  <div class="status" role="status" hidden></div>
</body>
</html>`;
}

const singles = tracks.filter(track => !track.albums.length || track.single === true);
const videos = tracks.filter(track => track.video);
const albumEntries = albums.map(item => ({ item, type: 'album', pinned: item.id === site.featuredAlbum }));
const singleEntries = singles.map(item => ({ item, type: 'single' }));
const feed = [
  ...albumEntries,
  ...singleEntries,
  ...videos.map(item => ({ item, type: 'video' })),
  ...posts.map(item => ({ item, type: 'post' }))
].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
  (b.item.date || b.item.year || '').localeCompare(a.item.date || a.item.year || ''));

function entryFact(glyph, markup, optional = false) {
  return `<span class="entry-fact${optional ? ' entry-fact-optional' : ''}">${icon(glyph)}${markup}</span>`;
}

function entryFacts(item, type) {
  const facts = [];
  if (item.date) {
    facts.push(entryFact('calendar', `<time datetime="${item.date}">${item.date.replaceAll('-', '.')}</time>`));
  } else if (type === 'album' && item.year) {
    facts.push(entryFact('calendar', esc(item.year) + '年'));
  }
  const duration = type === 'single' ? item.duration : type === 'video' ? item.videoDuration : '';
  if (duration) facts.push(entryFact('clock', esc(duration)));
  if (type === 'album') facts.push(entryFact('music', item.tracks.length + ' 首'));
  if (type === 'single' && (item.lyrics || item.lrc)) facts.push(entryFact('lyrics', '歌词', facts.length > 1));
  if (type === 'post') {
    const minutes = Math.max(1, Math.ceil(item.body.replace(/\s/g, '').length / 320));
    facts.push(entryFact('clock', `约 ${minutes} 分钟阅读`));
  }
  return `<div class="entry-facts">${facts.join('')}</div>`;
}

function videoId(track) {
  return 'video-' + track.id;
}

const feedKinds = {
  album: {
    label: '专辑', glyph: 'disc', href: item => albumPath(item.id),
    summary: item => item.description || band
  },
  single: {
    label: '单曲', glyph: 'music', href: item => songPath(item.id),
    summary: item => item.description || band
  },
  video: {
    label: '视频', glyph: 'video', href: item => '/videos/#' + videoId(item),
    summary: () => band
  },
  post: {
    label: '图文', glyph: 'lyrics', href: item => postPath(item.id),
    summary: item => item.description || item.body
  }
};

function firstPlayableTrack(album) {
  const trackId = album.tracks.find(id => lookup.get(id).audio);
  return lookup.get(trackId);
}

function albumPlay(album, track, compact = false) {
  const label = '播放专辑';
  const cls = compact ? 'round icon-only entry-action' : 'button';
  if (track) return play(track, album.id, label, compact ? cls : cls + ' primary', { wholeAlbum: true });
  return `<button type="button" class="${cls} album-play-unavailable" disabled
    title="专辑音源待上线" aria-label="${esc(label + ' ' + album.title + '，音源待上线')}">
    ${icon('play')}${compact ? '' : `<span>${label}</span>`}
  </button>`;
}

function feedEntry({ item, type, pinned }, index) {
  const kind = feedKinds[type];
  const album = type === 'album' ? item : null;
  const track = album ? firstPlayableTrack(album) : type === 'single' && item.audio ? item : null;
  const summary = kind.summary(item).split(/\r?\n/)[0].trim();
  const playAction = album ? albumPlay(album, track, true)
    : track ? play(track, '', '播放单曲', 'round icon-only entry-action') : '';
  const actionIcon = type === 'video' ? 'play' : 'arrow';
  return `<article class="feed-entry ${type}-entry${pinned ? ' featured-entry' : ''}${playAction ? ' has-entry-play' : ''}">
    <a class="entry-link" href="${kind.href(item)}">
      <div class="entry-art">
        ${item.cover ? cover(item, 'entry-cover', index === 0) : icon(kind.glyph)}
        <span class="entry-kind">${icon(kind.glyph)}${kind.label}</span>
        ${pinned ? '<span class="pin">置顶</span>' : ''}
      </div>
      <div class="entry-copy">
        <h2>${esc(item.title)}</h2>
        ${entryFacts(item, type)}
        <p class="entry-summary">${album && !track ? '音源待上线 · ' : ''}${esc(summary)}</p>
      </div>
      ${playAction ? '' : `<span class="round entry-action">${icon(actionIcon)}</span>`}
    </a>
    ${playAction}
  </article>`;
}

function authorLine(label, when, extra = '') {
  return `<div class="article-byline">${avatar(28)}<span class="author-name">${band}</span>
    ${dateTag(when)}${extra ? `<span>${esc(extra)}</span>` : ''}<span class="category">${esc(label)}</span>
  </div>`;
}

function articleHeader(item, label, extra = '') {
  return `<header>${authorLine(label, item.date, extra)}</header>
    ${item.cover ? cover(item, 'article-cover', true) : ''}`;
}

const searchEntries = [
  ...feed.filter(entry => entry.type === 'single' || entry.type === 'album'),
  ...tracks.filter(track => track.albums.length && track.single !== true)
    .map(item => ({ item, type: 'single' }))
];

function searchResult({ item, type }) {
  const kind = feedKinds[type];
  const label = type === 'single' && item.albums.length && !item.single ? '专辑曲目' : kind.label;
  const text = [item.title, item.description, item.story, item.lyrics].filter(Boolean).join(' ');
  return `<li data-search-text="${esc(text)}" hidden>
    <a href="${kind.href(item)}">${icon(kind.glyph)}<span>${esc(item.title)}</span><small>${label}</small></a>
  </li>`;
}

const homeSearch = `<form class="home-search" role="search" data-home-search hidden>
      <label for="home-query">搜索作品</label>
      <div class="search-controls">
        <div class="search-field">${icon('search')}
          <input id="home-query" type="search" name="q" placeholder="输入关键词" autocomplete="off" aria-controls="home-search-results">
        </div>
        <button type="submit" class="button primary">搜索</button>
      </div>
      <div id="home-search-results" class="search-panel" data-search-panel hidden>
        <p class="search-status" data-search-status role="status"></p>
        <ul class="search-results" aria-label="搜索结果">${searchEntries.map(searchResult).join('')}</ul>
      </div>
    </form>`;

const entriesPerPage = 8;
const listPagePath = (path, number) => number === 1 ? path : `${path}page/${number}/`;

const pages = [];
const lists = [
  {
    path: '/', label: '首页', feedLabel: '最新发布', entries: feed, empty: '内容整理中。',
    description: '宝座乐团 Throne Worship，创作属于华语信徒的敬拜歌曲。聆听专辑、单曲与音乐影像。',
    heroTitle: '把信仰写成歌', wrapper: 'home', beforeFeed: homeSearch
  },
  { path: albumListPath, label: '专辑', entries: albumEntries, empty: '专辑整理中。' },
  { path: singleListPath, label: '单曲', entries: singleEntries, empty: '独立发行的单曲整理中。你可以先到专辑里逐首浏览。' }
];
for (const {
  path, label, entries, empty, feedLabel = label, heroTitle = label,
  description = `浏览宝座乐团的原创敬拜${label}。`, wrapper = 'section interior', beforeFeed = ''
} of lists) {
  const total = Math.max(1, Math.ceil(entries.length / entriesPerPage));
  for (let number = 1; number <= total; number++) {
    const start = (number - 1) * entriesPerPage;
    const pageEntries = entries.slice(start, start + entriesPerPage);
    pages.push({
      path: listPagePath(path, number), navPath: path,
      title: number === 1 ? label : `${label} · 第 ${number} 页`, description, heroTitle,
      body: `<div class="wrap ${wrapper}">
        ${beforeFeed}
        <section class="feed" aria-label="${feedLabel}">
          ${path === '/' ? '<h2 class="mobile-feed-heading">最新发布</h2>' : ''}
          ${pageEntries.map(feedEntry).join('') || `<p class="empty">${empty}</p>`}
        </section>
        ${number < total ? `<div class="feed-more">
          <p data-feed-status role="status"></p>
          <a class="button secondary" data-feed-more href="${listPagePath(path, number + 1)}">加载更多作品</a>
        </div>` : ''}
      </div>`
    });
  }
}

function albumRows(album, items) {
  return `<ol class="album-tracks">${items.map((track, index) => {
    const lyricsId = 'lyrics-' + track.id;
    const hasLyrics = track.lyrics || track.lrc;
    const content = `<span class="track-index">${String(index + 1).padStart(2, '0')}</span><span>${esc(track.title)}</span>`;
    return `<li class="album-track" data-album-track="${track.id}" data-album-id="${album.id}">
      <div class="album-track-row">
        ${track.audio ? play(track, album.id, '播放', 'album-track-play', { content })
          : `<button type="button" class="album-track-play" disabled title="音源待上线" aria-label="播放 ${esc(track.title)}，音源待上线">${icon('play')}${content}</button>`}
        <div class="album-track-facts">
          ${track.duration ? `<span class="duration">${esc(track.duration)}</span>` : ''}
          ${hasLyrics ? `<button type="button" class="album-lyrics-toggle" data-album-lyrics aria-controls="${lyricsId}" aria-expanded="false" aria-label="歌词 ${esc(track.title)}">${icon('lyrics')}歌词</button>` : ''}
        </div>
      </div>
      ${track.audio ? timeline(track, { inAlbum: true }) : ''}
      ${hasLyrics ? `<div id="${lyricsId}" class="lyric-lines album-lyrics" data-lyrics="${track.id}" data-queue="${album.id}" hidden></div>` : ''}
    </li>`;
  }).join('')}</ol>`;
}

const sharePosters = new Map();
const shareLogo = (await readFile('public/assets/masthead/logo.png')).toString('base64');

function sharePoster(item, kind, path, fallbackDescription) {
  const title = posterText(item.title);
  const description = posterText(item.description?.trim() || item.story?.trim() || fallbackDescription);
  const url = new URL(path, site.domain);
  const src = '/share' + path.slice(0, -1) + '.svg';
  const { svg, width, height } = renderSharePoster({ title, description, kind, url, logo: shareLogo });
  sharePosters.set(src, svg);
  const label = kind === '专辑' ? '分享这张专辑' : '分享这首歌';
  return `<section class="share-section" aria-labelledby="share-title">
    <div class="share-copy">
      <h2 id="share-title">${label}</h2>
      <p>扫描海报上的二维码即可打开作品页。也可以保存海报，发给朋友。</p>
      <div class="share-actions">
        <button type="button" class="button primary" data-save-poster="${esc(title)}.png" hidden>保存海报</button>
        ${outside(src, '查看原图')}
      </div>
    </div>
    <img class="share-poster-image" src="${src}" alt="${esc(title)}分享海报，含打开作品页的二维码"
      width="${width}" height="${height}" loading="lazy" decoding="async">
  </section>`;
}

for (const album of albums) {
  const items = album.tracks.map(id => lookup.get(id));
  const first = firstPlayableTrack(album);
  pages.push({
    path: albumPath(album.id), navPath: albumListPath, title: album.title, description: album.description || albumMeta(album), image: album.cover || undefined,
    heroArt: 'detail',
    body: `<article class="wrap section interior detail">
      ${link(albumListPath, '专辑', 'text-link breadcrumb', 'back')}
      <div class="album-layout">
        <aside class="album-sidebar" aria-label="专辑资料">
          ${album.cover ? cover(album, 'album-cover', true) : ''}
          <dl class="album-data">
            <div><dt>艺人</dt><dd>${band}</dd></div>
            ${album.date || album.year ? `<div><dt>发行</dt><dd>${album.date ? dateTag(album.date) : esc(album.year) + '年'}</dd></div>` : ''}
            ${album.category ? `<div><dt>类别</dt><dd>${esc(album.category)}</dd></div>` : ''}
            <div><dt>曲目</dt><dd>${items.length} 首</dd></div>
          </dl>
        </aside>
        <section class="album-playlist" aria-labelledby="album-tracks-heading">
          <div class="section-title"><h2 id="album-tracks-heading">曲目列表</h2>
            <div class="actions">${albumPlay(album, first)}${first ? '' : '<span class="fine">音源待上线</span>'}</div>
          </div>
          ${albumRows(album, items)}
        </section>
      </div>
      ${album.description ? `<section class="inner-section prose"><h2>专辑介绍</h2>${textBlock(album.description)}</section>` : ''}
      ${album.story?.trim() ? `<section class="inner-section prose"><h2>创作背景</h2>${textBlock(album.story)}</section>` : ''}
      ${donationSection()}
      ${sharePoster(album, '专辑', albumPath(album.id), `宝座乐团原创敬拜专辑，收录 ${items.length} 首歌曲。`)}
    </article>`
  });
}

function video(track) {
  return `<video controls playsinline preload="none" src="${esc(track.video)}" poster="${esc(track.cover)}" aria-label="${esc(track.title)}视频"></video><p class="media-error" role="status" hidden>视频暂时无法播放，请稍后重试。</p>`;
}

function songListening(track, album) {
  const lyrics = `<div class="lyric-lines" data-lyrics="${track.id}" data-queue="${album?.id || ''}">${track.lyrics || track.lrc ? '<p class="empty">正在加载歌词…</p>' : '<p class="empty">歌词待整理。</p>'}</div>`;
  return `<section id="listen" class="listen-block song-player" aria-labelledby="song-player-title">
    <div class="song-controls">
      <div class="listen-title"><span class="song-player-icon">${icon('music')}</span>
        <div><h2 id="song-player-title">聆听歌曲</h2><p class="fine">${track.audio ? esc(track.title) : '站内音频暂未开放。'}</p></div>
      </div>
      ${track.audio ? play(track, album?.id, '播放歌曲') : ''}
    </div>
    ${track.audio ? timeline(track) : ''}
  </section>
  <section class="inner-section song-lyrics">
    <h2>歌词</h2>
    ${lyrics}
  </section>`;
}

function donationSection(statement = '') {
  return `<section class="donation-section prose">
    <h2>${statement ? '乐团声明' : '支持乐团'}</h2>
    ${textBlock(statement)}
    <a class="donation-banner" href="/assets/donation/banner.jpg" target="_blank" rel="noopener" aria-label="查看乐团捐赠图原图">
      <img src="/assets/donation/banner.jpg" alt="支持宝座乐团的微信赞赏码" width="900" height="500" loading="lazy">
    </a>
    ${link('/support/', '支持我们', 'button secondary', 'heart')}
  </section>`;
}

function donationCards() {
  const methods = [['wechat', '微信支付', '微信'], ['alipay', '支付宝', '支付宝']];
  const cards = methods.map(([id, label, app]) => {
    const payment = site.donations[id];
    return `<section class="support-method">
      <h3>${label}</h3>
      ${payment.qr ? `<a class="support-qr" href="${esc(payment.qr)}" target="_blank" rel="noopener" aria-label="查看${label}收款二维码原图">
        <span class="support-qr-preview">
          <img src="${esc(payment.qr)}" alt="${label}收款二维码"
            width="${esc(payment.qrWidth || 224)}" height="${esc(payment.qrHeight || 224)}" loading="lazy">
        </span>
        <span class="support-qr-label">查看原图 ${icon('external')}</span>
      </a>` : ''}
      ${payment.link ? outside(payment.link, '打开' + app + '收款页') : ''}
      ${!payment.qr && !payment.link ? '<p>收款方式暂未开放。</p>' : ''}
    </section>`;
  });
  return `<div class="support-methods">${cards.join('')}</div>`;
}

for (const track of tracks) {
  const album = albumById.get(track.albums[0]);
  const isSingle = !album || track.single === true;
  const story = track.story?.trim();
  const description = track.description?.trim() || '';
  let introPreview = isSingle ? story || '' : '';
  let introRemainder = '';
  if (introPreview && (description + introPreview).replace(/\s/g, '').length > 180) {
    const excerpt = Array.from(introPreview).slice(0, Math.max(75, 155 - description.length)).join('');
    const boundary = Array.from(excerpt.matchAll(/[。！？；]+[”’」』]?|\n+/g)).at(-1);
    const completeSentence = boundary && boundary.index >= 38;
    const splitAt = completeSentence ? boundary.index + boundary[0].length : excerpt.length;
    introRemainder = introPreview.slice(splitAt).trimStart();
    introPreview = introPreview.slice(0, splitAt).trimEnd();
    if (!completeSentence && introRemainder) introPreview += '…';
  }
  const credits = Object.entries(track.credits || {});
  const images = (track.storyImages || []).filter(image => image.src !== track.cover);
  const statement = track.statement?.trim() || (isSingle ? site.singleStatement?.trim() : '');
  pages.push({
    path: songPath(track.id), navPath: isSingle ? singleListPath : albumListPath,
    title: track.title, description: description || `宝座乐团原创歌曲《${track.title}》。`, image: track.cover,
    heroArt: 'detail',
    body: `<article class="wrap section interior detail song-detail">
      ${link(isSingle ? singleListPath : albumPath(album.id), isSingle ? '返回单曲' : album.title, 'text-link breadcrumb', 'back')}
      <header class="song-intro">
        ${cover(track, 'song-cover', true)}
        ${description || introPreview ? `<div class="prose song-description">
          <h2>作品简介</h2>
          ${textBlock(description)}
          ${introPreview ? `<div class="intro-preview">${textBlock(introPreview)}</div>` : ''}
          ${introRemainder ? `<details class="intro-disclosure">
            <summary><span class="intro-expand">展开完整简介</span><span class="intro-collapse">收起简介</span>${icon('arrow')}</summary>
            <div class="intro-story-copy">${textBlock(introRemainder)}</div>
          </details>` : ''}
        </div>` : ''}
      </header>
      ${songListening(track, isSingle ? null : album)}
      ${!isSingle && story ? `<section class="inner-section prose"><h2>创作背景</h2>${textBlock(story)}</section>` : ''}
      ${credits.length || images.length ? `<section class="inner-section"><h2>作品资料</h2>
        ${credits.length ? `<dl class="song-credits">${credits.map(([label, value]) =>
          `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
        ${images.length ? `<div class="story-images">
          ${images.map(({ src, title, width, height }) => {
            const size = Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
              ? ` width="${width}" height="${height}"` : '';
            return `<a class="story-image" href="${esc(src)}" target="_blank" rel="noopener" aria-label="查看${esc(title)}原图">
              <img src="${esc(src)}" alt="${esc(title)}"${size} loading="lazy" decoding="async">
            </a>`;
          }).join('')}
        </div>` : ''}
      </section>` : ''}
      ${track.video ? `<section class="inner-section video-panel"><h2>音乐视频</h2>${video(track)}</section>` : ''}
      ${statement ? donationSection(statement) : ''}
      ${sharePoster(track, '单曲', songPath(track.id), `聆听宝座乐团的原创敬拜歌曲《${track.title}》。`)}
    </article>`
  });
}

for (const post of posts) {
  pages.push({
    path: postPath(post.id), navPath: '/', title: post.title, description: post.description || post.body.split(/\r?\n/)[0],
    image: post.cover || undefined, heroArt: 'detail',
    body: `<article class="wrap section interior detail">
      ${link('/', '最新', 'text-link breadcrumb', 'back')}
      ${articleHeader(post, '图文')}
      <div class="prose">${textBlock(post.body)}</div>
      ${post.tracks?.length ? `<section class="inner-section"><h2>文中提到的歌</h2>${rows(post.tracks.map(id => lookup.get(id)))}</section>` : ''}
    </article>`
  });
}

pages.push({
  path: '/videos/', title: '敬拜影像', description: '观看宝座乐团的音乐视频与敬拜影像。',
  body: `<div class="wrap section interior">
  <div class="video-grid">${videos.map(track => `<article class="video-panel" id="${videoId(track)}">
    ${video(track)}
    <h2><a href="${songPath(track.id)}">${esc(track.title)}</a></h2>
    ${entryFacts(track, 'video')}
  </article>`).join('') || '<p class="empty">影像正在整理中。</p>'}</div></div>`
}, {
  path: '/about/', title: '关于乐团', description: '了解宝座乐团的成立、原创敬拜作品与音乐事工异象。',
  heroTitle: '关于宝座乐团',
  body: `<div class="wrap section interior about-grid">
    <section class="prose">
      <h2>乐团介绍</h2>
      <p>宝座乐团成立于2017年，跨教会、跨宗派，跨地域。首年发布原创敬拜专辑《完美之爱》获得众多好评，主打歌《神爱世人》被许多教会列为圣诞常用曲目；2019发布第二张原创专辑《我是你的宝贝》，《因着信》被国内外弟兄姊妹广为传唱；2020年发布第三张专辑《为我而来》，诞生《为万国祷告》等脍炙人口的佳作，主打歌《为我而来》更被广泛传播，成为布道会优选曲目。2021年上半年发行第四张原创专辑《十字架已成就》；2021年底发布第五张原创敬拜专辑《得救本乎恩》；2022年上半年发布原创敬拜专辑《你是医治》。</p>
      <p>另有部分原创作品《一生最大的事》、《愿主兴旺》、《天开了》，曾授权赞美之声音乐事工(CCM)制作发行，于2016年上架各音乐网站。</p>
    </section>
    <section class="inner-section prose">
      <h2>我们的异象</h2>
      <p>一、带领人进入真实的敬拜，实现与祂关系的亲密，让父与我们的心同得满足。我们单单渴望将人带领至父神宝座面前；从外院、内院深入至圣所；依靠基督之义、被圣灵引领掌管、被神同在充满；与祂真实相遇、相识、相交，被启示浇灌，被恩膏浸透，被祂的面容改变，恩上加恩、爱上加爱，荣上加荣、力上加力！</p>
      <p>二、音乐传道。叫人不花钱得福音 (林前 9:13-18）。免费开放诗歌音、视频下载，让更多人听见福音。</p>
      <p>三、以曲载道，喂养众人。让更多心灵在天父的爱和圣灵中得医治、被建立，成为神自由、荣耀、大能的儿女。</p>
      <p>四、以乐扬爱。向世界传递真善美。</p>
    </section>
    ${link(singleListPath, '浏览音乐作品', 'button primary')}
    <img src="/assets/spring.jpg" alt="远山前的绿色草地与白色野花" width="1400" height="933">
  </div>`
}, {
  path: '/support/', title: '支持我们', description: '通过微信、支付宝或银行转账支持宝座乐团的原创敬拜音乐。',
  body: `<div class="wrap section interior">
    <section class="support-scan" aria-labelledby="scan-payment-title">
      <header class="support-heading">
        <span class="support-heart">${icon('heart')}</span>
        <h2 id="scan-payment-title">扫码奉献</h2>
        <p class="support-motto">同心同道，同工同赏</p>
        <p>感谢你支持宝座乐团的原创敬拜音乐。请用对应的应用扫码，付款前核对收款方。</p>
      </header>
      ${donationCards()}
    </section>
    ${bankTransfers.length ? `<section class="support-bank" aria-labelledby="bank-payment-title">
      <h2 id="bank-payment-title">银行转账</h2>
      <div class="support-accounts">${bankTransfers.map(account => `<section class="support-account">
        <h3>${esc(account.label)}</h3>
        <dl class="bank-fields">${Object.entries(account.fields).map(([label, value]) =>
          `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
      </section>`).join('')}</div>
    </section>` : ''}
  </div>`
});

await rm(out, { recursive: true, force: true });
await cp('public', out, { recursive: true });
for (const [src, svg] of sharePosters) {
  const file = out + src;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, svg);
}
if (demo) {
  const { generateDemo } = await import('./demo.mjs');
  await generateDemo(out);
}
for (const page of pages) {
  const file = out + page.path + 'index.html';
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, layout(page));
}
await writeFile(out + '/404.html', layout({
  path: '/404/', title: '页面未找到', description: '页面未找到', error: true,
  body: `<div class="wrap section interior">${link('/music/', '查看音乐作品', 'button primary')}</div>`
}));
await writeFile(out + '/catalog.json', JSON.stringify({ tracks, albums }));
if (!demo) {
  await writeFile(out + '/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(page => `<url><loc>${esc(new URL(page.path, site.domain).href)}</loc></url>`).join('')}</urlset>\n`);
  await writeFile(out + '/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', site.domain)}\n`);
}
console.log(`已生成 ${pages.length} 个页面${demo ? '（含本地播放器演示）' : ''}。`);
