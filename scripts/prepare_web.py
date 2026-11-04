#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把桌面版 HTML 复制到 App 的 Web 目录，并注入移动端适配层。

原始 HTML 不做破坏性修改，只是在副本里：
  1. 规范化 viewport（保留缩放能力 + viewport-fit=cover）
  2. 在 </head> 前注入移动端样式与行为脚本（带幂等标记）
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\Administrator\Desktop")
OUT = ROOT / "Web"

# (源文件, 输出文件名, 移动端样式表)
PAGES = [
    ("10维连错.html", "liancuo.html", "app-mobile-dark.css"),
    ("10维连错V2.html", "liancuov2.html", "app-mobile-dark.css"),
    ("10维连对.html", "liandui.html", "app-mobile-dark.css"),
    ("10维连对V2.html", "lianduiv2.html", "app-mobile-dark.css"),
    ("特别号生肖规律分析预测系统.html", "shengxiao.html", "app-mobile-light.css"),
]

MARK = "<!-- facai-app-inject -->"
VIEWPORT = ('<meta name="viewport" content="width=device-width, initial-scale=1.0, '
            'viewport-fit=cover">')


def inject(html: str, css: str) -> str:
    if MARK in html:
        return html

    # 规范化 viewport
    html2, n = re.subn(
        r'<meta[^>]*name=["\']viewport["\'][^>]*>',
        VIEWPORT,
        html,
        count=1,
        flags=re.I,
    )
    if n == 0:
        html2 = re.sub(r'(<head[^>]*>)', r'\1\n' + VIEWPORT, html, count=1, flags=re.I)

    snippet = (
        MARK + "\n"
        f'<link rel="stylesheet" href="{css}">\n'
        '<script src="app-shell.js" defer></script>\n'
    )
    if "</head>" in html2:
        html2 = html2.replace("</head>", snippet + "</head>", 1)
    else:
        html2 = snippet + html2
    return html2


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, out_name, css in PAGES:
        src = SRC / name
        if not src.exists():
            print(f"缺少源文件：{src}", file=sys.stderr)
            return 1
        text = src.read_text(encoding="utf-8")
        result = inject(text, css)
        (OUT / out_name).write_text(result, encoding="utf-8")
        print(f"{name} -> Web/{out_name}  ({len(text)} -> {len(result)} chars)")
    print("web 资源准备完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
