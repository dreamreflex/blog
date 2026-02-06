---
title: 'CDN体系介绍'
description: '介绍CDN体系和CDN控制体系'
pubDate: '2026-02-06'
tags: ['最佳实践', '边缘计算','CDN']
---

# CDN体系完整介绍

> 本文面向CDN使用者和推广无服务器技术的技术人员，但不需要有专业的开发经验，了解基本网络概念即可

## 1. CDN介绍

CDN（Content Delivery Network）是内容分发网络，一般以就近分发，快速响应为原则。

解决了距离太远，带宽限制多导致的速度问题。

以超市分发网络为模型，超市中的货物分为常规货物和稀有货物两类，常规货物在各大超市均可买到，而稀有货物只能通过工厂邮递。以iPhone为例。

CDN网络层次

1. 第一层：用户层，用户访问，一般为浏览器和APP
2. 第二层：CDN层，CDN服务商，包含CDN分发节点和回源节点两类。
3. 第三曾：源站（Origin），内容服务源头

任何内容，只有两种状态：新鲜和过期。

对于新鲜内容：now < response_time + max-age，是可用的，不需要回源

而对于过期内容：now ≥ response_time + max-age，未必可用，需要其他指令帮助做决策

## 2. 缓存策略

Cache-Control字段内容：

https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Reference/Headers/Cache-Control

### 2.1 Expire字段

HTTP/1.0（RFC 1945）只有一个缓存头：

```
Expires: Wed, 21 Oct 2015 07:28:00 GMT
```

用于标记内容的过期时间，1996左右发布。

### 2.2 缓存指令体系

RFC 2068 → RFC 2616（1999）Cache-Control 被引入，作为“统一缓存指令系统”

第一代核心指令

```
Cache-Control: max-age=600
Cache-Control: no-cache
Cache-Control: no-store
Cache-Control: public
Cache-Control: private
```

#### max-age

工程用法

- HTML：`max-age=60`
- API：`max-age=0`
- 静态资源：`max-age=31536000`

#### s-maxage

共享缓存：

```
Cache-Control: max-age=60, s-maxage=3600
```

标识只对共享缓存（CDN / Proxy）有效，覆盖 `max-age`浏览器：1 分钟而CDN：1 小时

s-maxage和max-age都属于cache-control会覆盖expires

#### 权限指令

```
Cache-Control: public | private | no-store
```

1. public：被任意人员缓存，浏览器，CDN，代理都可以缓存，没有认证信息时通常隐式 public
2. private：被单个用户缓存，单个浏览器允许缓存，中间所有链条都不允许缓存，用在页面耦合用户状态
3. no-store：禁止缓存，不允许任何环节缓存，包括浏览器等，用于API和认证信息场景

#### 重新验证指令

当缓存已经存在，但过期了，CDN服务器就需要进行决策，CDN有权采用revalidate或返回旧数据。revalidate指的是向源站重新确认，2xx则更新，304则用缓存。注意304是没有Body的，只有一个HTTP响应头。

```
Cache-Control: no-cache | must-revalidate | proxy-revalidate
```

1. no-cache：和no-store不一样，可以缓存，但每次使用前必须回源验证，用于内容可能会变但是想省流量，就算是在max-age内也需要去源站验证，通常会得到304。通常是`Cache-Control: max-age=600, no-cache`，节省流量，最通用，但浪费请求数量和连接数量。
2. must-revalidate：必须回源验证，通常和max-age=0一起用，防止弱网时用旧数据。如果没有，则在弱网情况下，CDN和浏览器会凑合用旧数据。如果浏览器得不到响应，没有must-revalidate，就会凑合用旧数据。
3. proxy-revalidate：共享缓存版本的must-revalidate，这是CDN的专用版本，浏览器会忽略这个指示。

#### 请求指令

Cache-Control是分请求和响应的，浏览器的请求头可以携带特定的Cache-Control指令。

```
Cache-Control: max-stale=? | min-fresh=? | only-if-cached
```

1. max-stale:最多容忍多少秒的过期
2. 希望内容最少新鲜多少秒
3. only-if-cached：不要去回源，我只要缓存内容

#### 过期容忍

过期容忍是高可用和防击穿的现行做法，很多内容并不在标准中，但是被大量浏览器视为事实标准。

```
Cache-Control: max-age=60, stale-while-revalidate=30
```

内容已经过期，但是过期后 30s 内允许缓存旧内容，后台可以去执行revalidate

```
Cache-Control: stale-if-error=86400
```

源站出现了错误，那么CDN可以返回一天内的内容，CDN此时作为后台崩溃后的容灾作用。

#### immutable

immutable是特殊的指令，被大部分浏览器支持，但仍属于是实验性的内容。

```
Cache-Control: max-age=31536000, immutable
```

表示内容永不变，可以无限缓存。

例如配合哈希化静态资源使用。

### 2.3 Etag体系

HTTP允许使用条件请求头（Conditional Request Headers）来让浏览器具有和CDN协商的能力。

```
ETag: "v1"
```

ETag是资源的指纹，可以通过哈希，inode内容，版本号等确定，由服务器来进行响应

例如浏览器GET index.html，则服务器响应内容和ETag，通常还会携带一个`Cache-Control: no-cache`

浏览器获得Etag后会存储下来，下次继续GET index.html时会携带下面的内容

```
GET /index.html
If-None-Match: "v1"
```

服务器如果没有更新，则返回304 Not Modified，且304 Not Modified状态码是没有任何body的。

### 2.4 Last-Modified体系

客户端请求内容时，服务器返回

```
200 OK
Last-Modified: T1（例如是Wed, 21 Oct 2025 07:28:00 GMT）
Cache-Control: max-age=0
```

服务指的是这个资源最后一次修改是在Wed, 21 Oct 2025 07:28:00 GMT

下次浏览器请求内容时会携带

```
If-Modified-Since: Wed, 21 Oct 2025 07:28:00 GMT
```

标识我上次接收的内容修改时间。此时服务器有两种情况，第一种情况是内容从T1（Wed, 21 Oct 2025 07:28:00 GMT）到目前时间点都没变过，则可以缓存，返回304 Not Modified

但如果内容在T2变化了，T2自然是新的，例如在Wed, 21 Oct 2025 07:30:00 GMT，那么就会响应200，表示让浏览器用新内容，同时也会附带Last-Modified字段

### 2.5 判断优先级

CDN系统内会优先判断Etag体系，因为Last-Modified体系精度不足，且属于是旧系统，秒级更新不适合分布式和高精度系统。

通用方案都是Etag和cache-control结合进行使用。

## 3. 最佳实践

在选择缓存策略时，优先级为正确性>稳定性>成本>性能，且顺序不能反。CDN已经不再只扮演分发角色，更多是靠近用户的安全层，会集成CC防护，DDoS防护，WAF等其他功能。

下面将会从常见场景策略来介绍。

### 3.1 隐私敏感场景

防止数据泄露，防止用户串号，防止浏览器 / CDN 留痕，策略核心是禁止缓存，必须回源

```
Cache-Control: no-store
Pragma: no-cache
```

### 3.2 用户态 HTML 页面

低 TTL + 强一致，但希望页面快速刷新且不串用户。

```
Cache-Control: private, max-age=60, must-revalidate
ETag: "user-page-v123"
```

效果是CDN不缓存，但是用户侧可以获得更好体验
### 3.3 公共 HTML 页面

抗高并发，内容分钟级更新，SEO 友好，希望搜索机构能够检索

```
Cache-Control: max-age=60, s-maxage=600, must-revalidate
ETag: "home-v456"
```

效果是可以有304，较为节省资源，更新靠发布 + 刷新

### 3.4 REST API

对于资源API来说，希望可缓存，但必须验证，减少流量损耗的同时保障实时性

```
Cache-Control: no-cache
ETag: "api-v789"
```

效果是可缓存但每次 revalidate，304更多。

也可以通过用户的认证状态来区分

```
Cache-Control: private, no-cache
Vary: Authorization
```

通过认证头来进行标识。

### 3.5 REST API（高频版本）

如果REST资源需要高频访问且数据秒级延迟可接受

```
Cache-Control: max-age=5, s-maxage=30
ETag: "api-short-v1"
```

效果是命中直接返回，实时性也能得到一定保障

### 3.6 长缓存

博客资源，图片，视频等希望CDN缓存但可能刷新

```
Cache-Control: public, max-age=3600, s-maxage=86400
```

效果是一天内有效，允许浏览器一小时内缓存，CDN可以缓存一天

如果是频繁变动的长缓存也可以使用

```
Cache-Control: max-age=3600, must-revalidate
ETag: "static-v2"
```

允许变动同时支持条件请求

### 3.7 哈希化

如果资源是静态打包的，例如Vite或静态网页生成器，则使用永久缓存

```
Cache-Control: public, max-age=31536000, immutable
```

此时可强制缓存，能够忽略查询参数，因为内容变化必然导致构建产物的URL变化，直接访问新URL而非在CDN层面刷新。

### 3.8 大文件

希望降低源站带宽同时支持断点续传

```
Cache-Control: public, max-age=86400
Accept-Ranges: bytes
ETag: "file-v5"
```

启用 Range Cache可以让CDN服务商充当文件服务器

### 3.9 多语言 / 多终端页面

希望不串版本且CDN 正确区分相应内容

```
Cache-Control: max-age=300
Vary: Accept-Language, User-Agent
```

尊重 Vary，尤其是URL一致但是服务器响应的内容根据语言，地域，设备不同而响应不同。

如果Vary: Accept-Language，则只有URL一致且都是一个语言版本时会加速，对不上的情况会回源

一般都会加入`Vary: Accept-Encoding, Accept-Language`

### 3.10 企业容灾

对于企业内容来说，如果后端崩溃，则需要使用旧内容顶替

```
Cache-Control: max-age=60, stale-if-error=86400
```

源站挂了页面还能用，是高可用的基础，也是企业保障可用性的关键。

## 4. REST状态机

RESTful API中的实体是可缓存的，且在高频访问时，nginx无法管理API系统的实体状态，因此需要API系统完成对RESTful API实体资源的缓存管理。

REST状态机便是决定实体刷新状态和缓存指令的机制，本质上是判断实体更新时是否需要更新缓存指令。

由于实体在RESTful API风格下，一旦被创建，有且只有被更新和删除两种操作下会更改状态，因此PUT和DELETE操作会触发缓存机制变化。

一般有如下场景

### 4.1 无内容 - 新建

当实体不存在时，响应的内容始终是404，不会被缓存

内容被POST/PUT新建，则POST/PUT的响应事件（一般是201）和缓存时间戳会同时更新

此时访问会被缓存，CDN直接返回缓存内容

### 4.2 原状态更新

在实体维持原状态时，如果有PUT/PATCH请求更新了操作，一般会分成两种情况

1. 实体变化：服务器接受了更新，返回201 Created或200 ok，此时需要更新缓存的时间戳
2. 实体无变化：服务器接受了更新但是实体无变化，返回204 No Content，此时缓存时间戳仍不变，且仍然沿用旧的缓存时间戳

### 4.3 删除更新

一般来说删除操作DELETE必定会导致内容变化，因此DELETE会同时删除缓存机制，缓存系统跟着资源实体一起删除，方便统一管理

### 4.4 分页机制

在查询多实体时，一般会携带分页查询字符串，分页机制一般无法和缓存机制共存，因为分页会带来ID变化。但如果使用的是强约束数据库模式（ID严格按顺序变化），则可以利用下面的算法进一步优化缓存机制。

例如1-100中，第51个资源发生变化，则前五组被缓存标记为304，从第五组开始，所有内容均不提供缓存指令，即使存在替换的情况。

替换指的是51和52更换顺序，52后资源未修改。

但通用情况下不建议在分页接口中融合缓存机制。



