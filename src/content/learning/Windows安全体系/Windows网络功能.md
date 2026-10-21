---
title: 'Windows 网络体系、分层排障与证书配置'
description: '从应用到硬件建立 Windows 网络分层模型，给出按层排障的思路与证书配置要点。'
pubDate: '2026-10-21'
tags: []
order: 10
---

上一篇：[调试与运行库](Windows调试.md) · 返回：[总目录](index.md) · 下一篇：[驱动机制](Windows驱动加载和签名机制.md)

适用范围：Windows 11 为主，部分示例要求 Hyper-V、管理员权限或相应模块；Server 专有角色不能直接套用到 Home。资料核验日期：2026-10-21。

## 1. 先建立一张从应用到硬件的图

Windows 网络不是某个单独设置窗口。控制面负责接口、地址、路由、策略等配置，数据面按这些状态处理实际流量。可用下面的简化模型理解：

```text
应用：浏览器、服务、数据库客户端
  ↓ Winsock／WinHTTP／WinINet／应用自己的网络与 TLS 库
TCP、UDP、IP、路由、DNS 客户端等
  ↓ WFP 等过滤机制在网络栈多个位置参与处理
NDIS、网卡驱动、虚拟交换机及相关过滤组件
  ↓
物理／虚拟网卡 → 交换机、接入点、路由器 → 目标
```

这不是严格的全部实现调用顺序。DNS 是应用层协议，但其配置会影响几乎所有按名称发起的访问；防火墙也不能只理解为某个固定层上的开关。VPN、容器、Hyper-V 和 WSL 可能增加虚拟接口、路由与过滤器。[Windows Filtering Platform](https://learn.microsoft.com/en-us/windows/win32/fwp/windows-filtering-platform-start-page)。

排障时要同时识别“哪张网卡、哪个网络隔离环境、哪种 IP 协议、哪个进程身份”。同一台机器上的浏览器、Windows 服务和虚拟机可能走不同路径。

## 2. 按层查看，而不是先重置网络

### 2.1 第二层：链路、MAC、邻居与 VLAN

先确认接口存在且工作，网线／Wi-Fi 连接、驱动和 VLAN 配置正常。MAC 地址用于相应链路上的转发；访问远端网段通常先找下一跳网关的 MAC，而不是直接解析远端主机的 MAC。

```powershell
# 主要为只读查询；某些驱动高级属性需管理员才能完整读取
Get-NetAdapter
Get-NetAdapterStatistics
Get-NetAdapterBinding -Name '*'
Get-NetAdapterAdvancedProperty -Name '*' -ErrorAction SilentlyContinue
Get-NetNeighbor
arp -a
netsh wlan show interfaces
```

ARP 服务于 IPv4 邻居解析；IPv6 使用邻居发现。`Get-NetNeighbor` 能看到相应邻居缓存，但缓存存在不等于远端应用正常。某些网卡高级参数由厂商定义，VLAN／巨帧等要与交换机和对端配置匹配，不能套用一套统一注册表值。

### 2.2 第三层：地址、网关和路由

```powershell
Get-NetIPConfiguration
Get-NetIPAddress
Get-NetIPInterface
Get-NetRoute
Get-DnsClientServerAddress
ipconfig /all
route print
```

先确定地址和前缀正确，是否出现非预期的 `169.254.x.x` IPv4 链路本地地址，再看默认路由、VPN 路由和返回路径。IPv6 链路本地地址是正常机制，不能照搬 IPv4 的判断。选路通常先比较最长前缀，等长时再综合路由和接口度量等条件，不能只找“metric 最小的默认网关”。

`ping` 检查 ICMP 可达性，`tracert` 提供逐跳线索；对端可以丢弃 ICMP 或不回复超时报文，因此 ping 不通不证明 TCP 不通，tracert 某跳不回复也不证明流量无法经过。常用：

```powershell
ping -4 192.0.2.10
tracert -d 192.0.2.10
Resolve-DnsName example.com
```

`192.0.2.0/24` 是本文的文档示例网段，测试时需换成实际目标。检查双栈问题时分别测 IPv4／IPv6，避免 IPv4 通了就断言整个域名访问正常。

### 2.3 第四层：监听、连接和进程

```powershell
Test-NetConnection example.com -Port 443 -InformationLevel Detailed
Get-NetTCPConnection -State Listen
Get-NetTCPConnection | Select-Object LocalAddress, LocalPort,
    RemoteAddress, RemotePort, State, OwningProcess
Get-NetUDPEndpoint
netstat -ano
```

端口是传输层端点的一部分，不代表一个全机唯一的“应用编号”。服务只监听 `127.0.0.1` 时，局域网设备无法通过机器 LAN 地址访问；监听 `0.0.0.0` 通常表示所有 IPv4 本地接口，IPv6 则另看绑定和双栈行为。监听出现只证明本地有端点，不证明防火墙、路由和应用协议都正常。

`Test-NetConnection -Port` 测试 TCP，不是通用 UDP 测试器。UDP 的验证常需要应用协议请求、响应及抓包。按 `OwningProcess` 找到 PID 后，还应核对可执行文件与服务名。[Test-NetConnection](https://learn.microsoft.com/en-us/powershell/module/nettcpip/test-netconnection)。

## 3. 网络配置应该改在哪里

| 配置对象 | 首选入口／模块 | 要避免的混淆 |
| --- | --- | --- |
| 网卡启停、驱动属性、绑定 | 设置、设备管理器、NetAdapter | 改地址不能修复物理断链 |
| IP、前缀、路由 | NetTCPIP、相应网络设置 | 多网关、重叠网段和 VPN 可能改变选路 |
| DNS 服务器、客户端策略 | DnsClient、组织策略 | 应用自带 DoH／解析器未必使用同一路径 |
| 防火墙规则 | 高级安全 Windows Defender 防火墙、NetSecurity | 用户改本地规则可能被组织策略限制 |
| VPN、虚拟交换机、NAT | 对应 VPN／Hyper-V／平台管理接口 | 不宜直接改平台托管的虚拟接口注册表 |
| HTTP 代理、TLS 和证书 | 相应网络库、证书存储及应用配置 | 不存在保证所有应用都遵守的全局代理 |

底层网络配置应通过支持的管理接口和驱动属性修改。随意编辑网卡注册表、禁用 IPv6、执行 Winsock reset 或“网络重置”可能改变更多状态，不适合作为第一步。

### 3.1 静态地址示例及恢复

以下是**会改变网络的实验模板**，需要管理员 PowerShell。只在本地控制台或有可靠带外管理的实验机执行，不能在依赖该接口的远程会话中盲目运行。前提是目标接口原先使用 DHCP、没有其他手工地址，且示例地址和 DNS 已替换成网络实际分配值。

```powershell
# 先检查，不修改
Get-NetIPConfiguration -InterfaceAlias 'Ethernet'
Get-NetIPAddress -InterfaceAlias 'Ethernet'
Get-NetRoute -InterfaceAlias 'Ethernet'
Get-DnsClientServerAddress -InterfaceAlias 'Ethernet'

# 实际配置：New-NetIPAddress 在相应场景会关闭接口 DHCP
New-NetIPAddress -InterfaceAlias 'Ethernet' -IPAddress '192.0.2.10' `
    -PrefixLength 24 -DefaultGateway '192.0.2.1'
Set-DnsClientServerAddress -InterfaceAlias 'Ethernet' `
    -ServerAddresses '192.0.2.53'
```

为原本 DHCP 的此实验接口恢复时，先删除本次创建的静态地址和默认路由，再启用 DHCP 并恢复自动 DNS；下面只针对示例条目，勿扩大到所有网卡：

```powershell
Remove-NetIPAddress -InterfaceAlias 'Ethernet' -IPAddress '192.0.2.10' -Confirm
Remove-NetRoute -InterfaceAlias 'Ethernet' -DestinationPrefix '0.0.0.0/0' `
    -NextHop '192.0.2.1' -Confirm
Set-NetIPInterface -InterfaceAlias 'Ethernet' -AddressFamily IPv4 -Dhcp Enabled
Set-DnsClientServerAddress -InterfaceAlias 'Ethernet' -ResetServerAddresses
```

确认提示时应核对实际对象；若该地址删除后对应路由已不存在，路由删除可能无匹配项。若原配置是静态地址，则应根据预先保存的地址、路由及 DNS 恢复，不能用“启用 DHCP”代替原配置。[New-NetIPAddress](https://learn.microsoft.com/en-us/powershell/module/nettcpip/new-netipaddress?view=windowsserver2025-ps)。

### 3.2 防火墙不要全关

先核对服务绑定地址、网络配置文件（Domain／Private／Public）、有效策略和流量方向。下面创建一条范围有限的**入站放行规则**，仅作为明确需要提供实验服务的示例，需要管理员；换成真实程序、可信来源网段和端口，先确保规则名称未被使用：

```powershell
New-NetFirewallRule -Name 'WindowsKnowledge-Lab-8443' `
    -DisplayName 'WindowsKnowledge Lab TCP 8443' -Direction Inbound `
    -Action Allow -Protocol TCP -LocalPort 8443 -Profile Private `
    -RemoteAddress '192.0.2.0/24' -Program 'D:\Lab\server.exe'

# 撤销本次新增的规则
# Remove-NetFirewallRule -Name 'WindowsKnowledge-Lab-8443'
```

放行规则仍可能受显式阻止、组织策略、其他 WFP 过滤或上游网络限制。[New-NetFirewallRule](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule)。

## 4. 网桥、虚拟交换机、NAT、路由和端口转发

| 机制 | 主要工作层次／效果 | 典型用途 |
| --- | --- | --- |
| 网桥 | 二层转发，连接二层网络 | 将接口连接到同一广播域；可能引入环路和 DHCP 扩散 |
| Hyper-V 虚拟交换机 | 二层交换与扩展策略 | 给虚拟机连接虚拟网卡，选择与宿主／物理网的关系 |
| 路由／转发 | 三层按目的地址转发 | 连接不同 IP 网段，需要返回路由 |
| NAT | 修改地址／端口映射 | 私有实验网通过宿主访问外部网络 |
| TCP 端口代理 | 监听并转接指定 TCP 连接 | 某些端点映射，不等于二层桥接或完整 NAT |

`ncpa.cpl` 中的“桥接连接”会改变选中接口的二层关系和宿主网络配置。只有已确认两个接口都支持该方式、知道上游网络允许接入额外设备且不存在环路时，才选择实验接口创建网桥。删除网桥后还需检查成员接口恢复状态；不应把企业 Wi-Fi、VPN 或认证网络随意接入另一个网段。Wi-Fi 的转发行为取决于驱动和接入点，不能假设与有线端口完全一致。

### 4.1 Hyper-V 三种交换机

- **External**：绑定物理网卡，让虚拟机接入外部网络；宿主是否共享该接口由管理 OS 共享设置决定。
- **Internal**：宿主与虚拟机、虚拟机彼此通信，默认不自动具备外网出口。
- **Private**：同宿主上连接该交换机的虚拟机彼此通信，不直接包含宿主端口。

外部交换机创建后，宿主 IP 通常由管理 OS 的 `vEthernet` 接口承载，别继续机械地把 IP 写到被交换机绑定的物理口。客户端 Default Switch 是平台管理的另一种便利网络，不应与手工 Internal 交换机混为一谈。[Hyper-V 网络规划](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/plan/plan-hyper-v-networking-in-windows-server)。

### 4.2 构建可回收的 NAT 实验网

需要已启用 Hyper-V 且具有相应管理权限。先运行 `Get-VMSwitch`、`Get-NetNat`、`Get-NetRoute` 检查已有配置，确认实验网段不与局域网、VPN、WSL 或容器网络重叠。不要在已有不兼容 WinNAT 配置时继续创建；官方文档记载同宿主 NAT 网络的实现限制，应结合当前平台核对。

```powershell
# 会创建交换机、宿主实验地址及 NAT
New-VMSwitch -Name 'WK-Lab' -SwitchType Internal
$labAdapter = Get-NetAdapter -Name 'vEthernet (WK-Lab)'
New-NetIPAddress -InterfaceIndex $labAdapter.ifIndex `
    -IPAddress '192.168.250.1' -PrefixLength 24
New-NetNat -Name 'WK-Lab-NAT' -InternalIPInterfaceAddressPrefix '192.168.250.0/24'
```

再在 Hyper-V 管理器创建虚拟机，按安装介质选择代际、内存和磁盘，把网卡接到 `WK-Lab`，安装客体系统。在客体内手工设置例如 `192.168.250.10/24`、网关 `192.168.250.1` 和实际可达的 DNS。**New-NetNat 不会自动提供 DHCP 或 DNS 服务**，也不会替你安装客体系统。

确认无虚拟机依赖本实验网、已移除相关映射后，按以下顺序撤销本次对象：

```powershell
Remove-NetNat -Name 'WK-Lab-NAT' -Confirm
Remove-NetIPAddress -InterfaceAlias 'vEthernet (WK-Lab)' `
    -IPAddress '192.168.250.1' -Confirm
Remove-VMSwitch -Name 'WK-Lab' -Confirm
```

此操作会中断连接该交换机的虚拟机网络；虚拟机中的静态地址需另行清理。[Hyper-V NAT 官方步骤](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/setup-nat-network)。

`netsh interface portproxy` 用于相应 TCP 端口代理，不支持把任意 UDP 服务照样转发，也不能代替虚拟交换机、转发路由与防火墙配置。[netsh interface](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-interface)。

## 5. 应用层：DNS、代理、HTTP 与 TLS 是不同配置

### 5.1 不存在所有应用自动共享的代理

Windows 的用户代理设置、WinINet、WinHTTP 会话代理、PAC／自动发现、应用自己的代理和 `HTTP_PROXY` 等变量并非完全统一。WinHTTP 应用可以获取用户设置，也可以按会话或请求指定代理；服务与交互用户上下文不同，继承关系也不能想当然。[WinHTTP 与 WinINet 代理](https://learn.microsoft.com/en-us/windows/win32/winhttp/setting-wininet-proxy-configurations-in-winhttp)。

只读检查：

```powershell
netsh winhttp show proxy
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
    Select-Object ProxyEnable, ProxyServer, AutoConfigURL
Get-ChildItem Env: | Where-Object Name -match 'proxy'
curl.exe -V
curl.exe -v https://example.com/
```

这些只能说明相应存储或工具的设置，不能证明某个目标应用采用它。`curl.exe -V` 可帮助确认使用的 TLS 后端；不要默认所有 Windows 上安装的 curl、Java 或 Python 都使用同一证书库。`-v` 输出可能包含请求敏感信息，分享前检查。

### 5.2 证书与私钥如何存放

证书通常包含公钥、主体、签发者、用途和有效期等；私钥是另一个受保护对象。`.cer` 常用于证书内容，通常不包含私钥；`.pfx`／`.p12` 可以包含私钥与证书链，但也可能没有私钥，需实际检查。

Windows 常用证书存储分为 CurrentUser 与 LocalMachine，并有 My（个人）、Root（受信任根）、CA（中间证书）等逻辑存储。运行 `certmgr.msc` 查看当前用户存储，`certlm.msc` 查看本机存储；管理员导入到自己的 CurrentUser 不会自动让服务账户可用。信任存储还可能组合机器和组策略的内容，不能把逻辑存储理解成彼此完全隔离的文件夹。

```powershell
# 只读，不导出私钥
Get-ChildItem Cert:\CurrentUser\My |
    Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
Get-ChildItem Cert:\LocalMachine\My |
    Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
```

服务使用证书时，需要找到正确存储中的证书并具有使用私钥的权限。把证书放进 LocalMachine\My 不是自动授权所有服务读取私钥。通过证书管理器的“管理私钥”等受支持入口向实际服务身份授予最低必要权限；硬件密钥提供程序的权限管理可能不同。[证书存储](https://learn.microsoft.com/en-us/windows/win32/secauthn/certificate-stores)、[导入证书与私钥访问的区别](https://learn.microsoft.com/en-us/windows/win32/winhttp/winhttpcertcfg-exe--a-certificate-configuration-tool)。

例如为一个使用 Windows 证书存储的服务配置服务器证书：先确认服务要求的名称和用途，在 `certlm.msc` 的“个人 → 证书”中通过导入向导导入可信来源的 PFX，输入其保护密码并按需求限制私钥可导出性；检查证书具有私钥及正确链，再授予该服务身份必要的私钥使用权，最后在服务器栈中配置相应绑定并进行真实 TLS 连接验证。每一步都会改变证书或应用配置，生产环境应保留原绑定及证书以便回退。应用若使用 PEM 文件或自己的密钥库，则应按应用文档配置，不能强行套用这个流程。[证书存储管理](https://learn.microsoft.com/en-us/windows-server/identity/ad-cs/inspect-certificates-manage-certificate-stores)。

### 5.3 HTTPS 到底要检查哪些条件

依次确认：域名解析、TCP／适用的传输协议、TLS 版本和算法协商、服务器证书链、主机名与 SAN、有效时间、用途、吊销策略，以及应用自己的信任库。双向 TLS 还要检查客户端证书与私钥、服务器对该身份的信任和映射。

通过 IP 访问只包含 DNS 名称的证书可能导致名称不匹配；系统时间错误会导致有效期判断失败；缺少中间证书可能导致部分客户端失败。安装未知根证书会扩大信任范围，不能作为任意 HTTPS 报错的通用修复。关闭证书验证只会掩盖问题。

### 5.4 证书绑定取决于服务器栈

HTTP.sys、IIS、Kestrel、nginx 或应用自己的 TLS 服务器有各自配置。`netsh http` 管理 Windows HTTP Service 的证书绑定、URL 保留等，不会给所有程序统一装上 HTTPS：

```powershell
# 只读查看 HTTP.sys 的相关状态
netsh http show sslcert
netsh http show urlacl
```

URL ACL 控制相应 URL 命名空间的注册使用权，不等于文件权限或客户端业务授权。HTTP.sys 的证书绑定、应用监听、私钥权限和防火墙也需要分别成立。[netsh http](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-http)。

## 6. 如何抓包验证自己的假设

Windows 自带 Packet Monitor（Pktmon），可以观察网络栈多个位置、统计和报告某些丢包原因。它适合物理及虚拟网络路径排查，ETL 可以转换为 pcapng 后用相应分析器查看。[Pktmon 官方说明](https://learn.microsoft.com/en-us/windows-server/networking/technologies/pktmon/pktmon)。

以下需要管理员并**会改变捕获状态和生成文件**；先查看 `pktmon status` 和 `pktmon filter list`。本例要求没有现有采集、过滤器列表为空，并且操作期间没有其他人在共用 Pktmon。`pktmon filter remove` 删除所有过滤器，不能按名字只删除本例规则，因此不满足上述条件时不要照做。参数依系统版本而异，以 `pktmon help` 为准。

```powershell
pktmon status
pktmon filter list
pktmon filter add WK-HTTPS -t TCP -p 443
pktmon start --capture --pkt-size 0 --file-name D:\Captures\wk-network.etl
# 短时间复现后停止；确认仍只有本次过滤器后再清除
pktmon stop
pktmon filter list
pktmon filter remove
pktmon etl2pcap D:\Captures\wk-network.etl --out D:\Captures\wk-network.pcapng
```

前提是目标目录存在、文件未被占用且有足够空间。示例只捕获 TCP 443，**不包含 HTTP/3 的 QUIC／UDP 443**；按目标协议调整。TLS 加密流量通常看不到明文 HTTP，请求内容需结合应用日志或受控的解密调试方案。完整包可能包含敏感业务信息，结束后按实际保留需求管理文件。

## 7. 排障案例：本机能访问，别的电脑不行

先在服务端确认程序监听实际 LAN 地址或适当的所有接口；再从客户端确认 DNS 指向正确地址和 IPv4／IPv6；测试目标 TCP 端口；核对服务端防火墙配置文件及来源限制；有 NAT、VPN 或虚拟交换机时检查转发和返回路径。TCP 成功后再排 TLS、HTTP 状态、认证和业务权限。必要时两端抓包，区分请求没到、到达被拒绝、返回丢失和协议握手失败。

这个顺序把问题收敛到具体组件，避免仅因为浏览器提示“无法连接”就修改证书、关闭防火墙或重装网卡驱动。

## 8. 参考来源

- [WFP](https://learn.microsoft.com/en-us/windows/win32/fwp/windows-filtering-platform-start-page)、[Test-NetConnection](https://learn.microsoft.com/en-us/powershell/module/nettcpip/test-netconnection)：网络栈与诊断。
- [Hyper-V 网络规划](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/plan/plan-hyper-v-networking-in-windows-server)、[NAT 配置](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/setup-nat-network)：虚拟网络模型。
- [WinHTTP 代理](https://learn.microsoft.com/en-us/windows/win32/winhttp/setting-wininet-proxy-configurations-in-winhttp)、[证书存储](https://learn.microsoft.com/en-us/windows/win32/secauthn/certificate-stores)、[netsh http](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-http)：应用层配置边界。
- [Pktmon](https://learn.microsoft.com/en-us/windows-server/networking/technologies/pktmon/pktmon)：抓包和丢包分析。

