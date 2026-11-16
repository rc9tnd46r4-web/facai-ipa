# 发财 · 五页 WKWebView 壳（未签名 ipa）

把 5 个单文件 HTML 分析页打包成一个 iOS App：原生 SwiftUI 外壳 + 自绘底部栏 + 每 Tab 一个本机
HTTP 服务（同一份页面资源，5 个独立 origin），页面零改动，适配只靠外部 `wf-adapt.css` / `wf-adapt.js`。

## 目录

```
Sources/
  FacaiApp.swift        入口；启动预热三个数据源
  PageCatalog.swift     5 个 Tab 的顺序 / 标签 / SF Symbol / 端口
  RootView.swift        ZStack+opacity 五页保活 + 自绘底部栏
  PageController.swift  单页 WKWebView + 服务生命周期 + 注入脚本
  LocalHTTPServer.swift NWListener 本机 HTTP 服务（静态资源 + /api/history + /lagfit）
  HistoryService.swift  URLSession 代取源站（3 次指数退避 + 磁盘缓存 + 缓存兜底）
Web/                    5 个页面原文件 + wf-adapt.css / wf-adapt.js
Assets.xcassets/        icon-1024.png（HTML + Chrome 截图生成）
tools/                  make-icon.js / make_ipa.sh / merge_icons.py / push_github.py
qa/                     Node 版服务 + puppeteer 真机尺寸验收
.github/workflows/      macos-15 + Xcode 16 构建未签名 ipa
```

## 5 个 Tab

| # | 标签第一行 | 标签第二行 | SF Symbol | 页面 | 端口 |
|---|-----------|-----------|-----------|------|------|
| 0 | 十维 | 连错 | `xmark.circle` | Web/10d-lk.html | 47831 |
| 1 | 十维 | 连错V2 | `xmark.circle.fill` | Web/10d-lk2.html | 47832 |
| 2 | 十维 | 连对 | `checkmark.circle` | Web/10d-ld.html | 47833 |
| 3 | 十维 | 连对V2 | `checkmark.circle.fill` | Web/10d-ld2.html | 47834 |
| 4 | 853 | 生肖 | `hare.fill` | Web/853-zs.html | 47835 |

底部栏是手写原生 `HStack`：系统的 `.tabItem` 只吃「一个 Image + 一个 Text」，VStack 里两行 Text 会被丢弃，
所以 5 项等分、图标 + 两行文字、选中紫色高亮全部自绘。5 个页面放在 `ZStack` 里靠 `opacity` 切换，
切 Tab 不销毁、不重载、不丢状态。

## 为什么要一页一个端口

页面用 `localStorage` 存榜单与设置，而 `localStorage` 按 origin 隔离，端口是 origin 的一部分。
5 页共用一个端口就会互相串味（A 页的榜单出现在 B 页），因此 47831~47835 各起一个
`NWListener`，先显式绑 `127.0.0.1`，失败再降级普通绑定重试一次。服务起不来时先回退 `file://`
保证能看，1.5s 后重试，服务就绪自动切回 `http`。

## 取数链路

```
页面点击「新澳/老澳/香港」
   ↓ fetch /api/history?src=xinao|laogang|xianggang     （同源，走本机服务）
LocalHTTPServer → HistoryService（URLSession）
   ↓ https://www.wuweicb1.com/kj/CBAM1DHK1.txt | CBAMHK1.txt | CBHK1.txt
   · 桌面 Chrome User-Agent + Referer + Accept（移动端 UA 会被回 JS 挑战页）
   · 3 次尝试，指数退避 0.6s → 1.2s → 2.4s，单次 8s 超时（最坏 27.6s < 页面 40s 预算）
   · 成功写磁盘缓存；三次失败回吐上次成功的缓存
App 启动时预热三个源（并发合并成一次往返）
```

数据**不经过任何第三方公共代理**：注入脚本把 `window.srcBuildStages` 覆盖成「本地服务 → 直连」两级
（打 `__wfNoproxy` 标记 + 1.5s 定时重装兜底），并把 `cors.eu.org` / `api.allorigins.win` /
`api.codetabs.com` / `api.cors.lol` / `whateverorigin.org` / `corsproxy.io` / `proxy.corsfix.com`
等代理域名的 `fetch`/`XHR` 直接拒掉。

## 适配的两条铁律

1. **`html` 加 `overflow-x:hidden`，`body` 绝对不能加** —— 加了 `.upload-bar` 的 `position:sticky` 立刻失效。
2. **矩阵的内联 `grid-template-columns` 外部 CSS 覆盖不了**，必须由 JS 按列数改写：
   12 列（生肖）固定像素宽度 + 隐藏 `.cnt` 只留概率，其余（10 列）铺满容器。

其他适配点：`#updateBtn`（桌面更新器入口）`display:none` + `disabled` + 500/1500ms 定时兜底，
但元素保留（页面有 `getElementById` 引用）；`📁 加载数据` 本地导入保留；柱状图进
`.wf-bars` 横向滚动容器；宽表格自动包 `.wf-xscroll`；顶栏重排成两行（Logo + 标题 + 版本徽标 + 右侧状态 /
按钮等分）。

## 本地验收

```bash
npm install                 # puppeteer-core（用本机 Chrome，不下载 Chromium）
npm run icon                # HTML → 1024px PNG
npm run qa                  # 320/360/375/390/414/430 + 横屏，逐 Tab 灌真实开奖数据后断言
```

`qa/run-qa.js` 覆盖 545 项断言：文档宽==视口宽、按钮等分且不截断、滚 600px 后顶栏 `top==0`、
矩阵完整不裁切、12 列只留概率、柱状图在容器内、表格可横滑、`#updateBtn` 不可见、
`srcBuildStages` 只有两级、emoji 码点判定（「选」不能被当图标）、全程 0 个代理请求、
底部栏 5 项等分且图标 + 两行文字不截断。截图落在 `qa/out/`。

## 构建

推 `main` 触发 GitHub Actions（`macos-15` + 显式切 Xcode 16，因为 xcodegen 2.46 生成的
`objectVersion 77` 老 Xcode 打不开）：

1. `xcodegen generate`
2. `actool --compile build/Assets --app-icon AppIcon --output-partial-info-plist build/icon-partial.plist Assets.xcassets`
3. `tools/merge_icons.py` 把 `CFBundleIcons` 等键合并回 `Info.plist`
4. `xcodebuild ... CODE_SIGNING_ALLOWED=NO` 出未签名 app
5. `tools/make_ipa.sh` 组装 `Payload/Facai.app` → zip → `dist/Facai-unsigned.ipa`
6. 上传 artifact `facai-unsigned-ipa`

GitHub 网页在本机被墙，代码用 Git Data API 推送（blobs → tree → commit → ref 一次提交）：

```bash
GITHUB_TOKEN=ghp_xxx python tools/push_github.py
```
