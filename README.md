# Dream Reflex Blog Site

云梦镜像博客站开放源代码仓库

## 网站

该网站部署在[dreamreflex-blog](https://blog.dreamreflex.com)

## 开发

```bash
git clone https://github.com/dreamreflex/blog.git
cd blog
```

安装依赖

```bash
npm install
```

启动开发服务器
```bash
npm run docs:dev
```

注：
1. 文章默认按照文件名序列排序，但在getFrontmatterFromFile函数中实现了一个通过`order`字段自定义同级文档顺序的工具。
2. 文章编写流程不建议加入formatter头部，这并不是因为formatter头部的技术性原因，而是博客应以快速迭代，快速编辑为主，formatter头部的编辑逻辑不符合随笔习惯，增加了额外的不必要开支。
3. 使用ESA加速，详情[阿里云ESA](https://www.aliyun.com/product/esa)

## License

MIT
