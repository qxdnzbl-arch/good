#!/usr/bin/env bash
# 一键部署「木马小屋」：Node.js 应用 + Caddy 自动 HTTPS
# 用法:
#   bash install.sh              安装 / 重装（会问你 API Key 和密码）
#   bash install.sh update       拉取最新代码并重启
#   bash install.sh password     修改登录密码
#   bash install.sh key          修改 Anthropic API Key
#   bash install.sh uninstall    卸载（聊天记录、歌曲保留在 /var/lib/muma）
# 可选环境变量:
#   DOMAIN=chat.example.com      你自己的域名（不填就用 <IP>.sslip.io）
#   HTTPS_PORT=8443              网页端口（443 一般被 VPN 占着，所以默认 8443）
#   BRANCH=main                  从仓库的哪个分支安装
set -euo pipefail

REPO="${REPO:-https://github.com/qxdnzbl-arch/good.git}"
BRANCH="${BRANCH:-main}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
APP_PORT=3000
SRC=/opt/muma-src
APP="$SRC/app"
DATA=/var/lib/muma
ENV_FILE=/etc/muma.env
UNIT=/etc/systemd/system/muma.service

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '\033[36m==> %s\033[0m\n' "$*"; }
die()   { red "错误: $*"; exit 1; }

require_root() { [[ $EUID -eq 0 ]] || die "请用 root 运行 (sudo -i 后再执行)"; }

public_ip() {
  local ip
  for url in https://api.ipify.org https://ifconfig.me https://ipv4.icanhazip.com; do
    ip=$(curl -4 -fsS --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]') || true
    [[ -n $ip ]] && { echo "$ip"; return; }
  done
  die "获取公网 IP 失败"
}

open_port() {
  local port=$1
  info "放行端口 $port/tcp"
  if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow "$port"/tcp; fi
  if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="$port"/tcp; firewall-cmd --reload
  fi
  # Oracle Cloud 等镜像自带 iptables REJECT 规则, 需要插到最前面
  if command -v iptables >/dev/null; then
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
    command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
  fi
}

install_deps() {
  command -v apt-get >/dev/null || die "目前只支持 Debian / Ubuntu"
  info "安装依赖"
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates gnupg iptables debian-keyring debian-archive-keyring apt-transport-https
  local major=0
  command -v node >/dev/null && major=$(node -p 'process.versions.node.split(".")[0]')
  if (( major < 20 )); then
    info "安装 Node.js 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  fi
  if ! command -v caddy >/dev/null; then
    info "安装 Caddy（负责 HTTPS 证书）"
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
  fi
}

fetch_code() {
  info "下载代码（分支 $BRANCH）"
  if [[ -d $SRC/.git ]]; then
    git -C "$SRC" fetch --depth 1 origin "$BRANCH"
    git -C "$SRC" checkout -q -B "$BRANCH" FETCH_HEAD
  else
    git clone --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
  fi
  (cd "$APP" && npm ci --omit=dev --no-audit --no-fund)
}

ask_secret() {
  local prompt=$1 var
  while :; do
    read -rsp "$prompt" var </dev/tty; echo >&2
    [[ -n $var ]] && { printf '%s' "$var"; return; }
    red "不能为空" >&2
  done
}

set_env() {
  local key=$1 val=$2
  touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  grep -v "^$key=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
}

write_service() {
  id muma >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin muma
  mkdir -p "$DATA"; chown -R muma:muma "$DATA"
  set_env HOST 127.0.0.1
  set_env PORT "$APP_PORT"
  set_env DATA_DIR "$DATA"
  grep -q '^TZ_DISPLAY=' "$ENV_FILE" || set_env TZ_DISPLAY Asia/Shanghai
  cat > "$UNIT" <<EOF
[Unit]
Description=Muma companion chat
After=network-online.target

[Service]
User=muma
WorkingDirectory=$APP
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable muma >/dev/null 2>&1
  systemctl restart muma
  sleep 1
  systemctl is-active --quiet muma || die "应用启动失败, 查看日志: journalctl -u muma -e"
}

write_caddy() {
  local host=$1
  info "配置 HTTPS：https://$host:$HTTPS_PORT"
  cat > /etc/caddy/Caddyfile <<EOF
{
	https_port $HTTPS_PORT
}

$host:$HTTPS_PORT {
	encode gzip
	request_body {
		max_size 64MB
	}
	reverse_proxy 127.0.0.1:$APP_PORT {
		flush_interval -1
	}
}
EOF
  systemctl enable caddy >/dev/null 2>&1
  systemctl restart caddy
}

do_install() {
  require_root
  install_deps
  fetch_code
  if ! grep -q '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null; then
    set_env ANTHROPIC_API_KEY "$(ask_secret '粘贴你的 Anthropic API Key（输入时不显示）: ')"
  fi
  if ! grep -q '^APP_PASSWORD=' "$ENV_FILE" 2>/dev/null; then
    set_env APP_PASSWORD "$(ask_secret '给小屋设一个登录密码（输入时不显示）: ')"
  fi
  write_service
  local host="${DOMAIN:-}"
  [[ -n $host ]] || host="$(public_ip | tr . -).sslip.io"
  open_port 80
  open_port "$HTTPS_PORT"
  write_caddy "$host"
  echo "DOMAIN_IN_USE=$host" > /etc/muma.host
  green ""
  green "装好了！用手机浏览器打开："
  green "  https://$host:$HTTPS_PORT"
  echo
  echo "第一次打开时 Caddy 要申请证书，可能要等十几秒。"
  echo "打不开的话，先确认云服务器的安全组 / 安全列表放行了 TCP 80 和 $HTTPS_PORT。"
}

case "${1:-install}" in
  install)  do_install ;;
  update)   require_root; fetch_code; systemctl restart muma; green "已更新并重启" ;;
  password) require_root; set_env APP_PASSWORD "$(ask_secret '新密码: ')"; systemctl restart muma; green "密码改好了" ;;
  key)      require_root; set_env ANTHROPIC_API_KEY "$(ask_secret '新的 API Key: ')"; systemctl restart muma; green "API Key 改好了" ;;
  uninstall)
    require_root
    systemctl disable --now muma 2>/dev/null || true
    rm -f "$UNIT"; systemctl daemon-reload
    rm -rf "$SRC"
    green "已卸载。聊天记录和歌曲还在 $DATA，不需要的话手动删除；Caddy 没有卸载。" ;;
  *) die "未知命令: $1" ;;
esac
