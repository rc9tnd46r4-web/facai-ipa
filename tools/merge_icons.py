#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 actool 产出的图标键合并回 Info.plist。

actool --output-partial-info-plist 会生成 CFBundleIcons / CFBundleIcons~ipad /
CFBundleIconName 等键，这里只挑图标相关键做递归合并，避免把别的构建设置带歪。
"""
import plistlib
import sys
from pathlib import Path

ICON_PREFIXES = ("CFBundleIcon", "CFBundlePrimaryIcon")


def wanted(key: str) -> bool:
    return any(key.startswith(prefix) for prefix in ICON_PREFIXES)


def merge(dst: dict, src: dict) -> None:
    for key, value in src.items():
        if isinstance(value, dict) and isinstance(dst.get(key), dict):
            merge(dst[key], value)
        else:
            dst[key] = value


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: merge_icons.py <partial-info.plist> <Info.plist>")
        return 2

    partial_path, info_path = Path(sys.argv[1]), Path(sys.argv[2])
    with partial_path.open("rb") as fh:
        partial = plistlib.load(fh)
    with info_path.open("rb") as fh:
        info = plistlib.load(fh)

    icon_keys = {k: v for k, v in partial.items() if wanted(k)}
    if not icon_keys:
        print("[merge_icons] ERROR: actool partial plist has no icon keys")
        print("[merge_icons] keys seen:", ", ".join(partial.keys()))
        return 1

    merge(info, icon_keys)
    with info_path.open("wb") as fh:
        plistlib.dump(info, fh, sort_keys=False)

    print("[merge_icons] merged:", ", ".join(sorted(icon_keys.keys())))
    print("[merge_icons] CFBundleIcons:", info.get("CFBundleIcons"))
    print("[merge_icons] CFBundleIconName:", info.get("CFBundleIconName"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
