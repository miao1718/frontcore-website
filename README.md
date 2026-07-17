# 前沿方核 FRONTCORE 官网

基于 [Figma 设计稿](https://www.figma.com/design/g1kak5brUnSq3AMerpzXs1/1122?node-id=151-314&m=dev) 实现的响应式企业官网。

## 快速启动

直接用浏览器打开 `index.html`，或使用本地服务器：

```bash
# Python 3
python3 -m http.server 8080

# Node.js (需安装 npx)
npx serve .
```

访问 `http://localhost:8080` 即可预览。

## 项目结构

```
Front Cure/
├── index.html              # 页面入口
├── assets/                 # 图片资源（来自 Figma 导出）
├── css/
│   ├── main.css            # 样式入口（聚合所有模块）
│   ├── variables.css       # 设计令牌（色值、字体、间距）
│   ├── base.css            # 全局重置与通用样式
│   ├── responsive.css      # 响应式断点适配（含注释说明）
│   └── components/         # 组件样式模块
│       ├── header.css      # 导航栏
│       ├── hero.css        # Hero 横幅
│       ├── mission.css     # 使命宣言
│       ├── products.css    # 产品能力
│       ├── advantages.css  # 我们的优势
│       └── footer.css      # 页脚
└── js/
    └── main.js             # 交互逻辑（移动端菜单）
```

## 断点适配说明

| 断点名称 | 宽度范围 | 目标设备 | 主要布局变化 |
|---------|---------|---------|-------------|
| **xs** | ≤ 479px | 小屏手机竖屏 | 全宽按钮、缩小间距与字号 |
| **sm** | 480–767px | 手机竖屏 / 大屏手机 | 汉堡菜单、单列卡片 |
| **md** | 768–1023px | 手机横屏 / 小平板 | 产品 2 列、优势区堆叠 |
| **lg** | 1024–1279px | 大屏平板 / 小笔记本 | 优势右侧卡片收窄 |
| **xl** | 1280–1439px | 笔记本 | 接近设计稿布局 |
| **2xl** | 1440–1919px | 台式标准屏 | 设计稿等比缩放 |
| **3xl** | ≥ 1920px | 大屏台式 | 设计稿基准（1920px） |

### 各区块响应式行为

**导航栏**
- ≥ 768px：水平居中导航
- < 768px：汉堡菜单 + 下拉面板，点击区域 ≥ 44px

**Hero 区域**
- 背景图 `object-fit: cover`，各尺寸不拉伸
- 标题字号使用 `clamp()` 流体缩放（40px → 80px）
- 横屏低高度设备（≤ 500px）自动压缩高度

**产品能力**
- ≥ 1024px：3 列等宽
- 768–1023px：2 列 + 第三张居中
- < 768px：单列堆叠

**我们的优势**
- ≥ 1024px：2×2 网格 + 右侧 510px 大卡片
- < 1024px：全部单列堆叠

**页脚**
- ≥ 1024px：左右两栏
- < 1024px：上下堆叠，文字左对齐

## 浏览器兼容性

已针对以下环境优化：

- **浏览器**：Chrome、Edge、Safari、Firefox 最新两个主版本
- **移动端**：iOS Safari 14+、Android Chrome 90+
- **特性**：CSS Grid、Flexbox、`clamp()`、`object-fit`（均为主流浏览器原生支持）

## 设计令牌

所有色值、间距定义在 `css/variables.css`，修改断点数值请编辑 `css/responsive.css`（文件内均有中文注释标注）。


## 技术说明

- 纯 HTML + CSS + 原生 JS，无构建依赖，开箱即用
- 样式按组件模块化拆分，便于后期维护
- 图片资源从 Figma 导出，存放于 `assets/` 目录
