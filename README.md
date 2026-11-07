# 发财 · iOS 未签名 IPA

SwiftUI 单 App 打包 5 个单文件 HTML 页面（十维连错 / 连错V2 / 连对 / 连对V2 / 853生肖）。

- 每 Tab 一个 `WKWebView`，`ZStack + opacity` 常驻保活
- 每 Tab 一个独立本机 HTTP 服务（127.0.0.1:47831~47835，端口即 origin，localStorage 互不串味）
- `GET /api/history?src=xinao|laogang|xianggang` 由 App 代取源站，UA/Referer/Accept 齐全，3 次指数退避，磁盘缓存兜底，启动预热
- 页面适配只加外部 `Web/wf-adapt.css` / `Web/wf-adapt.js`，源 HTML 不改
- 底部栏自绘原生 HStack（系统 `.tabItem` 只吃一个 Image + 一个 Text，双行文字会被丢弃）

构建：GitHub Actions `macos-14` → Xcode 16 → xcodegen → actool → xcodebuild（不签名）→ Payload/ → zip。

> 源站对移动端 UA 会先下发一段 JS 挑战页（200 + HTML），请求需带 `Cookie: mobile_js_seen=1` 才能拿到真实数据。
