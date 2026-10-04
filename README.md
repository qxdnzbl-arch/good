# 自建免费 · 快速 · 稳定的 VPN 节点

一条命令在你自己的服务器上部署 **Xray VLESS + REALITY + Vision**，再开启 **BBR** 加速。

- **快**：Vision 流控几乎没有额外开销，BBR 改善高延迟线路上的吞吐
- **稳**：REALITY 借用真实大站（默认 `www.microsoft.com`）的 TLS 握手，不需要域名和证书，流量特征也不明显，比较难被识别封锁
- **免费**：用云厂商的永久免费服务器，脚本和软件都开源

> 这里没有现成的“公共免费 VPN”。网上的公共免费节点大多又慢又不稳定，还有隐私风险。最靠谱的“免费”方式是自己搭一台：服务器只有你自己用，速度和稳定性都由你掌控。

---

## 1. 准备一台免费服务器

| 厂商 | 免费内容 | 备注 |
|---|---|---|
| **Oracle Cloud（推荐）** | 永久免费：2 台 AMD 小机 或 ARM 最多 4 核 24G，每月 10TB 流量 | 注册要绑信用卡验证（不扣费），建议选日本 / 韩国 / 新加坡 / 美西区域 |
| Google Cloud | 永久免费 e2-micro（仅限美国部分区域） | 每月只有 1GB 免费出站流量（不含中国、澳大利亚方向），超出收费 |
| AWS | 新用户 12 个月免费 t2/t3.micro | 每月 100GB 免费出站流量 |
| Azure | 新用户 12 个月免费 B1s | 需信用卡 |

系统选 **Ubuntu 22.04/24.04** 或 **Debian 12**。

**务必在云控制台的安全组 / 安全列表放行 TCP 443 端口**（Oracle：VCN → 安全列表 → 添加入站规则，源 `0.0.0.0/0`，TCP，目标端口 443）。

## 2. 一键安装

SSH 登录服务器后执行：

```bash
sudo -i
curl -fsSL https://raw.githubusercontent.com/qxdnzbl-arch/good/main/install.sh -o install.sh
bash install.sh
```

> 如果仓库是私有的，或者脚本还没合并到 `main`，可以直接把 `install.sh` 的内容复制到服务器上执行。

装完会输出：

- 一条 `vless://...` **分享链接**
- 一个**二维码**（手机扫码直接导入）
- 一段 **Clash Meta / mihomo** 配置

以后想再看一遍：`bash install.sh show`
卸载：`bash install.sh uninstall`

自定义参数（可选）：

```bash
PORT=8443 SNI=www.apple.com NAME=tokyo bash install.sh
```

## 3. 客户端

| 平台 | 推荐客户端 | 导入方式 |
|---|---|---|
| Windows | [v2rayN](https://github.com/2dust/v2rayN/releases) / [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev/releases) | 复制链接 → 从剪贴板导入 |
| macOS | [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev/releases) / [v2rayN](https://github.com/2dust/v2rayN/releases) | 同上 |
| Android | [v2rayNG](https://github.com/2dust/v2rayNG/releases) / [Hiddify](https://github.com/hiddify/hiddify-app/releases) | 扫码或剪贴板导入 |
| iOS | Shadowrocket / Stash / Hiddify（需外区 Apple ID） | 扫码导入 |
| Linux | [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev/releases) / [Hiddify](https://github.com/hiddify/hiddify-app/releases) | 剪贴板导入 |

导入后选中节点，开启 **系统代理** 或 **TUN 模式**；路由建议选“绕过大陆”，国内网站直连更快。

## 4. 打包你自己的安卓 App（可选）

仓库里自带 GitHub Actions 打包流程（`.github/workflows/build-apk.yml`），基于开源的 v2rayNG，改成**你自己的名字、包名和图标颜色**，还能把你的节点内置进去：装好打开就有节点，点一下就能连。

1. **内置节点（推荐）**：仓库 → Settings → Secrets and variables → Actions → New repository secret
   名称填 `PRESET_NODE`，值填 `install.sh` 输出的 `vless://...` 链接。
   不要把链接写进代码：这个仓库是公开的。
2. **打包**：仓库 → Actions → Build APK → Run workflow，可以填 App 名称、包名后缀、图标颜色，大约 15～25 分钟完成。
3. **下载**：打开那次运行记录，页面底部 Artifacts 里下载 `vpn-arm64-v8a`（大多数手机用这个）或 `vpn-universal`（通用版），解压后把 apk 装到手机上。

固定签名（可选，以后升级 App 时不用先卸载旧版）：在自己电脑上生成证书并添加两个 Secret：

```bash
keytool -genkeypair -keystore release.jks -alias release -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=VPN"
base64 -w0 release.jks   # 输出内容填到 Secret: KEYSTORE_BASE64
# 证书密码填到 Secret: KEYSTORE_PASSWORD
```

> 节点信息会打包进 APK，别把 APK 发给不信任的人。v2rayNG 使用 GPL-3.0 协议，这个定制版同样遵守该协议。

## 5. 常见问题

**连不上？** 按这个顺序排查：
1. 云控制台安全组是否放行了 TCP 443
2. 服务器上 `systemctl status xray` 是否 `active (running)`
3. 本地 `telnet 服务器IP 443` 能否连通
4. 客户端里的链接是否完整导入（`pbk`、`sid`、`flow` 参数都要有）

**速度慢？**
- 换个离你近的区域（日本 / 韩国 / 新加坡 / 香港通常延迟最低）
- 确认 BBR 生效：`sysctl net.ipv4.tcp_congestion_control` 应该输出 `bbr`
- 换一个 SNI，例如 `SNI=www.apple.com` 或 `SNI=dl.google.com`，然后重装

**IP 被封？** 在云控制台给实例换一个公网 IP（Oracle 可以解绑后重新分配临时 IP），然后执行 `bash install.sh` 重新生成配置。

**查看日志：** `journalctl -u xray -e`

## 安全提示

- 分享链接相当于密码，不要发到公开场合
- 请遵守你所在地区的法律法规
