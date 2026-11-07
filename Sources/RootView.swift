import SwiftUI
import WebKit

/// 保活容器：五页 ZStack 常驻，只切 opacity，切 Tab 不销毁也不重载
struct RootView: View {
    @StateObject private var store = PageStore()
    @State private var selection: Int = 0
    @State private var started: Set<Int> = []

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                ForEach(store.pages.indices, id: \.self) { index in
                    PageContainer(controller: store.pages[index])
                        .opacity(index == selection ? 1 : 0)
                        .allowsHitTesting(index == selection)
                        .zIndex(index == selection ? 1 : 0)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            .background(WFColor.bg)

            WFTabBar(selection: $selection)
        }
        .background(WFColor.bg)
        .onAppear { launch(0) }
        .onChange(of: selection) { value in launch(value) }
    }

    private func launch(_ index: Int) {
        guard index >= 0, index < store.pages.count else { return }
        guard !started.contains(index) else { return }
        started.insert(index)
        store.pages[index].start()
    }
}

final class PageStore: ObservableObject {
    let pages: [PageController] = PageCatalog.all.map { PageController(spec: $0) }
}

struct PageContainer: UIViewRepresentable {
    let controller: PageController

    func makeUIView(context: Context) -> WKWebView {
        controller.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // 常驻保活：任何 SwiftUI 重排都不重建、不重载
    }
}

/// 自绘底部栏：系统 .tabItem 只吃「一个 Image + 一个 Text」，
/// VStack 两行文字会被丢弃且无图标，所以这里用原生 HStack 手写，5 项等分。
struct WFTabBar: View {
    @Binding var selection: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(PageCatalog.all.enumerated()), id: \.offset) { index, page in
                tabButton(index: index, page: page)
            }
        }
        .padding(.top, 7)
        .padding(.bottom, 3)
        .background(TabBarBackground())
    }

    private func tabButton(index: Int, page: PageSpec) -> some View {
        let active = index == selection
        return Button {
            if selection != index { selection = index }
        } label: {
            VStack(spacing: 2) {
                Image(systemName: page.symbol)
                    .font(.system(size: 19, weight: active ? .semibold : .regular))
                    .frame(height: 21)
                Text(page.line1)
                    .font(.system(size: 10, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
                Text(page.line2)
                    .font(.system(size: 9, weight: .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
            .foregroundColor(active ? WFColor.purple : WFColor.dim)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .center)
            .contentShape(Rectangle())
        }
        .buttonStyle(WFTabButtonStyle())
    }
}

private struct WFTabButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.55 : 1.0)
    }
}

private struct TabBarBackground: View {
    var body: some View {
        ZStack(alignment: .top) {
            WFColor.bar
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: 0.5)
        }
        .ignoresSafeArea(edges: .bottom)
    }
}
