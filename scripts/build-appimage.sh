#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------------------------------------
# 1️⃣ Ensure the Linux binary exists (pkg creates it)
# ----------------------------------------------------------------------
npm run build:pkg >/dev/null 2>&1

# ----------------------------------------------------------------------
# 2️⃣ Set up AppDir layout for AppImage
# ----------------------------------------------------------------------
APPDIR=$(mktemp -d)
mkdir -p "$APPDIR/usr/bin"
cp dist/pkg/rtq-demo-linux "$APPDIR/usr/bin/rtq-demo"

# Optional: copy an icon (replace with your own if you have one)
# mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"
# cp path/to/icon.png "$APPDIR/usr/share/icons/hicolor/256x256/apps/rtq-demo.png"

# Desktop entry (required by AppImageTool)
cat > "$APPDIR/rtq-demo.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=RTQ Demo
Exec=rtq-demo
Icon=rtq-demo
Categories=Utility;
EOF

# ----------------------------------------------------------------------
# 3️⃣ Download AppImageTool (once) if not present
# ----------------------------------------------------------------------
APPIMG_TOOL="$(pwd)/appimagetool-x86_64.AppImage"
if [ ! -f "$APPIMG_TOOL" ]; then
  wget -O "$APPIMG_TOOL" \
    https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x "$APPIMG_TOOL"
fi

# ----------------------------------------------------------------------
# 4️⃣ Build the AppImage
# ----------------------------------------------------------------------
"$APPIMG_TOOL" "$APPDIR" rtq-demo.AppImage
mv rtq-demo.AppImage dist/rtq-demo.AppImage

# ----------------------------------------------------------------------
# 5️⃣ Clean up temporary directory
# ----------------------------------------------------------------------
rm -rf "$APPDIR"

echo "✅ AppImage built at dist/rtq-demo.AppImage"
