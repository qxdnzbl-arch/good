# 木马小屋

一个部署在你自己服务器上的 Claude 陪伴聊天应用。打开是一间可以拖动、点击的 3D 粉色小屋，屋里的东西就是功能入口。

| 屋里的东西 | 功能 | 状态 |
|---|---|---|
| 信封 | **聊天**：消息逐字显示，可以选模型和思考程度，能给回复点爱心 | ✅ 第一批 |
| 唱片机 | **一起听**：上传自己的歌和 `.lrc` 歌词，转动的黑胶，进度条，随机播放 / 单曲循环；边听边聊时，Claude 知道你们正在听哪首、唱到哪一句 | ✅ 第一批 |
| 日记本 | **记忆**：Claude 聊天时会自己记下重要的事，你也可以手动写、改、删。每次聊天都会带上这些记忆 | ✅ 第一批 |
| 许愿瓶 | **许愿**：Claude 想要你陪他做的小事会放进瓶子，瓶里星星的数量跟着愿望变；点“做好了”，他下次聊天会知道 | ✅ 第一批 |
| 台历、书架、骰子、电话 | 日历、共读、小游戏、通话 | 下一批 |

其他：
- 首页卡片显示「在一起 N 天」和生日倒数。
- 天色可以跟着时间变，也能手动选白天、傍晚、夜里；窗外可以下雨或下雪。
- 歌曲在不同页面之间切换时不会断。
- 设置页能看到每天用了多少 token、估算花了多少钱。

## 你需要准备

1. **一台服务器**：装 VPN 的那台就可以，两者不冲突。VPN 占用 443 端口，小屋用 **8443**。
2. **Anthropic API Key**：在 Anthropic 控制台（console.anthropic.com）创建。API 按用量单独计费，**和 Claude 网页版的订阅是两回事**，需要另外充值。
3. **在云服务器控制台放行 TCP 80 和 8443 端口**（Oracle：VCN → 安全列表 → 添加入站规则）。80 端口用来自动申请 HTTPS 证书。

## 一键安装

SSH 登录服务器后执行：

```bash
sudo -i
curl -fsSL https://raw.githubusercontent.com/qxdnzbl-arch/good/ccr-103ebe64-wm3psr/app/install.sh -o muma.sh
BRANCH=ccr-103ebe64-wm3psr bash muma.sh
```

> 代码合并进 `main` 分支以后，把上面两处 `ccr-103ebe64-wm3psr` 换成 `main`，或者直接去掉 `BRANCH=...`。

安装过程中会让你粘贴 API Key，再设一个登录密码。装完会显示网址，类似：

```
https://1-2-3-4.sslip.io:8443
```

用手机浏览器打开、输入密码就能进屋。在 Safari 里选择“添加到主屏幕”，用起来就像一个 App。

没有域名也没关系：`sslip.io` 是一个免费服务，会把 `1-2-3-4.sslip.io` 解析到 `1.2.3.4`，Caddy 再为它自动申请 HTTPS 证书。有自己的域名的话，先把域名解析到服务器，安装时加上 `DOMAIN=你的域名`。

## 常用命令

```bash
bash muma.sh update     # 更新到最新代码
bash muma.sh password   # 改登录密码
bash muma.sh key        # 换 API Key
bash muma.sh uninstall  # 卸载（数据保留在 /var/lib/muma）
journalctl -u muma -e   # 看应用日志
```

## 费用

- 默认模型是 **Claude Opus 5.5**，思考程度默认是 **低**（回得快，也更省钱）。
- 在聊天页底部或设置里可以换成 Sonnet 5.5 或 Haiku 5.5。Haiku 最便宜，Opus 最聪明。
- 每次聊天都会带上最近 40 条消息和全部记忆，所以聊得越久，每条消息越贵一点。系统提示开了缓存，可以省掉一部分费用。
- 实际花了多少，看设置页的「额度」或者 Anthropic 控制台的账单。

## 数据和安全

- 所有数据（聊天记录、记忆、愿望、歌曲）都在你自己服务器的 `/var/lib/muma` 里，只会发给 Anthropic 用来生成回复。
- 整个小屋需要密码才能进。连续输错 8 次会锁定 1 分钟。
- API Key 和密码保存在 `/etc/muma.env`，只有 root 能读。

## 本地开发

```bash
cd app
npm install
ANTHROPIC_API_KEY=sk-ant-... APP_PASSWORD=test node server.js
# 打开 http://127.0.0.1:3000
```

技术栈：Node.js（无框架）、`@anthropic-ai/sdk`、three.js r128。前端是原生 JavaScript，不需要编译打包。
