---
order: 1
title: 'Windows 账户体系与权限体系'
description: 'Windows 的账户与权限体系主要围绕多用户隔离等目标设计。'
pubDate: '2026-01-01'
tags: []
---
# Windows 账户体系与权限体系

## 1. 设计目标与总体思路

Windows 的账户与权限体系主要围绕以下目标设计：

* **多用户隔离**：不同用户的进程、文件、配置相互隔离
* **最小权限原则（Least Privilege）**：默认不授予高权限
* **集中身份与访问控制**：支持单机、本地域、域环境
* **兼容性与可管理性**：兼顾 GUI 用户、服务账户、系统进程

Windows 的安全模型由 **账户（Identity）+ 权限（Authorization）+ 审计（Audit）** 共同构成，其核心由 Microsoft 的 NT 内核安全架构提供支持。


## 2. Windows 账户体系的基本概念

### 2.1 安全主体（Security Principal）

在 Windows 中，**任何可以被授予权限的对象**都称为安全主体，包括：

* 用户账户（User）
* 用户组（Group）
* 计算机账户（Computer）
* 服务账户（Service）
* 系统内置账户（SYSTEM 等）

每一个安全主体都有一个唯一的 **SID（Security Identifier）**，而不是依赖用户名。

> SID 是权限判断的真正依据，用户名只是可读别名。


### 2.2 账户存储位置

Windows 支持多种账户来源：

| 类型           | 存储位置                 |
| ------------ | -------------------- |
| 本地账户         | 本机 SAM 数据库           |
| Microsoft 账户 | 本地 + 微软云账户绑定         |
| 域账户          | Active Directory（AD） |
| 服务账户         | 本地 / 域（受限用途）         |


## 3. Windows 中的账户类型

### 3.1 普通用户账户（Standard User）

* 默认登录账户类型
* 权限受限
* 无法修改系统级配置
* 推荐日常使用

适用场景：
日常办公、开发、普通应用运行


### 3.2 管理员账户（Administrator）

管理员并非“始终高权限”，而是：

* 登录后默认运行在 **受限管理员令牌**
* 需要显式提升（UAC）才能执行高权限操作

特点：

* 可安装驱动、修改系统设置
* 可管理其他账户
* 受 UAC 控制


### 3.3 内置系统账户（Built-in Accounts）

| 账户名             | 权限级别 | 用途        |
| --------------- | ---- | --------- |
| SYSTEM          | 最高   | 操作系统核心服务  |
| Local Service   | 低    | 本地服务（受限）  |
| Network Service | 中    | 需要网络访问的服务 |

这些账户通常不可用于交互式登录。


### 3.4 服务账户（Service Account）

* 用于运行 Windows 服务
* 可以是本地账户或域账户
* 支持 **最小权限配置**

常见于数据库、Web Server、后台任务。


## 4. Windows 权限体系（Authorization）

### 4.1 权限的基本单位：ACL / ACE

Windows 使用 **访问控制列表（ACL）** 进行权限控制。

* **ACL**：一组访问规则
* **ACE**：单条规则（允许/拒绝）

常见 ACL 应用对象：

* 文件 / 目录（NTFS）
* 注册表键
* 服务
* 命名管道
* 进程对象


### 4.2 NTFS 文件权限模型

常见权限包括：

* Read（读取）
* Write（写入）
* Execute（执行）
* Modify（修改）
* Full Control（完全控制）

权限可：

* 继承（Inheritance）
* 显式设置（Explicit）
* 通过组授权


### 4.3 Token（访问令牌）机制

用户登录后，Windows 会生成一个 **Access Token**，其中包含：

* 用户 SID
* 所属组 SID
* 特权（Privileges，如 SeShutdownPrivilege）
* 完整性级别（Integrity Level）

进程访问资源时，系统比较：

> **进程 Token ↔ 资源 ACL**


## 5. UAC（用户帐户控制）机制

### 5.1 UAC 的本质

UAC 并不是权限管理系统，而是：

> **权限提升控制与安全边界**

管理员登录后会得到两个 Token：

* 标准 Token（默认使用）
* 管理员 Token（需确认）


### 5.2 提权流程

1. 普通进程运行（低权限）
2. 请求管理员操作
3. UAC 弹窗确认
4. 使用高权限 Token 重新执行


### 5.3 UAC 的安全价值

* 防止静默提权
* 降低恶意软件危害面
* 强制权限显式使用


## 6. 完整性级别（Integrity Level）

Windows 引入 **强制完整性控制（MIC）**：

| 级别     | 用途                   |
| ------ | -------------------- |
| Low    | 沙箱（浏览器、AppContainer） |
| Medium | 普通用户程序               |
| High   | 管理员程序                |
| System | 系统核心                 |

规则：
**低完整性进程不能写入高完整性对象**


## 7. 与 Linux 权限模型的核心差异

| 对比项   | Windows     | Linux      |
| ----- | ----------- | ---------- |
| 身份标识  | SID         | UID/GID    |
| 权限模型  | ACL + Token | rwx + ACL  |
| 提权机制  | UAC         | sudo / su  |
| 服务权限  | 独立账户        | 通常 root    |
| 细粒度特权 | Privilege   | Capability |

Windows 更偏向 **企业级、集中化、可视化安全管理**。


## 8. 官方文档与参考

* Microsoft Learn：Windows Security Architecture
* Microsoft Learn：Access Control Overview
* Microsoft Learn：User Account Control
