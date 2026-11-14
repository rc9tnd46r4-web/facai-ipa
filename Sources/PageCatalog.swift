import Foundation

/// 一个 Tab 的静态描述：SF Symbol、两行标签文字、页面文件、独立端口。
/// 端口即 origin（页面用 localStorage 存榜单/设置），所以一页一端口，绝不共用。
struct PageSpec: Identifiable, Hashable {
    let id: Int
    let line1: String
    let line2: String
    let symbol: String
    let file: String
    let port: UInt16
    /// 页面主题：4 个「十维」页是深色，853 生肖 / 743 尾数页是浅色
    let dark: Bool
}

enum PageCatalog {
    /// 顺序即底部栏顺序：连错 → 连错V2 → 连对 → 连对V2 → 853生肖 → 743尾数
    static let all: [PageSpec] = [
        PageSpec(id: 0, line1: "十维", line2: "连错",
                 symbol: "xmark.circle", file: "10d-lk.html",
                 port: 47831, dark: true),
        PageSpec(id: 1, line1: "十维", line2: "连错V2",
                 symbol: "xmark.circle.fill", file: "10d-lk2.html",
                 port: 47832, dark: true),
        PageSpec(id: 2, line1: "十维", line2: "连对",
                 symbol: "checkmark.circle", file: "10d-ld.html",
                 port: 47833, dark: true),
        PageSpec(id: 3, line1: "十维", line2: "连对V2",
                 symbol: "checkmark.circle.fill", file: "10d-ld2.html",
                 port: 47834, dark: true),
        PageSpec(id: 4, line1: "853", line2: "生肖",
                 symbol: "hare.fill", file: "853-zs.html",
                 port: 47835, dark: false),
        PageSpec(id: 5, line1: "743", line2: "尾数",
                 symbol: "number.circle.fill", file: "743-ws.html",
                 port: 47836, dark: false)
    ]
}
