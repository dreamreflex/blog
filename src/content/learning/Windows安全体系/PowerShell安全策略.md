---
order: 3
title: 'PowerShell安全策略'
description: 'PowerShell内定的安全策略和相关配置'
pubDate: '2026-01-03'
tags: []
---

## Execution Policy

PowerShell 有一套执行策略机制（Execution Policy），不是权限，而是“安全提醒机制”。

常见策略：

| 策略           | 含义         |
| ------------ | ---------- |
| Restricted   | 禁止所有脚本（默认） |
| AllSigned    | 所有脚本必须签名   |
| RemoteSigned | 网络下载脚本需签名  |
| Unrestricted | 不限制（最危险）   |
| Bypass       | 完全绕过检查     |

默认情况下执行策略不允许使用PS1脚本

通过管理员PowerShell允许脚本执行

```
Set-ExecutionPolicy Unrestricted -Scope CurrentUser
```

将不限制限定在当前用户

## Profile

Profile 是 PowerShell 启动时自动执行的脚本文件，PowerShell 的「启动配置文件」 ≈ `.bashrc` / `.zshrc`。

Profile有多种作用域

| 变量                           | 说明                       |
| ------------------------------ | -------------------------- |
| `$PROFILE`                     | 当前用户 + 当前 PowerShell |
| `$PROFILE.CurrentUserAllHosts` | 当前用户，所有 PS          |
| `$PROFILE.AllUsersAllHosts`    | 所有用户（需管理员）       |

### 1. 查看 Profile 是否存在

```
Test-Path $PROFILE
```

返回：

- `False`：未创建
- `True`：已存在


### 2. 创建 Profile 文件

```
New-Item -Type File -Path $PROFILE -Force
```

### 3. 编辑 Profile

使用记事本：

```
notepad $PROFILE
```

### 3. 编辑 Profile

使用记事本：

```
notepad $PROFILE
```

或 VS Code：

```
code $PROFILE
```


### 4. 示例 Profile 内容

```
# 设置 UTF-8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 常用别名
Set-Alias ll Get-ChildItem
Set-Alias grep Select-String

# 显示路径的简洁提示符
function prompt {
    "PS $($PWD)> "
}

# 自动导入模块（示例）
# Import-Module posh-git
```

### 5. 立即生效（不用重开 PowerShell）

```
. $PROFILE
```

