#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 actool 生成的 CFBundleIcons 等图标信息合并回 Info.plist（递归合并，后者覆盖前者）。"""
import plistlib
import sys


def merge(dst, src):
    for key, value in src.items():
        if isinstance(value, dict) and isinstance(dst.get(key), dict):
            merge(dst[key], value)
        else:
            dst[key] = value


def main():
    if len(sys.argv) != 3:
        print("usage: merge_icons.py <partial.plist> <Info.plist>")
        return 2
    partial_path, info_path = sys.argv[1], sys.argv[2]
    with open(partial_path, "rb") as fh:
        partial = plistlib.load(fh)
    with open(info_path, "rb") as fh:
        info = plistlib.load(fh)

    merge(info, partial)

    with open(info_path, "wb") as fh:
        plistlib.dump(info, fh, sort_keys=False)

    keys = [k for k in partial.keys()]
    print("[merge_icons] merged keys:", ", ".join(keys))
    print("[merge_icons] CFBundleIcons:", info.get("CFBundleIcons"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
