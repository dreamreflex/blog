# Windows 驱动加载、签名、调试与发布

上一篇：[网络功能](Windows网络功能.md) · 返回：[总目录](index.md)

适用范围：现代 Windows 11 为主，解释 Windows 10 的相关策略背景。历史系统、ARM64、Server、Secure Boot／HVCI 环境有不同要求，不应把旧版绕过方法直接套用。资料核验日期：2026-10-21。

## 1. 驱动在体系中处于什么位置

驱动是操作系统与设备或特定系统功能之间的组件，并非每个驱动都直接控制一块实体硬件。存储、网络、文件系统和安全软件中可能都有多层驱动共同处理一次请求。

```text
应用调用系统 API
      ↓
系统子系统／I/O 管理
      ↓
功能驱动与可选过滤驱动
      ↓
总线驱动及硬件
```

这是设备 I/O 的简化示意，实际栈取决于设备类别。总线驱动枚举设备并提供总线相关能力，功能驱动实现设备主要功能，上层／下层过滤驱动可在相应位置扩展或过滤行为。过滤驱动故障可能影响并非由它制造的硬件。[什么是驱动](https://learn.microsoft.com/en-us/windows-hardware/drivers/gettingstarted/what-is-a-driver-)。

### 1.1 内核态、用户态与框架

| 概念 | 用途 |
| --- | --- |
| 内核态驱动 | 在内核上下文运行，错误可能破坏系统或触发 BugCheck |
| 用户态驱动 | 某些设备可使用用户态驱动模型，故障隔离方式与内核态不同 |
| WDM | Windows 驱动模型与相关接口约定，涉及 I/O、PnP、电源等 |
| KMDF／UMDF | WDF 下的内核／用户态框架，帮助管理常见驱动生命周期与请求 |
| 设备类别专用模型 | NDIS、Storport、显示等模型，按子系统规范设计 |

驱动不都适合从零实现任意 WDM 栈，应按设备类别选择正确模型。普通应用可在某些架构上模拟运行，也不意味着相应架构的内核驱动可以模拟加载。[选择驱动模型](https://learn.microsoft.com/en-us/windows-hardware/drivers/gettingstarted/choosing-a-driver-model)。

## 2. 驱动包、设备实例与加载是三件事

驱动包常包含 INF、CAT、SYS／DLL 及所需资源。INF 描述适用设备 ID、体系结构、目标系统、安装设置和服务等；CAT 保存包中文件的散列关联并承载相应签名信息；SYS 是常见内核驱动二进制格式，但并非每包都只有一个 SYS。

| 阶段 | 意义 |
| --- | --- |
| 暂存（staging） | 验证并将驱动包放入 Driver Store |
| 设备安装／绑定 | 给某个设备实例选择并应用匹配驱动包 |
| 驱动加载与设备启动 | 在需要的时机加载二进制，建立设备栈并启动设备 |
| 停止／移除 | 结束相应设备活动并释放资源，驱动是否能卸载取决于实际引用和模型 |
| 删除驱动包 | 从 Driver Store 删除已发布的包，影响后续绑定与使用它的设备 |

“包导入成功”不代表设备已切换到它；“设备卸载”也不代表仓库包已删除；把 `.sys` 复制进系统目录不是标准驱动安装方法。Driver Store 不应由用户手动递归清理。[驱动包](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-packages)、[Driver Store](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-store)。

## 3. 即插即用与启动加载

总线报告设备和硬件标识后，PnP 管理、设备安装机制与驱动协作匹配并启动设备。驱动需要处理资源、电源状态和移除，包括可预期移除与突然拔出；“支持热插拔”不代表任何存储设备都可在写入时安全拔掉。

驱动服务的启动类型可包含 Boot、System、Auto、Demand 等语义。Boot-start 驱动需要更早可用，例如启动存储链路；PnP 驱动还会按设备枚举和启动需要加载，不能仅按用户态服务的经验理解 `Start` 值。停止关联服务也不保证可以卸载一个在用的内核驱动。[驱动启动类型](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/specifying-driver-load-order)。

设备禁用、移除、包删除和物理拔出也有不同效果。关键存储、显示、网络或安全驱动的变更可能需要重启；不应为追求“立即卸载”而强制删除所有依赖。

## 4. 如何识别并找到正确驱动

### 4.1 从硬件标识出发

设备管理器的“详细信息”中查看 Hardware IDs、Compatible IDs、设备实例路径、类 GUID 等。PCI 常含 `VEN`、`DEV` 和 `SUBSYS`，USB 常含 `VID`、`PID`。同名设备可能有不同芯片修订或整机定制，设备营销名称不足以确认驱动。

检查时至少确认：设备硬件 ID／兼容 ID、整机或主板型号与修订、OS 版本和架构、INF 的目标节及最低要求、固件／BIOS 配套条件、包签名与来源。已有驱动的日期不是硬件制造日期，也不是绝对新旧优先级。

Windows 会对匹配包评分，评分涉及签名、功能和 ID 匹配等，随后结合相应规则比较日期和版本；不是无条件安装数字最大的版本。更具体的硬件匹配可能优于泛化兼容包。[驱动排名](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/how-windows-ranks-driver-packages)、[选择过程](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/overview-of-the-driver-selection-process)。

### 4.2 下载顺序与规格确认

优先检查整机／主板厂商针对准确型号提供的包，再检查 Windows Update／可选驱动和芯片厂商官方页面；对于笔记本电源、触控板、音频等，整机定制包往往更有针对性。微软更新目录可以作为查找渠道，但目录存在某个包不保证适合任意同名硬件。

“Windows 没自带驱动”不等于没有官方驱动；操作系统收录、硬件厂商发布与第三方再分发是不同来源。厂商不支持目标系统时，应查是否有厂商确认的标准类驱动、替代接口或受支持硬件；不能仅修改 INF 添加 ID 就把不支持硬件变成兼容设备。

硬件 ID 匹配也不保证所有高级功能可用。还要按厂商规格检查带宽、电源管理、休眠唤醒、显示输出、音频功能、固件兼容等。虚拟机只能测试相应虚拟设备行为，不能完整证明真实硬件驱动稳定。

## 5. 用 PnPUtil 查看、安装与卸载

以下工具均来自 Windows；部分命令／参数只在相应 Windows 版本引入，应先用 `pnputil /?` 核对。管理驱动建议使用管理员终端。[PnPUtil 语法](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/pnputil-command-syntax)。

```powershell
# 查询：/enum-drivers 主要列出第三方仓库包，并非列出所有正在运行的驱动
pnputil /enum-drivers
pnputil /enum-devices /connected
Get-PnpDevice -PresentOnly
Get-CimInstance Win32_PnPSignedDriver |
    Select-Object DeviceName, DeviceID, DriverVersion, DriverProviderName, InfName
```

安装前导出受影响包并保存已知可用版本。下面示例的 `oem42.inf` 必须替换为**当前机器已经核对过的发布名**，输出目录需先准备好，导出会创建文件：

```powershell
pnputil /export-driver oem42.inf D:\DriverBackup
```

安装可信包的示例会改变仓库及匹配设备的配置：

```powershell
pnputil /add-driver D:\Drivers\Vendor\device.inf /install
```

`/install` 尝试应用于匹配设备，但不会强制用低排名包替换高排名包。成功后检查设备管理器状态、实际驱动提供者／版本、安装日志，并验证休眠恢复和主要功能；必要时安排重启。

设备管理器的“卸载设备”不一定移除仓库包；删除指定第三方包并卸载相关设备所用包的命令如下，属于**可能影响多个设备的状态变更**：

```powershell
# 只有核对发布名、依赖设备、备份和恢复方法后才执行
pnputil /delete-driver oem42.inf /uninstall
```

不要日常添加 `/force`。启动存储等关键驱动不要仅凭版本旧就卸载。恢复优先使用设备管理器的“回退驱动程序”；不可用时按设备类别和厂商步骤重新安装已保存的包，无法启动时可能需要安全模式或 WinRE 进行恢复。

## 6. 签名到底保证什么

驱动签名主要帮助确认完整性及签名信任关系。它不保证程序绝对安全、没有漏洞或一定适合当前硬件。WHQL／WHCP 的相应测试和签名也不能替代真实业务负载验证。

需要分别理解三个关口：

1. **包安装信任**：Windows 是否接受 INF／CAT 对应包，包文件是否被修改。
2. **内核加载策略**：代码完整性是否允许该二进制在当前系统运行。
3. **额外保护策略**：Secure Boot、HVCI／内存完整性、易受攻击驱动阻止列表及组织应用控制可能进一步限制加载。

从 Windows 10 1607 起，现代新内核驱动的正式发布通常需要经过微软硬件开发者门户签名路径；历史兼容例外不应当作 Windows 11 的通用部署方法。普通 Authenticode 签名“有效”与满足当前内核加载策略并非完全同一判断。[Driver Signing Policy](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/kernel-mode-code-signing-policy--windows-vista-and-later-)。

CAT 签名覆盖相应包文件，修改 INF 等内容会破坏包的一致性。`Get-AuthenticodeSignature 某文件` 可以辅助检查文件签名，但不一定完整验证通过目录签名关联的整包，也不验证硬件适配。Windows SDK／WDK 的 SignTool 支持相应验证，例如按实际包路径使用 `signtool verify /kp /v /c device.cat device.sys`，仍需结合当前系统加载结果。[SignTool](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/signtool)。

## 7. 如何“禁用签名”：区分临时启动选项与测试签名

应把这个问题放在开发测试语境下回答。日常用户遇到签名错误，先检查来源、包完整性、目标架构、系统支持、证书／时间与阻止策略。关闭校验不会修复硬件不兼容或驱动代码问题。

### 7.1 一次性启动设置

在支持该选项的设备上，可以通过“高级启动 → 疑难解答 → 高级选项 → 启动设置 → 重启 → 禁用驱动程序强制签名”进行一次相应测试启动。选项是否可用及实际加载限制受系统策略影响；它不等于永久关闭所有代码完整性保护。普通重新启动通常恢复默认强制策略。

在改变启动、固件或保护设置之前，测试机应准备可用的 BitLocker 恢复密钥和启动恢复方案；相关变化可能触发恢复验证。组织设备还可能有禁止更改的策略。[Windows 启动设置](https://support.microsoft.com/en-us/windows/experience/startup-boot/windows-startup-settings)。

### 7.2 测试签名模式

开发者应为自己的测试包生成适用的测试签名，并在隔离测试环境配置相应信任。需要管理员终端的启动配置示例：

```powershell
# 仅用于已经准备好恢复方式的测试机；会修改启动配置，重启后生效
bcdedit.exe /set testsigning on
# 测试结束后恢复；仍需重新启动
# bcdedit.exe /set testsigning off
```

Secure Boot 可能阻止修改该选项；如实验确实要求改变固件设置，应按设备厂商文档、恢复密钥与测试计划处理，不能把关闭 Secure Boot 作为普通驱动安装步骤。HVCI 启用时也不能因为进入测试模式就任意加载未签名二进制；测试签名和 HVCI 兼容要求仍需满足。

`TESTSIGNING` 是允许相应测试签名代码的模式，不等于所有校验都不存在，也不是把自签名包变成正式微软发布包。[测试签名加载说明](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/the-testsigning-boot-configuration-option)。

## 8. 驱动如何检测与调试

### 8.1 从安装失败还是运行失败分流

安装失败重点看 INF 匹配、签名、文件完整性、依赖、策略和 `%SystemRoot%\INF\setupapi.dev.log`。设备管理器错误码需要按含义分析：例如 Code 28 通常提示未安装驱动，Code 10 表示设备无法启动，Code 43 表示设备报告问题，不能统称为“缺驱动”。

加载被代码完整性阻止时，查看“应用程序和服务日志 → Microsoft → Windows → CodeIntegrity → Operational”等实际可用通道；系统日志及对应设备组件日志也可能有帮助。[SetupAPI 设备安装日志](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/setupapi-device-installation-log-entries)。

蓝屏则保存 `%SystemRoot%\Minidump` 或配置的内核转储；文件是否存在取决于转储策略、分页／专用转储文件及磁盘等条件。WinDbg 中配置匹配符号后分析 BugCheck、栈、模块和故障参数。栈中最后出现的驱动或 `ntoskrnl.exe` 名称不是充分归因；内存破坏可能早已发生，详见[调试篇](Windows调试.md)。

### 8.2 Driver Verifier 的用途和边界

Driver Verifier 会对选定驱动施加检查，帮助暴露错误的内存、I/O、同步与调用行为，可能主动触发蓝屏。因此只在测试／调试机器上、已有备份和恢复方式时使用，不应给生产机器一键启用全部驱动检查。[Driver Verifier](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/driver-verifier)。

```powershell
# 以下先查询已有设置
verifier.exe /querysettings
# 测试机：只检查已确认的目标驱动，名字必须替换
verifier.exe /standard /driver vendor-example.sys
# 按工具要求重启并复现；结束测试后撤销并重启
# verifier.exe /reset
```

如果进入启动循环，需要按预先准备的恢复方案进入可用的安全模式等环境，在正确目标系统上下文撤销 Verifier；不能假设在任意 WinRE 命令窗口运行 `/reset` 都会修改离线目标系统。蓝屏并不自动等于“硬件坏了”，应根据 Verifier 规则和转储定位问题。

开发流程还应包含代码审查／静态分析、WDK 工具、HLK 类别测试、睡眠唤醒、热插拔、错误恢复和真实硬件负载。UMDF 与内核态驱动的调试目标及工具路径不同。

## 9. 开发者如何发布驱动

面向现代 Windows 的大致流程如下，具体要求以当前 Hardware Dev Center／WHCP 政策为准：

1. 确定设备类别、硬件 ID、支持系统、架构和驱动模型，使用受支持的 WDK／构建工具。
2. 完成正确 INF、版本、文件和目录生成，并保留构建产物及符号。
3. 在测试环境验证安装、升级、卸载、PnP、电源、负载、安全和 HVCI 兼容性。
4. 按当前计划准备组织开发者账户、身份及证书要求，选择合适的正式认证或测试提交方式。
5. 正式兼容性认证通常涉及对应 HLK 测试与结果提交；下载门户处理后的签名包后再验证。
6. 按渠道发布到厂商站点或配置 Windows Update 分发，设置目标硬件、系统范围和相应 shipping label。
7. 分阶段观察安装与稳定性反馈，保留回退版本并维护漏洞修复。

Attestation 签名与经过 HLK 的兼容性认证不是同一件事，其适用系统、用途及分发资格受当前规则限制；不能声称“拿到任何微软签名就能直接面向所有用户推送 Windows Update”。[签名选项](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/driver-signing-offerings)。

签名完成与发布至 Windows Update 也是不同步骤，后者需要硬件提交、shipping label 和目标设置等分发配置。[发布到 Windows Update](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/publish-a-driver-to-windows-update)。

## 10. 一份下载前检查清单

- 确认设备实例、硬件／兼容 ID 和整机修订，不能只看商品名。
- 确认 OS、架构、目标版本和厂商支持范围，特别是 ARM64 与旧硬件。
- 确认官方来源和实际签名，检查解压后文件是否完整、INF 是否被修改。
- 阅读固件依赖、已知问题和回退限制，保留当前可用包。
- 安装后确认实际绑定版本和功能，不以“安装器成功退出”替代设备验证。

这些检查能减少错误包，仍不能从形式匹配推导出所有业务场景都稳定；最终需要对真实设备和所需功能验证。

## 11. 参考来源

- [驱动定义](https://learn.microsoft.com/en-us/windows-hardware/drivers/gettingstarted/what-is-a-driver-) 、[驱动模型](https://learn.microsoft.com/en-us/windows-hardware/drivers/gettingstarted/choosing-a-driver-model)：体系与模型。
- [Driver Store](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-store)、[PnPUtil](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/pnputil-command-syntax)、[驱动排名](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/how-windows-ranks-driver-packages)：安装和选择。
- [签名策略](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/kernel-mode-code-signing-policy--windows-vista-and-later-) 、[测试签名](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/the-testsigning-boot-configuration-option)：信任与加载边界。
- [Driver Verifier](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/driver-verifier)、[签名选项](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/driver-signing-offerings)、[Windows Update 发布](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/publish-a-driver-to-windows-update)：验证和交付。

