---
title: '使用WebSocket承载TCP流量'
description: '利用WebSocet的TCP长连接承载TCP流量通道'
pubDate: '2026-02-20'
tags: ['技术方案', '运维']
---

# 使用WebSocket承载TCP流量

## 概览

FRP 完全可以在 HTTPS / WebSocket 隧道之上承载纯 TCP 流量

本文通过FRP的WebSocket示例，说明如何通过WebSocket流量来承载TCP隧道。

## 技术背景

1. FRP对STCP和WebSocket的支持良好，在[原始代码](https://github.com/fatedier/frp/blob/master/pkg/util/net/websocket.go)中定义了`FrpWebsocketPath = "/~!frp"` 作为匹配字符串
2. 大部分HTTPS网关在支持协议升级后无法查看内部流量，因此只要绕过SNI嗅探，即可搭建完全加密的内容。至于SNI嗅探，阿里云对于SNI存在绕过问题，详见[阿里云ICP阻断绕过](https://blog.dreamreflex.com/blog/%E6%9C%80%E4%BD%B3%E5%AE%9E%E8%B7%B5%E5%88%86%E4%BA%AB/%E9%98%BF%E9%87%8C%E4%BA%91icp%E9%98%BB%E6%96%AD%E7%BB%95%E8%BF%87/)

## 技术原理

基础架构：

![image-20260220220702918](./使用HTTPS承载TCP流量.assets/image-20260220220702918.png)

基础架构是frpc通过WSS隧道来连接到FRPS，FRPS作为中转站来转发TCP请求。

1. frps作为中转站隐藏在HTTP网关后面，提供一个连接端口，比如是7000，那么HTTP网关将所有匹配某个域名的流量全部转发到7000端口，这需要拥有一定的Host路由控制权，这也是先决条件之一。
2. frps成功劫持流量后，frpc服务提供者首先连接到frps，如果frpc提供者指明类型是wss，此时请求浏览就会被伪装为HTTP请求，并进行HTTP升级（Upgrade）
3. frpc提供者成功建立连接之后，frpc需要提供一个stcp类型的TCP连接，如果是UDP则是SUDP，原理一样。但需要指明服务密钥以区分服务。
4. frpc访问者需要先和frps建立连接，然后建立一个stcp的visitor角色，将本地端口监听占用。此时frps内部会话管理就会开始建立转发，隧道便被成功打通。

## 实践流程

### 网关环境准备

以`proxy.in.greenshadecapital.com`和相关基础设施为例，本文使用的是OpenResty配置风格。

主配置文件：

```
server {
    listen 80 ; 
    listen 443 ssl ; 
    server_name proxy.in.greenshadecapital.com; 
    index index.php index.html index.htm default.php default.htm default.html; 
    access_log /www/sites/proxy.in.greenshadecapital.com/log/access.log main; 
    error_log /www/sites/proxy.in.greenshadecapital.com/log/error.log; 
    location ~ ^/(\.user.ini|\.htaccess|\.git|\.env|\.svn|\.project|LICENSE|README.md) {
        return 404; 
    }
    location ^~ /.well-known/acme-challenge {
        allow all; 
        root /usr/share/nginx/html; 
    }
    if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
        return 403; 
    }
    root /www/sites/proxy.in.greenshadecapital.com/index; 
    http2 on; 
    if ($scheme = http) {
        return 301 https://$host$request_uri; 
    }
    ssl_certificate /www/sites/proxy.in.greenshadecapital.com/ssl/fullchain.pem; 
    ssl_certificate_key /www/sites/proxy.in.greenshadecapital.com/ssl/privkey.pem; 
    ssl_protocols TLSv1.3 TLSv1.2; 
    ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256:!aNULL:!eNULL:!EXPORT:!DSS:!DES:!RC4:!3DES:!MD5:!PSK:!KRB5:!SRP:!CAMELLIA:!SEED; 
    ssl_prefer_server_ciphers off; 
    ssl_session_cache shared:SSL:10m; 
    ssl_session_timeout 10m; 
    error_page 497 https://$host$request_uri; 
    proxy_set_header X-Forwarded-Proto https; 
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains"; 
    include /www/sites/proxy.in.greenshadecapital.com/proxy/*.conf; 
}
```

代理配置文件

```
location /~!frp {
    proxy_pass http://127.0.0.1:7000; 
    proxy_set_header Host $host; 
    proxy_set_header X-Real-IP $remote_addr; 
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; 
    proxy_set_header REMOTE-HOST $remote_addr; 
    proxy_set_header Upgrade $http_upgrade; 
    proxy_set_header Connection $http_connection; 
    proxy_set_header X-Forwarded-Proto $scheme; 
    proxy_set_header X-Forwarded-Port $server_port; 
    proxy_http_version 1.1; 
    add_header X-Cache $upstream_cache_status; 
    proxy_ssl_server_name off; 
    proxy_ssl_name $proxy_host; 
    proxy_read_timeout 600s;
}

```

需要注意的是` /~!frp`是硬编码写死的，如果使用WebSocket服务而不是WSS服务，硬编码可能会被嗅探。

### 配置FRPS

```toml
bindAddr = "0.0.0.0"
bindPort = 7000

auth.method = "token"
auth.token = "pass123"

webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "pass123"


transport.protocol = "websocket"
transport.tls.enable = true
transport.websocket.path = "/frp/"
```

监听7000端口，webServer可有可无

### 配置一个服务提供者

本文使用frpmgr

```
loginFailExit = false
serverAddr = 'proxy.in.greenshadecapital.com'
serverPort = 443

[auth]
method = 'token'
token = 'pass123'

[frpmgr]
name = 'TCPoverWSS'

[log]
level = 'info'
maxDays = 3
to = 'D:/Program Files/FRP/logs/5a7b255c6593aa6c066886edc13834d4.log'

[transport]
protocol = 'wss'
tcpMux = true

[transport.tls]
disableCustomTLSFirstByte = true
enable = true
```

启动会话之后，日志提示

```
2026-02-20 22:17:46.998 [I] [client/service.go:317] [4b1f607ad837ef56] login to server success, get run id [4b1f607ad837ef56]
```

现在打开一个本地TCP，以80端口为例，命名为`LocalWeb`

```
[[proxies]]
localPort = 80
name = 'LocalWeb'
secretKey = '123456'
type = 'xtcp'
```

此时在本地激活一个80端口的服务，例如`python -m http.server 80`，激活后80端口便在网关注册成功

### 配置访问者

现在开始配置一个访问者，访问者需要知道frps的认证信息和提供者的密钥，连接frps的流程一致，但连接frpc提供者时候需要提供准确的名称和密钥，完整配置如下

```
loginFailExit = false
serverAddr = 'proxy.in.greenshadecapital.com'
serverPort = 443

[auth]
method = 'token'
token = 'pass123'

[frpmgr]
name = 'Remote'

[log]
level = 'info'
maxDays = 3
to = 'D:/Program Files/FRP/logs/69fba32b1e5875ef8a1bd2a335b7a6f9.log'

[transport]
protocol = 'wss'
tcpMux = true

[transport.tls]
disableCustomTLSFirstByte = true
enable = true

[[visitors]]
bindPort = 88
name = 'RemoteWeb'
secretKey = '123456'
serverName = 'LocalWeb'
type = 'xtcp'

[visitors.frpmgr]
sort = 1
```

此时访问88端口就等价于提供者的80端口

![image-20260220223544572](./使用HTTPS承载TCP流量.assets/image-20260220223544572.png)

二者内容等价，隧道工作正常

