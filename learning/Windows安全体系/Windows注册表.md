---
order: 2
---
# Windows 注册表机制技术说明

## 1. 注册表的定位与设计目的

Windows 注册表是一个**集中式、层级化的系统配置数据库**，用于存储：

* 操作系统核心配置
* 硬件与驱动信息
* 用户配置与策略
* 应用程序运行参数
* 安全策略与权限相关信息

注册表是 Windows NT 架构的重要组成部分，由 Microsoft 设计，用于替代早期 Windows 的 INI 配置文件体系。


## 2. 注册表的逻辑结构（层级模型）

注册表采用**类似文件系统的树状结构**：

```
Hive（根键）
 └─ Key（键）
    └─ SubKey（子键）
       └─ Value（值）
```

### 2.1 Hive（根键）

Hive 是注册表的**顶层命名空间**，也是逻辑与物理存储的基本单位。

![Image](https://miro.medium.com/v2/resize%3Afit%3A1400/1%2AXE-M00scPHn7nvzeGYV5zg.png)

![Image](https://voyager.deanza.edu/~hso/cis170f/lecture/ch11/images/win11_F02.jpg)

![Image](https://www.researchgate.net/publication/366519390/figure/fig1/AS%3A11431281194142783%401695972326635/Relation-between-windows-registry-root-keys.jpg)

Windows 常见的 6 个根 Hive：

| Hive                       | 含义         |
| -------------------------- | ---------- |
| HKEY_LOCAL_MACHINE (HKLM)  | 本机级系统配置    |
| HKEY_CURRENT_USER (HKCU)   | 当前登录用户配置   |
| HKEY_USERS (HKU)           | 所有用户配置     |
| HKEY_CLASSES_ROOT (HKCR)   | 文件关联 / COM |
| HKEY_CURRENT_CONFIG (HKCC) | 当前硬件配置     |
| HKEY_PERFORMANCE_DATA      | 性能计数器（动态）  |


## 3. 各主要 Hive 的内容说明

### 3.1 HKEY_LOCAL_MACHINE（HKLM）

**系统级配置中心**

包含内容：

* 操作系统版本与启动参数
* 驱动加载信息
* 服务配置
* 硬件枚举结果
* 系统策略

常见子键：

* `SYSTEM`：启动、驱动、硬件
* `SOFTWARE`：系统与应用全局配置
* `SECURITY`：本地安全策略（受保护）
* `SAM`：本地账户数据库（高度受限）

> HKLM 中的内容对所有用户生效，写入通常需要管理员权限。


### 3.2 HKEY_CURRENT_USER（HKCU）

**当前用户的个性化配置视图**

包含内容：

* 桌面与外观设置
* 输入法、语言、区域
* 用户级应用配置
* Explorer 行为

技术本质：

> HKCU 实际是 `HKEY_USERS\<当前用户 SID>` 的快捷映射。

### 3.3 HKEY_USERS（HKU）

**所有用户的注册表数据**

* 每个子键对应一个用户 SID
* 包含当前登录与历史用户
* 系统账户（SYSTEM、LOCAL SERVICE 等）也在此

用途：

* 多用户系统管理
* 用户配置加载与卸载


### 3.4 HKEY_CLASSES_ROOT（HKCR）

**文件类型与 COM 组件注册中心**

包含：

* 文件扩展名关联（.txt、.exe）
* 默认打开程序
* COM / ActiveX 注册信息
* Shell 扩展

技术来源：

> HKCR = HKLM\Software\Classes + HKCU\Software\Classes 的合并视图


### 3.5 HKEY_CURRENT_CONFIG（HKCC）

**当前硬件配置视图**

* 显示当前硬件 Profile
* 实际映射自 HKLM\SYSTEM

常用于：

* 多硬件配置场景
* 动态设备环境


## 4. 注册表值（Value）的数据类型

每个 Key 可以包含多个 Value，常见类型包括：

| 类型            | 说明            |
| ------------- | ------------- |
| REG_SZ        | 字符串           |
| REG_EXPAND_SZ | 可展开字符串（含环境变量） |
| REG_DWORD     | 32 位整数        |
| REG_QWORD     | 64 位整数        |
| REG_BINARY    | 二进制数据         |
| REG_MULTI_SZ  | 多字符串          |


## 5. 注册表的物理存储机制

### 5.1 Hive 文件位置

注册表并非“只存在于内存”，而是映射到磁盘文件：

| Hive     | 文件路径                                  |
| -------- | ------------------------------------- |
| SYSTEM   | `C:\Windows\System32\Config\SYSTEM`   |
| SOFTWARE | `C:\Windows\System32\Config\SOFTWARE` |
| SAM      | `C:\Windows\System32\Config\SAM`      |
| SECURITY | `C:\Windows\System32\Config\SECURITY` |
| 用户 Hive  | `C:\Users\<User>\NTUSER.DAT`          |

启动流程：

1. 内核加载 SYSTEM Hive
2. 登录时加载用户 NTUSER.DAT
3. 映射为 HKCU / HKU


## 6. 注册表的访问与安全模型

### 6.1 ACL 权限控制

注册表 Key 本质是**内核对象**，拥有：

* DACL（访问控制）
* SACL（审计）

可精确控制：

* 读取
* 写入
* 创建子键
* 删除
* 修改权限


### 6.2 UAC 与虚拟化（Registry Virtualization）

为兼容旧应用：

* 非管理员写 HKLM
* 实际被重定向到：

  ```
  HKCU\Software\Classes\VirtualStore
  ```

该机制仅用于旧程序，现代应用应避免依赖。


## 7. 注册表的工作方式总结

注册表的运行逻辑可以概括为：

1. 系统启动加载核心 Hive
2. 用户登录加载用户 Hive
3. 进程通过 Win32 / NT API 访问注册表
4. 内核执行 ACL 与 Token 校验
5. 返回或拒绝访问


## 8. 注册表的典型用途分类

| 类别   | 示例                     |
| ---- | ---------------------- |
| 启动项  | Run / RunOnce          |
| 服务配置 | Services               |
| 系统策略 | Policies               |
| 应用配置 | Software\Vendor\App    |
| 安全限制 | Windows Defender / UAC |
| 文件关联 | Classes                |

## 9. 与 Linux 配置体系的对比

| 对比项  | Windows 注册表 | Linux |
| ---- | ----------- | ----- |
| 配置形式 | 二进制集中数据库    | 文本文件  |
| 权限控制 | ACL         | 文件权限  |
| 动态性  | 高           | 中     |
| 可读性  | 低           | 高     |
| 集中管理 | 强           | 弱     |
