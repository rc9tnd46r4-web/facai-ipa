#!/usr/bin/env bash
# 组装未签名 ipa：Products/*.app -> Payload/xxx.app -> zip -> dist/xxx.ipa
set -euo pipefail
cd "$(dirname "$0")/.."

APP_PATH="$(find build/dd/Build/Products/Release-iphoneos -maxdepth 1 -name '*.app' -print -quit)"
if [ -z "${APP_PATH}" ]; then
  echo "[make_ipa] .app not found"
  exit 1
fi

NAME="$(basename "${APP_PATH}" .app)"
rm -rf build/Payload dist
mkdir -p build/Payload dist
cp -R "${APP_PATH}" "build/Payload/${NAME}.app"

# 图标：工程里没有 asset catalog 构建阶段，Assets.car 由 actool 单独产出后手工塞进去
if [ -f build/Assets/Assets.car ]; then
  cp build/Assets/Assets.car "build/Payload/${NAME}.app/Assets.car"
else
  echo "[make_ipa] warn: build/Assets/Assets.car missing"
fi

# 页面资源必须是 Web/ 目录（目录引用整体拷贝）
if [ ! -d "build/Payload/${NAME}.app/Web" ]; then
  echo "[make_ipa] fatal: Web/ missing in app bundle"
  ls -la "build/Payload/${NAME}.app"
  exit 1
fi
echo "[make_ipa] Web/ files:"
ls -la "build/Payload/${NAME}.app/Web"

plutil -lint "build/Payload/${NAME}.app/Info.plist"
plutil -p "build/Payload/${NAME}.app/Info.plist" | grep -A6 CFBundleIcons || true

( cd build && zip -qry "../dist/${NAME}-unsigned.ipa" Payload )

echo "[make_ipa] built:"
ls -lh dist/
unzip -l "dist/${NAME}-unsigned.ipa" | head -30
