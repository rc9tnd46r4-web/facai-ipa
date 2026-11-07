import SwiftUI

/// 全局配色：深色壳 + 紫色高亮（与页面 --accent #7c6cf6 对齐）
enum WFColor {
    static let bg       = Color(red: 0.043, green: 0.043, blue: 0.063)
    static let bar      = Color(red: 0.035, green: 0.035, blue: 0.055)
    static let lightBG  = Color(red: 0.953, green: 0.961, blue: 0.976)
    static let purple   = Color(red: 0.573, green: 0.486, blue: 0.965)
    static let dim      = Color(red: 0.470, green: 0.470, blue: 0.600)
}

@main
struct FacaiApp: App {
    init() {
        // 启动即预热三个数据源：进页面点「新澳/老澳/香港」时直接命中
        // 内存/磁盘缓存或已就绪的取数任务，不必干等三次退避重试。
        HistoryService.shared.prewarm()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .ignoresSafeArea(.keyboard)
        }
    }
}
