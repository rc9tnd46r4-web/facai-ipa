#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通过 GitHub REST API 推送整个项目目录（本机 git 协议被墙，只能走 api.github.com）。

用法：
    GH_TOKEN=... python scripts/gh_push.py [owner/repo] [branch] [message]
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.github.com"
ROOT = Path(__file__).resolve().parents[1]

REPO = sys.argv[1] if len(sys.argv) > 1 else "rc9tnd46r4-web/facai-ipa"
BRANCH = sys.argv[2] if len(sys.argv) > 2 else "main"
MESSAGE = sys.argv[3] if len(sys.argv) > 3 else "feat: 发财 App（5 Tab 版本）"

SKIP_DIRS = {"node_modules", ".git", "build", "preview/shots", "__pycache__"}
SKIP_FILES = {"package-lock.json", "package.json"}


def token() -> str:
    value = os.environ.get("GH_TOKEN")
    if not value:
        raise SystemExit("缺少环境变量 GH_TOKEN")
    return value


def call(method: str, path: str, payload=None, retries: int = 4):
    data = json.dumps(payload).encode() if payload is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(API + path, data=data, method=method)
        req.add_header("Authorization", "token " + token())
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "facai-build")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")
            if exc.code in (500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise SystemExit(f"{method} {path} -> {exc.code}\n{detail}")
    return {}


def collect_files():
    files = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel in SKIP_FILES or any(rel == d or rel.startswith(d + "/") for d in SKIP_DIRS):
            continue
        files.append((rel, path))
    return files


def main() -> int:
    # 仓库存在性 + 默认分支头
    repo = call("GET", f"/repos/{REPO}")
    head_sha = None
    try:
        ref = call("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")
        head_sha = ref["object"]["sha"]
        print(f"当前 {BRANCH} 头：{head_sha[:8]}")
    except SystemExit:
        print(f"{BRANCH} 分支还不存在，将创建首个提交")

    files = collect_files()
    print(f"待上传文件 {len(files)} 个")

    tree = []
    for rel, path in files:
        raw = path.read_bytes()
        blob = call("POST", f"/repos/{REPO}/git/blobs",
                    {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print(f"  blob {rel} ({len(raw)} B)")

    tree_payload = {"tree": tree}
    new_tree = call("POST", f"/repos/{REPO}/git/trees", tree_payload)

    commit_payload = {"message": MESSAGE, "tree": new_tree["sha"]}
    if head_sha:
        commit_payload["parents"] = [head_sha]
    commit = call("POST", f"/repos/{REPO}/git/commits", commit_payload)
    print(f"新提交：{commit['sha'][:8]}")

    if head_sha:
        call("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": commit["sha"], "force": True})
    else:
        call("POST", f"/repos/{REPO}/git/refs", {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})
    print(f"已更新 {REPO}@{BRANCH} -> {commit['sha'][:8]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
