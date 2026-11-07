import Foundation

/// 一个 Tab 的静态描述：标签两行文字、SF Symbol、页面文件、端口。
struct PageSpec: Identifiable, Hashable {
    let id: Int
    let line1: String
    let line2: String
    let symbol: String
    let file: String
    let port: UInt16
}

enum PageCatalog {
    /// 顺序即底部栏顺序：连错 → 连错V2 → 连对 → 连对V2 → 853生肖
    static let all: [PageSpec] = [
        PageSpec(id: 0, line1: "十维", line2: "连错",
                 symbol: "xmark.circle", file: "10d-lk.html", port: 47831),
        PageSpec(id: 1, line1: "十维", line2: "连错V2",
                 symbol: "xmark.circle.fill", file: "10d-lk2.html", port: 47832),
        PageSpec(id: 2, line1: "十维", line2: "连对",
                 symbol: "checkmark.circle", file: "10d-ld.html", port: 47833),
        PageSpec(id: 3, line1: "十维", line2: "连对V2",
                 symbol: "checkmark.circle.fill", file: "10d-ld2.html", port: 47834),
        PageSpec(id: 4, line1: "853", line2: "生肖",
                 symbol: "hare.fill", file: "853-zs.html", port: 47835)
    ]
}
