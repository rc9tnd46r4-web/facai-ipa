#!/usr/bin/env bash
# 在 macOS（GitHub Actions）上编译未签名的 发财.app 并打成 ipa
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build"
APP="$BUILD/Facai.app"
OUT="$ROOT/build/out"

rm -rf "$BUILD"
mkdir -p "$APP/Web" "$OUT"

echo "== 1/5 编译 Swift（arm64 / iOS 15+）"
SDK_PATH="$(xcrun --sdk iphoneos --show-sdk-path)"
echo "SDK: $SDK_PATH"

xcrun --sdk iphoneos swiftc \
  -sdk "$SDK_PATH" \
  -target arm64-apple-ios15.0 \
  -O -parse-as-library \
  -module-name Facai \
  -Xlinker -rpath -Xlinker /usr/lib/swift \
  -o "$APP/Facai" \
  "$ROOT"/App/Sources/*.swift \
  -framework UIKit -framework SwiftUI -framework WebKit -framework Network

echo "== 2/5 拷贝 Info.plist 与网页资源"
cp "$ROOT/App/Info.plist" "$APP/Info.plist"
cp "$ROOT"/Web/*.html "$ROOT"/Web/*.css "$ROOT"/Web/*.js "$APP/Web/"
printf 'APPL????' > "$APP/PkgInfo"

echo "== 3/5 编译图标（Assets.car）"
xcrun actool \
  --output-format binary1 \
  --platform iphoneos \
  --minimum-deployment-target 15.0 \
  --target-device iphone \
  --app-icon AppIcon \
  --output-partial-info-plist "$BUILD/asset-partial.plist" \
  --compress-pngs \
  --compile "$APP" \
  "$ROOT/App/Assets.xcassets" >/dev/null

echo "== 4/5 合并图标信息到 Info.plist"
python3 - "$BUILD/asset-partial.plist" "$APP/Info.plist" <<'PY'
import plistlib, sys
partial_path, info_path = sys.argv[1], sys.argv[2]
partial = plistlib.load(open(partial_path, 'rb'))
info = plistlib.load(open(info_path, 'rb'))
for key in ('CFBundleIcons', 'CFBundleIcons~ipad'):
    if key in partial:
        info[key] = partial[key]
plistlib.dump(info, open(info_path, 'wb'), fmt=plistlib.FMT_BINARY)
print('图标键：', [k for k in info if k.startswith('CFBundleIcon')])
PY

echo "== 5/5 打包 ipa"
mkdir -p "$BUILD/Payload"
cp -R "$APP" "$BUILD/Payload/"
(cd "$BUILD" && /usr/bin/zip -qry "$OUT/Facai-unsigned.ipa" Payload)

echo "---- 产物 ----"
ls -lh "$OUT"
unzip -l "$OUT/Facai-unsigned.ipa" | head -20
echo "---- 二进制 ----"
file "$APP/Facai"
