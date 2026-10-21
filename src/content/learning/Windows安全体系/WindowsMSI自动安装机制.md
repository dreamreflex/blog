---
title: 'Windows 软件安装、MSI 自动安装与用户档案'
description: '比较 MSI、EXE、MSIX 等安装形式的管理边界，解释每用户与每计算机安装范围及静默安装的使用前提。'
pubDate: '2026-10-21'
tags: []
order: 6
---

上一篇：[账户机制](Windows账户机制.md) · 返回：[总目录](index.md) · 下一篇：[环境变量](Windows环境变量机制.md)

适用范围：Windows 11／Windows Installer 5.x 为主。资料核验日期：2026-10-21。安装参数必须以具体软件厂商文档和包设计为准。

## 1. Windows 没有一个包办全部软件的安装器

安装通常包括复制文件、登记卸载信息、安装依赖、创建快捷方式，以及按需注册组件、服务或驱动。是否需要管理员，取决于要修改什么和安装包设计，不只取决于文件扩展名。

| 形式 | 负责什么 | 管理特点 |
| --- | --- | --- |
| MSI | Windows Installer 数据库与安装引擎 | 按产品、组件和功能组织资源，支持维护、修复和卸载 |
| EXE 安装器 | 厂商自行选择框架或引导多个安装包 | 可能内部启动 MSI，也可能完全不用 MSI；没有统一静默参数 |
| MSIX／AppX | 包身份、部署和相应隔离机制 | 包部署、用户注册和预配需要区分；并非所有桌面 EXE 都天然成为沙盒应用 |
| 便携软件 | 解压后直接运行 | 仍可能写 AppData、注册表或依赖外部运行库 |
| Windows 可选功能／系统组件 | Windows 维护机制 | 通过设置、DISM 或相应组件管理，不宜当作普通第三方安装包删除 |

WinGet 是发现、下载和调用相应安装器的包管理工具，不能让不支持静默安装的软件凭空获得完整静默能力。[Windows Installer 概述](https://learn.microsoft.com/en-us/windows/win32/msi/windows-installer-portal)、[MSIX 概述](https://learn.microsoft.com/en-us/windows/msix/overview)。

## 2. 每用户安装与每计算机安装

每用户（per-user）安装把产品注册、快捷方式等与某个用户关联；每计算机（per-machine）安装将产品登记到机器范围，供符合权限和使用条件的用户使用。安装范围、文件读写权限、软件许可和用户数据是不同维度。

| 内容 | 每用户常见位置 | 每计算机常见位置 |
| --- | --- | --- |
| 程序文件 | `%LOCALAPPDATA%\Programs` 或厂商选择的用户目录 | `%ProgramFiles%`、`%ProgramFiles(x86)%` |
| 软件注册 | HKCU 下相应项 | HKLM 下相应项 |
| 快捷方式 | 当前用户开始菜单／桌面 | 公共开始菜单／公共桌面 |
| 配置和数据 | 用户自己的 AppData | 公共数据可以放 ProgramData，但个人配置仍通常在各自档案 |

这些是常见约定，实际路径由包设计和已知文件夹解析决定。不能从 `D:\Apps` 这个路径推出安装范围，也不能把“只有一个用户有快捷方式”直接判断为其他用户无法运行 EXE。[安装上下文](https://learn.microsoft.com/en-us/windows/win32/msi/installation-context)。

### 2.1 Windows 怎么决定范围

MSI 通过包的属性、设计、用户权限及系统策略决定安装上下文，主要属性是 `ALLUSERS` 和 `MSIINSTALLPERUSER`：

| 属性组合 | 含义 |
| --- | --- |
| `ALLUSERS` 为空／未设置 | 按相应规则使用每用户上下文 |
| `ALLUSERS=1` | 每计算机上下文，需要满足相应权限 |
| `ALLUSERS=2` | 允许引擎结合系统、权限与属性解析上下文 |
| `ALLUSERS=2 MSIINSTALLPERUSER=1` | 对正确编写的双用途包请求每用户安装 |
| `ALLUSERS=2 MSIINSTALLPERUSER=""` | 对相应双用途包请求每计算机安装 |

`MSIINSTALLPERUSER` 仅在 `ALLUSERS=2` 时参与这一选择。不能给任何 MSI 强塞属性就保证转换成功：包可能限制上下文，硬编码了机器级路径，或包含必须提升的服务／驱动操作。普通用户范围安装也不保证整个安装器绝不触发提权。[ALLUSERS 官方规则](https://learn.microsoft.com/en-us/windows/win32/msi/allusers)。

### 2.2 安装用户、执行身份和使用用户

它们可能是三个人或三种上下文。部署代理可能以 SYSTEM 安装机器级软件，随后普通用户运行；标准用户输入另一个管理员凭据运行 EXE，安装器若错误地按执行身份写 HKCU，就可能写进管理员档案。MSI 还区分客户端、安装服务和自定义操作的执行上下文，因此不能只看任务管理器中的某个进程名字就判断安装范围。

## 3. MSI 的维护模型为何重要

MSI 不是一段仅按顺序复制文件的脚本，而是描述资源及其状态的数据库：ProductCode 标识产品，UpgradeCode 关联产品系列，Component 组织被跟踪的安装资源，Feature 表示可选择功能。组件标识与 KeyPath 等规则影响修复和卸载是否正确。

引擎按序列执行动作，可以安排回滚；自定义操作、外部 EXE 和跨包引导程序若没有正确实现配套处理，并不保证所有副作用都能自动回滚。双击安装、静默部署、修复和卸载可能走不同分支，所以交互安装成功不能直接证明自动部署成功。

不要手动清理 `%WINDIR%\Installer` 或软件包缓存来“瘦身”：维护与卸载可能依赖缓存包和补丁。也不要启用 AlwaysInstallElevated 来绕过提权问题，这会让安装包获得危险的提升路径。[Windows Installer 组件](https://learn.microsoft.com/en-us/windows/win32/msi/windows-installer-components)、[AlwaysInstallElevated](https://learn.microsoft.com/en-us/windows/win32/msi/alwaysinstallelevated)。

## 4. 自动／静默安装如何设计

“静默”只是不显示交互界面，不意味着没有权限要求、不重启、不需要许可证，也不意味着程序会自动获得所有用户配置。可靠部署应明确：包来源及签名、目标体系结构、安装范围、依赖、日志位置、退出码、重启安排、检测与卸载方法。

下面是**会安装软件**的模板，只能在确定需要部署该可信 MSI 时使用。路径需替换；日志目录需预先存在。机器范围通常需要管理员终端，范围参数仅用于支持该设计的包。

```powershell
# 此例使用一个已经存在的临时目录保存日志；不要把机密属性放到命令行
$msiLog = Join-Path $env:TEMP 'example-install.log'
& msiexec.exe /i 'D:\Packages\example.msi' /qn /norestart /L*v $msiLog
# 自动化脚本需要通过等待进程退出的方式可靠取得退出码
```

如果脚本需要等待并判断结果，可在无空格的示例路径下使用：

```powershell
# 会执行安装；参数包含空格时须额外正确引用
$installProcess = Start-Process -FilePath 'msiexec.exe' `
    -ArgumentList '/i D:\Packages\example.msi /qn /norestart /L*v D:\Packages\example-install.log' `
    -Wait -PassThru
$installProcess.ExitCode
```

常见返回码：0 成功；3010 成功但需要重启；1641 成功并已启动重启；1603 是一般性严重失败；1618 表示另一安装正在进行。1603 不是根因说明，需查看详细日志。`/norestart` 避免安装器主动重启，不表示系统无需重启。EXE 的 `/S`、`/silent` 等参数不统一，必须查厂商文档。[msiexec 参数](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/msiexec)、[MSI 错误码](https://learn.microsoft.com/en-us/windows/win32/msi/error-codes)。

卸载应优先使用系统“已安装的应用”或厂商支持的卸载入口；MSI 可用 `/x` 配合已确认的包或 ProductCode，卸载同样属于状态变更。不要仅删除程序目录作为标准卸载。

## 5. 默认安装目录为什么不同

目录差异主要来自安装范围、进程体系结构、包技术、厂商设计和用户选择。在常见 x64 Windows 上，原生 64 位程序通常使用 Program Files，32 位程序通常使用 Program Files (x86)；WOW64 还涉及文件系统和注册表视图重定向。ARM64 环境有原生及模拟应用，不能只靠目录名判断实际架构。

`System32` 在 64 位 Windows 中主要放原生系统二进制，`SysWOW64` 主要提供 32 位兼容组件，名称有历史原因。不要把“32”看成当前位数说明。[WOW64 文件系统重定向](https://learn.microsoft.com/en-us/windows/win32/winprog64/file-system-redirector)。

开发者应通过 Known Folder API 获取目录；Program Files 用于程序，用户可写配置应放 AppData，跨用户共享数据可放受适当 ACL 保护的 ProgramData。程序不能因普通用户无法写安装目录，就要求用户长期以管理员身份运行。[SHGetKnownFolderPath](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shgetknownfolderpath)。

## 6. 用户档案如何组织

账户与用户档案不是一回事。账户可以先存在，首次建立交互登录环境时再创建档案；档案目录不要求与当前显示名一致。

| 路径／对象 | 内容和用途 |
| --- | --- |
| `%USERPROFILE%` | 当前用户档案根目录，通常在 `C:\Users` 下 |
| `%APPDATA%` | 通常为 AppData\Roaming；是否真正漫游取决于组织配置 |
| `%LOCALAPPDATA%` | 通常为 AppData\Local，放本机相关数据、缓存和用户级程序等 |
| `NTUSER.DAT` | 用户注册表配置单元的重要文件，登录加载后关联 HKCU；HKCU 还包含其他映射内容 |
| `C:\Users\Default` | 新档案创建时的默认模板，不是所有现有用户的实时公共配置 |
| `C:\Users\Public` | 按权限共享的公共文件，不是一个所有用户共用的 HKCU |
| `%ProgramData%` | 全机软件数据，不代表所有内容都应允许所有用户写入 |

HKCU 取决于当前进程／线程的实际用户上下文；服务和部署脚本不应默认它指向正在看桌面的那个人。OneDrive 文件夹备份、重定向和企业档案方案也可能改变 Documents／Desktop 的实际位置。

不要直接重命名档案目录来修改用户名；应用路径、ACL、注册表映射和同步软件都可能受影响。重建档案前应确认数据备份和加密密钥；管理员重置密码与用户正常更改密码的语义不同，可能影响 EFS、DPAPI 等受保护数据的可用性。[用户配置文件概述](https://learn.microsoft.com/en-us/windows/win32/shell/user-profiles)。

## 7. 排障案例：装好了，但只有安装者能正常使用

先确认产品实际按哪个范围登记，再依次检查公共快捷方式、程序文件读取权限、依赖、首次启动初始化和个人配置。若程序文件供所有用户读取，但设置只写在安装者 HKCU，其他用户可能需要受支持的首次运行配置；复制整个管理员档案通常不是正确方案。

MSI 失败时按时间定位详细日志中的错误及 `Return value 3` 附近动作，再往前寻找最早的具体失败；不要把每一次探测路径不存在都当成错误。应用已经安装但启动失败时，进入[调试与运行库](Windows调试.md)的流程。

## 8. 参考来源

- [Windows Installer](https://learn.microsoft.com/en-us/windows/win32/msi/windows-installer-portal)、[安装上下文](https://learn.microsoft.com/en-us/windows/win32/msi/installation-context)、[ALLUSERS](https://learn.microsoft.com/en-us/windows/win32/msi/allusers)：安装范围及维护模型。
- [msiexec](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/msiexec)、[错误码](https://learn.microsoft.com/en-us/windows/win32/msi/error-codes)：自动部署参数与结果。
- [Known Folder API](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shgetknownfolderpath)、[用户档案](https://learn.microsoft.com/en-us/windows/win32/shell/user-profiles)：路径解析与档案。

