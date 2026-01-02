---
title: 'Samba文件共享运维文档'
description: 'Samba服务的配置策略、设计原则与运维流程'
pubDate: '2026-01-01'
tags: ['技术方案', '运维']
---

# Samba文件共享运维文档 T1

## 1. 文档目的

本文档用于说明：

1. 当前 Samba（SMB）服务的配置策略与设计原则
2. 各核心配置项的含义与作用
3. 增用户访问共享目录的标准操作流程
4. 常见维护与检查方法

## 2. 服务概览

| 项目    | 说明                          |
| ----- | --------------------------- |
| 服务类型  | Samba（SMB 文件共享）             |
| 服务器角色 | 独立文件服务器（Standalone）         |
| 主要客户端 | Windows / Linux             |
| 协议策略  | 禁用 SMB1，仅 SMB2.10 ~ SMB3.11 |
| 安全策略  | 禁止 guest，强制用户认证             |
| 性能策略  | 稳定优先，不启用 RDMA / 高风险调优       |

## 3. 配置文件位置

```text
/etc/samba/smb.conf
```

说明：

* Samba 只有这一个核心配置文件
* 所有共享、权限策略最终都体现在该文件中

修改后必须执行：

```bash
testparm -s
systemctl restart smbd
```

## 4. 当前全局配置说明（[global]）

```ini
[global]
   workgroup = WORKGROUP
   server string = Samba NAS
   server role = standalone server

   netbios name = PHIL616NAS

   security = user
   map to guest = never

   server min protocol = SMB2_10
   server max protocol = SMB3_11

   server multi channel support = no

   log file = /var/log/samba/log.%m
   max log size = 1000
   logging = file

   load printers = no
   printing = bsd
   printcap name = /dev/null
   disable spoolss = yes
```

### 4.1 关键配置项解释

#### 4.1.1 身份与发现

| 配置项           | 含义                     |
| ------------- | ---------------------- |
| workgroup     | Windows 工作组名称          |
| server string | 在客户端显示的服务器描述           |
| netbios name  | SMB 服务名（≤15 字符，避免发现异常） |


#### 4.1.2 认证与安全

| 配置项                  | 含义              |
| -------------------- | --------------- |
| security = user      | 基于用户认证          |
| map to guest = never | 禁止匿名/guest 自动映射 |

**设计意图**

* 所有访问必须有明确用户
* 避免误暴露共享目录


#### 4.1.3 协议策略

| 配置项                           | 含义        |
| ----------------------------- | --------- |
| server min protocol = SMB2_10 | 禁用 SMB1   |
| server max protocol = SMB3_11 | 启用最新 SMB3 |

#### 4.1.4 性能与稳定性

| 配置项                               | 含义          |
| --------------------------------- | ----------- |
| server multi channel support = no | 禁用多通道（稳定优先） |

说明：

* 多通道仅在明确测试过的环境中启用
* 本服务器以稳定维护为第一目标

#### 4.1.5 日志与无关功能禁用

| 项目   | 目的           |
| ---- | ------------ |
| 日志文件 | 排障、审计        |
| 禁用打印 | 减少无关组件，降低复杂度 |

## 5. 共享目录配置说明

```ini
[ShareFolder]
   comment = ShareFolder
   path = /hdd/desktop

   browseable = yes
   read only = no
   guest ok = no

   valid users = smbuser

   force user = smbuser
   force group = smbuser

   create mask = 0660
   directory mask = 0770
```

### 5.1 共享策略说明

| 项目    | 策略      |
| ----- | ------- |
| 访问方式  | 仅授权用户   |
| 写入权限  | 允许      |
| guest | 明确禁止    |
| 文件属主  | 强制为指定用户 |

### 5.2 force user 的设计意义（非常重要）

```ini
force user = smbuser
```

作用：

* 所有通过 SMB 写入的文件
* 在 Linux 上统一归属为 smbuser

好处：

* 避免权限混乱
* 避免 Windows/Linux 用户 UID 映射问题
* 大幅降低后期维护成本

## 6. 新增一个用户访问共享目录的标准流程（重点）

以下流程 **必须按顺序执行**。

---

### 6.1 场景说明

> 新增用户 `userA`，允许其访问 `/hdd/desktop` 共享


### 6.2 第一步：创建 Linux 用户

```bash
useradd userA
passwd userA
```

说明：

* Samba 用户必须先是 Linux 用户

### 6.3 第二步：添加 Samba 用户

```bash
smbpasswd -a userA
smbpasswd -e userA
```

说明：

* Samba 使用独立的密码数据库
* Linux 密码 ≠ Samba 密码


### 6.4 第三步：设置目录权限

如果共享使用 `force user = smbuser`：

```bash
usermod -aG smbuser userA
```

并确保目录权限：

```bash
chown -R smbuser:smbuser /hdd/desktop
chmod -R 0770 /hdd/desktop
```

### 6.5 第四步：修改 smb.conf

在共享中追加用户：

```ini
valid users = smbuser userA
```

### 6.6 第五步：校验并重启

```bash
testparm -s
systemctl restart smbd
```

### 6.7 第六步：客户端验证

Windows 访问：

```text
\\服务器IP\ShareFolder
```

使用：

* 用户名：userA
* 密码：smbpasswd 设置的密码

## 7. 日常维护与检查

### 7.1 查看当前生效配置

```bash
testparm -s
```

### 7.2 查看连接状态

```bash
smbstatus
```

### 7.3 查看日志

```bash
ls /var/log/samba/
tail -f /var/log/samba/log.*
```

## 8. 运维原则

1. **不启用 RDMA / 内核级 oplocks 等高风险参数**
2. **所有共享必须明确 valid users**
3. **目录权限与 smb.conf 必须一致**
4. **新增用户必须同时处理：**

   * Linux 用户
   * Samba 用户
   * 目录权限
   * smb.conf
5. 修改配置后：

   * 必须 `testparm`
   * 必须重启服务