import SwiftUI
import UIKit

// MARK: - 配色（与 4 个深色页面的变量保持一致）

enum Palette {
    static let background = Color(red: 0.031, green: 0.031, blue: 0.063)      // #080810
    static let bar = Color(red: 0.047, green: 0.047, blue: 0.090)             // #0C0C17
    static let accent = Color(red: 0.655, green: 0.596, blue: 0.980)          // #A78BFA
    static let dim = Color(red: 0.431, green: 0.431, blue: 0.549)             // #6E6E8C
    static let hairline = Color.white.opacity(0.07)

    static let uiBackground = UIColor(red: 0.031, green: 0.031, blue: 0.063, alpha: 1)
}

// MARK: - 5 个版本

struct AppTab: Identifiable, Equatable {
    let id: Int
    let fileName: String
    let line1: String
    let line2: String
    let icon: String
    let port: UInt16
}

extension AppTab {
    static let all: [AppTab] = [
        AppTab(id: 0, fileName: "liancuo.html", line1: "十维", line2: "连错", icon: "arrow.down.right.circle.fill", port: 47831),
        AppTab(id: 1, fileName: "liancuov2.html", line1: "十维", line2: "连错V2", icon: "arrow.down.right.square.fill", port: 47832),
        AppTab(id: 2, fileName: "liandui.html", line1: "十维", line2: "连对", icon: "arrow.up.right.circle.fill", port: 47833),
        AppTab(id: 3, fileName: "lianduiv2.html", line1: "十维", line2: "连对V2", icon: "arrow.up.right.square.fill", port: 47834),
        AppTab(id: 4, fileName: "shengxiao.html", line1: "853", line2: "生肖", icon: "tortoise.fill", port: 47835),
    ]
}
