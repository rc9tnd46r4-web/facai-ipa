#!/usr/bin/env bash
# 组装未签名 ipa：Products/Facai.app -> Payload/Facai.app -> zip -> dist/Facai-unsigned.ipa
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

# 图标：Assets.car 由 actool 单独产出，这里塞进 bundle（xcodebuild 也会编一份，显式覆盖更稳）
if [ -f build/Assets/Assets.car ]; then
  cp build/Assets/Assets.car "build/Payload/${NAME}.app/Assets.car"
else
  echo "[make_ipa] fatal: build/Assets/Assets.car missing"
  exit 1
fi

# 页面资源必须是 Web/ 目录，且 7 个文件齐全
if [ ! -d "build/Payload/${NAME}.app/Web" ]; then
  echo "[make_ipa] fatal: Web/ missing in app bundle"
  ls -la "build/Payload/${NAME}.app"
  exit 1
fi
COUNT="$(ls -1 "build/Payload/${NAME}.app/Web" | wc -l | tr -d ' ')"
echo "[make_ipa] Web/ files: ${COUNT}"
if [ "${COUNT}" -lt 7 ]; then
  echo "[make_ipa] fatal: Web/ incomplete"
  ls -la "build/Payload/${NAME}.app/Web"
  exit 1
fi

plutil -lint "build/Payload/${NAME}.app/Info.plist"

# 未签名 ipa：不带 _CodeSignature / embedded.mobileprovision
rm -rf "build/Payload/${NAME}.app/_CodeSignature"
rm -f  "build/Payload/${NAME}.app/embedded.mobileprovision"

( cd build && zip -qry "../dist/${NAME}-unsigned.ipa" Payload )

echo "[make_ipa] built:"
ls -lh dist/
unzip -l "dist/${NAME}-unsigned.ipa" | head -30
