# AI 共创场 UI 原型

> PROTOTYPE — 一次性验证代码，不是正式产品实现。

在仓库根目录运行：

```sh
python3 -m http.server 4173 --directory prototype/arena-ui
```

然后打开：

- 参赛者双栏：<http://localhost:4173/?surface=participant&variant=A>
- 参赛者纵向：<http://localhost:4173/?surface=participant&variant=B>
- 主持控制台：<http://localhost:4173/?surface=host>
- 现场大屏：<http://localhost:4173/?surface=display>

页面底部也可以切换视角。所有数据仅存在于当前页面内存，刷新即重置。
