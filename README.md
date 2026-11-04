# 发财 · 5 版本合体 iOS App（未签名 ipa）

把 5 个网页版分析工具打包成一个 iOS App：底部 5 个 Tab，两行文字标签，页面已做移动端适配。
GitHub Actions 云端编译 **未签名 ipa**，App 显示名 **发财**。

## 5 个 Tab

| # | 标签（两行） | 页面 | 说明 |
|---|--------------|------|------|
| 1 | 十维 / 连错 | `Web/liancuo.html` | 十维连错 |
| 2 | 十维 / 连错V2 | `Web/liancuov2.html` | 十维连错 V2 |
| 3 | 十维 / 连对 | `Web/liandui.html` | 十维连对 |
| 4 | 十维 / 连对V2 | `Web/lianduiv2.html` | 十维连对 V2 |
| 5 | 853 / 生肖 | `Web/shengxiao.html` | 特别号生肖规律分析预测系统 |

## 结构

```
App/
  Info.plist                 # 显示名「发财」、竖屏、ATS 允许 http 代理入口
  Assets.xcassets/AppIcon    # 1024 图标
  Sources/
    FacaiApp.swift           # @main 入口，启动时拉起本机 HTTP 服务
    RootView.swift           # 原生底部 TabBar（两行文字 + 选中态）+ 懒加载页面
    WebTabView.swift         # WKWebView 容器（含失败回退 file://）
    LocalWebServer.swift     # 127.0.0.1 迷你 HTTP 服务（每 Tab 一个端口）+ 开奖数据中转
    Models.swift             # 5 个 Tab 定义与配色
Web/                         # 5 个页面 + 移动端适配层（CSS/JS）
scripts/
  prepare_web.py             # 从桌面版 HTML 生成带适配层的副本
  build_ipa.sh               # macOS 上 swiftc 编译 + actool 图标 + 打 ipa
  gh_push.py                 # 用 api.github.com 推送（git 协议被墙时使用）
  mock_local_api.py          # 本地接口联调（复刻 /api/history，验证页面侧取数）
  test_remote_btn.js         # 点「新澳」验证走本地通道能否加载
preview/shell.html           # 原生外壳的浏览器预览（用于渲染检查）
```

## 关键设计

- **每 Tab 一个本机端口（47831–47835）**：页面用 `localStorage` 记住加载源健康度与 LAG 榜单，
  端口不同 = origin 不同，5 个版本互不污染，行为与桌面版「每个 exe 一个端口」一致。
- **开奖数据中转（`/api/history?src=xxx`）**：三个源站（新澳 / 老澳 / 香港）不返回
  `Access-Control-Allow-Origin`，浏览器直连必被 CORS 拦；页面原本靠公共跨域代理中转，
  而这些代理随时会限流或下线（实测 `cors.eu.org` 返回 429、`allorigins` / `codetabs` 返回 522）。
  因此本机服务实现了与桌面版 Python 服务同名的同源接口，由 `URLSession` 直接取源站文本再回给页面，
  页面走「本地服务」这一档即可，完全不经代理。附 90 秒内存缓存（5 个 Tab 共享），
  连续切换不用重抓；上游返回 HTML 错误页时判为失败、不写缓存。
- **回退机制**：本机服务未就绪或加载失败时，自动退回 `file://` 直读，保证页面总能打开。
- **移动端适配层**：`Web/app-mobile-dark.css` / `app-mobile-light.css` / `app-shell.js`
  由 `prepare_web.py` 注入副本，原始 HTML 不做破坏性改动。矩阵表在窄屏下自动改列宽、
  隐藏次数只留概率；12 列矩阵一屏可见；隐藏桌面端「更新记录 / 退出程序」；拖拽文案改为点击。

## 本地预览与检查

```bash
python -m http.server 8901 --bind 127.0.0.1        # 仓库根目录
node scripts/shoot.js                              # Chrome 渲染 5 个 Tab 并截图 + 溢出检测
```

## 云端构建

推送到 `main` 或手动 `workflow_dispatch` 即触发 `.github/workflows/build.yml`，
产物为 `Facai-unsigned-ipa` artifact（内含 `Facai-unsigned.ipa`）。

安装：用爱思助手 / Sideloadly / AltStore 重新签名后安装（未签名 ipa 无法直接装）。
