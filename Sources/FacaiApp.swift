import SwiftUI

enum WFColor {
    static let bg = Color(red: 0.043, green: 0.043, blue: 0.063)
    static let bar = Color(red: 0.035, green: 0.035, blue: 0.055)
    static let purple = Color(red: 0.573, green: 0.486, blue: 0.965)
    static let dim = Color(red: 0.47, green: 0.47, blue: 0.60)
}

@main
struct FacaiApp: App {
    init() {
        // 启动即预热三个数据源，进页面点「新澳/老澳/香港」时直接命中缓存/已就绪连接
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
