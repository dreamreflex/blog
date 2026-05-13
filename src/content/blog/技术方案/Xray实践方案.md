---
title: 'Xray代理实践方案'
description: 'Nginx前置代理实践方案'
pubDate: '2026-05-13'
tags: ['技术方案', '代理']
---

# Xray+Nginx前置代理实践方案

> **版本**：1.1
> **最后更新**：2026-05-13
> **适用系统**：Ubuntu 22.04 / 24.04 LTS
> **协议栈**：VLESS + XTLS-Vision + Reality
> **前端**：Nginx（官方仓库版）Stream SNI 路由
> **客户端**：Clash Meta

---

## 目录

1. [架构设计](#1-架构设计)
2. [选型说明](#2-选型说明)
3. [系统准备](#3-系统准备)
4. [安装 Nginx](#4-安装-nginx)
5. [安装 Xray](#5-安装-xray)
6. [SSL 证书](#6-ssl-证书)
7. [Nginx 完整配置](#7-nginx-完整配置)
8. [Xray 完整配置](#8-xray-完整配置)
9. [启动与验证](#9-启动与验证)
10. [Clash Meta 客户端配置](#10-clash-meta-客户端配置)
11. [反向代理配置](#11-反向代理配置)
12. [已知问题与排错手册](#12-已知问题与排错手册)
13. [拓展新节点 SOP](#13-拓展新节点-sop)
14. [诊断脚本](#14-诊断脚本)
15. [安全加固清单](#15-安全加固清单)

---

## 1. 架构设计

### 流量路径

**静态文件模式**（不需要真实 IP）：

```
客户端（Clash Meta）
        │ TCP :443
        ▼
Nginx Stream（SNI 预读路由）
        ├── SNI = 伪装域名 ──→ 127.0.0.1:4443（Xray Reality）──→ 自由出站
        └── SNI = 其他域名 ──→ 127.0.0.1:4444（Nginx HTTPS）──→ 静态文件
```

**反向代理模式**（需要真实 IP，引入 Proxy Protocol 中继跳）：

```
客户端（Clash Meta）
        │ TCP :443
        ▼
Nginx Stream（SNI 预读路由）
        ├── SNI = 伪装域名 ──→ 127.0.0.1:4443（Xray Reality）──→ 自由出站
        └── SNI = 其他域名 ──→ 127.0.0.1:4445（Proxy Protocol 中继）
                                        │ 注入真实 IP Header
                                        ▼
                                127.0.0.1:4444（Nginx HTTPS）
                                        │
                                        ▼
                                后端应用（Node.js / PHP / Python…）
```

> 中继跳（4445）的作用：不能在主 Stream server 全局开启 `proxy_protocol on`，否则会把 PROXY header 也发给 Xray 导致连接失败。独立中继跳把两条路完全隔离。

### 端口分工

| 端口 | 监听地址 | 进程 | 用途 |
|------|----------|------|------|
| `80` | `0.0.0.0` | Nginx HTTP | HTTP → HTTPS 重定向，ACME 验证 |
| `443` | `0.0.0.0` / `[::]` | Nginx Stream | SNI 预读，TCP 透传路由 |
| `4443` | `127.0.0.1` | Xray | VLESS+Reality 入站（仅内部） |
| `4444` | `127.0.0.1` | Nginx HTTPS | 网站内容服务（仅内部） |
| `4445` | `127.0.0.1` | Nginx Stream | Proxy Protocol 中继（反向代理模式专用） |

### 核心原理

Nginx Stream 层**仅做原始 TCP 透传**，不终止 TLS。Xray 完整控制 Reality 握手全过程，借用 `www.microsoft.com` 的 TLS 证书指纹，流量特征与正常访问该网站完全一致，GFW 的流量识别系统无法区分。

---

## 2. 选型说明

### 为什么选标准 Nginx 而非 OpenResty

| 维度 | Nginx（官方仓库） | OpenResty |
|------|-----------------|-----------|
| Stream + ssl_preread 模块 | ✅ 开箱即包含 | ✅ 包含 |
| Lua 脚本引擎 | ❌ 不需要 | ✅ 有但多余 |
| WAF 集成 | ❌ | ✅ 有但引入复杂度 |
| 文档与社区 | 更广泛 | 相对较少 |
| 维护复杂度 | 低 | 较高 |

**结论**：本方案不需要 Lua 或内置 WAF，OpenResty 只增加无谓的复杂度。

### 为什么选 Reality 而非普通 TLS

- **普通 VLESS+TLS**：证书可被探测，有明显代理特征
- **VLESS+Reality**：无需自签证书，直接借用大型网站的 TLS 握手流程，理论上与正常 HTTPS 流量无法区分
- **XTLS-Vision flow**：在 TLS-in-TLS 场景下消除内层 TLS 的时序指纹

---

## 3. 系统准备

```bash
# 更新系统
apt update && apt upgrade -y

# 安装基础工具
apt install -y curl wget gnupg2 ca-certificates lsb-release ufw socat

# 防火墙配置（仅开放必要端口）
ufw allow 22/tcp      # SSH（按实际端口修改）
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

---

## 4. 安装 Nginx

使用 nginx.org 官方仓库，获取包含完整模块的最新稳定版：

```bash
# 添加官方 GPG 密钥
curl -fsSL https://nginx.org/keys/nginx_signing.key \
  | gpg --dearmor -o /usr/share/keyrings/nginx-archive-keyring.gpg

# 添加官方仓库
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] \
  http://nginx.org/packages/mainline/ubuntu $(lsb_release -cs) nginx" \
  > /etc/apt/sources.list.d/nginx.list

# 安装
apt update && apt install -y nginx

# 验证关键模块存在
nginx -V 2>&1 | grep -E 'stream_ssl_preread|http_ssl'
# 应看到：--with-stream_ssl_preread_module --with-http_ssl_module

# 创建配置目录
mkdir -p /etc/nginx/conf.d /etc/nginx/stream.d /var/log/nginx

# 开机自启
systemctl enable nginx
```

---

## 5. 安装 Xray

```bash
# 官方一键安装脚本
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# 验证版本
xray version

# 创建日志目录
mkdir -p /var/log/xray
chown nobody:nogroup /var/log/xray
```

### 生成密钥材料

**每个节点必须独立生成，切勿复用。**

```bash
# 1. 生成 UUID（用户身份凭证）
xray uuid

# 2. 生成 Reality 密钥对
xray x25519
# Private key: ...（服务端保留，绝不外传）
# Public key:  ...（填入客户端配置）

# 3. 生成 shortId（连接标识，可多个）
openssl rand -hex 8

# 如果后续只有私钥，用此命令推导公钥
xray x25519 -i <privateKey>
```

> **安全提示**：Private key 相当于节点的私有密钥，泄露即意味着节点被冒充。建议记录在密码管理器中，不要明文存于公开位置。

---

## 6. SSL 证书

本方案要求为真实域名申请有效的 TLS 证书，用于 Nginx HTTPS 内部端口（4444）服务网站内容。

### 证书文件路径约定

```
/etc/nginx/ssl/<域名>/
├── fullchain.pem   # 完整证书链
└── privkey.pem     # 私钥
```

### 使用 acme.sh 申请（推荐）

```bash
# 安装 acme.sh
curl https://get.acme.sh | sh -s email=your@email.com
source ~/.bashrc

# 申请（webroot 模式，Nginx 需在运行）
mkdir -p /var/www/html
mkdir -p /etc/nginx/ssl/<域名>

~/.acme.sh/acme.sh --issue --webroot /var/www/html -d <域名>

# 安装到 Nginx 读取路径，并配置自动重载
~/.acme.sh/acme.sh --install-cert -d <域名> \
  --cert-file      /etc/nginx/ssl/<域名>/cert.pem \
  --key-file       /etc/nginx/ssl/<域名>/privkey.pem \
  --fullchain-file /etc/nginx/ssl/<域名>/fullchain.pem \
  --reloadcmd      "systemctl reload nginx"
```

### 证书验证

```bash
openssl x509 -in /etc/nginx/ssl/<域名>/fullchain.pem \
  -noout -subject -issuer -dates
```

---

## 7. Nginx 完整配置

### 主配置 `/etc/nginx/nginx.conf`

此文件与所选模式无关，两种模式通用。

```nginx
user www-data;
worker_processes auto;
pid /run/nginx.pid;
worker_rlimit_nofile 51200;

error_log /var/log/nginx/error.log warn;

events {
    use epoll;
    worker_connections 4096;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;

    server_tokens  off;
    sendfile       on;
    tcp_nopush     on;
    tcp_nodelay    on;
    keepalive_timeout 65;
    keepalive_requests 1000;

    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 4;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript;
    gzip_vary on;

    include /etc/nginx/conf.d/*.conf;
}

stream {
    log_format stream '$remote_addr [$time_local] $protocol '
                      '$status $bytes_sent $bytes_received $session_time';
    access_log /var/log/nginx/stream.log stream;

    include /etc/nginx/stream.d/*.conf;
}
```

### SNI 路由 `/etc/nginx/stream.d/sni-router.conf`

根据所需模式二选一。

**版本 A — 静态文件模式**（无需真实 IP）

```nginx
map $ssl_preread_server_name $backend {
    www.microsoft.com   127.0.0.1:4443;
    microsoft.com       127.0.0.1:4443;
    default             127.0.0.1:4444;
}

server {
    listen     443 reuseport;
    listen     [::]:443 reuseport;
    ssl_preread on;
    proxy_pass  $backend;
    proxy_connect_timeout  10s;
    proxy_timeout          600s;
    proxy_buffer_size      16k;
}
```

**版本 B — 反向代理模式**（带 Proxy Protocol 中继，保留真实 IP）

```nginx
map $ssl_preread_server_name $backend {
    www.microsoft.com   127.0.0.1:4443;
    microsoft.com       127.0.0.1:4443;
    default             127.0.0.1:4445;   # 流量先到中继跳，再转 4444
}

# 主路由（不加 proxy_protocol，保护 Xray 通道）
server {
    listen     443 reuseport;
    listen     [::]:443 reuseport;
    ssl_preread on;
    proxy_pass  $backend;
    proxy_connect_timeout  10s;
    proxy_timeout          600s;
    proxy_buffer_size      16k;
}

# Proxy Protocol 中继（注入真实 IP 后转发至 Nginx HTTPS）
server {
    listen     127.0.0.1:4445;
    proxy_pass 127.0.0.1:4444;
    proxy_protocol        on;
    proxy_connect_timeout 10s;
    proxy_timeout         600s;
}
```

> **关于 `reuseport`**：开启后每个 worker 进程各持一个独立 socket，`ss` 命令会显示 443 端口有多条记录（每 worker 一条），这是**正常现象**，不是端口冲突。

### 网站配置 `/etc/nginx/conf.d/<域名>.conf`

与上方 `sni-router.conf` 对应，同样二选一。

**版本 A — 静态文件模式**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <域名>;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 127.0.0.1:4444 ssl;
    http2 on;
    server_name <域名>;

    ssl_certificate     /etc/nginx/ssl/<域名>/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/<域名>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    root  /var/www/<域名>;
    index index.html index.htm;

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    location / {
        try_files $uri $uri/ =404;
    }
    location ~ /\. { deny all; }

    access_log /var/log/nginx/<域名>.access.log main;
    error_log  /var/log/nginx/<域名>.error.log;
}
```

> 必须创建 root 目录，否则返回 404：
> ```bash
> mkdir -p /var/www/<域名>
> echo "<h1>OK</h1>" > /var/www/<域名>/index.html
> ```

**版本 B — 反向代理模式**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <域名>;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        allow all;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 127.0.0.1:4444 ssl proxy_protocol;   # 必须加 proxy_protocol
    http2 on;
    server_name <域名>;

    # 从 PROXY Protocol header 还原真实客户端 IP
    set_real_ip_from  127.0.0.1;
    real_ip_header    proxy_protocol;
    real_ip_recursive on;

    ssl_certificate     /etc/nginx/ssl/<域名>/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/<域名>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    location / {
        proxy_pass         http://127.0.0.1:3000;   # 改为实际后端地址
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;   # 此时已是真实 IP
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout    60s;
        proxy_send_timeout    60s;
        proxy_buffering       on;
        proxy_buffer_size     4k;
        proxy_buffers         8 16k;
    }

    location ~ /\. { deny all; }

    access_log /var/log/nginx/<域名>.access.log main;
    error_log  /var/log/nginx/<域名>.error.log;
}
```

---

## 8. Xray 完整配置

`/usr/local/etc/xray/config.json`（与所选 Nginx 模式无关，两种模式通用）

```json
{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/xray/access.log",
    "error":  "/var/log/xray/error.log"
  },

  "inbounds": [
    {
      "tag":    "vless-reality-in",
      "listen": "127.0.0.1",
      "port":   4443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id":    "<UUID>",
            "flow":  "xtls-rprx-vision",
            "email": "user@local"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network":  "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "www.microsoft.com:443",
          "serverNames": [
            "www.microsoft.com",
            "microsoft.com"
          ],
          "privateKey": "<私钥>",
          "shortIds": [
            "<shortId>"
          ],
          "fingerprint": "chrome"
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"],
        "routeOnly": false
      }
    }
  ],

  "outbounds": [
    {
      "tag":      "direct",
      "protocol": "freedom",
      "settings": { "domainStrategy": "UseIPv4" }
    },
    {
      "tag":      "block",
      "protocol": "blackhole"
    }
  ],

  "routing": {
    "domainStrategy": "IPIfNonMatch",
    "rules": [
      {
        "type":        "field",
        "ip":          ["geoip:private"],
        "outboundTag": "block"
      },
      {
        "type":        "field",
        "domain":      ["geosite:category-ads-all"],
        "outboundTag": "block"
      },
      {
        "type":        "field",
        "network":     "tcp,udp",
        "outboundTag": "direct"
      }
    ]
  }
}
```

### 伪装域名选择原则

| 要求 | 说明 |
|------|------|
| 支持 TLSv1.3 | Reality 依赖 TLS 1.3 特性 |
| 大陆可直接访问 | Xray 需要回源验证，目标不可达则连接失败 |
| 响应稳定 | 避免选择有强 DDoS 防护的域名 |
| 推荐选项 | `www.microsoft.com`、`www.apple.com`、`addons.mozilla.org` |

---

## 9. 启动与验证

```bash
nginx -t
xray -test -config /usr/local/etc/xray/config.json

systemctl enable --now nginx
systemctl enable --now xray

ss -tlnp | grep -E '80|443|4443|4444|4445'
```

**静态文件模式期望输出**：

```
LISTEN  0.0.0.0:80       → Nginx HTTP
LISTEN  0.0.0.0:443      → Nginx Stream（×N，N=worker 数，正常）
LISTEN  [::]:443         → Nginx Stream IPv6
LISTEN  127.0.0.1:4443   → Xray Reality
LISTEN  127.0.0.1:4444   → Nginx HTTPS 内部
```

**反向代理模式期望输出**（额外多一个 4445）：

```
LISTEN  0.0.0.0:80       → Nginx HTTP
LISTEN  0.0.0.0:443      → Nginx Stream
LISTEN  [::]:443         → Nginx Stream IPv6
LISTEN  127.0.0.1:4443   → Xray Reality
LISTEN  127.0.0.1:4444   → Nginx HTTPS 内部
LISTEN  127.0.0.1:4445   → Proxy Protocol 中继
```

**连通性三连测**：

```bash
# 1. 内部 HTTPS（应返回 200）
curl -sk -o /dev/null -w "%{http_code}\n" \
  --resolve "<域名>:4444:127.0.0.1" "https://<域名>:4444/"

# 2. 外部 443（应返回 200）
curl -sk -o /dev/null -w "%{http_code}\n" "https://<域名>/"

# 3. Reality 伪装（应返回 200，内容来自 Microsoft）
curl -sk -o /dev/null -w "%{http_code}\n" \
  --resolve "www.microsoft.com:443:127.0.0.1" "https://www.microsoft.com/"
```

---

## 10. Clash Meta 客户端配置

```yaml
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false

dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 119.29.29.29
    - 223.5.5.5
  nameserver:
    - https://doh.pub/dns-query
    - https://dns.alidns.com/dns-query
  fallback:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN

proxies:
  - name: "Reality-JP-01"
    type: vless
    server: <服务器公网IP>          # 填 IP，不填经 Cloudflare 代理的域名
    port: 443
    uuid: <UUID>
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    servername: www.microsoft.com
    reality-opts:
      public-key: <公钥>
      short-id: <shortId>
    client-fingerprint: chrome
    skip-cert-verify: false

proxy-groups:
  - name: "节点选择"
    type: select
    proxies:
      - Reality-JP-01
      - DIRECT

  - name: "国内直连"
    type: select
    proxies:
      - DIRECT
      - Reality-JP-01

rules:
  - GEOSITE,private,DIRECT
  - GEOSITE,cn,国内直连
  - GEOIP,CN,国内直连
  - MATCH,节点选择
```

---

## 11. 反向代理配置

第 7 章版本 B 已提供完整的反向代理 Nginx 配置。本章补充各类后端的具体 `location` 写法，直接替换版本 B 中的 `location /` 块即可。

### WebSocket

```nginx
location /ws {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host       $host;
    proxy_set_header   X-Real-IP  $remote_addr;
    proxy_read_timeout 3600s;     # 长连接必须设长，否则被强制断开
}
```

### PHP-FPM

```nginx
root /var/www/<域名>;
index index.php index.html;

location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location ~ \.php$ {
    fastcgi_pass         127.0.0.1:9000;    # 或 unix:/run/php/php8.2-fpm.sock
    fastcgi_index        index.php;
    fastcgi_param        SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_param        HTTPS on;
    fastcgi_param        HTTP_X_FORWARDED_PROTO https;
    include              fastcgi_params;
    fastcgi_read_timeout 60s;
}
```

### Python（uvicorn / gunicorn）

```nginx
location / {
    proxy_pass         http://unix:/run/gunicorn.sock;   # 或 http://127.0.0.1:8000
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto https;
}
```

### 多路径分发（前端 SPA + API + 静态上传）

```nginx
# 前端静态资源（Vue / React 构建产物）
location / {
    root  /var/www/<域名>/dist;
    try_files $uri $uri/ /index.html;
}

# API 转发给后端服务
location /api/ {
    proxy_pass         http://127.0.0.1:8080/;   # 末尾斜杠自动去掉 /api 前缀
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}

# 用户上传文件
location /uploads/ {
    alias   /var/www/uploads/;
    expires 7d;
    add_header Cache-Control "public";
}
```

### 注意事项

| 场景 | 注意点 |
|------|--------|
| 不需要真实 IP | 用版本 A 即可，无需中继跳，`listen 4444 ssl` 不加 `proxy_protocol` |
| 后端在 Docker | `proxy_pass` 目标改为容器 IP，或配置 `host-gateway` |
| 后端使用 Unix Socket | `proxy_pass http://unix:/path/to/app.sock;` |
| WebSocket + 超时 | `proxy_read_timeout` 必须设为足够长的值 |
| 混合模式（静态 + 代理） | `location` 优先级：精确 `=` > 前缀 `^~` > 正则 `~` > 默认 `/` |

---

## 12. 已知问题与排错手册

本章记录部署过程中实际遇到的所有问题。

### 问题 A：4444 端口不存在 → Connection Refused

**原因**：网站配置文件中仍有 `listen 443 ssl`，未改为内部端口。

```bash
grep -rn "listen.*443" /etc/nginx/conf.d/
# 修复：将 listen 443 ssl 改为 listen 127.0.0.1:4444 ssl
```

### 问题 B：Nginx 启动报 emerg，证书文件不存在

**现象**：`[emerg] cannot load certificate "...fullchain.pem": No such file`

**原因**：配置文件引用了证书路径，但证书尚未生成。先生成证书再启动 Nginx。

### 问题 C：网站返回 404

**原因**：`root` 目录不存在，或目录下没有 `index.html`（仅版本 A）。

```bash
mkdir -p /var/www/<域名>
echo "<h1>OK</h1>" > /var/www/<域名>/index.html
systemctl reload nginx
```

### 问题 D：443 端口在 ss 中出现多条记录

**是否异常**：不是。`reuseport` 为每个 worker 创建独立 socket，N 个 worker 就有 N 条记录，正常行为。

### 问题 E：`conflicting server name` 警告

**原因一**：同一 `server_name` 在 server block 中写了两遍：
```nginx
server_name example.com example.com;   # 错误，重复了
server_name example.com;               # 正确
```

**原因二**：两个不同配置文件都为同一域名定义了 port 80 的 server block。

### 问题 F：Cloudflare 橙云代理破坏 Reality

**现象**：Stream 日志出现 `172.64.x.x`（Cloudflare 回源 IP），客户端无法连接。

**原因**：Cloudflare 橙云终止 TLS，Reality 握手所需的直连通道被中断。

**修复**：在 Cloudflare Dashboard 将目标子域名改为灰云（DNS only）。Clash Meta 的 `server` 字段直接填服务器公网 IP。

### 问题 G：Xray 报 "non-443 ports may get your IP blocked"

**是否异常**：不是。Xray 只看到自己监听 4443，不知道外层 Nginx 已将 443 流量路由过来，误报，忽略即可。

### 快速排查命令

```bash
ss -tlnp | grep -E '80|443|4443|4444|4445'
nginx -t
xray -test -config /usr/local/etc/xray/config.json
journalctl -u nginx -f
journalctl -u xray -f
tail -f /var/log/nginx/stream.log
```

---

## 13. 拓展新节点 SOP

### 前置条件

- [ ] 新服务器已完成系统准备（第 3 章）
- [ ] 新域名 DNS A 记录已指向新服务器 IP，且为灰云（DNS only）
- [ ] 新域名 SSL 证书已申请并安装到位

### Step 1：复用 Nginx 基础配置

```bash
# nginx.conf 和 stream.d/sni-router.conf 完全复用，无需修改

# 新增网站 conf
cp /etc/nginx/conf.d/原域名.conf /etc/nginx/conf.d/新域名.conf
sed -i 's/原域名/新域名/g' /etc/nginx/conf.d/新域名.conf

# 版本 A 需创建 root 目录
mkdir -p /var/www/新域名
echo "<h1>OK</h1>" > /var/www/新域名/index.html
```

### Step 2：重新生成 Xray 密钥材料

```bash
xray uuid
xray x25519
openssl rand -hex 8
```

### Step 3：更新 Xray 配置

编辑 `/usr/local/etc/xray/config.json`，更换 `id`、`privateKey`、`shortIds`。

### Step 4：验证并上线

```bash
nginx -t && systemctl reload nginx
xray -test -config /usr/local/etc/xray/config.json
systemctl restart xray
bash diagnose.sh
```

### Step 5：更新 Clash Meta 配置

```yaml
proxies:
  - name: "Reality-JP-01"
    # 原节点配置...
  - name: "Reality-HK-01"
    type: vless
    server: <新服务器IP>
    port: 443
    uuid: <新UUID>
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    servername: www.microsoft.com
    reality-opts:
      public-key: <新公钥>
      short-id: <新shortId>
    client-fingerprint: chrome

proxy-groups:
  - name: "节点选择"
    type: select
    proxies:
      - Reality-JP-01
      - Reality-HK-01
      - DIRECT
```

---

## 14. 诊断脚本

```bash
#!/bin/bash
SEP="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sec() { echo; echo "$SEP"; echo "▶ $1"; echo "$SEP"; }

sec "1. 系统基本信息"
hostname; grep PRETTY /etc/os-release; uname -r; date

sec "2. 端口监听状态"
ss -tlnp | grep -E '80|443|4443|4444|4445'

sec "3. 服务状态"
systemctl is-active nginx xray

sec "4. Nginx 配置语法"
nginx -t 2>&1

sec "5. 全局 listen 443 指令（排查冲突）"
grep -rn "listen.*443" /etc/nginx/

sec "6. conf.d/ 配置内容"
for f in /etc/nginx/conf.d/*.conf; do
    echo "───── $f ─────"; cat "$f"; done

sec "7. stream.d/ 配置内容"
for f in /etc/nginx/stream.d/*.conf; do
    echo "───── $f ─────"; cat "$f"; done

sec "8. SSL 证书检查"
DOMAIN=$(grep -rh "server_name" /etc/nginx/conf.d/ \
  | grep -v localhost | awk '{print $2}' | head -1 | tr -d ';')
CERT="/etc/nginx/ssl/${DOMAIN}/fullchain.pem"
[ -f "$CERT" ] \
  && openssl x509 -in "$CERT" -noout -subject -issuer -dates \
  || echo "证书不存在: $CERT"

sec "9. Xray 配置"
cat /usr/local/etc/xray/config.json

sec "10. Xray 最近日志"
journalctl -u xray -n 20 --no-pager
tail -10 /var/log/xray/error.log 2>/dev/null

sec "11. Nginx 最近日志"
journalctl -u nginx -n 20 --no-pager
tail -5 /var/log/nginx/stream.log 2>/dev/null

sec "12. 连通性测试"
D=$(grep -rh "server_name" /etc/nginx/conf.d/ \
  | grep -v localhost | awk '{print $2}' | head -1 | tr -d ';')
echo "内部 4444："; curl -sk -o /dev/null -w "%{http_code}\n" \
  --resolve "${D}:4444:127.0.0.1" "https://${D}:4444/"
echo "外部 443："; curl -sk -o /dev/null -w "%{http_code}\n" "https://${D}/"
echo "Reality 伪装："; curl -sk -o /dev/null -w "%{http_code}\n" \
  --resolve "www.microsoft.com:443:127.0.0.1" "https://www.microsoft.com/"

sec "13. 防火墙状态"
ufw status verbose 2>/dev/null
iptables -L INPUT -n --line-numbers 2>/dev/null | head -20

sec "诊断完成 — 将以上输出提供给运维人员分析"
```

```bash
bash diagnose.sh 2>&1 | tee diagnose_output.txt
```

---

## 15. 安全加固清单

| 项目 | 要求 | 验证方式 |
|------|------|----------|
| UUID | 每节点独立生成，不重用 | — |
| Private key | 仅存于服务器，不外传 | — |
| shortId | 可配置多个，每客户端一个便于管理 | — |
| 伪装域名 | 选 TLS 1.3、大陆可直达的大站 | `curl -I https://伪装域名` |
| Cloudflare DNS | 目标子域名必须为灰云（DNS only） | Cloudflare Dashboard |
| 防火墙 | 只开 22/80/443，内部端口不对外 | `ufw status` |
| 内部端口 | 4443/4444/4445 监听 `127.0.0.1`，非 `0.0.0.0` | `ss -tlnp` |
| Nginx server_tokens | 已配置 `server_tokens off` | `curl -I` 响应头无 Server 版本 |
| Xray 日志级别 | 生产环境改为 `none`，减少磁盘 IO | `config.json` |
| 证书自动续签 | acme.sh 安装后默认已配置 cron | `crontab -l` |
| SSH 端口 | 建议改为非 22 端口 | `/etc/ssh/sshd_config` |

