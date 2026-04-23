---
title: 'SMB协议检查'
description: '公共网络中的SMB协议检查手册'
pubDate: '2026-04-22'
tags: ['远程办公', '网络安全']
---

# SMB协议检查手册

## PowerShell

```
Get-Service LanmanWorkstation
Start-Service LanmanWorkstation
```

服务名：

- `LanmanWorkstation` = SMB 客户端

PowerShell查看配置信息
```
Get-SmbServerConfiguration
```

## 组策略限制

域策略（Group Policy）是否被禁用

路径：

```
gpedit.msc
→ 计算机配置
→ 管理模板
→ 网络
→ Lanman Workstation / Server
```
