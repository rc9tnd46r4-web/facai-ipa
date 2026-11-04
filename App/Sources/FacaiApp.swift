import SwiftUI
import UIKit

@main
struct FacaiApp: App {

    init() {
        // 5 个本机 HTTP 服务（每版本一个端口 → 独立的 localStorage origin）
        ServerHub.shared.startAll()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}
