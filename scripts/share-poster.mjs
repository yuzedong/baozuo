import qrcode from 'qrcode-generator';

const width = 720;
const inset = 52;
const esc = value => value.replace(/[&<>"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
})[char]);

const posterInitials = new Map([
  ['主耶稣', 'ZYS'], ['耶和华', 'YHH'], ['造物主', 'ZWZ'], ['哈利路亚', 'HLLY'],
  ['耶稣', 'YS'], ['上帝', 'SD'], ['父神', 'FS'], ['主神', 'ZS'], ['基督', 'JD'],
  ['圣灵', 'SL'], ['天父', 'TF'], ['救主', 'JZ'], ['阿爸', 'AB'], ['阿们', 'AM'],
  ['与主共舞', '与Z共舞'], ['愿主兴旺', '愿Z兴旺'], ['遇见主', '遇见Z'],
  ['奉主的名', '奉Z的名'], ['主的荣光', 'Z的荣光'], ['主的灵', 'Z的灵'],
  ['主我愿', 'Z我愿'], ['主你是', 'Z你是'], ['主来的日子', 'Z来的日子'],
  ['十字架', 'SZJ'], ['福音', 'FY'], ['敬拜', 'JB'], ['祂', 'T'], ['祢', 'N'], ['神', 'S']
]);
const posterTerms = new RegExp([...posterInitials.keys()].join('|'), 'g');

export function posterText(text) {
  return text.replace(posterTerms, term => posterInitials.get(term));
}

function wrapText(text, fontSize, maxLines = Infinity) {
  const lines = [];
  let line = '';
  let lineWidth = 0;
  for (const char of text.replace(/\s+/g, ' ').trim()) {
    const charWidth = fontSize * (/^[\x20-\x7e]$/.test(char) ? .8 : 1);
    if (lineWidth + charWidth > width - inset * 2) {
      if (lines.length === maxLines - 1) {
        return [...lines, Array.from(line).slice(0, -2).join('').trimEnd() + '…'];
      }
      lines.push(line.trimEnd());
      line = '';
      lineWidth = 0;
    }
    if (!line && char === ' ') continue;
    line += char;
    lineWidth += charWidth;
  }
  if (line) lines.push(line);
  return lines;
}

export function renderSharePoster({ title, description, kind, url, logo }) {
  const titleLines = wrapText(title, 50);
  const introLines = wrapText(description, 26, 4);
  const introY = 222 + (titleLines.length - 1) * 61 + 59;
  const footerY = introY + (introLines.length - 1) * 40 + 43;
  const height = footerY + 308;

  const qr = qrcode(0, 'M');
  qr.addData(url.href);
  qr.make();
  const modules = qr.getModuleCount();
  const cell = Math.floor(232 / (modules + 8));
  const offset = Math.floor((232 - modules * cell) / 2);
  const path = [];
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) {
        path.push(`M${408 + offset + col * cell} ${footerY + 16 + offset + row * cell}h${cell}v${cell}h-${cell}z`);
      }
    }
  }

  const text = (lines, start, leading) => lines.map((line, index) =>
    `<tspan x="${inset}" y="${start + index * leading}">${esc(line)}</tspan>`
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${esc(title)} · 宝座乐团</title>
  <rect width="${width}" height="${height}" fill="#fff"/>
  <rect width="${width}" height="144" fill="#0b1420"/>
  <rect y="140" width="${width}" height="4" fill="#1e73be"/>
  <image x="52" y="29" width="94" height="86" href="data:image/png;base64,${logo}"/>
  <g font-family="PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif">
    <path d="M170 51v42" stroke="#6385a7"/>
    <text x="194" y="81" font-size="23" fill="#e4edf7">华语原创音乐</text>
    <rect x="576" y="50" width="92" height="44" rx="22" fill="none" stroke="#8eabc7"/>
    <text x="622" y="79" text-anchor="middle" font-size="20" fill="#fff">${esc(kind)}</text>
    <text font-size="50" font-weight="700" fill="#171c22">${text(titleLines, 222, 61)}</text>
    <text font-size="26" fill="#4d5b6b">${text(introLines, introY, 40)}</text>
    <rect x="52" y="${footerY}" width="616" height="264" rx="18" fill="#f0f6fc"/>
    <text x="84" y="${footerY + 118}" font-size="32" font-weight="700" fill="#1e73be">扫码聆听</text>
    <text x="84" y="${footerY + 158}" font-size="22" fill="#4d5b6b">${esc(url.hostname)}</text>
  </g>
  <rect x="408" y="${footerY + 16}" width="232" height="232" fill="#fff"/>
  <path d="${path.join('')}" fill="#171c22" shape-rendering="crispEdges"/>
</svg>`;
  return { svg, width, height };
}
