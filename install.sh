#!/usr/bin/env bash
# 一键部署 Xray VLESS + REALITY + Vision 代理节点
# 用法:
#   bash install.sh            安装 / 重装
#   bash install.sh show       显示客户端链接和二维码
#   bash install.sh uninstall  卸载
# 可选环境变量:
#   PORT=443                    监听端口
#   SNI=www.microsoft.com       伪装的目标网站 (需支持 TLS1.3 + H2)
#   NAME=my-vpn                 节点名称
set -euo pipefail

PORT="${PORT:-443}"
SNI="${SNI:-www.microsoft.com}"
NAME="${NAME:-reality-$(hostname -s)}"

XRAY_BIN=/usr/local/bin/xray
CONF_DIR=/usr/local/etc/xray
CONF_FILE="$CONF_DIR/config.json"
CLIENT_FILE="$CONF_DIR/client.txt"
XRAY_INSTALLER=https://github.com/XTLS/Xray-install/raw/main/install-release.sh

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '\033[36m==> %s\033[0m\n' "$*"; }
die()   { red "错误: $*"; exit 1; }

require_root() {
  [[ $EUID -eq 0 ]] || die "请用 root 运行 (sudo -i 后再执行)"
}

install_deps() {
  info "安装依赖"
  if command -v apt-get >/dev/null; then
    apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y curl openssl qrencode iptables
  elif command -v dnf >/dev/null; then
    dnf install -y epel-release || true
    dnf install -y curl openssl qrencode iptables
  elif command -v yum >/dev/null; then
    yum install -y epel-release || true
    yum install -y curl openssl qrencode iptables
  else
    die "不支持的系统, 请使用 Debian / Ubuntu / CentOS / Rocky / Alma"
  fi
}

install_xray() {
  info "安装 Xray-core (官方脚本)"
  bash -c "$(curl -fsSL "$XRAY_INSTALLER")" @ install
  [[ -x $XRAY_BIN ]] || die "Xray 安装失败"
}

enable_bbr() {
  if sysctl net.ipv4.tcp_congestion_control 2>/dev/null | grep -q bbr; then
    return
  fi
  info "开启 BBR 加速"
  cat >/etc/sysctl.d/99-bbr.conf <<'EOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
  sysctl --system >/dev/null || true
}

open_port() {
  info "放行端口 $PORT/tcp"
  if command -v ufw >/dev/null && ufw status | grep -q active; then
    ufw allow "$PORT"/tcp
  fi
  if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="$PORT"/tcp
    firewall-cmd --reload
  fi
  # Oracle Cloud 等镜像自带 iptables REJECT 规则, 需要插到最前面
  if command -v iptables >/dev/null; then
    iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT
    if command -v netfilter-persistent >/dev/null; then
      netfilter-persistent save >/dev/null 2>&1 || true
    fi
  fi
}

public_ip() {
  local ip
  for url in https://api.ipify.org https://ifconfig.me https://ipv4.icanhazip.com; do
    ip=$(curl -4 -fsS --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]') || true
    [[ -n $ip ]] && { echo "$ip"; return; }
  done
  die "无法获取公网 IP"
}

write_config() {
  info "生成密钥和配置"
  local uuid keys priv pub sid
  uuid=$("$XRAY_BIN" uuid)
  keys=$("$XRAY_BIN" x25519)
  # 新旧版本输出格式不同: "Private key:/Public key:" 或 "PrivateKey:/Password:"
  priv=$(awk -F': *' '/^Private/ {print $2}' <<<"$keys")
  pub=$(awk -F': *' '/^(Public|Password)/ {print $2}' <<<"$keys")
  [[ -n $priv && -n $pub ]] || die "无法解析 x25519 密钥: $keys"
  sid=$(openssl rand -hex 8)

  mkdir -p "$CONF_DIR"
  cat >"$CONF_FILE" <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": $PORT,
      "protocol": "vless",
      "settings": {
        "clients": [ { "id": "$uuid", "flow": "xtls-rprx-vision" } ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "dest": "$SNI:443",
          "serverNames": [ "$SNI" ],
          "privateKey": "$priv",
          "shortIds": [ "$sid" ]
        }
      },
      "sniffing": { "enabled": true, "destOverride": [ "http", "tls", "quic" ] }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ],
  "routing": {
    "rules": [
      { "type": "field", "ip": [ "geoip:private" ], "outboundTag": "block" }
    ]
  }
}
EOF

  local ip link
  ip=$(public_ip)
  link="vless://${uuid}@${ip}:${PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${SNI}&fp=chrome&pbk=${pub}&sid=${sid}&type=tcp#${NAME}"

  cat >"$CLIENT_FILE" <<EOF
$link

# Clash Meta / mihomo 配置片段 (proxies 下)
- name: $NAME
  type: vless
  server: $ip
  port: $PORT
  uuid: $uuid
  network: tcp
  tls: true
  udp: true
  flow: xtls-rprx-vision
  servername: $SNI
  client-fingerprint: chrome
  reality-opts:
    public-key: $pub
    short-id: $sid
EOF
  chmod 600 "$CONF_FILE" "$CLIENT_FILE"
}

start_xray() {
  info "启动 Xray"
  "$XRAY_BIN" run -test -config "$CONF_FILE" >/dev/null || die "配置校验失败"
  systemctl enable xray >/dev/null 2>&1
  systemctl restart xray
  sleep 1
  systemctl is-active --quiet xray || die "Xray 启动失败, 查看日志: journalctl -u xray -e"
}

show() {
  [[ -f $CLIENT_FILE ]] || die "尚未安装, 先运行: bash install.sh"
  local link
  link=$(head -n1 "$CLIENT_FILE")
  echo
  green "========== 安装完成 / 客户端信息 =========="
  echo
  echo "分享链接 (复制导入 v2rayN / v2rayNG / Shadowrocket / Clash Verge 等):"
  echo
  green "$link"
  echo
  if command -v qrencode >/dev/null; then
    echo "手机扫码导入:"
    qrencode -t ANSIUTF8 "$link"
  fi
  echo
  tail -n +2 "$CLIENT_FILE"
  echo
  echo "以上信息保存在: $CLIENT_FILE"
  echo "云服务商安全组 / 防火墙也必须放行 TCP $PORT 端口!"
}

uninstall() {
  info "卸载 Xray"
  bash -c "$(curl -fsSL "$XRAY_INSTALLER")" @ remove --purge || true
  rm -rf "$CONF_DIR"
  green "已卸载"
}

main() {
  require_root
  case "${1:-install}" in
    install)
      install_deps
      install_xray
      enable_bbr
      write_config
      open_port
      start_xray
      show
      ;;
    show) show ;;
    uninstall) uninstall ;;
    *) die "未知命令: $1 (可用: install | show | uninstall)" ;;
  esac
}

main "$@"
