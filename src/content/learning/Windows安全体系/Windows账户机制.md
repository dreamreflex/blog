---
title: 'Windows 账户、权限与登录认证'
description: '区分账户、凭据、登录与授权四件事，说明本地账户、域与 Microsoft Entra 身份及访问令牌权限的来源。'
pubDate: '2026-10-21'
tags: []
order: 5
---

上一篇：[系统版本机制](Windows系统版本机制.md) · 返回：[总目录](index.md) · 下一篇：[安装机制](WindowsMSI自动安装机制.md)

适用范围：Windows 11 为主，兼顾 Windows 10 与 AD／Microsoft Entra 管理环境。资料核验日期：2026-10-21。

## 1. 账户、凭据、登录和授权是四件事

账户描述“谁”，凭据提供“如何证明”，登录创建会话，授权决定“能做什么”。例如同一个域用户可以用密码或 Windows Hello 登录，随后普通进程仍以受限权限运行。

```text
身份来源 → 提交或使用凭据 → 身份验证 → 登录会话与访问令牌
                                           ↓
                                  访问对象时进行权限检查
```

不要把“云账户”与“管理员”并列：前者描述身份来源，后者描述权限；“远程账户”通常描述使用场景，并非独立账户种类。

## 2. 本地账户、微软账户、域账户和云账户

| 身份 | 谁管理身份 | 典型用法 | 边界 |
| --- | --- | --- | --- |
| 本地账户 | 当前 Windows 设备，本地账户信息由 SAM 等机制维护 | `计算机名\用户`、`.\用户` | 在两台机器创建同名用户，不会自动得到同一个身份 |
| 个人微软账户（MSA） | 微软个人账户服务 | 个人 Windows 登录、OneDrive、Store | 与组织的 Entra 账户分开，同一个邮箱文本也可能对应两套身份 |
| AD DS 域账户 | 组织域控制器 | `域\用户`、用户主体名 | 可用 Kerberos 等访问域资源，支持组织策略管理 |
| Microsoft Entra ID 账户 | 组织云租户 | 工作或学校账户、云设备登录与单点登录 | 能否登录 Windows 桌面取决于设备加入状态和策略 |
| 服务身份 | 操作系统或组织管理 | SYSTEM、LocalService、NetworkService、虚拟服务账户、gMSA | 用于服务运行，通常不是供人交互登录的账户 |

本地身份有自己的 SID；改显示名通常不会改变 SID，删除后创建同名账户也不会恢复原 SID。因此权限绑定到名字背后的身份，而不是文件夹里的那串用户名。[本地账户](https://learn.microsoft.com/en-us/windows/security/identity-protection/access-control/local-accounts)。

个人微软账户登录会与设备上的 Windows 用户配置结合，仍然有本地 SID、用户档案和访问令牌；不是每次打开文件都到微软服务器请求许可。应用单独登录微软账户，也不必然改变当前 Windows 登录账户。

### 2.1 设备加入状态与“添加工作账户”

- **工作组**：没有加入 AD 域，各机器分别管理本地身份。
- **AD domain joined**：设备加入传统域，域账户可以按策略登录，组策略等参与管理。
- **Entra registered**：通常为个人设备登记工作身份以访问组织资源；不会仅因登记就把 Windows 登录身份变成组织账户。
- **Entra joined**：设备加入组织云目录，可使用组织账户登录 Windows。
- **Hybrid joined**：设备既加入 AD DS，又在 Entra 中建立相应设备身份；桌面登录通常仍以 AD 身份为基础。

“设置 → 账户 → 访问工作或学校”可能执行登记、加入或管理注册中的不同操作，要看具体按钮、设备状态和租户策略。Windows Home 不支持通常的 Entra join 或 AD 域加入。[Entra joined 设备说明](https://learn.microsoft.com/en-us/entra/identity/devices/concept-directory-join)。

## 3. 管理员、SYSTEM 与访问控制

### 3.1 访问令牌和安全描述符

进程主要使用主令牌，线程还可以在授权范围内使用模拟令牌。令牌携带用户 SID、组 SID、特权和完整性级别等。文件、注册表键、服务、进程等可保护对象具有安全描述符，其中记录所有者、DACL 和审计相关 SACL。

访问对象时，系统结合有效令牌、请求的操作及对象权限执行检查。认证成功只说明身份成立，并不意味着有写入该文件、启动服务或远程登录的权利。[访问令牌](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-tokens)、[访问控制组成](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-components)。

这里的 Windows 访问令牌是本机安全对象，与调用云 API 的 OAuth access token 不同；浏览器拿到某个网站令牌，不会因此获得本机管理员权限。云服务认证、单点登录和本机对象授权之间需要由各自受支持的机制衔接。

| 概念 | 示例 | 作用 |
| --- | --- | --- |
| 对象权限 | 读取某文件、修改某注册表键 | 限制具体对象上的操作 |
| 特权 | 备份、调试、取得所有权等特权 | 允许特定系统级操作，是否启用还需检查令牌 |
| 登录权利 | 本地登录、作为服务登录、通过远程桌面登录 | 决定能否建立某种登录会话 |
| 完整性级别 | Low、Medium、High、System | 补充访问控制，约束跨完整性写入等操作 |

常见的“拒绝优先”是简化说法；实际结果还涉及显式与继承 ACE 的顺序、具体权限位和其他安全机制。排障应使用“有效访问”、`icacls` 和实际进程令牌，不宜仅凭一条允许规则推断。共享文件还要同时满足共享权限及 NTFS 权限。[访问控制总览](https://learn.microsoft.com/en-us/windows/security/identity-protection/access-control/access-control)。

### 3.2 Administrators 组不等于每个进程已经提升

通常启用 UAC、管理员处于管理员批准模式时，登录会产生受限令牌及完整管理员令牌。桌面和普通应用使用前者；提升后启动的进程才使用相应完整令牌。标准用户的 UAC 提示通常要求管理员凭据，管理员的提示通常要求同意，实际行为可受策略影响。

“以管理员身份运行”是为新进程选择更高权限上下文，不会把原来所有进程一并升级。若标准用户输入另一个管理员账户，提权进程的身份和 HKCU 也可能变为那个管理员，这解释了某些配置“写错用户”的问题。[UAC 工作原理](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works)。

SYSTEM 是本机服务使用的高权限身份，不是某个普通管理员的别名；LocalService 本地权限较低，NetworkService 可在相应网络场景使用计算机身份。TrustedInstaller 是 Windows 组件维护相关服务身份，许多系统文件由它拥有。管理员也不应随意取得所有系统目录所有权；受保护进程、代码完整性和系统维护机制还会限制操作。

## 4. 密码登录的大致路径

交互登录界面通过 Credential Provider 收集或选择凭据，Winlogon、LSA／LSASS 及相应认证包参与验证和会话建立。Credential Provider 负责凭据界面与序列化，不等于它本身就是最终认证机构。

- 本地密码登录由本机验证本地身份，系统不以普通明文配置文件保存登录密码。
- 域环境中，在线认证通常依赖域控制器，Kerberos 是重要协议；NTLM 仍可能出现在兼容或特定场景中，不能理解为所有 Windows 登录都用 NTLM。
- 域离线缓存登录允许符合策略、曾登录过的用户在无法访问域控制器时进入设备，但它不代表已经取得新的域网络访问凭据。
- MSA／Entra 登录结合在线身份、设备状态及本地可用凭据；可离线进入桌面与能在线获取新令牌是不同问题。

LSASS 不只是密码比较器，还参与认证和会话安全管理。它属于敏感系统组件；诊断登录问题应从事件、策略和身份状态入手。[Windows 身份验证概述](https://learn.microsoft.com/en-us/windows-server/security/windows-authentication/windows-authentication-overview)、[Credential Providers](https://learn.microsoft.com/en-us/windows/win32/secauthn/credential-providers-in-windows)。

## 5. PIN、Windows Hello 和其他登录方式

### 5.1 PIN 为什么不等于账户密码

Windows Hello 的 PIN 是设备上的解锁因子，通常用来授权使用受保护的凭据或私钥，并不把这一串 PIN 当作微软账户密码发给服务器。具有 TPM 时可以利用其密钥保护及抗暴力尝试能力；具体硬件要求和允许的软件保护方式取决于部署策略。

Windows Hello for Business 的典型模型是：设备生成密钥对，把公钥或相关证书与组织身份关联；用户通过 PIN 或生物识别授权使用私钥，向认证方证明密钥所有权。PIN 的有效范围与该设备／凭据关联，所以不能拿本机 PIN 当成另一台机器的密码。生物模板主要由本地机制保护和处理，不作为普通人脸照片上传到认证服务。[Hello for Business 工作原理](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/hello-how-it-works)。

个人 Windows Hello 与企业 Windows Hello for Business 相关，但企业部署还涉及密钥信任、证书信任或云 Kerberos 信任等，不能把任意本地 PIN 配置都看成已完成企业无密码部署。

### 5.2 还有哪些方式

| 方式 | 主要前提 | 注意点 |
| --- | --- | --- |
| 密码 | 账户允许密码认证 | 账户密码与设备 PIN 分开管理 |
| Hello PIN | 已配置相应设备凭据 | 可以按策略支持字母等，不一定只是四位数字 |
| Hello 指纹／人脸 | 支持的传感器、驱动与策略 | 普通摄像头不一定支持 Hello 人脸；通常保留 PIN 作为替代 |
| 智能卡／证书 | PKI、证书及身份映射 | 需要有效私钥、证书链与组织部署 |
| FIDO2 安全密钥／通行密钥 | 支持的系统、身份类型及策略 | 网站的通行密钥不自动成为任意 Windows 设备的桌面登录方式 |
| Web sign-in 等组织方式 | 特定 Entra 设备与策略 | 不是所有本地账户、域账户和离线场景都适用 |

锁定后解锁、重启后的完整登录、RDP、访问 SMB 共享和浏览器单点登录，可能使用不同认证路径。动态锁是自动锁屏机制，本身不完成登录。RDP 是否支持某种 Hello／无密码方式要看部署和客户端，不能一概输入本机 PIN 即可。

## 6. 实际检查与排障

以下主要为只读检查。`Get-LocalUser` 取决于系统及 PowerShell 模块环境；查看全部安全日志和某些组信息可能需要提升权限。

```powershell
whoami
whoami /user
whoami /groups
whoami /priv
Get-LocalUser
Get-CimInstance Win32_ComputerSystem |
    Select-Object Name, Domain, PartOfDomain
dsregcmd /status
icacls "$env:USERPROFILE\Documents"
```

`dsregcmd /status` 同时包含设备和当前用户上下文信息，在不同用户或提升上下文中查看结果可能不同；分享前隐去租户、设备、用户标识。`whoami /groups` 可帮助看管理员组是否为受限状态，`whoami /priv` 可看令牌内特权及启用状态。

排障时按下列顺序区分问题：

1. **认错身份**：确定登录的是本地、MSA、域还是 Entra 账户；同名、同邮箱不能替代此判断。
2. **无法证明身份**：检查登录方式、时间同步、网络、域控制器或云服务连通性、密码变化与缓存状态。
3. **身份成立但不能登录**：检查禁用／锁定、登录权利、RDP 授权组及拒绝策略。
4. **登录后访问被拒绝**：查看实际进程令牌、UAC 提升、对象 ACL、共享权限和服务身份。
5. **修改后仍失败**：组成员、令牌或登录凭据可能仍在缓存中；根据具体机制重新获取会话／令牌，不要默认所有改动立即反映到旧进程。

例如“管理员打不开文件”应检查当前进程是否提升和文件有效访问；“本机能登录但共享失败”应检查网络认证与共享端授权，而不是先删除 PIN。安全日志的 4624／4625 可用于成功／失败登录分析，需连同 LogonType、状态码、源地址及审计配置阅读，详见[日志体系](Windows日志体系.md)。

## 7. 参考来源

- [本地账户](https://learn.microsoft.com/en-us/windows/security/identity-protection/access-control/local-accounts)：本地身份和内置账户。
- [Entra joined 设备](https://learn.microsoft.com/en-us/entra/identity/devices/concept-directory-join)：设备身份及登录前提。
- [访问令牌](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-tokens)、[访问控制模型](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-components)：授权基础。
- [UAC 原理](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works)：受限令牌与提升。
- [Windows 身份验证](https://learn.microsoft.com/en-us/windows-server/security/windows-authentication/windows-authentication-overview)、[Hello for Business](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/hello-how-it-works)：认证路径与密钥机制。

