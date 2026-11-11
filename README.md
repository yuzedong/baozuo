# 宝座乐团 · Throne Worship

手机版优先的华语原创敬拜音乐站。使用 Node.js 生成静态页面，由 Cloudflare Pages 托管。浏览器直接从七牛 CDN 获取媒体。

## 本地预览

需要 Node.js 22 或更新版本。先运行 `npm ci` 安装构建依赖。

```sh
npm run dev
```

访问 [本机预览](http://127.0.0.1:4173/)。本地预览默认展示正式内容。修改内容后重新运行构建命令，再刷新浏览器。

```sh
npm run check    # 检查播放器脚本并验证生产构建
npm run build    # 生成正式站点至 dist/
npm run preview  # 预览上一次构建的 dist/
```

生产构建排除演示页面和演示媒体。

## 发布图文、单曲和专辑

编辑 `content/catalog.json`。发布和更新均随代码提交。作品 ID 使用小写英文、数字和连字符，发布后保留 ID 以维持旧链接。

- **发图文**。在 `posts` 中新增 `id`、`title` 和 `body`。正文用换行分段，可选填 `description`（首页摘要）、`cover`（封面）和 `date`（发布日期）。如果文中提到歌曲，可在 `tracks` 中按顺序填写歌曲 ID，文章末尾会显示对应曲目。发布后首页会出现一条图文，正文地址为 `/posts/<id>/`。
- **发歌**。在 `tracks` 中新增条目，至少填 `id` 和 `title`。页面地址为 `/songs/<id>/`。未收录到专辑的歌曲自动进入单曲列表。如歌曲同时作为单曲独立发行，可加 `"single": true`。
- **发专辑**。在 `albums` 中新增 `id`、`title` 与 `tracks`。在 `tracks` 数组中按播放顺序填写已存在的歌曲 ID。页面地址为 `/albums/<id>/`。用 `site.featuredAlbum` 设置首页置顶专辑，留空即可取消置顶。
- **播放专辑**。首页、专辑列表和专辑详情都显示播放入口，至少一首歌填了 `audio` 后即可播放。点「播放专辑」从第一首有音源的歌开始，也可以在曲目表中选择一首起播。播放器按专辑顺序继续播放有音源的歌曲。
- **填资料**。歌曲和专辑均支持 `cover`、`date`、`description` 和 `story`。日期格式为 `YYYY-MM-DD`。只知道专辑发行年份时，可填 `year`，也可用 `category` 标注专辑类别。介绍和创作背景可用换行分段，歌曲时长可用 `duration` 标注，例如 `"4:29"`。
- **附简谱或配图**。在歌曲的 `storyImages` 中按顺序填写图片的 `title` 和 `src`。图片会直接显示在「作品资料」，点击可查看原图。可填写原图的 `width` 和 `height`，让页面在图片加载前预留空间。
- **补充制作名单和声明**。歌曲的 `credits` 可填写署名项目与对应文字。旧站有随作品发布的声明时，可用 `statement` 填写，正文会显示在歌曲页底部。
- **填媒体**。歌曲的 `audio` 填 MP3 或 AAC/M4A，`video` 填浏览器可直接播放的 MP4（H.264 / AAC）。填写后，歌曲页出现播放器，视频也会进入「敬拜影像」。可选的 `videoDuration` 用于显示视频时长，例如 `"3:24"`。
- **填歌词**。用 `lyrics` 写纯文本歌词或内嵌 LRC，也可以用 `lrc` 引用 UTF-8 文件。时间标签示例为 `[00:12.50]第一句`。LRC 支持同一行多个时间标签及 `[offset:毫秒]`。点击带时间标签的歌词行可跳转播放。
- **填收款方式**。在 `site.donations.wechat` 和 `site.donations.alipay` 分别填写 `qr`（真实收款码图片）和可选的 `link`（可在浏览器打开的 HTTPS 收款页）。网站展示收款入口，付款由用户在微信或支付宝完成。
- **更新银行转账信息**。在 `site.bankTransfers` 编辑国内或国外账户的公开收款资料。

首页逐条展示专辑、视频、独立发行的单曲和图文。有日期的内容按日期从新到旧排列，未填写日期的内容排在后面。

## 七牛 CDN

`audio`、`video`、`cover`、`lrc` 和收款码支持完整 HTTPS 地址。若多个文件使用同一个 CDN 前缀，可设置 `site.mediaBase`，例如 `https://media.example.com/worship/`，随后填写相对路径，例如 `music/song.mp3`。站点自带资源放在 `public/`，并使用 `/assets/...` 等根路径。

音视频需使用浏览器可访问的地址。配置防盗链时允许正式域名以及实际使用的 Pages 预览域名。确认 CDN 返回正确的媒体类型，并支持字节范围请求 `206 Partial Content`，以便 iOS 播放和拖动进度。跨域 LRC 通过浏览器读取，七牛需返回允许站点来源的 `Access-Control-Allow-Origin` 响应头。七牛密钥和私有签名生成逻辑应留在服务器端。[七牛 CDN HTTPS 配置](https://developer.qiniu.com/fusion/4952/https-configuration)

## GitHub 和 Cloudflare Pages

1. 将本目录的源文件提交到 GitHub 仓库，默认生产分支用 `main`。
2. 在 Cloudflare 的 **Workers & Pages** 创建 **Pages** 项目，选择从现有 Git 仓库导入并连接该仓库。
3. 生产分支选 `main`，框架预设选 **None**，构建命令用 `npm run build`，输出目录用 `dist`，根目录留空。可设置 `NODE_VERSION=22`。
4. 首次部署成功后，在项目的 **Custom domains** 添加 `baozuoyuetuan.com`。若域名尚未接入 Cloudflare，先将域名添加到同一账号并按控制台指引配置权威名称服务器。
5. 提交到生产分支后 Pages 自动重新构建并发布。其他分支可用 Pages 的预览部署复核内容。

[Cloudflare Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/) · [绑定自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## 香港服务器自动发布

GitHub Actions 在 `main` 上构建静态文件，通过 SSH 上传到 Linux 服务器。Nginx 从 `/var/www/baozuo/current` 读取网站。部署脚本先检查新版本，再原子切换 `current` 链接，旧版本保存在 `releases/`。

1. 在香港服务器上准备 Nginx 和一个普通 SSH 用户。以管理员身份执行 `sudo install -d -o deploy -g deploy -m 755 /var/www/baozuo /var/www/baozuo/releases`，再执行 `sudo install -d -o deploy -g deploy -m 700 /var/www/baozuo/incoming`。将命令中的 `deploy` 换成实际的发布用户及其用户组。
2. 将 `deploy/baozuo.nginx.conf` 加到 Nginx 的站点配置中，按实际测试域名调整 `server_name`。用 `sudo nginx -t` 检查，通过后重载 Nginx。测试域名使用直连服务器的 DNS 记录，配置 HTTPS 后再做浏览器验证。
3. 给发布用户配置专用 SSH 公钥。在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中，将私钥保存为 `HK_SSH_KEY`，将经服务器管理员核对的 SSH 主机公钥记录保存为 `HK_SSH_KNOWN_HOSTS`。如果使用非 22 端口，主机记录使用 `[主机名或 IP]:端口`。
4. 在同一页面添加变量 `HK_SSH_HOST`（服务器 IP 或主机名）、`HK_SSH_USER`（发布用户）、`HK_SSH_PORT`（可选，默认 22）。设置 `HK_DEPLOY_ENABLED=true` 后，在 **Actions → Deploy to Hong Kong** 手动触发首次部署。此后推送 `main` 会自动发布。
5. 用测试域名验证首页、单曲和专辑详情、加载更多、音视频及 HTTPS。七牛启用防盗链或跨域限制时，把测试域名加入相应规则。验证通过后再调整正式域名的解析和 Nginx 证书。

如需回滚，以发布用户在 `/var/www/baozuo` 内执行 `ln -s releases/<已验证版本目录> .rollback`，再执行 `mv -Tf .rollback current`。每个版本会占用一份静态文件的空间，可定期清理不再使用的旧版本。

透明 Logo 位于 `public/assets/logo.png`。网站使用的浅绿色春日风景配图位于 `public/assets/spring.jpg`。
