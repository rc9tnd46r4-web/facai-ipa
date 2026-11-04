import SwiftUI
import UIKit
import WebKit

/// 让「再次点击当前 Tab」可以回到页面顶部
final class WebViewRegistry {
    static let shared = WebViewRegistry()
    private var views: [Int: WKWebView] = [:]

    func register(_ webView: WKWebView, for id: Int) {
        views[id] = webView
    }

    func scrollToTop(_ id: Int) {
        views[id]?.evaluateJavaScript("window.scrollTo({top:0,behavior:'smooth'});", completionHandler: nil)
    }
}

struct RootView: View {

    @State private var selection: Int = 0
    /// 懒加载：只创建被访问过的页面，避免 5 个 WebView 同时抢占内存
    @State private var visited: Set<Int> = [0]

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Palette.background
                ForEach(AppTab.all) { tab in
                    if visited.contains(tab.id) {
                        WebTabView(tab: tab)
                            .opacity(tab.id == selection ? 1 : 0)
                            .allowsHitTesting(tab.id == selection)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()

            TabBarView(selection: $selection) { tab in
                if tab.id == selection {
                    WebViewRegistry.shared.scrollToTop(tab.id)
                } else {
                    visited.insert(tab.id)
                    selection = tab.id
                }
            }
        }
        .background(Palette.background.ignoresSafeArea())
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

struct TabBarView: View {

    @Binding var selection: Int
    var onSelect: (AppTab) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.all) { tab in
                Button(action: { onSelect(tab) }) {
                    VStack(spacing: 1) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(tab.id == selection ? Palette.accent.opacity(0.14) : Color.clear)
                                .frame(width: 34, height: 23)
                            Image(systemName: symbolName(for: tab))
                                .font(.system(size: 16, weight: .semibold))
                        }
                        Text(tab.line1)
                            .font(.system(size: 10, weight: .semibold))
                            .lineLimit(1)
                        Text(tab.line2)
                            .font(.system(size: 10, weight: .regular))
                            .lineLimit(1)
                    }
                    .foregroundColor(tab.id == selection ? Palette.accent : Palette.dim)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(TabButtonStyle())
            }
        }
        .padding(.bottom, 2)
        .background(
            Palette.bar
                .overlay(
                    Rectangle()
                        .fill(Palette.hairline)
                        .frame(height: 0.5),
                    alignment: .top
                )
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func symbolName(for tab: AppTab) -> String {
        // 极少数系统版本可能缺符号，兜底为圆点，避免整栏空白
        UIImage(systemName: tab.icon) != nil ? tab.icon : "circle.fill"
    }
}

/// 轻触反馈 + 淡入淡出，接近系统 TabBar 的手感
struct TabButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
