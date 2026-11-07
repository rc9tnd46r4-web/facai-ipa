#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 Git Data API 一次性推送整个工程（GitHub 网页/HTTPS git 被墙，只能走 api.github.com）。

用法：GH_TOKEN=xxx python3 tools/push_github.py [repo_name]
流程：blobs -> tree -> commit -> ref，一次提交完成。
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
TOKEN = os.environ.get("GH_TOKEN", "").strip()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"node_modules", "out", ".cache", ".git", "build", "dist"}
SKIP_FILES = {"package-lock.json", ".DS_Store"}


def call(method, path, payload=None, ok=(200, 201, 204)):
    url = path if path.startswith("http") else API + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "token " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "facai-ipa-builder")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read()
            return resp.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as err:
        body = err.read()
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body.decode("utf-8", "replace")}
        if err.code in ok:
            return err.code, parsed
        raise RuntimeError(f"{method} {path} -> {err.code}: {parsed}")


def collect_files():
    files = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            if name in SKIP_FILES:
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, ROOT).replace("\\", "/")
            if rel.startswith(".git/"):
                continue
            files.append((rel, full))
    return sorted(files)


def main():
    if not TOKEN:
        print("GH_TOKEN missing")
        return 2
    repo = sys.argv[1] if len(sys.argv) > 1 else "facai-ipa"

    _, me = call("GET", "/user")
    owner = me["login"]
    print("[push] owner:", owner)

    status, _ = call("GET", f"/repos/{owner}/{repo}", ok=(200, 404))
    if status == 404:
        try:
            status, _ = call("POST", "/user/repos", {
                "name": repo,
                "private": True,
                "description": "Facai iOS unsigned ipa build (SwiftUI + per-tab WKWebView + local http)",
                "auto_init": False,
                "has_issues": False,
                "has_wiki": False,
            })
            print("[push] created private repo:", repo)
        except RuntimeError as exc:
            print("[push] private repo failed, retry public:", exc)
            call("POST", "/user/repos", {"name": repo, "private": False, "auto_init": False})
            print("[push] created public repo:", repo)
    else:
        print("[push] repo exists:", repo)

    # 现有分支 / 树
    parent = None
    base_tree = None
    status, ref = call("GET", f"/repos/{owner}/{repo}/git/ref/heads/main", ok=(200, 404, 409))
    if status == 200 and ref:
        parent = ref["object"]["sha"]
        _, commit = call("GET", f"/repos/{owner}/{repo}/git/commits/{parent}")
        base_tree = commit["tree"]["sha"]
        print("[push] existing head:", parent[:8])

    files = collect_files()
    print("[push] files:", len(files))

    tree = []
    for rel, full in files:
        with open(full, "rb") as fh:
            raw = fh.read()
        _, blob = call("POST", f"/repos/{owner}/{repo}/git/blobs", {
            "content": base64.b64encode(raw).decode(),
            "encoding": "base64",
        })
        mode = "100755" if rel.endswith(".sh") else "100644"
        tree.append({"path": rel, "mode": mode, "type": "blob", "sha": blob["sha"]})
        print(f"  blob {rel} ({len(raw)} bytes)")

    tree_payload = {"tree": tree}
    if base_tree:
        tree_payload["base_tree"] = base_tree
    _, new_tree = call("POST", f"/repos/{owner}/{repo}/git/trees", tree_payload)

    commit_payload = {
        "message": "feat: 发财 iOS 工程（SwiftUI 五 Tab + 每页本机 HTTP 服务 + 适配注入）",
        "tree": new_tree["sha"],
    }
    if parent:
        commit_payload["parents"] = [parent]
    _, new_commit = call("POST", f"/repos/{owner}/{repo}/git/commits", commit_payload)
    sha = new_commit["sha"]

    if parent:
        call("PATCH", f"/repos/{owner}/{repo}/git/refs/heads/main", {"sha": sha, "force": True})
    else:
        call("POST", f"/repos/{owner}/{repo}/git/refs", {"ref": "refs/heads/main", "sha": sha})

    print("[push] commit:", sha)
    print("[push] repo:", f"https://github.com/{owner}/{repo}")
    time.sleep(1)
    # 触发 workflow_dispatch（push 也会触发，这里只做兜底，失败忽略）
    try:
        call("POST", f"/repos/{owner}/{repo}/actions/workflows/build-ipa.yml/dispatches",
             {"ref": "main"}, ok=(204, 200))
        print("[push] workflow dispatched")
    except Exception as exc:
        print("[push] dispatch skipped:", exc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
