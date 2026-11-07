#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 GitHub Git Data API 推送整棵工作树（blobs → tree → commit → ref）。

github.com 在本地被墙，所以不走 git push，全程只打 api.github.com。

用法：
  GITHUB_TOKEN=ghp_xxx python tools/push_github.py [--repo owner/name] [--branch main] [--dry-run]
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.github.com"
SKIP_DIRS = {"node_modules", "build", "dist", "qa/out", ".git", "qa/.cache", "_prev", "__pycache__"}
SKIP_FILES = {"qa/qa.log"}

ROOT = Path(__file__).resolve().parent.parent


def api(method, path, token, payload=None):
    url = path if path.startswith("http") else API + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "token " + token)
    req.add_header("Accept", "application/vnd.github+json")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:600]
        raise SystemExit(f"[push] HTTP {exc.code} {method} {url}\n{detail}")


def collect():
    files = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if any(rel == d or rel.startswith(d + "/") for d in SKIP_DIRS):
            continue
        if rel in SKIP_FILES:
            continue
        files.append((rel, path))
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPO", "rc9tnd46r4-web/facai-ipa"))
    parser.add_argument("--branch", default="main")
    parser.add_argument("--message", default="feat(facai): 五页 WKWebView 壳 + 本机取数服务 + 移动端适配")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        raise SystemExit("[push] GITHUB_TOKEN missing")

    files = collect()
    print(f"[push] {len(files)} files, repo={args.repo} branch={args.branch}")
    for rel, path in files:
        print(f"        {rel:52s} {path.stat().st_size:>8d}")
    if args.dry_run:
        return

    repo = args.repo
    # 1) 现有分支 HEAD（没有就基于空树建第一个 commit）
    parent_sha = None
    try:
        ref = api("GET", f"/repos/{repo}/git/ref/heads/{args.branch}", token)
        parent_sha = ref["object"]["sha"]
        print("[push] parent commit:", parent_sha[:10])
    except SystemExit:
        print("[push] branch missing, will create:", args.branch)

    # 2) blobs
    blobs = []
    for rel, path in files:
        content = base64.b64encode(path.read_bytes()).decode()
        res = api("POST", f"/repos/{repo}/git/blobs", token,
                  {"content": content, "encoding": "base64"})
        blobs.append({"path": rel, "mode": "100755" if os.access(path, os.X_OK) and rel.endswith(".sh")
                      else "100644", "type": "blob", "sha": res["sha"]})
    print(f"[push] blobs created: {len(blobs)}")

    # 3) tree（不带 base_tree → 整棵树就是本次内容，仓库里不会有历史垃圾）
    tree = api("POST", f"/repos/{repo}/git/trees", token, {"tree": blobs})
    print("[push] tree:", tree["sha"][:10], "entries:", len(tree["tree"]))

    # 4) commit
    payload = {"message": args.message, "tree": tree["sha"]}
    if parent_sha:
        payload["parents"] = [parent_sha]
    commit = api("POST", f"/repos/{repo}/git/commits", token, payload)
    print("[push] commit:", commit["sha"])

    # 5) ref
    if parent_sha:
        api("PATCH", f"/repos/{repo}/git/refs/heads/{args.branch}", token, {"sha": commit["sha"]})
    else:
        api("POST", f"/repos/{repo}/git/refs", token,
            {"ref": f"refs/heads/{args.branch}", "sha": commit["sha"]})
    print(f"[push] done → https://github.com/{repo}/tree/{args.branch}")
    print("[push] commit url:", commit["html_url"])


if __name__ == "__main__":
    sys.exit(main())
