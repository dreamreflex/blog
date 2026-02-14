---
title: '阿里云ICP阻断绕过测试'
description: '测试阿里云对未进行ICP备案域名阻断绕过的测试'
pubDate: '2026-02-12'
tags: ['最佳实践', '网络安全']
---

# 阿里云ICP阻断绕过

阿里云ICP网关在拦截未备案的ICP时可能会存在绕过情况，详见博文：

[阿里云网关 DPI 阻断绕过漏洞分析报告：TLS Client Hello 分片逃逸](https://2x.nz/posts/aliyun-icp-tls-bug/)

测试域名： poc.openedge.top

测试IP：114.55.89.133

通过OpenResty搭建普通Web服务时会导致访问被拦截，如图

![image-20260213155210810](./阿里云ICP阻断绕过.assets/image-20260213155210810.png)

但试用HTTPS后，浏览器能够进行访问

![image-20260213160147610](./阿里云ICP阻断绕过.assets/image-20260213160147610.png)

但curl仍被阻断

![image-20260213160923147](./阿里云ICP阻断绕过.assets/image-20260213160923147.png)

猜测可能是Chrome和DNS体系导致的，尚未经过全面验证，因为ITDOG被阻断

![image-20260213161008547](./阿里云ICP阻断绕过.assets/image-20260213161008547-1770970208934-1.png)

说明SNI阻断仍然是存在的。

## 思路

在验证阻断确实存在后，通过升级OpenSSL的方式让Nginx具有PQC能力。

构建PQC环境博文：

## 支持PQC的组件编译流程

[支持PQC的组件编译流程](https://blog.dreamreflex.com/blog/%E6%8A%80%E6%9C%AF%E6%96%B9%E6%A1%88/%E6%94%AF%E6%8C%81pqc%E7%9A%84nginx%E7%BC%96%E8%AF%91%E6%B5%81%E7%A8%8B/)

同时为了验证PQC的能力，这里利用了DreamReflex NGP的源码：

https://github.com/dreamreflex/ngp/tree/main/hybrid-pqc-site

将其内容作为Docker镜像部署在服务器上

![image-20260213161426897](./阿里云ICP阻断绕过.assets/image-20260213161426897.png)

其基本原理就是将HTTP的头转发给后端

Nginx配置文件如下

```
root@iZbp13nows55f48gtl7px7Z:~# cat /usr/local/nginx/conf/nginx.conf

worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    sendfile        on;
    keepalive_timeout  65;

    # ========== PQC 相关 map ==========

    # 把 ssl_curve 的原始值映射为对应的名字
    map $ssl_curve $pqc_group {
        "0x11ec"   "X25519MLKEM768";
        "0x6399"   "X25519Kyber768Draft00";
        default    $ssl_curve;
    }

    # 根据组名称判断是否为 PQC / 混合 PQC
    map $pqc_group $pqc_status {
        "~MLKEM"            "hybrid_pqc";
        "~Kyber768Draft00"  "hybrid_pqc_draft";
        default             "no_pqc";
    }

    # 标记是否 TLS1.3
    map $ssl_protocol $tls13 {
        "TLSv1.3"   "1";
        default     "0";
    }

    # 自定义日志格式（方便以后排查 PQC）
    log_format pqc_log '$remote_addr "$request" '
                       'prot=$ssl_protocol cipher=$ssl_cipher '
                       'curve=$ssl_curve curves_cli=$ssl_curves '
                       'pqc_status=$pqc_status';

    access_log  logs/access_pqc.log pqc_log;

    # =======================
    # 80 端口 HTTP 跳 HTTPS
    # =======================
    server {
        listen      80;
        server_name poc.openedge.top;
        return 301 https://$host$request_uri;
    }

    # =======================
    # 443 端口 HTTPS 主站
    # =======================
    server {
        listen 443 ssl;
        http2 on;
        server_name poc.openedge.top;

        ssl_certificate      /opt/1panel/www/sites/poc.openedge.top/ssl/fullchain.pem;
        ssl_certificate_key  /opt/1panel/www/sites/poc.openedge.top/ssl/privkey.pem;

        # 只启用 TLS 1.3
        ssl_protocols       TLSv1.3;
        ssl_prefer_server_ciphers on;

        # ========== TLS 安全相关响应头 ==========

        # HSTS and CSP
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header Content-Security-Policy "upgrade-insecure-requests" always;

        # 暴露 TLS/PQC Header 信息
        add_header X-TLS-Protocol   $ssl_protocol  always;
        add_header X-TLS-Cipher     $ssl_cipher    always;
        add_header X-TLS-Curve      $pqc_group     always;
        add_header X-PQC-Status     $pqc_status    always;
        add_header X-TLS-TLS13      $tls13         always;


        root   html;


        location / {
            index  index.html;
        }

        location /api/ {

            proxy_pass http://127.0.0.1:8000/;

            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # ===== TLS 协商结果 =====
            proxy_set_header X-TLS-Protocol      $ssl_protocol;
            proxy_set_header X-TLS-Cipher        $ssl_cipher;
            proxy_set_header X-TLS-Curve-Raw     $ssl_curve;    # 原始值，例如 0x11ec
            proxy_set_header X-TLS-Curve         $pqc_group;    # 映射后的名字
            proxy_set_header X-PQC-Status        $pqc_status;   # no_pqc / hybrid_pqc / ...

            # ===== 客户端能力（支持的 cipher / 曲线列表）=====
            proxy_set_header X-TLS-Cipher-List   $ssl_ciphers;
            proxy_set_header X-TLS-Curves-Client $ssl_curves;

            # ===== ALPN / 早期数据 等附加信息 =====
            proxy_set_header X-TLS-ALPN          $ssl_alpn_protocol;
            proxy_set_header X-TLS-Early-Data    $ssl_early_data;

            # ===== 服务器侧启用的组 =====
            proxy_set_header X-TLS-Server-Groups "X25519MLKEM768:X25519:prime256v1";
        }
    }
}root@iZbp13nows55f48gtl7px7Z:~#
```

启动支持PQC的nginx

![image-20260213161600272](./阿里云ICP阻断绕过.assets/image-20260213161600272.png)

此时的nginx是支持PQC的

![image-20260213161657332](./阿里云ICP阻断绕过.assets/image-20260213161657332.png)

此时PQC是生效的

![image-20260213162051927](./阿里云ICP阻断绕过.assets/image-20260213162051927.png)

原始请求:

![image-20260213162109671](./阿里云ICP阻断绕过.assets/image-20260213162109671.png)

## 生产可用的配置文件

nginx配置

```
http {
    include       mime.types;
    default_type  application/octet-stream;

    sendfile        on;
    keepalive_timeout  65;

    # ----------- 映射 PQC 组名称 ------------
    map $ssl_curve $pqc_group {
        "0x11ec"   "X25519MLKEM768";
        "0x11ed"   "X25519Kyber768Draft00";
        default    $ssl_curve;
    }

    map $pqc_group $pqc_status {
        "~MLKEM"            "hybrid_pqc";
        "~Kyber768Draft00"  "hybrid_pqc_draft";
        default             "no_pqc";
    }

    map $ssl_protocol $tls13 {
        "TLSv1.3"   "1";
        default     "0";
    }

    log_format pqc_log '$remote_addr "$request" '
                       'protocol=$ssl_protocol cipher=$ssl_cipher '
                       'group_raw=$ssl_curve group_name=$pqc_group '
                       'pqc_status=$pqc_status';

    access_log  logs/access_pqc.log pqc_log;

    # =======================
    # HSTS
    # =======================
    server {
        listen      80;
        server_name pqc.dreamreflex.com;
        return 301 https://$host$request_uri;
    }

    # =======================
    # 443 HTTPS 站点
    # =======================
    server {
        listen 443 ssl http2;
        server_name pqc.dreamreflex.com;

        ssl_certificate     /opt/1panel/www/pqc.dreamreflex.com.ssl/fullchain.pem;
        ssl_certificate_key /opt/1panel/www/pqc.dreamreflex.com.ssl/privkey.pem;

        # 只启用 TLS1.3（PQC 有效）
        ssl_protocols TLSv1.3;

        # === 启用后量子混合密钥交换组 ===
        # 这里优先 X25519MLKEM768 再考虑传统组
        ssl_ecdh_curve X25519MLKEM768:X25519:prime256v1;

        # 或者使用 ssl_conf_command 明确传递 OpenSSL 曲线策略
        ssl_conf_command Curves X25519MLKEM768:X25519:prime256v1;

        # 必要时可指定 TLS1.3 密码套件
        ssl_conf_command Ciphersuites TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256;

        # 优先客户端选择（兼容性能更好）
        ssl_prefer_server_ciphers off;

        # === 附加头 此处的附加头可以根据后端中间件自行确定 ===
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-TLS-Protocol   $ssl_protocol  always;
        add_header X-TLS-Cipher     $ssl_cipher    always;
        add_header X-TLS-Curve      $pqc_group     always;
        add_header X-PQC-Status     $pqc_status    always;
        add_header X-TLS-TLS13      $tls13         always;

        root   html;

        location / {
            index  index.html;
        }

        location /api/ {
            proxy_pass http://127.0.0.1:8000/;
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            proxy_set_header X-TLS-Protocol   $ssl_protocol;
            proxy_set_header X-TLS-Cipher     $ssl_cipher;
            proxy_set_header X-TLS-Curve-Raw  $ssl_curve;
            proxy_set_header X-TLS-Curve      $pqc_group;
            proxy_set_header X-PQC-Status     $pqc_status;

            proxy_set_header X-TLS-Cipher-List   $ssl_ciphers;
            proxy_set_header X-TLS-Curves-Client $ssl_curves;
            proxy_set_header X-TLS-ALPN          $ssl_alpn_protocol;
            proxy_set_header X-TLS-Early-Data    $ssl_early_data;
        }
    }
}
```

效果

![image-20260214140115841](./阿里云ICP阻断绕过.assets/image-20260214140115841.png)

## 结论

阿里云的ICP拦截确实存在问题，但问题未必在包大小，因为激活HSTS的HTTPS请求也会被绕过，可能是条件绕过

从阿里云的角度来说，未备案的HTTPS请求一般需要HSTS跳转，而HSTS会被拦截，导致HSTS不可用，但HTTPS的TCP请求确实会被直接阻断丢弃，满足监管要求

该测试的严谨性无法保障，由于所有PQC链路都是自行编译的，没有官方的最佳实践可以参考，因此只能进行测试，不保证生产环境安全
