import SwiftUI
import WebKit

/// 六页常驻容器：ZStack + opacity 保活，切 Tab 不销毁、不重载、不丢 localStorage 状态。
struct RootView: View {
    @StateObject private var store = PageStore()
    @State private var selection: Int = 0
    @State private var booted: Set<Int> = []

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
            .background(store.pages[selection].spec.dark ? WFColor.bg : WFColor.lightBG)

            WFTabBar(selection: $selection)
        }
        .background(WFColor.bg)
        .onAppear { boot(0) }
        .onChange(of: selection) { value in boot(value) }
    }

    /// 首次进入某 Tab 才起它的服务并加载页面；之后常驻不再动。
    private func boot(_ index: Int) {
        guard index >= 0, index < store.pages.count else { return }
        guard !booted.contains(index) else { return }
        booted.insert(index)
        store.pages[index].start()
    }
}

final class PageStore: ObservableObject {
    let pages: [PageController] = PageCatalog.all.map { PageController(spec: $0) }
}

/// UIViewControllerRepresentable 不行（要的是裸 view），这里直接把 controller 持有的 WKWebView 塞进 SwiftUI。
struct PageContainer: UIViewRepresentable {
    let controller: PageController

    func makeUIView(context: Context) -> WKWebView { controller.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        // 保活：SwiftUI 任何重排都不重建、不触发 reload
    }
}

/// 自绘底部栏。
/// 系统的 .tabItem 只吃「一个 Image + 一个 Text」——VStack 里放两行 Text 会被丢弃，
/// 且拿不到图标，所以这里用原生 HStack 手写：6 项等分、图标 + 两行文字、选中紫色高亮。
struct WFTabBar: View {
    @Binding var selection: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(PageCatalog.all.enumerated()), id: \.offset) { index, page in
                tabButton(index: index, page: page)
            }
        }
        .padding(.top, 7)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity)
        .background(
            WFColor.bar
                .overlay(
                    Rectangle()
                        .fill(Color.white.opacity(0.08))
                        .frame(height: 0.5),
                    alignment: .top
                )
                .ignoresSafeArea(edges: .bottom)
        )
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
                    .font(.system(size: 10.5, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(page.line2)
                    .font(.system(size: 9, weight: .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .foregroundColor(active ? WFColor.purple : WFColor.dim)
            .frame(maxWidth: .infinity, minHeight: 54, alignment: .center)
            .contentShape(Rectangle())
        }
        .buttonStyle(WFTabButtonStyle())
        .accessibilityLabel("\(page.line1)\(page.line2)")
        .accessibilityAddTraits(active ? [.isSelected, .isButton] : [.isButton])
    }
}

private struct WFTabButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.55 : 1.0)
    }
}
