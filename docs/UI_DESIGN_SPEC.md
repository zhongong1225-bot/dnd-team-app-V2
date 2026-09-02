## DND Team App — UI 设计规范

> 从现有代码库提炼的标准化设计系统，供后续开发和新组件参考。

---

### 一、设计哲学

整体风格：深色奇幻主题，参考 DND 羊皮纸与暗色桌游界面。核心视觉感受是"沉稳、层次分明、金色点缀"。

三个关键词：

- **深邃**：深蓝黑底色，多层阴影营造卡片浮起感
- **金色点缀**：金黄（#c79a42）作为唯一强调色，用于标题、激活态、边框高亮
- **紧凑实用**：信息密度高，减少装饰性留白，操作区域明确

---

### 二、色彩系统

#### 2.1 基础色板

| 用途 | 色值 | 变量/类名 |
|------|------|-----------|
| 页面底色 | #141b27 | --page-bg / dnd-bg |
| 卡片底色 | #1d2737 | --card-bg / dnd-card |
| 卡片悬停 | #223047 | dnd-card-hover |
| 卡片边框 | #34455f | --card-border |
| 主强调（金） | #c79a42 | --accent / dnd-gold |
| 主操作（红） | #e63946 | --btn-primary / dnd-red |
| 主文字 | #ffffff | --text-main |
| 次要文字 | #9ca3af | --text-muted / dnd-text-muted |
| 输入框底色 | #1b2738 | --input-bg |
| 输入框边框 | #3a4e69 | --input-border |
| 输入框聚焦 | #4e6688 | --input-focus |

#### 2.2 色彩使用规则

- 金色只用于：区块标题、激活/选中态、边框高亮、进度条填充
- 红色只用于：主操作按钮（保存/确认）、危险操作、HP 相关
- 文字层级：白色（标题/主文字）→ #9ca3af（次要/标签）→ #6b7280（禁用/最弱）
- 功能色：成功 #48BB78、警告 #ED8936、信息 #38BDF8（蓝）、法术等级用紫色系

#### 2.3 全局 amber 覆盖

所有 Tailwind 的 amber 类通过 CSS 属性选择器统一映射为 #c79a42，确保历史代码中散落的 amber 引用视觉一致。

---

### 三、字体系统

| 属性 | 值 |
|------|-----|
| 字体族 | Noto Sans SC（思源黑体） |
| 正文字号 | 16px / line-height 1.6 |
| 区块标题 | 0.95rem / font-weight 800 / 金色 |
| 副标题 | 0.75rem / font-weight 600 / 灰蓝 #9eacbf / 大写 |
| 卡片标题 | text-base (16px) / font-bold / 白色 |
| 次要文字 | text-xs (12px) ~ text-sm (14px) / 灰色 |
| 数值 | text-lg ~ text-2xl / font-bold / 白色 |
| 标签/徽章 | text-[10px] ~ text-xs / uppercase / tracking-wider |

所有输入框、按钮、选择框统一继承思源黑体。

---

### 四、间距与布局

#### 4.1 版心

- 最大宽度：1180px（max-w-app-shell）
- 水平内边距：px-3（小屏）/ px-4（≥1180px）
- 不强制 min-width，小屏无横向滚动

#### 4.2 间距层级

| 场景 | 间距 |
|------|------|
| 面板内边距 | 16px（module-panel）/ 8px 16px（紧凑 panel-padding） |
| 子卡片内边距 | 12px 16px（panel-card）/ 8px 12px（panel-card-compact） |
| 卡片间距 | gap-2 (8px) ~ gap-3 (12px) |
| 区块间距 | mb-4 ~ mb-6 |
| 元素内间距 | gap-1 (4px) ~ gap-1.5 (6px) |

#### 4.3 圆角

统一 8px（--panel-radius / rounded-panel），小按钮/标签 4~6px。

---

### 五、组件规范

#### 5.1 面板（Module Panel）

```
background: 多层渐变（微高光 + 径向光晕 + 纯色底 #1a2332）
border: 1px solid var(--card-border)
border-radius: 8px
padding: 16px
box-shadow:
  0 6px 22px rgba(0,0,0,0.48)    ← 外投影（远）
  0 2px 6px rgba(0,0,0,0.28)     ← 外投影（近）
  inset 0 1px 0 rgba(255,255,255,0.085)  ← 顶部内高光
  inset 0 -1px 0 rgba(0,0,0,0.22)        ← 底部内阴影
```

高频操作区可加 `panel-highlight-top`（金色顶部渐变线）或 `panel-highlight-side`（金色左侧线）。

#### 5.2 子卡片（Panel Card）

```
background: 略深于面板（#202735 + 微渐变）
border: 1px solid var(--card-border)
border-radius: 8px
padding: 12px 16px
box-shadow: 同面板但强度降低
hover: border-color → rgba(199,154,66,0.25) + 阴影增强
```

紧凑版 panel-card-compact：padding 8px 12px。

#### 5.3 按钮

| 类型 | 样式 |
|------|------|
| 主操作 | bg #e63946 / 白色文字 / rounded-lg / hover 变深 / active:scale-95 |
| 次要操作 | bg #252a33 / border #2d323e / 白色文字 |
| 面板添加 | btn-panel-add：虚线边框 + 灰色文字 + hover 变金 |
| 金色强调 | bg-dnd-gold/10~25 / text-dnd-gold-light / border-dnd-gold/50 |
| 图标按钮 | w-7~9 h-7~9 / rounded-md / active:scale-95 |

所有按钮共性：transition-all / active:scale-95（点击缩放反馈）。

按钮感要求：必须有可见背景色、边框、hover 高亮、点击缩放。避免过于扁平/透明。

#### 5.4 输入框

```
background: var(--input-bg) #1b2738
border: 1px solid var(--input-border) #3a4e69
focus: border-color var(--input-focus) #4e6688
       box-shadow: 0 0 0 2px rgba(199,154,66,0.14)  ← 金色外发光
```

数字输入框隐藏上下箭头（.input-no-spin）。

#### 5.5 标签/徽章

- 极小尺寸：text-[9px] ~ text-[10px]
- 半透明背景：bg-{color}-500/20
- 文字色：对应浅色系（如 blue-300, green-300）
- 圆角：rounded

#### 5.6 列表项

极简原则：只保留核心信息（名字 + 操作按钮），去掉等级徽章、分类标签等装饰。紧凑布局，同类条目一行多列。

---

### 六、阴影系统

三层阴影体系，从远到近叠加：

| 层级 | 用途 | 参数 |
|------|------|------|
| 外投影（远） | 卡片浮起感 | 0 6px 22px rgba(0,0,0,0.48) |
| 外投影（近） | 卡片边缘锐度 | 0 2px 6px rgba(0,0,0,0.28) |
| 内高光 | 顶部光泽 | inset 0 1px 0 rgba(255,255,255,0.085) |
| 内阴影 | 底部厚重感 | inset 0 -1px 0 rgba(0,0,0,0.22) |

高亮态（选中/当前 Tab）额外加：
- 0 0 0 1px rgba(199,154,66,0.28)  ← 金色轮廓
- 0 0 18px rgba(199,154,66,0.14)   ← 金色光晕

---

### 七、动画与交互

| 类型 | 参数 | 场景 |
|------|------|------|
| 通用过渡 | transition-all / transition-colors | 按钮、卡片悬停 |
| 点击缩放 | active:scale-95 | 所有可点击元素 |
| 骰子旋转 | 0.35s ease-out | 投掷按钮 |
| 浮动 | 2.5s ease-in-out infinite | FAB 按钮 |
| 3D 骰子 | 0.72~0.9s 循环 | 投掷动画 |
| 淡入上滑 | fadeSlideUp | 新条目出现 |
| 数值闪烁 | valueFlash | 数值变化高亮 |

缓动曲线偏好：cubic-bezier(0.2, 0.78, 0.18, 1)（弹性感）。

---

### 八、图标系统

- 图标库：lucide-react
- 常用尺寸：w-3.5 h-3.5（小）/ w-4 h-4（标准）/ w-5 h-5（标题旁）
- 颜色：跟随父元素文字颜色（currentColor）
- 金色图标用于激活/重要状态

---

### 九、响应式策略

| 断点 | 调整 |
|------|------|
| < 640px | 单列布局，px-3，紧凑间距 |
| ≥ 640px | 部分双列 |
| ≥ 1024px | 侧栏 sticky 生效 |
| ≥ 1180px | 版心居中 1180px，fixed 侧栏对齐 |
| ≥ 1280px | 侧栏加宽（11rem → 12rem） |

关键原则：不强制 min-width，scrollbar-gutter: stable 防止版心跳动。

---

### 十、新组件开发检查清单

1. 颜色是否使用了 CSS 变量或 Tailwind 自定义色（不硬编码 hex）
2. 阴影是否遵循三层体系（外投影 + 内高光 + 内阴影）
3. 圆角是否统一 8px（面板/卡片）或 4~6px（小元素）
4. 按钮是否有背景色 + 边框 + hover + active:scale-95
5. 文字层级是否在白/灰/暗灰三档内
6. 金色是否只用于强调（标题、激活、高亮）
7. 过渡动画是否加了 transition-all 或 transition-colors
8. 输入框聚焦是否有金色外发光
