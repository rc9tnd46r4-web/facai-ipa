import UIKit
import WebKit

// MARK: - AppDelegate

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = MainTabContainer()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

// MARK: - 双行文字底部 Tab 按钮

final class TabButton: UIControl {
    private let line1Label = UILabel()
    private let line2Label = UILabel()

    init(line1: String, line2: String) {
        super.init(frame: .zero)
        line1Label.text = line1
        line2Label.text = line2
        for label in [line1Label, line2Label] {
            label.textAlignment = .center
            label.numberOfLines = 1
            label.font = UIFont.systemFont(ofSize: 11, weight: .regular)
        }
        let stack = UIStackView(arrangedSubviews: [line1Label, line2Label])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 1
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        updateColors()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var isSelected: Bool {
        didSet { updateColors() }
    }

    private func updateColors() {
        let color = isSelected ? UIColor.systemRed : UIColor.secondaryLabel
        line1Label.textColor = color
        line2Label.textColor = color
        let weight: UIFont.Weight = isSelected ? .semibold : .regular
        line1Label.font = .systemFont(ofSize: 11, weight: weight)
        line2Label.font = .systemFont(ofSize: 11, weight: weight)
    }
}

// MARK: - 主容器：内容区 + 两行布局底部栏

final class MainTabContainer: UIViewController {
    private struct TabDef {
        let line1: String
        let line2: String
        let resource: String
    }

    // Tab 顺序：十维连错 → 十维连错v2 → 十维连对 → 十维连对v2 → 853生肖
    private let tabs: [TabDef] = [
        TabDef(line1: "十维", line2: "连错", resource: "liancuo"),
        TabDef(line1: "十维", line2: "连错V2", resource: "liancuov2"),
        TabDef(line1: "十维", line2: "连对", resource: "liandui"),
        TabDef(line1: "十维", line2: "连对V2", resource: "lianduiv2"),
        TabDef(line1: "853", line2: "生肖", resource: "shengxiao"),
    ]

    private let contentContainer = UIView()
    private let barBackground = UIView()
    private let barStack = UIStackView()
    private var buttons: [TabButton] = []
    private var currentVC: UIViewController?
    private var cachedVCs: [Int: UIViewController] = [:]
    private var selectedIndex = -1

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        contentContainer.translatesAutoresizingMaskIntoConstraints = false
        barBackground.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(contentContainer)
        view.addSubview(barBackground)

        barBackground.backgroundColor = .secondarySystemBackground
        let hairline = UIView()
        hairline.translatesAutoresizingMaskIntoConstraints = false
        hairline.backgroundColor = .separator
        hairline.alpha = 0.6
        barBackground.addSubview(hairline)

        barStack.axis = .horizontal
        barStack.distribution = .fillEqually
        barStack.translatesAutoresizingMaskIntoConstraints = false
        barBackground.addSubview(barStack)

        for tab in tabs {
            let button = TabButton(line1: tab.line1, line2: tab.line2)
            button.addTarget(self, action: #selector(tabTapped(_:)), for: .touchUpInside)
            buttons.append(button)
            barStack.addArrangedSubview(button)
        }

        NSLayoutConstraint.activate([
            contentContainer.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            contentContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            contentContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            contentContainer.bottomAnchor.constraint(equalTo: barBackground.topAnchor),

            barBackground.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            barBackground.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            barBackground.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            hairline.topAnchor.constraint(equalTo: barBackground.topAnchor),
            hairline.leadingAnchor.constraint(equalTo: barBackground.leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: barBackground.trailingAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 0.5),

            barStack.topAnchor.constraint(equalTo: barBackground.safeAreaLayoutGuide.topAnchor),
            barStack.leadingAnchor.constraint(equalTo: barBackground.leadingAnchor),
            barStack.trailingAnchor.constraint(equalTo: barBackground.trailingAnchor),
            barStack.heightAnchor.constraint(equalToConstant: 54),
        ])

        selectTab(0)
    }

    @objc private func tabTapped(_ sender: TabButton) {
        guard let index = buttons.firstIndex(of: sender) else { return }
        selectTab(index)
    }

    private func selectTab(_ index: Int) {
        guard index != selectedIndex else { return }
        selectedIndex = index
        for (i, button) in buttons.enumerated() {
            button.isSelected = (i == index)
        }

        if let old = currentVC {
            old.willMove(toParent: nil)
            old.view.removeFromSuperview()
            old.removeFromParent()
        }

        let vc: UIViewController
        if let cached = cachedVCs[index] {
            vc = cached
        } else {
            vc = PageWebViewController(resource: tabs[index].resource)
            cachedVCs[index] = vc
        }

        addChild(vc)
        vc.view.frame = contentContainer.bounds
        vc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        contentContainer.addSubview(vc.view)
        vc.didMove(toParent: self)
        currentVC = vc
    }
}

// MARK: - WKWebView 页面

final class PageWebViewController: UIViewController {
    private let resource: String
    private weak var webView: WKWebView?

    init(resource: String) {
        self.resource = resource
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.userContentController.addUserScript(
            WKUserScript(
                source: Self.viewportScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.backgroundColor = .systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        self.webView = webView
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        if let url = Bundle.main.url(forResource: resource, withExtension: "html") {
            webView?.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            let label = UILabel()
            label.text = "页面缺失: \(resource).html"
            label.textAlignment = .center
            view = label
        }
    }

    // 若页面缺 viewport meta 则注入，保证移动端适配
    private static let viewportScript = """
    (function() {
      if (!document.querySelector('meta[name="viewport"]')) {
        var m = document.createElement('meta');
        m.setAttribute('name', 'viewport');
        m.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=5');
        (document.head || document.documentElement).appendChild(m);
      }
    })();
    """
}
