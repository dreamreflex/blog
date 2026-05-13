---
title: '代理节点搭建技术文档'
description: 'Xray + Reality 代理节点搭建技术文档'
pubDate: '2026-04-10'
tags: ['技术方案', '代理', 'OpenClaw']
---

# Xray + Reality 代理节点搭建技术文档


## 目录

1. [架构概览](#1-架构概览)
2. [服务器环境准备](#2-服务器环境准备)
3. [安装与配置 Xray](#3-安装与配置-xray)
4. [Nginx 前置分流方案（可选）](#4-nginx-前置分流方案可选)
5. [SSL 证书申请](#5-ssl-证书申请)
6. [客户端配置（Clash Verge）](#6-客户端配置clash-verge)
7. [DNS 最佳实践](#7-dns-最佳实践)
8. [防探测与安全原理](#8-防探测与安全原理)
9. [故障排查手册](#9-故障排查手册)
10. [新节点快速部署检查清单](#10-新节点快速部署检查清单)

---

## 1. 架构概览

### 1.1 推荐架构（Nginx 前置 + 自有域名）

```
客户端 (Clash Verge)
    │
    │ VLESS + Reality + TLS 1.3
    ▼
服务器 :443
    │
    Nginx stream 模块（SNI 分流，TCP 层，不解密）
    │
    ├─ SNI: proxy.yourdomain.com ──▶ Xray :18443 ──▶ 互联网
    │
    ├─ SNI: www.yourdomain.com   ──▶ Nginx :8443  ──▶ 网站内容
    │
    └─ GFW 主动探测
           │ Xray 识别为非合法客户端
           └──▶ 回落到 Nginx :8443 ──▶ 返回真实网站内容
```

### 1.2 简化架构（无域名，直接 IP）

```
客户端 (Clash Verge)
    │
    │ VLESS + Reality + TLS 1.3
    ▼
服务器 :443 (Xray 直接监听)
    │
    └─ GFW 探测 ──▶ Xray 回落 ──▶ 转发至 www.microsoft.com
```

### 1.3 技术栈

| 组件 | 用途 | 版本要求 |
|------|------|----------|
| Xray | 服务端代理核心 | 最新版 |
| VLESS + Reality | 传输协议 | Xray ≥ 1.8 |
| Nginx (可选) | SNI 分流 / 建站 | ≥ 1.18（需 stream 模块）|
| Clash Verge | 客户端 | 需 Mihomo (Meta) 内核 |
| Let's Encrypt (可选) | SSL 证书 | - |

---

## 2. 服务器环境准备

### 2.1 推荐配置

- 操作系统：Ubuntu 22.04 LTS / Debian 12
- 位置：美国、日本、新加坡、德国等（避免国内云的海外节点，如阿里云国际）
- 最低配置：1 核 512MB 内存
- 验证服务器是否在海外：

```bash
curl -s https://ipinfo.io/json
# 确认 "country" 字段不是 "CN"
```

### 2.2 系统初始化

```bash
# 更新系统
apt update && apt upgrade -y

# 安装常用工具
apt install -y curl wget unzip ufw

# 配置防火墙
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# 确认时区（建议 UTC）
timedatectl set-timezone UTC
```

### 2.3 验证出站网络

```bash
# 确认服务器能访问 Google（出站畅通）
curl -I https://www.google.com --max-time 5

# 确认 TLS 1.3 可用
openssl s_client -connect www.google.com:443 -servername www.google.com </dev/null 2>&1 | head -5
```

---

## 3. 安装与配置 Xray

### 3.1 安装 Xray

```bash
# 官方一键安装脚本
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# 验证安装
xray version
```

### 3.2 生成密钥材料

```bash
# 生成 Reality 密钥对（X25519）
xray x25519
# 输出：
# Private key: <私钥，只放服务器>
# Public key:  <公钥，填入客户端>

# 生成 UUID
xray uuid
# 输出：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 生成随机 shortId（8位十六进制）
openssl rand -hex 4
# 输出：a1b2c3d4
```

> **安全提示**：私钥只放服务器，客户端只需公钥。记录好这三个值。

### 3.3 配置文件（简化架构）

适用于不使用 Nginx、直接用 IP 访问的场景。

编辑 `/usr/local/etc/xray/config.json`：

```json
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "<UUID>",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "www.microsoft.com:443",
          "xver": 0,
          "serverNames": [
            "www.microsoft.com"
          ],
          "privateKey": "<生成的私钥>",
          "shortIds": [
            "<生成的ID>"
          ]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "block"
    }
  ]
}
```

### 3.4 配置文件（Nginx 前置架构）

适用于有域名、与 Nginx 共存的场景，Xray 只监听内网端口。

```json
{
  "log": {
    "loglevel": "warning"
  },
  "dns": {
    "servers": [
      {
        "address": "https://1.1.1.1/dns-query",
        "domains": ["geosite:geolocation-!cn"]
      },
      "localhost"
    ]
  },
  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 18443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "你的UUID",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "127.0.0.1:8443",
          "xver": 1,
          "serverNames": [
            "proxy.yourdomain.com"
          ],
          "privateKey": "你的私钥",
          "shortIds": [
            "a1b2c3d4"
          ]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "block"
    }
  ]
}
```

### 3.5 启动与管理

```bash
# 启动并设置开机自启
systemctl start xray
systemctl enable xray

# 查看运行状态
systemctl status xray

# 实时查看日志（排障用）
journalctl -u xray -f --no-pager

# 重启
systemctl restart xray
```

### 3.6 伪装目标（dest）选择标准

`dest` 是 GFW 主动探测时 Xray 会回落转发的目标网站，需满足：

| 要求 | 说明 |
|------|------|
| 支持 TLS 1.3 | Reality 握手依赖此特性 |
| 支持 HTTP/2 | 流量特征更自然 |
| 知名大站 | 流量模式正常，不易被针对 |
| 与服务器延迟低 | 避免回落时响应过慢 |
| 未被墙 | SNI 本身不能被阻断 |

验证目标是否合格：

```bash
curl -vI https://www.apple.com 2>&1 | grep -E "TLSv|ALPN|HTTP/"
# 应输出 TLSv1.3 和 h2
```

推荐目标：`www.microsoft.com`、`www.apple.com`、`addons.mozilla.org`、`www.amazon.com`

---

## 4. Nginx 前置分流方案（可选）

适用于希望同时运行网站、且有独立域名的场景。

### 4.1 安装 Nginx（含 stream 模块）

```bash
apt install -y nginx

# 确认 stream 模块已加载
nginx -V 2>&1 | grep stream
# 应包含 --with-stream
```

### 4.2 DNS 解析配置

在域名服务商处添加 A 记录（都指向同一 IP）：

```
www.yourdomain.com      A  <服务器IP>
proxy.yourdomain.com    A  <服务器IP>
```

### 4.3 Nginx 完整配置

编辑 `/etc/nginx/nginx.conf`，**完整替换**为以下内容：

```nginx
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

# TCP 层 SNI 分流（必须在 http 块之外）
stream {
    map $ssl_preread_server_name $backend {
        proxy.yourdomain.com   127.0.0.1:18443;  # Xray
        www.yourdomain.com     127.0.0.1:8443;   # 网站
        default                127.0.0.1:8443;   # 兜底走网站
    }

    server {
        listen 443 reuseport;
        proxy_pass $backend;
        ssl_preread on;                  # 读取 SNI，不解密 TLS
        proxy_connect_timeout 5s;
        proxy_timeout 300s;
        proxy_buffer_size 16k;
    }
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;

    # 网站 HTTPS（监听内网，由 stream 转发）
    server {
        listen 127.0.0.1:8443 ssl;
        server_name www.yourdomain.com yourdomain.com;

        ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        root /var/www/html;
        index index.html index.htm;

        location / {
            try_files $uri $uri/ =404;
        }
    }

    # HTTP 跳转 HTTPS
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com proxy.yourdomain.com;
        return 301 https://$host$request_uri;
    }
}
```

### 4.4 验证与重启

```bash
# 检查配置语法
nginx -t

# 重启 Nginx
systemctl restart nginx
systemctl enable nginx

# 确认端口监听正常
ss -tlnp | grep -E '443|8443|18443'
```

### 4.5 回落网站内容

GFW 探测 `proxy.yourdomain.com` 时会看到你的网站，建议放置真实内容（博客、工具页、企业介绍等），避免使用 Nginx 默认页：

```bash
# 示例：放一个简单的 HTML 页面
echo "<html><body><h1>Welcome</h1></body></html>" > /var/www/html/index.html
```

---

## 5. SSL 证书申请

仅在使用自有域名时需要。

```bash
# 安装 certbot
apt install -y certbot

# 停止 Nginx（释放 80 端口）
systemctl stop nginx

# 申请证书（同时覆盖多个子域名）
certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  -d proxy.yourdomain.com \
  --agree-tos \
  --email your@email.com

# 证书路径
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem

# 启动 Nginx
systemctl start nginx

# 设置自动续期
systemctl enable certbot.timer
# 或手动测试续期
certbot renew --dry-run
```

---

## 6. 客户端配置（Clash Verge）

### 6.1 内核要求

必须使用 **Mihomo（Meta）内核** 才支持 Reality 协议。在 Clash Verge 设置中切换内核。

### 6.2 节点配置（简化架构，使用 IP）

```yaml
proxies:
  - name: "Reality节点"
    type: vless
    server: <服务器IP>
    port: 443
    uuid: <你的UUID>
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    servername: www.microsoft.com
    reality-opts:
      public-key: <你的公钥>
      short-id: a1b2c3d4
    client-fingerprint: chrome
```

### 6.3 节点配置（Nginx 前置架构，使用域名）

```yaml
proxies:
  - name: "Reality节点"
    type: vless
    server: proxy.yourdomain.com
    port: 443
    uuid: <你的UUID>
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    servername: proxy.yourdomain.com
    reality-opts:
      public-key: <你的公钥>
      short-id: a1b2c3d4
    client-fingerprint: chrome
```

### 6.4 完整 Profile 配置

```yaml
mixed-port: 7897
allow-lan: false
mode: rule
log-level: warning
ipv6: false

dns:
  enable: true
  listen: 0.0.0.0:1053
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - "*.lan"
    - localhost.ptlogin2.qq.com
    # 如有 hosts 文件重写的域名，在此添加，使 hosts 生效
    # - "*.example.com"
    # - "example.com"
  nameserver:
    - 223.5.5.5        # 阿里 DNS，解析国内域名
    - 119.29.29.29     # 腾讯 DNS
  fallback:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN
    ipcidr:
      - 240.0.0.0/4

proxies:
  - name: "Reality节点"
    type: vless
    server: <服务器IP或域名>
    port: 443
    uuid: <你的UUID>
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    servername: <www.microsoft.com 或 proxy.yourdomain.com>
    reality-opts:
      public-key: <你的公钥>
      short-id: a1b2c3d4
    client-fingerprint: chrome

proxy-groups:
  - name: "节点选择"
    type: select
    proxies:
      - Reality节点
      - DIRECT

  - name: "国内流量"
    type: select
    proxies:
      - DIRECT
      - Reality节点

rules:
  # 局域网直连
  - DOMAIN-SUFFIX,local,DIRECT
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,172.16.0.0/12,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT

  # 国内网站直连
  - GEOSITE,cn,国内流量
  - GEOIP,CN,国内流量

  # 其余走代理
  - MATCH,节点选择
```

### 6.5 关键设置说明

| 参数 | 推荐值 | 原因 |
|------|--------|------|
| `flow` | `xtls-rprx-vision` | 最强流量混淆，降低特征 |
| `client-fingerprint` | `chrome` | 模拟真实 Chrome TLS 指纹 |
| `enhanced-mode` | `fake-ip` | 防止 DNS 泄露 |
| `ipv6` | `false` | IPv6 易绕过代理规则 |
| 代理模式 | `Rule` | 国内直连，国外代理 |
| System Proxy | 开启 | 确保系统流量进入 Clash |

---

## 7. DNS 最佳实践

### 7.1 为什么需要配置 DNS

- **DNS 泄露**：不配置时，浏览器会直接向运营商 DNS 查询目标域名，暴露访问意图
- **DNS 污染**：国内 DNS 对 Google、Twitter 等返回错误 IP，导致代理失效
- **解析速度**：国内域名用国内 DNS，速度更快

### 7.2 fake-ip 工作原理

```
浏览器访问 google.com
    │
    ▼
Clash DNS (fake-ip 模式)
    │ 分配假 IP 198.18.x.x，记录映射
    ▼
浏览器向 198.18.x.x 发起连接
    │
    ▼
Clash 拦截，查映射表还原为 google.com
    │
    ▼
通过代理节点远端解析并连接 google.com
    │（本地完全不发出真实 DNS 查询）
```

### 7.3 hosts 文件与代理共存

如果本地 hosts 文件有域名重写（如 `*.example.com` 指向内网 IP），需在 `fake-ip-filter` 中排除这些域名，让 Clash 使用系统 DNS（会读取 hosts 文件）：

```yaml
dns:
  fake-ip-filter:
    - "*.example.com"
    - "example.com"
```

若这些域名解析后的 IP 需要走代理而非直连，还需在 rules 中添加对应规则。

### 7.4 服务器端 DNS 配置

服务器端 Xray 负责代替客户端解析国外域名，建议配置 DoH 防止出站 DNS 被污染：

```json
"dns": {
  "servers": [
    {
      "address": "https://1.1.1.1/dns-query",
      "domains": ["geosite:geolocation-!cn"]
    },
    {
      "address": "https://8.8.8.8/dns-query"
    },
    "localhost"
  ]
}
```

---

## 8. 防探测与安全原理

### 8.1 三层防御体系

**第一层：流量伪装（对抗被动监听）**

Reality 协议在 TLS 握手阶段完整复用真实网站的证书和握手流程。GFW 旁路监听时看到的是标准的 TLS 1.3 握手，与正常 HTTPS 流量无异。

**第二层：TLS 指纹伪装（对抗 DPI 检测）**

`client-fingerprint: chrome` 使用 uTLS 库，完整复刻 Chrome 浏览器的 TLS ClientHello 指纹，包括加密套件顺序、扩展字段、椭圆曲线优先级等。深度包检测（DPI）设备无法通过 JA3 指纹识别出代理工具。

**第三层：主动探测防御（对抗 GFW 主动扫描）**

GFW 会主动向可疑 IP 发起 HTTPS 请求探测。Xray 通过 `shortId` 和 X25519 密钥验证区分合法客户端和探测请求：

- 合法客户端 → 正常代理流量
- GFW 探测请求 → 无感转发至 `dest` 指定的真实网站，返回真实内容

### 8.2 关键参数安全说明

| 参数 | 存放位置 | 说明 |
|------|----------|------|
| `privateKey` | 仅服务器 | 泄露会导致节点完全失效 |
| `publicKey` | 客户端 | 公开无害 |
| `uuid` | 服务器 + 客户端 | 相当于访问密码，不要公开 |
| `shortId` | 服务器 + 客户端 | 增加验证熵值，可配置多个 |

### 8.3 为什么使用自己的域名不降低隐蔽性

GFW 被动监听阶段只关注流量的 TLS 特征，不关心 SNI 指向哪个域名。`www.microsoft.com` 的作用仅体现在主动探测阶段（让探测请求得到真实响应）。使用自己的域名 + 真实网站，同样能做到相同的防探测效果。

---

## 9. 故障排查手册

### 9.1 系统性排查流程

```
连接失败
    │
    ├─ Step 1: 服务器出站是否正常？
    │   └─ curl -I https://www.google.com --max-time 5
    │       正常(200) ──▶ Step 2
    │       失败 ──▶ 检查服务器防火墙/安全组
    │
    ├─ Step 2: Xray 是否收到请求？
    │   └─ journalctl -u xray -f（同时在客户端发起请求）
    │       有日志 ──▶ Step 3
    │       无日志 ──▶ 检查客户端 System Proxy / 代理模式
    │
    ├─ Step 3: 请求目标是否正确？
    │   └─ 日志应显示 google.com 等目标，而非只有 cp.cloudflare.com
    │       目标正确 ──▶ Step 4
    │       只有测试请求 ──▶ Clash 模式设为 Global 测试
    │
    └─ Step 4: 本机强制测试
        └─ curl -x http://127.0.0.1:7897 https://www.google.com -v
            200 ──▶ 代理正常，检查浏览器设置
            35/TLS错误 ──▶ 检查节点配置参数
```

### 9.2 常用排查命令

```bash
# 查看 Xray 实时日志
journalctl -u xray -f --no-pager

# 查看完整配置
cat /usr/local/etc/xray/config.json

# 确认端口监听
ss -tlnp | grep -E '443|18443|8443'

# 测试服务器出站
curl -I https://www.google.com --max-time 5
curl -I https://www.youtube.com --max-time 5

# 验证 TLS 握手
openssl s_client -connect <服务器IP>:443 -servername www.microsoft.com </dev/null 2>&1 | head -10

# Nginx 配置检查
nginx -t

# 查看 Nginx 日志
tail -f /var/log/nginx/error.log
```

### 9.3 常见问题速查

| 现象 | 可能原因 | 解决方法 |
|------|----------|----------|
| 节点延迟正常但网页打不开 | Clash 模式为 Direct，或 System Proxy 未开 | 切换为 Global 模式测试 |
| Xray 日志只有 cp.cloudflare.com | 客户端流量未进入代理 | 确认 System Proxy 已开启 |
| TLS 握手失败 (error 35) | uuid/公钥/shortId 不匹配 | 逐一核对服务端与客户端配置 |
| 连接超时 | 服务器防火墙未放行 443 | `ufw allow 443/tcp` |
| 服务器出站失败 | 阿里云/腾讯云安全组限制 | 检查云控制台安全组出站规则 |
| 证书申请失败 | 80 端口被占用 | 停止 Nginx 后再申请 |
| Nginx stream 不生效 | 编译时未包含 stream 模块 | `nginx -V` 确认，或重新安装 |

---

## 10. Nginx前置方案

Nginx配置:

```
server {
    listen 80;
    listen [::]:80;
    server_name proxy.example.com;

    location ^~ /.well-known/acme-challenge/ {
        allow all;
        root /usr/share/nginx/html;
    }

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name proxy.example.com;

    ssl_certificate /www/sites/proxy.example.com/ssl/fullchain.pem;
    ssl_certificate_key /www/sites/proxy.example.com/ssl/privkey.pem;

    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    access_log /www/sites/proxy.example.com/log/access.log main;
    error_log /www/sites/proxy.example.com/log/error.log;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location ~ ^/(\.user.ini|\.htaccess|\.git|\.env|\.svn|\.project|LICENSE|README.md) {
        return 404;
    }

    location = /xray-ws {
        proxy_pass http://127.0.0.1:10000;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Xray WebSocket 会识别 X-Forwarded-For；为了避免客户端伪造，建议只传 remote_addr
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;

        proxy_redirect off;
        proxy_buffering off;

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
      root /www/sites/proxy.example.com/index;
      index index.html;
      try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
    error_page 497 https://$host$request_uri;
}
```

Nginx HTTP block need:
```
    map $http_upgrade $connection_upgrade {
        default upgrade;
        "" close;
    }
```

Config for Xray
```
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "tag": "vless-ws-in",
      "listen": "127.0.0.1",
      "port": 10000,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "自定义的UUID",
            "level": 0
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "ws",
        "wsSettings": {
          "path": "/xray-ws"
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": [
          "http",
          "tls"
        ]
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom"
    },
    {
      "tag": "blocked",
      "protocol": "blackhole"
    }
  ]
}
```

## 附录

### A. 关键文件路径

| 文件 | 路径 |
|------|------|
| Xray 配置 | `/usr/local/etc/xray/config.json` |
| Xray 二进制 | `/usr/local/bin/xray` |
| Nginx 配置 | `/etc/nginx/nginx.conf` |
| SSL 证书 | `/etc/letsencrypt/live/<域名>/fullchain.pem` |
| SSL 私钥 | `/etc/letsencrypt/live/<域名>/privkey.pem` |
| 网站根目录 | `/var/www/html/` |

### B. 端口规划

| 端口 | 用途 |
|------|------|
| 80 | HTTP（跳转 HTTPS） |
| 443 | Nginx stream 入口（对外） |
| 8443 | Nginx HTTPS 网站（内网） |
| 18443 | Xray 监听（内网） |

### C. 推荐 VPS 服务商

| 服务商 | 特点 |
|--------|------|
| Vultr | 按小时计费，全球节点，稳定 |
| DigitalOcean | 简单易用，文档完善 |
| Hetzner | 欧洲节点，性价比高 |
| BandwagonHost | CN2 线路，对中国优化 |
| RackNerd | 价格便宜，适合轻量使用 |
