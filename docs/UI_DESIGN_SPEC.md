## DND Team App — UI 设计规范 v2

> 从代码库精确提取的设计系统，供后续开发和新组件参考。
> 所有色值、间距、阴影参数均可直接在 Tailwind / CSS 中使用。

---

### 一、设计哲学

整体风格：深色奇幻主题，参考 DND 羊皮纸与暗色桌游界面。

三个关键词：

- **深邃**：深蓝黑底色，多层阴影营造卡片浮起感
- **金色点缀**：金黄 #c79a42 作为唯一强调色，用于标题、激活态、边框高亮
- **紧凑实用**：信息密度高，减少装饰性留白，操作区域明确

---

### 二、色彩系统

#### 2.1 基础色板

| 用途 | 色值 | CSS 变量 | Tailwind 类名 |
|------|------|----------|---------------|
| 页面底色（顶部） | #141b27 | --page-bg | bg-dnd-bg |
| 页面底色（底部渐变终点） | #182235 | --page-bg-end | — |
| 卡片底色 | #1d2737 | --card-bg | bg-dnd-card |
| 卡片悬停 | #223047 | — | bg-dnd-card-hover |
| 卡片边框 | #34455f | --card-border / --border-color | border-dnd-card (自定义) |
| 主强调金 | #c79a42 | --accent / --text-title / --accent-gold-rgb(199,154,66) | text-dnd-gold-light / border-dnd-gold |
| 主操作红 | #e63946 | --btn-primary | bg-dnd-red |
| 主操作红（悬停） | #d42d3a | --btn-primary-hover | hover:bg-dnd-red-hover |
| 自定义红（更亮） | #E01C2F | — | text-dnd-red / bg-dnd-red (部分场景) |
| 主文字 | #ffffff | --text-main | text-white |
| 正文文字 | #e5e7eb | — | text-dnd-text-body |
| 次要文字 | #9ca3af | --text-muted | text-dnd-text-muted / text-gray-400 |
| 最弱文字 | #6b7280 | — | text-gray-500 |
| 输入框底色 | #1b2738 | --input-bg | — |
| 输入框边框 | #3a4e69 | --input-border | — |
| 输入框聚焦 | #4e6688 | --input-focus | — |

#### 2.2 功能语义色

| 语义 | 色值 | 使用场景 |
|------|------|----------|
| 成功/治疗 | #48BB78 (green-500) | 治疗弹窗边框 border-green-500/30、标题 text-green-300、HP≥80% 血条 |
| 警告 | #ED8936 (orange-500) | HP 50-79% 血条 bg-yellow-600、"待配置"标签 |
| 危险/伤害 | #E01C2F / red-500 | 伤害弹窗边框 border-red-500/30、标题 text-red-300、删除按钮悬停 |
| 信息/临时 | #38BDF8 (sky-400) / blue-600 | 临时 HP 血条 bg-blue-600、临时 HP 文字 text-blue-400 |
| 魔法/召唤 | purple-500 | 召唤弹窗边框 border-purple-500/30、标题 text-purple-300、死灵学派标签 |
| 金色强调 | #c79a42 | "使用"按钮 bg-yellow-600/20、待激活状态 |
| 电弧特效 | #06b6d4 (cyan-500) | 特殊能量效果边框/发光 |

#### 2.3 法术学派标签色

| 学派 | 背景 | 文字 | 边框 |
|------|------|------|------|
| 防护 | bg-sky-500/20 | text-sky-200 | border-sky-500/40 |
| 咒法 | bg-emerald-500/20 | text-emerald-200 | border-emerald-500/40 |
| 预言 | bg-violet-500/20 | text-violet-200 | border-violet-500/40 |
| 惑控 | bg-pink-500/20 | text-pink-200 | border-pink-500/40 |
| 塑能 | bg-orange-500/20 | text-orange-200 | border-orange-500/40 |
| 幻术 | bg-fuchsia-500/20 | text-fuchsia-200 | border-fuchsia-500/40 |
| 死灵 | bg-purple-600/25 | text-purple-200 | border-purple-500/40 |
| 变化 | bg-teal-500/20 | text-teal-200 | border-teal-500/40 |
| 灵能 | bg-indigo-500/25 | text-indigo-200 | border-indigo-500/50 |

#### 2.4 全局 amber→gold 覆盖

index.css 中通过 CSS 属性选择器将所有 `amber-*` 类（text/border/bg/from/via/to/ring/fill/stroke）统一映射为 rgb(199,154,66)。历史代码中散落的 amber 引用在视觉上全部显示为金色。

#### 2.5 色彩使用规则

- **金色**只用于：区块标题、激活/选中态、边框高亮、熟练度标记、进度条填充
- **红色**只用于：主操作按钮（保存/确认）、危险操作、HP 相关
- **文字三档**：白色（标题/主文字）→ #9ca3af（次要/标签）→ #6b7280（禁用/最弱）
- **永远不要**引入新的强调色，所有高亮统一走金色

---

### 三、字体系统

#### 3.1 字体族

全部字体（sans/display/body/mono/serif）强制为 `'Noto Sans SC', 'Source Han Sans SC', 'Source Han Sans', sans-serif'`。
通过 index.css 中 `!important` 规则强制 input/textarea/select/button 继承。

#### 3.2 字号层级

| 场景 | 字号 | 字重 | 颜色 | 附加 |
|------|------|------|------|------|
| 区块大标题（section-title） | 0.9rem (≈14.4px) | 800 | 金色 #c79a42 | letter-spacing: 0.06em + 文字阴影 |
| 面板内标题 | text-sm (14px) | bold | 金色 | uppercase tracking-wider |
| 卡片标题 | text-base (16px) | bold | 白色 | — |
| 副标题（section-subtitle） | 0.75rem (12px) | 600 | 灰蓝 #9eacbf | uppercase, letter-spacing: 0.08em |
| 正文 | 16px / text-base | normal | 白色 #e5e7eb | line-height: 1.6 |
| 次要文字 | text-xs (12px) ~ text-sm (14px) | normal | #9ca3af | — |
| 大数值 | text-lg ~ text-2xl | bold | 白色 | font-mono（等宽数字） |
| 标签/徽章 | text-[9px] ~ text-[10px] | medium | 对应浅色 | uppercase tracking-wider |
| 紧凑表单 | text-[11px] | normal | 白色 | h-7 行高 |

#### 3.3 文字阴影

区块标题专用：
```
text-shadow: 0 1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(199,154,66,0.15)
```

---

### 四、间距与布局

#### 4.1 版心

- 最大宽度：1180px（max-w-app-shell）
- 水平内边距：px-3（<640px）/ px-4（≥640px）
- 不强制 min-width，小屏无横向滚动
- html 设置 scrollbar-gutter: stable 防止版心跳动

#### 4.2 间距层级

| 场景 | 具体值 |
|------|--------|
| 面板内边距 | 12px（module-panel CSS 类）/ 16px（panel-padding） |
| 子卡片内边距 | 12px 16px（panel-card）/ 8px 12px（panel-card-compact） |
| 卡片间距 | gap-2 (8px) ~ gap-3 (12px) |
| 区块间距 | mb-4 (16px) ~ mb-6 (24px) |
| 元素内间距 | gap-1 (4px) ~ gap-1.5 (6px) |
| 列表行间距 | space-y-1.5 (6px) ~ space-y-2 (8px) |

#### 4.3 圆角

| 场景 | 圆角 |
|------|------|
| 面板/卡片 | 8px（--panel-radius / rounded-lg / rounded-panel） |
| 按钮 | 8px (rounded-lg)；大 CTA 按钮 12px (rounded-xl) |
| 小按钮/标签/徽章 | 4~6px (rounded / rounded-md) |
| 药丸形（血条/进度条） | 9999px (rounded-full / rounded-pill) |

#### 4.4 常用网格布局

| 场景 | 网格定义 |
|------|----------|
| 战斗手段行 | grid-cols-[5fr_3fr_3fr_12fr_1fr]（名称/攻击/伤害/效果/删除） |
| BUFF 列表行 | grid-cols-[minmax(6.25rem,9.5em)_1fr_auto_auto] |
| 物品表格行 | grid-cols-[11rem_5.5rem_5.5rem_1fr_3.5rem_4rem_7rem] |
| 六维属性 | grid-cols-3（小屏 grid-cols-2） |
| 角色页主体 | grid-cols-1 lg:grid-cols-[1fr_500px] |
| 通用双列 | grid-cols-1 md:grid-cols-2 gap-4 |

---

### 五、阴影系统

#### 5.1 标准卡片阴影（shadow-dnd-card）

四层叠加，从外到内：

| 层 | 参数 | 作用 |
|----|------|------|
| 外投影（远） | 0 6px 22px rgba(0,0,0,0.48) | 卡片浮起感 |
| 外投影（近） | 0 2px 6px rgba(0,0,0,0.28) | 卡片边缘锐度 |
| 内高光 | inset 0 1px 0 rgba(255,255,255,0.085) | 顶部光泽 |
| 内阴影 | inset 0 -1px 0 rgba(0,0,0,0.22) | 底部厚重感 |

#### 5.2 悬停阴影（shadow-dnd-card-hover）

| 层 | 参数 |
|----|------|
| 外投影（远） | 0 10px 28px rgba(0,0,0,0.42) |
| 外投影（近） | 0 4px 10px rgba(0,0,0,0.32) |
| 内高光 | inset 0 1px 0 rgba(255,255,255,0.1) |
| 内阴影 | inset 0 -1px 0 rgba(0,0,0,0.24) |

#### 5.3 高亮阴影（shadow-dnd-card-highlight）

在标准阴影基础上额外叠加：
- 0 0 0 1px rgba(199,154,66,0.28) — 金色轮廓
- 0 0 18px rgba(199,154,66,0.14) — 金色光晕

用于：选中 Tab、当前关键卡片。

#### 5.4 特殊阴影

| 名称 | 参数 | 场景 |
|------|------|------|
| shadow-dnd-glow | 0 0 12px rgba(224,28,47,0.4) | 红色发光（HP 危急） |
| shadow-dnd-gold-glow | 0 0 8px rgba(199,154,66,0.45) | 金色发光（强调按钮） |
| 列表行阴影 | 0 2px 10px rgba(0,0,0,0.42) | 战斗手段列表项 |
| 下拉菜单阴影 | 0 8px 24px rgba(0,0,0,0.4) | 弹出菜单 |
| 物品卡片阴影 | 0 2px 10px rgba(0,0,0,0.42), 0 1px 4px rgba(0,0,0,0.34) | 背包物品 |

---

### 六、组件规范

#### 6.1 面板（.module-panel）

```
背景：纯色 #1a2332 + 两层渐变覆盖（微高光 + 径向光晕）
边框：1px solid var(--card-border) #34455f
圆角：8px
内边距：12px
阴影：shadow-dnd-card（四层）
```

变体：
- `.panel-highlight-top`：顶部 2px 金色渐变线（from transparent → gold → transparent）
- `.panel-highlight-side`：左侧 2px 金色渐变线（inset 8px 上下留白）

#### 6.2 子卡片（.panel-card）

```
背景：#202735 + 微渐变
边框：1px solid var(--card-border)
圆角：8px
内边距：12px 16px
阴影：同面板但强度降低
过渡：transition: box-shadow .2s, border-color .2s
悬停：border-color → rgba(199,154,66,0.25) + 阴影增强
```

紧凑版 `.panel-card-compact`：内边距 8px 12px。

#### 6.3 渐变卡片（高级）

法术卡片、属性卡片等使用渐变背景替代纯色：
```
bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433]
border: 1px solid rgba(255,255,255,0.11)
圆角：12px (rounded-xl)
内边距：12px (p-3)
阴影：shadow-dnd-card
```

物品卡片渐变：
```
bg-gradient-to-b from-[#161e2b] via-[#141c28] to-[#121a25]
ring: 1px inset ring-white/[0.028]
```

#### 6.4 弹窗/模态框（Modal）

**结构**：两层式
1. 遮罩层：`fixed inset-0 z-[400] bg-black/60`（点击关闭）
2. 定位层：`fixed inset-0 z-[401] flex items-center justify-center p-4`（点击关闭）
3. 内容面板：`e.stopPropagation()` 阻止冒泡

**面板样式**：
```
背景：bg-[#1a1f2e]
边框：rounded-lg
内边距：p-4
宽度：max-w-sm w-full
阴影：shadow-xl
语义边框色：
  - 默认/金色：border-dnd-gold/30
  - 伤害/失败：border-red-500/40
  - 治疗/成功：border-green-500/30
  - 召唤/魔法：border-purple-500/30
```

**头部**：
```
布局：flex items-center justify-between mb-3
标题：text-sm font-bold text-dnd-gold-light（或对应语义色）
关闭按钮：text-gray-400 hover:text-white，Lucide <X size={14} />
```

大型弹窗（如 BUFF 编辑器）：
```
头部：px-5 py-3 border-b border-gray-700
标题：text-dnd-gold-light text-base font-bold
内容区：max-h-[90vh] overflow-y-auto
```

**底部按钮**：
```
布局：flex gap-2
按钮宽度：flex-1 py-1.5
取消：rounded border border-gray-500 text-gray-400 text-sm
确认：rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-sm
```

**注意**：弹窗没有打开/关闭过渡动画，直接出现。

**z-index 层级**：
| 元素 | z-index |
|------|---------|
| 信息提示（Tooltip） | 9999 |
| 弹窗遮罩 | 400 |
| 弹窗内容 | 401 |
| BUFF 编辑器 | 300 |
| 战斗面板内弹窗 | 110 |
| 下拉菜单 | 100 |
| 固定侧栏 | 5 |

#### 6.5 按钮

##### 主操作按钮（红色）

```
px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium
disabled: opacity-50 cursor-not-allowed
过渡：transition-all
点击：active:scale-95
```

大 CTA 变体：
```
w-full py-3 rounded-xl font-semibold uppercase tracking-label
```

CSS 类 `.btn-primary`：
```
背景：#e63946
圆角：10px
内边距：8px 16px
字号：0.875rem
字重：600
阴影：0 0 12px rgba(230,57,70,0.35), inset 0 1px 0 rgba(255,255,255,0.1)
悬停：背景 #d42d3a + 阴影 0 0 16px
```

##### 次要按钮（灰色）

```
px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm
悬停：border-gray-600 text-gray-300 hover:bg-gray-700
```

CSS 类 `.btn-ghost`：
```
背景：#252a33
边框：#2d323e
圆角：10px
内边距：8px 16px
悬停：背景 #374151 + 边框 var(--input-focus)
```

##### 金色强调按钮

```
px-2 py-0.5 rounded-lg border border-dnd-gold text-dnd-gold-light text-xs font-medium
hover:bg-dnd-gold/20
过渡：transition-colors
```

金色填充变体：
```
px-4 py-1.5 rounded-lg bg-dnd-gold/20 text-dnd-gold-light hover:bg-dnd-gold/30
```

##### "使用"按钮（主动技能）

```
px-2 py-0.5 rounded-md bg-yellow-600/20 border border-yellow-600/40 text-yellow-400
hover:bg-yellow-600/30
字号：text-[10px] font-medium
```

装备释放按钮：
```
w-full h-7 rounded-md bg-dnd-gold/[0.12] border border-dnd-gold/25 text-dnd-gold-light text-[10px]
hover:bg-dnd-gold/[0.22] hover:border-dnd-gold/40
active:scale-[0.96]
```

##### 图标按钮

标准尺寸：
```
w-7 h-7 flex items-center justify-center rounded-md
text-dnd-text-muted
hover:bg-white/[0.08] hover:text-gray-300
```

金色图标按钮（战斗面板）：
```
w-6 h-6 rounded-md border border-transparent bg-transparent
text-dnd-gold-light
hover:text-dnd-gold
```

危险图标按钮：
```
hover:bg-dnd-red/10 hover:text-dnd-red
```

编辑/删除小按钮（BUFF 行）：
```
p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-dnd-gold
```
删除变体：`hover:bg-red-900/50 hover:text-red-500`

##### 步进器按钮（±）

```
w-[22px] h-7 flex items-center justify-center
bg-white/[0.06] border border-white/[0.08]
text-dnd-text-muted text-sm font-semibold
hover:bg-white/[0.12] hover:text-gray-300
```

##### 面板添加按钮（.btn-panel-add）

虚线边框 + 灰色文字 + 悬停变金 + 悬停上浮：
```
hover: transform: translateY(-1px) + 阴影 0 0 24px rgba(230,57,70,0.55)
```

##### 按钮共性要求

- 必须有可见背景色 + 边框 + hover 高亮 + 点击缩放（active:scale-95 或 active:scale-[0.96]）
- 过渡：transition-all 或 transition-colors
- 避免过于扁平/透明的按钮

#### 6.6 输入框

##### 标准输入框（inputClass）

```
高度：h-10 (40px)
内边距：px-3
背景：var(--input-bg) #1b2738
边框：1px solid var(--border-color) #34455f
圆角：rounded-lg (8px)
字号：text-sm (14px)
占位符：placeholder:opacity-70 placeholder:text-[var(--text-muted)]
禁用：disabled:opacity-70
聚焦：border-color var(--accent) #c79a42
      ring-2 ring-[var(--accent)]
      box-shadow: 0 0 0 3px rgba(199,154,66,0.3), 0 0 12px rgba(199,154,66,0.15)
```

##### 紧凑输入框

通过替换基础类实现：
```
h-10 → h-7 (28px)
px-3 → px-1.5
text-sm → text-[11px]
```

CSS 类 `.panel-input-compact`：
```
高度：1.75rem (28px)
圆角：6px
内边距：2px 8px
```

##### 工具栏输入框

```
高度：h-8 (32px)
```

##### 纯文本输入框（.input-thin）

```
无边框，仅底部：border-bottom: 1px solid var(--border-color)
聚焦：border-bottom-color: var(--accent)
      box-shadow: 0 1px 0 0 var(--accent)
```

##### 文本域（textareaClass）

```
px-3 py-2 resize-y min-h-[3rem]
其余同标准输入框
```

##### 数字输入框

隐藏上下箭头：`.input-no-spin` 类
```
-webkit-appearance: none
-moz-appearance: textfield
&::-webkit-inner-spin-button, &::-webkit-outer-spin-button { display: none }
```

##### 标签（labelClass）

```
block uppercase tracking-wider text-xs font-bold mb-2 text-[var(--accent)]
```
（金色、大写、宽字距、小号加粗）

##### 下拉选择框

全局样式：
```
select { color: #fff }
select option { background: var(--input-bg); color: var(--text-main) }
```

分类选择器变体：
```
h-7 px-1.5 rounded border border-amber-500/30 bg-dnd-bg text-amber-300 text-[10px] cursor-pointer
```

##### 复选框

```
accent-amber-500 w-3 h-3（被 amber→gold 覆盖为金色）
语义紫色：accent-purple-500 w-3 h-3（法术位缩放选项）
```

#### 6.7 标签/徽章

##### 微型标签（动作类型/消耗）

```
text-[9px] text-gray-500 px-1 py-0.5 rounded bg-white/5
```

##### 提示芯片（信息标签）

```
text-[10px] text-{color}-300/85 bg-{color}-900/30 px-1.5 py-0.5 rounded
颜色对应：violet=风格, sky=类型, emerald= subtype, amber=魔法/充能
```

##### 轮廓徽章

```
text-[10px] px-1.5 py-0.5 rounded border border-gray-600 text-gray-400
```

##### 熟练度标记

```
熟练：text-[9px] font-medium text-[#C79A42]/90（金色）
未熟练：text-gray-500
BUFF 授予点：absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-dnd-red
```

#### 6.8 列表项

```
极简原则：只保留核心信息（名字 + 操作按钮）
行高：min-h-[32px]
间距：py-0.5 px-1.5
分隔：border-b border-white/10 last:border-b-0
背景：bg-[#202838]/36
禁用态：opacity-50
```

主动卡行：
```
flex items-center gap-2
rounded-md border border-white/10 bg-[#243147]/50
pl-2 pr-1.5 py-1
```

#### 6.9 下拉菜单

```
面板：absolute right-0 top-[calc(100%+4px)] min-w-[110px]
      bg-[#1e2836] border border-white/10 rounded-md
      shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-[100]
菜单项：flex items-center gap-2 px-3.5 py-2 text-xs text-gray-400
        hover:bg-white/[0.06]
危险项：text-dnd-red hover:bg-dnd-red/10
分隔线：h-px bg-white/[0.06]
```

#### 6.10 信息提示（Tooltip）

```
定位：Portal 到 body，z-index 9999
视口边距：8px
自动翻转：高度估算 220px，空间不够时从上方翻到下方
显示延迟：80ms
指针：pointer-events:none，触发元素 cursor:help
```

气泡样式：
```
rounded-lg border border-gray-600 bg-[#1a2430]/97 backdrop-blur-sm
p-3 text-xs text-gray-200
shadow-2xl shadow-black/60
max-h-[60vh] overflow-y-auto
默认 maxWidth: 420px
```

内容排版：
- 标题：text-sm font-bold text-white
- 字段 + 分隔线 + 芯片

#### 6.11 空状态（.empty-state）

```
边框：dashed 1.5px rgba(199,154,66,0.25)
内边距：2rem 1rem
图标：金色 opacity: 0.35
悬停：边框透明度升至 0.4
```

---

### 七、进度条与资源指示器

#### 7.1 生命值血条

```
轨道：h-3 rounded bg-gray-900 overflow-hidden
填充：h-full rounded transition-all（宽度内联 style）
```

颜色规则：
| HP 百分比 | 颜色 |
|-----------|------|
| ≥80% | bg-green-600 |
| 50-79% | bg-yellow-600 |
| 1-49% | bg-red-600 |
| 0（死亡） | bg-red-900 |
| 临时 HP | bg-blue-600（覆盖上述规则） |

迷你版（生物块）：h-1.5 w-full rounded bg-black/30

#### 7.2 法术位指示器

圆形药丸：
```
外圈：h-6 w-6 rounded-full border-2
已用：border-[var(--accent)] bg-[var(--accent)] shadow-[0_0_6px_rgba(199,154,66,0.35)]
未用：border-[var(--accent)]/55 bg-transparent
点击区域：h-9 w-9 rounded-full hover:bg-white/[0.07] active:bg-white/10
过渡：transition-colors
```

#### 7.3 充能条

```
外框：flex-1 h-7 bg-white/[0.04] border-y border-white/[0.08] relative overflow-hidden
填充：h-full transition-[width] duration-200
      渐变：linear-gradient(90deg, rgba(74,144,217,0.18), rgba(124,179,245,0.12))
数值文字：absolute inset-0 flex items-center justify-center
          text-[11px] font-semibold text-gray-300 tracking-wide
```

#### 7.4 经验条

```
轨道：height:6px bg-var(--input-bg) rounded-full border:1px solid var(--card-border)
填充：linear-gradient(90deg, var(--accent), #c79a42)
过渡：width .25s ease
```

#### 7.5 属性数值芯片

```
外框：h-10 rounded-lg border border-white/[0.12]
      bg-gradient-to-b from-[#2f3d52]/95 to-[#1c2534]/90
标签：text-[8px] sm:text-[9px] text-dnd-text-muted/90
数值：font-mono text-[10px] sm:text-xs font-bold tabular-nums
强调边框：border-[var(--accent)]/50 ring-1 ring-inset ring-[var(--accent)]/20
强调数值：text-[11px] text-[var(--accent)]
```

---

### 八、面板标题

#### 8.1 CSS 类标题（.section-title）

```
颜色：var(--text-title) 金色
字号：0.9rem
字重：800
字距：0.06em
阴影：0 1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(199,154,66,0.15)
间距：margin-bottom: 0.35rem
```

#### 8.2 内联面板标题（最常用）

```
text-dnd-gold-light text-xs font-bold uppercase tracking-wider
```

头部行布局：
```
flex items-baseline gap-2 mb-1.5
标题 + 大数值（text-white font-bold text-xl font-mono）
```

#### 8.3 微型区域标签

```
标签：text-dnd-gold-light text-[10px] font-bold tracking-wide
提示：text-gray-500 text-[10px]
```

#### 8.4 金色装饰线

- `.panel-highlight-top::before`：顶部 2px 金色渐变线（from transparent → gold → transparent）
- `.panel-highlight-side::before`：左侧 2px 金色渐变线（inset 8px 上下留白）

#### 8.5 选项卡（.class-tab）

```
内边距：0.5rem 1rem
字号：0.8125rem
字重：600
颜色：var(--text-muted)
激活态：金色 + 底部 2px 下划线（box-shadow: 0 0 8px rgba(199,154,66,0.4)）
下划线动画：width .25s ease, left .25s ease
悬停态：30% 透明度下划线
```

---

### 九、动画与交互

#### 9.1 过渡效果

| 元素 | 过渡属性 | 时长 |
|------|----------|------|
| 按钮 | transition-all | 默认 150ms |
| 卡片悬停 | box-shadow, border-color | 0.2s |
| 血条填充 | transition-all | 默认 |
| 充能条 | transition-[width] | duration-200 |
| 经验条 | width | 0.25s ease |
| 选项卡下划线 | width, left | 0.25s ease |

#### 9.2 关键帧动画

| 名称 | 效果 | 时长 | 场景 |
|------|------|------|------|
| fadeSlideUp | 透明度 0→1 + 上移 8px | 0.25s ease-out | 列表项出现（带交错延迟 30ms/项） |
| valueFlash | 数值闪烁 + 金色文字阴影 | 0.6s ease-out | HP/AC 等数值变化 |
| shake | 左右抖动 ±4px | 0.2s ease-in-out × 2 | 错误/警告 |
| flash | 透明度 1→0.7→1 | 0.3s ease-out | 高亮闪烁 |
| fab-float | 上下浮动 4px | 2.5s ease-in-out infinite | FAB 悬浮按钮 |
| dice-roll | 360° 旋转 | 0.35s ease-out | 投掷按钮 |
| dice3d-spin | 持续旋转 | 0.72s linear infinite | 3D 骰子 |
| dice3d-bounce | 弹跳 | 0.9s ease-in-out infinite | 3D 骰子 |
| arc-pulse | 透明度 .25→.45 + 缩放 1.01 | 4-5s ease-in-out infinite | 电弧能量特效 |
| arc-text-glow | 青色文字阴影脉冲 | 4s ease-in-out infinite | 电弧文字 |

#### 9.3 点击反馈

所有可点击元素：
```
active:scale-95  或  active:scale-[0.96]
```

#### 9.4 缓动曲线

主曲线：`cubic-bezier(0.2, 0.78, 0.18, 1)` — 弹性感，用于 3D 骰子飞入等。

---

### 十、图标系统

- 图标库：lucide-react
- 颜色：跟随父元素文字颜色（currentColor），不单独设色

| 尺寸 | 场景 |
|------|------|
| w-3.5 h-3.5 | 行内/列表内图标 |
| w-4 h-4 | 编辑/删除/弹窗关闭 |
| w-5 h-5 | 标题旁图标 |
| size={14} | 弹窗头部关闭按钮 |
| w-[1.872rem] | 普通骰子图标 |
| w-[2.246rem] | 金色骰子图标 |

图标 + 文字间距：
- gap-1 (4px)：按钮内图标+文字
- gap-1.5 (6px)：标准图标+文字
- gap-2 (8px)：行级图标+文字

图标始终 `shrink-0` 防止被压缩。

---

### 十一、滚动条

#### 自定义细滚动条

```css
scrollbar-width: thin;
scrollbar-color: rgba(255,255,255,0.2) transparent;

::-webkit-scrollbar { height: 4px; }
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.2);
  border-radius: 999px;
}
```

#### 完全隐藏滚动条

```
scrollbar-width: none
-ms-overflow-style: none
::-webkit-scrollbar { display: none }
```

#### 全局防跳动

```css
html { scrollbar-gutter: stable }
```

---

### 十二、响应式策略

| 断点 | 调整 |
|------|------|
| < 640px | 单列布局，px-3，紧凑间距 |
| ≥ 640px | 部分双列，px-4 |
| ≥ 1024px | 侧栏 sticky 生效 |
| ≥ 1180px | 版心居中 1180px，fixed 侧栏对齐 |
| ≥ 1280px | 侧栏加宽（11rem → 12rem） |

侧栏固定定位（≥1180px）：
```
position: fixed
left: 50%; margin-left: calc(-1180px/2 + 1rem)
width: 11rem（1280px 以上 12rem）
```

主内容区对应 padding-left 让出侧栏空间。

关键原则：
- 不强制 min-width
- 小屏无横向滚动
- scrollbar-gutter: stable 防止版心跳动

---

### 十三、新组件开发检查清单

1. 颜色是否使用 CSS 变量或 Tailwind 自定义色（不硬编码 hex）
2. 阴影是否遵循多层体系（外投影 + 内高光 + 内阴影）
3. 圆角是否统一 8px（面板/卡片）或 4~6px（小元素）
4. 按钮是否有背景色 + 边框 + hover 高亮 + active:scale-95
5. 文字层级是否在白/灰/暗灰三档内
6. 金色是否只用于强调（标题、激活、高亮）
7. 过渡动画是否加了 transition-all 或 transition-colors
8. 输入框聚焦是否有金色外发光
9. 弹窗是否使用标准两层结构（遮罩 + 定位层）
10. 语义色是否一致（红=危险、绿=成功、蓝=临时、紫=魔法）
11. 图标是否使用 lucide-react 并跟随父色
12. 列表项出现是否有 fadeSlideUp 动画
13. 数值变化是否有 valueFlash 反馈
14. z-index 是否在标准层级内（tooltip 9999 > modal 400 > dropdown 100）
