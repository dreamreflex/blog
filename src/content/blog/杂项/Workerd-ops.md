---
title: 'workerd部署指南'
description: 'Workerd边缘逻辑部署指南'
pubDate: '2026-07-02'
tags: ['边缘网络']
---

# Workerd 运维手册（systemd + Socket Activation）

版本：v1.0

目标：
- 长期运行 Workerd
- systemd 常驻监听 8888
- workerd 可以随时重启
- 非 root 权限运行
- 适合作为 API Gateway、反向代理、Edge Runtime 的基础设施

---

## 一、整体架构

采用 systemd Socket Activation 架构。

```text
Client
  ↓
TCP:8888
  ↓
systemd(workerd.socket)
  ↓
fd=3
  ↓
workerd(workerd.service)
  ↓
worker.js
  ↓
Response
```

核心思想：

> systemd 管理网络端口，workerd 管理业务逻辑。

---

## 二、目录结构

统一使用：

```text
/etc/workerd/
├── config.capnp
└── worker.js
```

systemd：

```text
/etc/systemd/system/
├── workerd.socket
└── workerd.service
```

---

## 三、创建运行用户

创建专用用户：

```bash
sudo useradd \
  --system \
  --no-create-home \
  --shell /usr/sbin/nologin \
  workerd
```

查看：

```bash
id workerd
```

---

## 四、编写 worker.js

文件：`/etc/workerd/worker.js`

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return Response.json({
        status: "healthy",
        timestamp: new Date().toISOString()
      })
    }

    return Response.json({
      runtime: "workerd",
      method: request.method,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      timestamp: new Date().toISOString()
    })
  }
}
```

---

## 五、编写 config.capnp

文件：`/etc/workerd/config.capnp`

```capnp
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (
      name = "main",
      worker = .mainWorker
    )
  ],
  sockets = [
    (
      name = "http",
      service = "main",
      http = ()
    )
  ]
);

const mainWorker :Workerd.Worker = (
  compatibilityDate = "2026-06-17",
  modules = [
    (
      name = "worker.js",
      esModule = embed "worker.js"
    )
  ]
);
```

注意：不要在这里配置 `*:8888`，因为 systemd 已经负责监听。

---

## 六、编写 workerd.socket

文件：`/etc/systemd/system/workerd.socket`

```ini
[Unit]
Description=Socket for workerd

[Socket]
ListenStream=0.0.0.0:8888
NoDelay=true

[Install]
WantedBy=sockets.target
```

作用：长期占用 8888。

---

## 七、编写 workerd.service

文件：`/etc/systemd/system/workerd.service`

```ini
[Unit]
Description=workerd runtime
After=network-online.target
Requires=workerd.socket
Wants=network-online.target

[Service]
Type=exec
ExecStart=/usr/bin/workerd serve /etc/workerd/config.capnp --socket-fd http=3
Sockets=workerd.socket
Restart=always
RestartSec=1
User=workerd
Group=workerd
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

---

## 八、设置权限

```bash
sudo chown -R root:workerd /etc/workerd
sudo chmod -R 750 /etc/workerd
```

---

## 九、启动系统

刷新 systemd：

```bash
sudo systemctl daemon-reload
```

启用 socket & service：

```bash
sudo systemctl enable workerd.socket
sudo systemctl enable workerd.service
```

启动：

```bash
sudo systemctl start workerd.socket
sudo systemctl start workerd.service
```

---

## 十、查看状态

```bash
systemctl status workerd.socket
systemctl status workerd.service
ss -tlnp | grep 8888
```

正常情况：

```text
LISTEN 0 4096 0.0.0.0:8888 users:(("systemd",pid=1))
```

注意：监听者是 systemd，不是 workerd。

---

## 十一、查看日志

实时查看：

```bash
journalctl -u workerd -f
```

查看最近 100 行：

```bash
journalctl -u workerd -n 100
```

---

## 十二、重启 workerd

仅重启业务进程：

```bash
sudo systemctl restart workerd.service
```

注意：不要重启 socket，因为 socket 是长期存在的。

---

## 十三、停止 workerd

停止业务：

```bash
sudo systemctl stop workerd.service
```

8888 依然存在，因为 socket 还活着。

```text
systemd → 8888 → 仍然监听
```

---

## 十四、关闭整个系统

停止：

```bash
sudo systemctl stop workerd.service
sudo systemctl stop workerd.socket
```

禁用：

```bash
sudo systemctl disable workerd.service
sudo systemctl disable workerd.socket
```

---

## 十五、接口测试

健康检查：

```bash
curl http://127.0.0.1:8888/health
```

返回：

```json
{
  "status": "healthy"
}
```

普通请求：

```bash
curl 'http://127.0.0.1:8888/hello?name=demo'
```

返回：

```json
{
  "runtime": "workerd",
  "pathname": "/hello"
}
```

---

## 十六、推荐使用场景

适合：
- API Gateway
- Reverse Proxy
- Zero Trust Gateway
- Internal Service Mesh
- Agent Runtime
- HTTP Orchestration Layer

不推荐：
- 大量本地文件读写
- 长时间 CPU 密集型任务
- 替代数据库
- 替代 Linux 容器
