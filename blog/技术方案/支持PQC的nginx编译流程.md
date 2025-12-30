# 支持PQC的组件编译流程

该文章说明了编译一个支持PQC的实验版本nginx的流程，更多内容可参考

1. [后量子加密白皮书](https://doc.dreamreflex.com/legal/%E9%A1%B9%E7%9B%AE%E7%99%BD%E7%9A%AE%E4%B9%A6/%E5%90%8E%E9%87%8F%E5%AD%90%E5%8A%A0%E5%AF%86%E7%99%BD%E7%9A%AE%E4%B9%A6.html)
2. [PQC支持探测PoC](https://pqc.dreamreflex.com/)

3. [项目仓库](https://github.com/dreamreflex/ngp)

## 安装OpenSSL3.5

安装编译套件

```latex
sudo apt update
sudo apt install -y build-essential git cmake ninja-build perl \
                    libssl-dev pkg-config
```

### 构建OpenSSL

```latex
mkdir -p src
cd ~/src
wget https://www.openssl.org/source/openssl-3.5.0.tar.gz
tar xf openssl-3.5.0.tar.gz
cd openssl-3.5.0

./Configure linux-x86_64 \
  --prefix=/opt/openssl-oqs \
  --libdir=lib \
  shared enable-quic   # 关键：启用 QUIC

make -j$(nproc)
sudo make install_sw

```

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763823727625-6f458f75-058f-405e-9bc6-458a4eccf3cd.png)

配置完成

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763824121243-0b3d42cc-38c4-4743-899e-7c2e8daefba5.png)

无文档安装

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763824133770-9a357131-6e4d-4456-93fb-78a4ba3fd282.png)



### 检查OpenSSL

更新环境变量

```latex
echo 'export PATH=/opt/openssl-oqs/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/opt/openssl-oqs/lib:$LD_LIBRARY_PATH' >> ~/.bashrc
echo 'export OPENSSL_MODULES=/opt/openssl-oqs/lib/ossl-modules' >> ~/.bashrc
source ~/.bashrc

```

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763824264483-32e3626e-6f9d-4d25-8876-920ddeab76fb.png)

3.5安装成功

## 安装liboqs

### 安装ninja

```latex
apt update
apt install -y git cmake ninja-build
```

### 下载代码库

```latex
cd ~/src
git clone -b main https://github.com/open-quantum-safe/liboqs.git
cd liboqs
mkdir build && cd build
```

配置

```latex
cmake -GNinja \
  -DCMAKE_INSTALL_PREFIX=/opt/liboqs \
  -DOQS_BUILD_ONLY_LIB=ON \
  -DOQS_USE_OPENSSL=ON \
  -DOPENSSL_ROOT_DIR=/opt/openssl-oqs ..

```

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763824856573-4ba0bed8-5076-4591-9625-1acb90c73119.png)

### 开始构建

```latex
ninja
ninja install
```

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763825084378-2c6d1a7b-e7eb-4362-878b-41e84f8f78e3.png)

## 安装**oqs-provider**

```latex
cd ~/src
git clone https://github.com/open-quantum-safe/oqs-provider.git
cd oqs-provider
mkdir _build
cd _build

```

配置

```latex
cmake -GNinja \
  -DCMAKE_INSTALL_PREFIX=/opt/openssl-oqs \
  -DOPENSSL_ROOT_DIR=/opt/openssl-oqs \
  -DLIBOQS_ROOT=/opt/liboqs ..

```

构建

```latex
ninja
ninja install
```

很好，`oqsprovider.so` 已经成功装进 `/opt/openssl-oqs/lib/ossl-modules` 了 ✅  
现在让 OpenSSL 自动加载它，并检查 PQC 算法是否可见。

### 创建 OpenSSL 专用配置，启用 oqs-provider

请依次执行下面两段命令（整段复制粘贴即可）：

#### 创建配置文件目录（如果已存在不会报错）

```bash
mkdir -p /opt/openssl-oqs/ssl
```

#### 写入配置文件 `/opt/openssl-oqs/ssl/openssl-oqs.cnf`

```bash
cat > /opt/openssl-oqs/ssl/openssl-oqs.cnf << 'EOF'
openssl_conf = openssl_init

[openssl_init]
providers = provider_sect
alg_section = algorithm_sect

[provider_sect]
default = default_sect
oqsprovider = oqs_sect

[default_sect]
activate = 1

[oqs_sect]
module = /opt/openssl-oqs/lib/ossl-modules/oqsprovider.so
activate = 1

[algorithm_sect]
# 这里先不强制默认算法，后面需要可以再调
EOF
```

#### 1设置环境变量让 OpenSSL 使用这个配置（当前 shell + 以后登录）

```bash
echo 'export OPENSSL_CONF=/opt/openssl-oqs/ssl/openssl-oqs.cnf' >> ~/.bashrc
export OPENSSL_CONF=/opt/openssl-oqs/ssl/openssl-oqs.cnf
```

---

### 确认 provider 已加载

现在执行：

```bash
openssl list -providers
```

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763825314486-a9cd7b1a-495e-4629-a22c-aaa859650313.png)

## 签发证书

```latex
mkdir -p ~/pq-certs
cd ~/pq-certs
pwd
```

### 生成后量子 根 CA证书（基于 ML-DSA-65）

在你的当前目录 `/root/pq-certs` 中，执行以下命令：

```plain
openssl req -x509 -new \
  -newkey ML-DSA-65 \
  -keyout ca.key \
  -out ca.crt \
  -days 3650 \
  -nodes \
  -subj "/CN=OQS-Root-CA" \
  -provider default -provider oqsprovider

```

<!-- 这是一张图片，ocr 内容为： -->
![](./支持PQC的nginx编译流程.assets/1763825489056-256065b5-b200-409a-b2f4-d30d288c47f7.png)

### 生成 PQC 服务器证书（server.key / server.crt）

你现在在 `/root/pq-certs` 目录下，按顺序执行这两条命令：

### 生成服务器私钥 + CSR（证书签名请求）

```plain
openssl req -new \
  -newkey ML-DSA-65 \
  -keyout server.key \
  -out server.csr \
  -nodes \
  -subj "/CN=pq-server.local" \
  -provider default -provider oqsprovider
```

### 用 CA 签发服务器证书

```plain
openssl x509 -req \
  -in server.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt \
  -days 365 \
  -copy_extensions copyall
```

### 确认服务器证书也使用 ML-DSA-65 签名

```plain
openssl x509 -in server.crt -text -noout | grep -i "Signature Algorithm"
```

## 安装Nginx



```plain
apt update
apt install -y build-essential libpcre3 libpcre3-dev zlib1g-dev libssl-dev wget git
```



```plain
cd /usr/local/src
wget https://nginx.org/download/nginx-1.28.0.tar.gz --no-check-certificate
tar -xzf nginx-1.28.0.tar.gz
cd nginx-1.28.0
./configure \
  --prefix=/usr/local/nginx \
  --with-http_ssl_module \
  --with-stream_ssl_module \
  --with-http_v2_module \
  --with-cc-opt='-I/opt/openssl-oqs/include' \
  --with-ld-opt='-L/opt/openssl-oqs/lib -Wl,-rpath,/opt/openssl-oqs/lib'
```



### 编译nginx

```plain
make -j$(nproc)
make install
/usr/local/nginx/sbin/nginx -V
```

### 查看结果

```plain
root@vmuser-VMware-Virtual-Platform:/usr/local/src/nginx-1.28.0# /usr/local/nginx/sbin/nginx -V
nginx version: nginx/1.28.0
built by gcc 13.3.0 (Ubuntu 13.3.0-6ubuntu2~24.04)
built with OpenSSL 3.5.0 8 Apr 2025
TLS SNI support enabled
configure arguments: --prefix=/usr/local/nginx --with-http_ssl_module --with-stream_ssl_module --with-http_v2_module --with-cc-opt=-I/opt/openssl-oqs/include --with-ld-opt='-L/opt/openssl-oqs/lib -Wl,-rpath,/opt/openssl-oqs/lib'
```

### 设置systemd

```plain
/etc/systemd/system/nginx.service
[Unit]
Description=NGINX Hybrid PQC TLS Server
After=network.target

[Service]
Type=forking
PIDFile=/usr/local/nginx/logs/nginx.pid
ExecStart=/usr/local/nginx/sbin/nginx
ExecReload=/usr/local/nginx/sbin/nginx -s reload
ExecStop=/usr/local/nginx/sbin/nginx -s quit

# 如果 /opt/openssl-oqs/lib 不在系统默认库路径，
# 要确保 NGINX 运行时能找到 libssl.so.3
Environment="LD_LIBRARY_PATH=/opt/openssl-oqs/lib"

# 自动重启策略（可选）
Restart=on-failure
RestartSec=2s

[Install]
WantedBy=multi-user.target
```

### 设置nginx

```plain
user  www-data;
worker_processes  auto;

error_log  logs/error.log warn;
pid        logs/nginx.pid;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    # 日志
    access_log  logs/access.log;

    sendfile        on;
    keepalive_timeout  65;

    # ======== 全局 TLS / PQC 设置（关键部分）========
    # 只启用 TLS 1.3（你也可以加 TLSv1.2 作兼容：TLSv1.2 TLSv1.3）
    ssl_protocols TLSv1.3;

    # 使用 OpenSSL 3.5 的 SSL_CONF 接口设置混合组
    # 优先使用 X25519MLKEM768，其次 SecP256r1MLKEM768，再 fallback 到传统组
    ssl_conf_command Groups X25519MLKEM768:SecP256r1MLKEM768:X25519:SecP256r1;

    # 设置 TLS 1.3 密码套件（只留两套足够）
    ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256;
    ssl_prefer_server_ciphers on;

    # session 缓存（可选，但推荐）
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout  10m;

    # ======== HTTP → HTTPS 重定向（可选）========
    server {
        listen      80;
        listen      [::]:80;
        server_name  your.domain.com;

        return 301 https://$host$request_uri;
    }

    # ======== HTTPS + PQC server ========
    server {
        listen      443 ssl http2;
        listen      [::]:443 ssl http2;
        server_name  your.domain.com;

        # 替换成你自己的证书和私钥
        ssl_certificate      /usr/local/nginx/conf/cert.pem;
        ssl_certificate_key  /usr/local/nginx/conf/key.pem;

        # 可以额外限制只用 TLS 1.3
        # ssl_protocols TLSv1.3;

        # 如果想只对某个 server 生效，也可以把 ssl_conf_command 挪到这里
        # ssl_conf_command Groups X25519MLKEM768:SecP256r1MLKEM768:X25519:SecP256r1;

        root   html;
        index  index.html index.htm;

        location / {
            try_files $uri $uri/ =404;
        }
    }
}
```