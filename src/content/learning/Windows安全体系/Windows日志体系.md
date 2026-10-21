# Windows 日志体系与事件追踪

上一篇：[环境变量](Windows环境变量机制.md) · 返回：[总目录](index.md) · 下一篇：[调试与运行库](Windows调试.md)

适用范围：Windows 11／10 和现代 Windows Server；部分工具需要另行安装。资料核验日期：2026-10-21。

## 1. 日志不是只有“事件查看器”一种

Windows 同时存在持久事件、性能追踪、审计记录、文本日志和内存转储。它们回答的问题不同：

| 体系 | 典型内容 | 常见载体和工具 |
| --- | --- | --- |
| Windows Event Log | 服务启动失败、应用错误、系统组件事件 | `.evtx`；事件查看器、Get-WinEvent、wevtutil |
| ETW | 内核、驱动与应用细粒度追踪 | 实时事件或 `.etl`；WPR、WPA、logman 等 |
| 安全审计 | 登录、账户管理、被配置审计的对象访问 | Security 通道；审计策略和 SACL 决定覆盖范围 |
| 系统组件文本日志 | 系统组件维护、驱动安装等 | CBS、DISM、SetupAPI 等各自日志 |
| 应用自有日志 | 业务行为、请求详情、框架日志 | 文本、JSON、数据库、stdout 等 |
| WER／Dump | 崩溃报告和故障瞬间内存状态 | `.dmp` 等；WinDbg、Visual Studio |

Windows 不会自动接管所有软件写出的文本文件，也不会自动记录每一次 API 调用。日志是否存在、是否完整，取决于组件是否产生事件、通道／会话是否开启及保留策略。

## 2. Windows Event Log 如何组织

### 2.1 Provider、事件和 Channel

Provider 是事件的发布者；Channel 是逻辑存储和订阅目标。一个 Provider 可以产生多个事件、写入多个通道；一个通道也可以包含多个 Provider 的事件。

| 常见日志 | 用途 |
| --- | --- |
| Application | 应用及部分运行时、安装器等事件 |
| System | 服务控制、驱动、系统组件等事件 |
| Security | 按策略产生的安全审计事件 |
| Setup | 部署、设置等事件 |
| ForwardedEvents | 常见的集中收集目标，实际目标取决于订阅配置 |
| 应用程序和服务日志下各通道 | 各组件专用的 Admin、Operational、Analytic、Debug 等通道 |

Operational／Admin 常用于运维；Analytic／Debug 往往更详细，可能默认关闭或需要额外显示和启用。它们并不是全都自动永久记录。许多日志文件默认位于 `%SystemRoot%\System32\winevt\Logs`，但路径可配置，事件查看器中的树也不是目录树的简单镜像。

现代 Event Log API 使用事件清单描述 Provider、事件及元数据，写入可通过 ETW API 完成；旧式 Event Logging API 仍被很多应用使用。因此 Event Log 与 ETW 有技术联系，但“所有 ETW 事件都可在事件查看器看到”不成立。[Windows Event Log API](https://learn.microsoft.com/en-us/windows/win32/wes/windows-event-log)。

### 2.2 怎样读一条事件

重点看时间、计算机、Provider、Event ID、Level、任务／操作码、PID／TID、用户以及 EventData。存在 ActivityID 时可帮助关联一组操作。

Event ID 不是全 Windows 唯一编号。至少应组合 Provider 与 ID，必要时还要看事件版本；同一个数字在不同组件下含义不同。渲染后的“消息”便于阅读，XML 原始字段更适合分析。复制 `.evtx` 到另一台机器后，若缺少对应消息资源，可能无法显示完整描述，但原始事件数据仍可能在文件中。

事件级别也不是根因排名：Error 可能只是外部服务暂不可用，Information 也可能记录了关键配置变更。应围绕故障时间建立前后事件链。

## 3. 如何查看、筛选和导出

运行 `eventvwr.msc` 打开事件查看器。先限定故障发生时间，再按通道、Provider 和事件 ID 筛选；保存自定义视图不会创建新的事件采集源。

以下是只读查询，Security 和受限通道可能需要管理员或授予读取权限。某些命令在没有匹配事件时会报“找不到事件”，不应直接解释为日志系统损坏。

```powershell
# 查看通道及保留配置
Get-WinEvent -ListLog System |
    Select-Object LogName, IsEnabled, RecordCount, MaximumSizeInBytes, LogMode

# 查询过去两小时的 System 警告、错误和严重事件
Get-WinEvent -FilterHashtable @{
    LogName = 'System'
    StartTime = (Get-Date).AddHours(-2)
    Level = 1, 2, 3
} -MaxEvents 100 |
    Select-Object TimeCreated, ProviderName, Id, LevelDisplayName, Message

# 对特定 Provider + ID 查询，避免仅按数字解释
Get-WinEvent -FilterHashtable @{
    LogName = 'Application'
    ProviderName = 'Application Error'
    Id = 1000
} -MaxEvents 10

# 枚举日志、查看配置
wevtutil el
wevtutil gl System
```

优先让查询在日志引擎端筛选，不要先读取数百万条记录再用 `Where-Object` 丢弃大部分。[Get-WinEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent)。

导出会创建文件但不会清空系统日志。下面写入一个新的临时文件，避免覆盖已有文件；导出的日志同样需要控制访问：

```powershell
$eventExport = Join-Path $env:TEMP ('System-' + [guid]::NewGuid() + '.evtx')
wevtutil epl System $eventExport
Get-WinEvent -Path $eventExport -MaxEvents 5
```

`wevtutil` 还能启用、配置、清空日志，使用时要区分查询和修改子命令。排障期间不应清空现场日志。[wevtutil](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wevtutil)。

## 4. ETW：按需捕获更细的行为

ETW 主要由 Provider（产生事件）、Controller（管理追踪会话）和 Consumer（消费／分析事件）组成。会话可以按 Provider、Level、Keyword 控制采集，将缓冲区中的事件写入 ETL 或交给实时消费者。

它适合 CPU、磁盘、线程调度、网络和应用耗时等问题。高频追踪有缓冲、吞吐和磁盘成本，事件也可能丢失；“ETW 性能好”不等于“无限量打开全部 Provider 没影响”。[About Event Tracing](https://learn.microsoft.com/en-us/windows/win32/etw/about-event-tracing)。

常用工具分工：

| 工具 | 获取方式／用途 |
| --- | --- |
| logman、tracerpt | 系统工具，控制部分追踪或转换追踪数据 |
| WPR | 基于 ETW 的性能录制器；命令行是否已有及可用配置需检查本机 |
| WPA | Windows Performance Toolkit 中的分析器，常通过 ADK 获取 |
| PerfView | 微软提供的开源性能分析工具，常用于 .NET／ETW 问题 |
| Process Monitor | 微软 Sysinternals 工具，记录文件、注册表和进程／线程活动；不是通用网络抓包工具 |

管理员终端中的性能录制示例**会启动系统追踪并产生文件**。先确认没有其他需要保留的 WPR 会话，短时间复现后停止：

```powershell
wpr -status
wpr -profiles
wpr -start GeneralProfile -filemode
# 在此期间复现一次问题，然后停止；目标文件名应未被占用
wpr -stop "$env:TEMP\windows-performance.etl"
```

若本机不支持该配置，按 `wpr -profiles` 选择，不要照抄任意旧教程参数。WPA 中应沿时间段查看 CPU 栈、等待、磁盘和进程活动；只有符号和调用栈采集到位时才能获得相应函数级解释。[WPR 官方说明](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/windows-performance-recorder)。

## 5. 软件如何把日志交给 Windows

### 5.1 选择适合的接口

- 需要运维可订阅、按事件 ID 分析的稳定事件：使用 Event Log，设计 Provider、事件结构和通道。
- 需要低开销、可动态启停的高频追踪：使用 ETW，例如 TraceLogging、清单式 Provider，或适用的 .NET EventSource。
- 业务请求详情：可以保留结构化应用日志，并与 Windows 事件通过时间、实例标识和关联 ID 对接。

不要把所有 Debug 字符串都写进 Application 通道；应控制级别、数据量、字段稳定性和保留策略。普通程序也不能随意向 Security 日志写任意事件，安全审计有专门权限和接口。

下面用 **Windows PowerShell 5.1** 的经典 Event Log 接口演示流程。首次注册 Source 需要管理员，会修改机器配置；生产软件应在安装阶段完成注册。PowerShell 7 不保证提供这些经典 cmdlet。

```powershell
# 演示操作，会创建事件源；先确认该名称未被其他软件使用
if (-not [System.Diagnostics.EventLog]::SourceExists('WindowsKnowledgeDemo')) {
    New-EventLog -LogName Application -Source 'WindowsKnowledgeDemo'
}
Write-EventLog -LogName Application -Source 'WindowsKnowledgeDemo' `
    -EventId 1001 -EntryType Information -Message '示例任务已完成'
```

注册后的可见性可能需要等待／重新启动相关应用。测试结束后，如确认事件源为本次新建且没有应用依赖，可用管理员 Windows PowerShell 的 `Remove-EventLog -Source 'WindowsKnowledgeDemo'` 注销事件源；这不等于删除已写入的事件。现代 Provider 则应按清单或 TraceLogging 的部署方式管理。[经典事件写入](https://learn.microsoft.com/en-us/windows/win32/eventlog/reporting-an-event)。

### 5.2 Windows 收到日志之后做什么

按 Provider 和通道配置保存事件、应用访问控制、按容量和保留策略循环覆盖或归档，并支持查询、订阅和转发。它不会自动理解“这个业务失败应如何修复”；告警规则、仪表盘、关联分析和长期存储需要另行设计。

## 6. 集中收集、审计和保留

Windows Event Forwarding（WEF）将选定事件发到 Windows Event Collector（WEC）。可以采用源发起或收集器发起订阅，常结合域策略和 WS-Management 部署。它是事件转发基础设施，不是自动完成所有安全检测的 SIEM。[WEF 部署与订阅](https://learn.microsoft.com/en-us/windows/security/operating-system-security/device-management/use-windows-event-forwarding-to-assist-in-intrusion-detection)。

日志保留必须考虑写入速率、最大容量、覆盖方式、归档和磁盘空间。集中化也需要检测源端停止、转发失败与采集延迟，不能把“没有收到事件”当作“没有发生异常”。

Security 的登录成功 4624、失败 4625 等事件受审计策略影响；文件访问审计通常还需要目标对象配置 SACL。启用“对象访问审计”不会自动为所有文件生成每次访问记录。审计日志和转储可能包含用户名、内部路径、请求数据或内存中的秘密，导出应遵循实际访问需求。

## 7. 常见判断错误与排障路线

| 现象 | 正确解释方向 |
| --- | --- |
| Kernel-Power 41 | 表示上次未正常关机，可能由断电、硬件或崩溃等引起，本身不是“电源一定坏了”的证明 |
| 崩溃记录显示 ntdll.dll／KERNELBASE.dll | 这是故障显现的系统模块位置，需用转储和调用栈继续找原因 |
| 某通道没有记录 | 检查是否启用、权限、保留覆盖、审计策略和软件是否实际产生日志 |
| ETL 有记录但消息难理解 | 检查 Provider 元数据、工具和符号，必要时使用对应组件分析方法 |
| Procmon 大量 NAME NOT FOUND | 程序正常探测也会产生，必须结合后续成功路径和故障时间 |

建议流程：记录准确时间和操作 → 找对应组件通道 → 导出相关时间段 → 读取原始字段 → 根据问题类型补充 ETW、Procmon、抓包或 Dump。不要从事件查看器里随机挑一条红色事件作为结论。

## 8. 参考来源

- [Windows Event Log](https://learn.microsoft.com/en-us/windows/win32/wes/windows-event-log)、[ETW](https://learn.microsoft.com/en-us/windows/win32/etw/about-event-tracing)：体系和 API。
- [Get-WinEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.diagnostics/get-winevent)、[wevtutil](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/wevtutil)：查询及导出。
- [WPR](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/windows-performance-recorder)、[Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon)：追踪工具。
- [WEF](https://learn.microsoft.com/en-us/windows/security/operating-system-security/device-management/use-windows-event-forwarding-to-assist-in-intrusion-detection)：集中收集设计。

