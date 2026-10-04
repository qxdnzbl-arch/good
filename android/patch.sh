#!/usr/bin/env bash
# 把 v2rayNG 源码改成你自己的 App
# 用法: bash android/patch.sh <v2rayNG 源码目录>
# 环境变量:
#   APP_NAME     App 显示名称          (默认: Good VPN)
#   APP_ID       包名后缀, 小写字母数字 (默认: mine -> com.v2ray.ang.mine)
#   ICON_COLOR   图标背景色            (默认: #1E88E5)
# 内置节点在编译时通过环境变量 PRESET_NODE 读取, 不写进源码。
set -euo pipefail

SRC="${1:?用法: bash android/patch.sh <v2rayNG 源码目录>}"
export APP_NAME="${APP_NAME:-Good VPN}"
export APP_ID="${APP_ID:-mine}"
export ICON_COLOR="${ICON_COLOR:-#1E88E5}"

[[ $APP_ID =~ ^[a-z][a-z0-9]*$ ]] || { echo "APP_ID 只能是小写字母和数字, 且以字母开头: $APP_ID"; exit 1; }
[[ $ICON_COLOR =~ ^#[0-9A-Fa-f]{6}$ ]] || { echo "ICON_COLOR 格式应为 #RRGGBB: $ICON_COLOR"; exit 1; }

python3 - "$SRC/V2rayNG/app" <<'PY'
import os, pathlib, re, sys
from xml.sax.saxutils import escape

app = pathlib.Path(sys.argv[1])
name, app_id, color = os.environ["APP_NAME"], os.environ["APP_ID"], os.environ["ICON_COLOR"]

def patch(path, old, new, count=1):
    src = path.read_text(encoding="utf-8")
    if src.count(old) != count:
        sys.exit(f"{path} 结构变了, 找不到: {old!r}, 需要更新 patch.sh")
    path.write_text(src.replace(old, new), encoding="utf-8")

# 1. 包名: 保留 com.v2ray.ang 前缀 (内核用它判断 Xray 模式), 可以和官方版同时安装;
#    内置节点在编译时从环境变量 PRESET_NODE 读取
patch(app / "build.gradle.kts",
      'applicationId = "com.v2ray.ang"\n',
      f'applicationId = "com.v2ray.ang.{app_id}"\n'
      '        buildConfigField("String", "PRESET_NODE", "\\"" + (System.getenv("PRESET_NODE") ?: "")'
      '.trim().replace("\\\\", "").replace("\\"", "") + "\\"")\n')

# 2. App 名称 (所有语言)
xml_name = escape(name).replace("'", "\\'").replace('"', '\\"')
pattern = re.compile(r'(<string name="app_name" translatable="false">)[^<]*(</string>)')
for f in (app / "src/main/res").glob("values*/strings.xml"):
    src = f.read_text(encoding="utf-8")
    f.write_text(pattern.sub(lambda m: m.group(1) + xml_name + m.group(2), src), encoding="utf-8")

# 3. 图标背景色
bg = app / "src/main/res/values/ic_launcher_background.xml"
bg.write_text(re.sub(r'(name="ic_launcher_background">)#[0-9A-Fa-f]+', r'\g<1>' + color,
                     bg.read_text(encoding="utf-8")), encoding="utf-8")

# 4. 首次启动自动导入内置节点
patch(app / "src/main/java/com/v2ray/ang/AngApplication.kt",
      "        ThemeManager.refresh()\n",
      """        ThemeManager.refresh()

        importPresetNode()
    }

    /**
     * 首次启动时导入编译时内置的节点 (仅主进程, 且还没有任何节点时)。
     */
    private fun importPresetNode() {
        val preset = BuildConfig.PRESET_NODE
        if (preset.isBlank()) return
        if (android.os.Build.VERSION.SDK_INT >= 28 && Application.getProcessName() != packageName) return
        if (com.v2ray.ang.handler.MmkvManager.decodeAllServerList().isNotEmpty()) return
        com.v2ray.ang.handler.AngConfigManager.importBatchConfig(
            preset, AppConfig.DEFAULT_SUBSCRIPTION_ID, true
        )
""")
PY

echo "已定制: $APP_NAME (com.v2ray.ang.$APP_ID)"
