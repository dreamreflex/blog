---
title: 'Windows虚拟机方案'
description: 'Ubuntu平台安装Windows虚拟机方案'
pubDate: '2026-04-15'
tags: ['技术方案']
---

# Ubuntu平台安装Windows虚拟机方案

>  Ubuntu 24.04 使用 KVM + QEMU + virt-manager 安装 Windows 11 完整指南

## 一、方案概述

本文介绍如何在 Ubuntu 24.04 上，通过：

- KVM（Kernel-based Virtual Machine）
- QEMU（虚拟化执行引擎）
- virt-manager（图形管理工具）

构建一个完整、稳定、高性能的 Windows 11 虚拟机环境。

---

## 二、技术架构说明

### 1. 核心组件

| 组件         | 作用                                  |
| ------------ | ------------------------------------- |
| KVM          | 利用 CPU 虚拟化指令，实现接近原生性能 |
| QEMU         | 模拟硬件设备                          |
| libvirt      | 管理虚拟机生命周期                    |
| virt-manager | 图形化管理工具                        |
| swtpm        | 提供虚拟 TPM（满足 Win11 要求）       |

---

### 2. 整体结构

```

Ubuntu Host
├── KVM（硬件虚拟化）
├── QEMU（设备模拟）
├── libvirt（管理层）
└── Windows 11 VM

````

---

## 三、环境要求

### 硬件要求

- CPU 支持虚拟化（Intel VT-x / AMD SVM）
- 建议：
  - ≥ 8GB 内存（推荐16GB）
  - ≥ 4核 CPU

---

### 检查虚拟化支持

```bash
egrep -c '(vmx|svm)' /proc/cpuinfo
````

> 输出 > 0 表示支持

---

## 四、安装虚拟化环境

```bash
sudo apt update
sudo apt install -y qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virtinst virt-manager
```

---

## 五、启动服务

```bash
sudo systemctl start libvirtd
sudo systemctl enable libvirtd
```

---

## 六、用户权限配置（关键）

```bash
sudo adduser $USER libvirt
sudo adduser $USER kvm
```

⚠️ 必须重启系统：

```bash
reboot
```

---

## 七、准备安装镜像

### 1. Windows 11 ISO（官方）

下载地址：
[https://www.microsoft.com/software-download/windows11](https://www.microsoft.com/software-download/windows11)

---

### 2. VirtIO 驱动（必须）

下载地址：
[https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/latest-virtio/](https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/latest-virtio/)

---

### 3. 复制到 libvirt 目录（关键）

```bash
sudo cp Win11.iso /var/lib/libvirt/images/
sudo cp virtio-win.iso /var/lib/libvirt/images/
```

---

## 八、创建虚拟机

启动：

```bash
virt-manager
```

---

### 创建流程

1. Create new VM
2. 选择：

   ```
   Local install media (ISO)
   ```
3. 手动输入路径：

   ```
   /var/lib/libvirt/images/Win11.iso
   ```

---

## 九、资源配置（推荐）

| 项目 | 推荐值               |
| ---- | -------------------- |
| CPU  | 4 cores              |
| 内存 | 8GB                  |
| 磁盘 | ≥ 100GB（推荐128GB） |

---

## 十、关键配置（必须修改）

### 1. 固件

```
Firmware: UEFI
Chipset: Q35
```

---

### 2. CPU优化

```
host-passthrough
```

👉 提供接近物理机性能

---

### 3. TPM（Windows 11 必须）

添加：

```
Type: Emulated
Version: 2.0
```

❌ 不要使用 passthrough

---

### 4. 添加 VirtIO 光驱

Add Hardware → Storage：

```
Device type: CDROM
```

选择：

```
virtio-win.iso
```

---

## 十一、开始安装

点击：

```
Begin Installation
```

---

## 十二、解决“找不到磁盘”问题（必遇）

### 原因

Windows 默认不支持 VirtIO 磁盘

---

### 解决方法

在安装界面：

```
Load driver
```

进入：

```
viostor → w11 → amd64
```

加载后磁盘出现

---

## 十三、解决“必须联网”问题

在 OOBE 界面：

### 按：

```
Shift + F10
```

输入：

```
OOBE\BYPASSNRO
```

重启后：

选择：

```
我没有 Internet
```

---

## 十四、安装完成后（驱动补全）

进入系统后：

### 安装：

* NetKVM（网络）
* Balloon（内存优化）
* QXL / Spice（显示优化）

路径：

```
virtio-win.iso
```

---

## 十五、常见问题总结

### 1. ISO 无权限访问

原因：

```
libvirt 无法访问 /home
```

解决：

```
复制到 /var/lib/libvirt/images/
```

---

### 2. 看不到 ISO

原因：

```
virt-manager GUI 限制
```

解决：

```
手动输入路径
```

---

### 3. 无网络

原因：

```
缺少 VirtIO 网卡驱动
```

---

### 4. 无磁盘

原因：

```
缺少 VirtIO 存储驱动
```

---

## 十六、性能优化建议

* CPU：host-passthrough
* 磁盘：VirtIO（后期可切换）
* 显示：Spice + QXL
* IO：cache=none（高级优化）

---

## 十七、方案优势分析

### 1. 性能优势

* 接近裸机性能（KVM 使用 CPU 硬件虚拟化）
* 比 VMware / VirtualBox 更高效

---

### 2. 开源生态

* 完全开源
* 无授权限制
* Linux 原生支持

---

### 3. 灵活性

* 支持：

  * GPU Passthrough
  * 网络桥接
  * 快照
  * 自动化部署

---

### 4. 企业级能力

* libvirt API
* 可集成：

  * OpenStack
  * Kubernetes 虚拟化

---

## 十八、适用场景

* 开发测试环境
* Windows 软件运行
* 安全隔离环境
* 多系统并行运行

---

## 十九、总结

KVM + QEMU + virt-manager 是 Linux 下：

> 性能最强
> 最稳定
> 最接近物理机

的虚拟化方案。

通过：

* VirtIO 驱动
* Emulated TPM
* host-passthrough

可以实现：

几乎无损性能的 Windows 11 虚拟机环境

---

## 二十、扩展方向（进阶）

* GPU 直通（VFIO）
* SR-IOV 网卡
* 云虚拟化（Proxmox / OpenStack）
* 自动化部署（Terraform + libvirt）
