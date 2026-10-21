# Windows 系统版本机制

返回：[总目录](index.md) · 下一篇：[账户机制](Windows账户机制.md)

适用范围：以 Windows 11 客户端为主，解释 Windows 10 的历史命名；涉及 Server 时单独注明。资料核验日期：2026-10-21。发布状态、功能授权和支持期限会变化，应以文末官方页面为准。普通 Windows 10 支持已于 2025-10-14 结束，LTSC 和符合条件的 ESU 等有单独安排，不能把本文提到 Windows 10 机制理解为所有 Windows 10 版本仍受常规支持。[Windows 10 生命周期说明](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro)。

## 1. 先把“版本”拆成不同维度

描述一套 Windows，至少要回答下面六个问题。只说“企业版”或“最新版”都不足以判断兼容性。

| 维度 | 示例 | 回答的问题 |
| --- | --- | --- |
| 产品代际 | Windows 10、Windows 11、Windows Server | 属于哪个产品系列 |
| 产品版本（Edition） | Home、Pro、Enterprise | 开放哪些功能、需要什么许可 |
| 功能发布（Version） | 24H2、25H2 | 属于哪一次功能发布 |
| OS Build | 26100.某修订号 | 具体代码和更新基线 |
| 服务或预览通道 | 常规可用通道、LTSC、Insider | 如何接收功能与质量更新 |
| 体系结构 | x86、x64、ARM64 | 可以运行哪些系统二进制与驱动 |

激活方式是另一个维度。例如，Pro 可以通过零售密钥或符合条件的批量激活使用；LTSC 也不是一种激活方法。

## 2. 家庭版、专业版、企业版和工作站版

| 名称 | 主要用途 | 需要理解的区别 |
| --- | --- | --- |
| Home／家庭版 | 个人和家庭使用 | 具有 NT 账户权限、网络和应用运行基础；通常不能加入 AD 域或 Microsoft Entra ID，不提供内置远程桌面主机、完整 Hyper-V 角色等 Pro 能力 |
| Pro／专业版 | 商用终端、开发和管理 | 增加域加入、组策略管理、远程桌面主机、Hyper-V 等能力，具体功能仍有硬件要求 |
| Pro for Workstations／专业工作站版 | 特定高性能工作站 | 在 Pro 基础上提供相应工作站能力和更高硬件资源上限；是否受益取决于硬件与负载，并不保证普通软件更快 |
| Enterprise／企业版 | 企业集中部署和安全管理 | 在 Pro 基础上提供企业功能与许可选择；部分安全、管理或云服务还取决于具体订阅，装上 Enterprise 不自动获得全部微软服务 |
| Education／教育版 | 教育组织 | 与企业功能有较多交集，但许可对象及条款不同；Pro Education 又是另一个 Edition |
| IoT Enterprise | 专用设备 | 面向特定设备和授权场景，不能仅因为名字含 Enterprise 就与通用企业桌面许可混用 |

家庭版也有文件 ACL、管理员和标准用户。缺少某些管理界面不等于缺少底层安全机制。家庭版在符合硬件和账户条件时可能提供“设备加密”，这也不能简单等同于 Pro 的完整 BitLocker 管理能力。选型应从域加入、远程桌面主机、虚拟化、安全策略和许可需求出发。参见 [Microsoft Windows 版本升级说明](https://learn.microsoft.com/en-us/windows/deployment/upgrade/windows-edition-upgrades) 和 [Windows 11 商业许可指南](https://www.microsoft.com/licensing/docs/documents/download/Windows_11_Commercial_Licensing_Guide.pdf)。

硬件上限也有实际差异：微软列出的 Windows 11 物理内存上限中，Home 为 128 GB，Pro／Education 为 2 TB，Enterprise／Pro for Workstations 为 6 TB；这是系统产品上限，主板、CPU、固件和应用还会施加自己的限制。工作站版不能让只支持 64 GB 的主板自动支持数 TB 内存。[Windows 内存限制](https://learn.microsoft.com/en-us/windows/win32/memory/memory-limits-for-windows-releases)。

工作站场景还经常涉及 ReFS 和 SMB Direct 等能力。SMB Direct 需要相应的 RDMA 网卡和支持的对端；桌面 Windows 的客户端能力也不能当作 Windows Server 的服务端能力。现代部分 Pro 发布也获得了相应支持，因此不能把旧版产品宣传表当成永久独占功能清单。[SMB Direct 的当前要求](https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-direct)。

Edition 名称中的 N／KN 通常表示移除了部分媒体相关功能，并非比非 N 版本更高一级。S 模式描述一组应用和安全限制，也不能与 Home、Pro 的全部差异画等号；Evaluation 是评估用途和期限相关标记，不能当作永久授权版本。要同时核对完整产品名、实际功能和许可。

## 3. LTS、LTSB 与 LTSC

LTS 是“长期支持”的通用缩写，并非 Windows 桌面系统中一个与 Home、Pro 平级的正式通用 Edition。微软旧称 LTSB（长期服务分支），后来采用 LTSC（长期服务通道）。具体产品名称可以是“Windows 11 Enterprise LTSC 2024”。

LTSC 主要服务于医疗设备、工控终端等功能稳定的专用设备：维持相对固定的功能基线，持续接收相应维护更新，跨 LTSC 发布仍需要规划升级。它不是“永远不更新”，也不是“保证所有新硬件和软件都长期兼容”。应用厂商可以不支持某个 LTSC 版本。

不要把所有 LTSC 都理解为十年支持。Windows 11 Enterprise LTSC 2024 的支持截至 2029-10-09；IoT Enterprise LTSC 2024 的支持期限不同，可延续至 2034-10-10。还不能笼统说“LTSC 都没有 Edge”：2024 版的官方说明明确包含 Edge，应看具体发布。[LTSC 总览](https://learn.microsoft.com/en-us/windows/whats-new/ltsc/overview)、[LTSC 2024 功能与生命周期](https://learn.microsoft.com/en-us/windows/whats-new/ltsc/whats-new-windows-11-2024)。

## 4. 内核版本、功能版本、Build 和 KB 的关系

可以把 `10.0.26100.x` 理解为“主版本.次版本.构建号.修订号”的示例。Windows 11 仍沿用 NT 10.0 这一版本体系，不能看到 `10.0` 就断言是 Windows 10。构建号用于区分代码基线，末尾修订号反映该基线的维护状态；不同系统文件的文件版本又可能不同，不能把任意 DLL 的版本直接当成整机系统版本。

`24H2` 表示命名上属于 2024 年下半年的功能发布；它不是精确安装时间，也不是版本号排序的完整算法。Windows 10 早期还用过 1507、1809 等形式。某些功能发布通过启用包启用已有功能，不要求重新安装整个系统。

`KBxxxxxxx` 是知识库文章或更新条目的标识，不是内核版本；同一更新可能适用于多个发布，Build 需要结合产品、发布版本和 KB 一起查。累积更新通常包含此前相应修复，功能更新、质量更新、驱动更新与 .NET 更新也应分别识别。

尤其不能跨分支只比较数字大小：官方发布表中，26H1 用于特定新设备，不能作为现有 24H2／25H2 设备的普通就地功能更新；26H2 与 26H1 的构建号也不能直接用于判断谁更新。当前发布和支持状态请查询 [Windows 11 发布信息](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information)。

### 4.1 “预览版”有两种常见含义

一类是 Windows Insider 系统预览，通道用于测试不同成熟度的功能和代码。通道名称、切换限制及退出方法会调整，不能假设随时可以无损切回稳定版。

另一类是稳定系统收到的可选非安全“预览更新”。安装这类更新不等于加入 Insider。预览补丁、Insider Build 和正式功能发布属于不同概念。[Windows Insider 通道说明](https://learn.microsoft.com/en-us/windows-insider/flighting)。

### 4.2 如何查看自己装的是什么

以下为只读命令，普通 PowerShell 通常可执行；DISM 的查询通常需要管理员终端。

```powershell
winver
Get-CimInstance Win32_OperatingSystem |
    Select-Object Caption, Version, BuildNumber, OSArchitecture
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' |
    Select-Object EditionID, DisplayVersion, CurrentBuildNumber, UBR
# 管理员终端：查询映像 Edition
DISM /Online /Get-CurrentEdition
```

优先用“设置 → 系统 → 系统信息”和 `winver` 确认显示名称，结合注册表与 CIM 查看 Build。注册表中的个别历史兼容字段可能保留旧名字，不要只读 `ProductName` 就结束判断。开发者应优先检测实际功能和 API 能力，版本检测 API 还可能受应用清单的兼容声明影响。[操作系统版本检测](https://learn.microsoft.com/en-us/windows/win32/sysinfo/operating-system-version)。

## 5. 激活是什么，与许可和账户有什么关系

许可规定“是否有权、以什么条件使用”；激活是系统确认某项技术授权状态的机制。显示“已激活”不自动证明许可来源及使用方式符合条款。账户登录解决身份问题，激活解决 Windows 授权状态，两者可以关联，但不能互相替代。

原问题中的“远程激活”“本地激活”“微软账户激活”不是一套互斥的官方分类。应先区分许可渠道，再确认实际激活机制：

| 机制／渠道 | 如何工作 | 典型误解 |
| --- | --- | --- |
| OEM 许可与固件密钥 | 随设备提供，某些设备在固件中存有密钥，安装匹配 Edition 后可自动激活 | 不能因此认为可随意迁移到另一台电脑 |
| 零售密钥／数字许可证 | 使用有效密钥或设备对应的数字许可证完成激活 | 数字许可证不代表每次都必须用微软账户登录 |
| MAK | 批量许可中的多次激活密钥，通过微软服务或组织代理完成相应激活 | 它不是组织内部长期提供续期的 KMS |
| KMS | 客户端向组织授权的 KMS 主机请求激活，并定期续期 | 任意公共 KMS 地址不代表拥有使用许可 |
| AD-based Activation | 将激活对象存入 AD DS，符合条件的域成员读取并完成批量激活 | 加入域不自动让所有 Edition 都有许可证 |
| 订阅激活 | 合格基础系统、设备加入状态及用户订阅共同满足时，启用 Enterprise／Education 权益 | 单纯登录个人微软账户不能获得企业订阅 |

数字许可证可以关联个人微软账户，便于在符合条件的硬件变更后使用激活疑难解答；关联不会把所有 OEM 许可都变成可自由转移的零售许可。[Windows 激活说明](https://support.microsoft.com/en-us/windows/activation/activate-windows)。

“远程激活”还可能只是管理员远程执行操作，或通过组织工具代理完成激活，描述的是操作路径。所谓“本地激活”可能指使用固件密钥、已保存的设备授权，甚至仅指某个第三方工具的叫法，不能据此判断合法渠道或技术机制。离线／代理激活需要走微软与组织支持的流程，不存在靠绑定任意账户就自动获得许可证的规则。

KMS 的常规机制是客户端定期续期，激活有效期 180 天，默认每 7 天尝试续期；客户端操作系统的计数门槛通常为 25，服务器为 5，默认使用 TCP 1688。它不要求客户端一定加入 AD 域，但需要合适的批量许可、客户端版本和网络条件。[KMS 规划](https://learn.microsoft.com/en-us/windows-server/get-started/kms-activation-planning)。

AD-based Activation 则依赖 AD DS 域与支持的批量许可客户端。[AD 批量激活说明](https://learn.microsoft.com/en-us/windows/deployment/volume-activation/activate-using-active-directory-based-activation-client)。订阅激活通常要求已激活的合格 Pro 基础版本、获得许可的组织用户，以及 Entra joined 或 hybrid joined 等条件，不能替代基础系统激活。[订阅激活](https://learn.microsoft.com/en-us/windows/deployment/windows-subscription-activation)。

### 5.1 检查激活与排障顺序

```powershell
# 查询，不安装密钥，不修改 KMS 地址
cscript.exe //Nologo "$env:windir\System32\slmgr.vbs" /dli
cscript.exe //Nologo "$env:windir\System32\slmgr.vbs" /xpr
```

先看“设置 → 系统 → 激活”的 Edition、状态和错误代码，再看许可通道。零售／OEM 激活检查网络、时间、版本是否匹配和硬件变化；组织激活再检查域／Entra 状态、组织网络或 VPN、KMS DNS 和组织许可分配。`/dlv` 可提供更多信息，但分享截图时需隐去设备、组织及许可标识。不要为了修复网络或运行库问题随意更换产品密钥。

## 6. 参考来源与延伸阅读

本文中的机制解释以 Microsoft Learn、Microsoft Support 和微软许可文件为依据，示例输出不代表最新补丁。

- [版本升级及支持路径](https://learn.microsoft.com/en-us/windows/deployment/upgrade/windows-edition-upgrades)：确认 Edition 转换条件。
- [Windows 11 发布信息](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information)：确认发布版本、Build 和支持日期。
- [LTSC 总览](https://learn.microsoft.com/en-us/windows/whats-new/ltsc/overview)：理解通道用途。
- [Windows 激活](https://support.microsoft.com/en-us/windows/activation/activate-windows)、[KMS 规划](https://learn.microsoft.com/en-us/windows-server/get-started/kms-activation-planning)、[订阅激活](https://learn.microsoft.com/en-us/windows/deployment/windows-subscription-activation)：区分激活机制。

