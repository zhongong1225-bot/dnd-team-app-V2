# AGENTS.md — D&D Team App (繁星 D&D 小助手)

> 本文件是 AI 助手进入本项目的**第一份必读文件**。每次新对话开始时自动加载。
> 详细架构参考 [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md)，路线图参考 [MASTER_PLAN_v2.md](./MASTER_PLAN_v2.md)。

---

## 零、最高原则：AI 造引擎，DM 填内容

**这是本项目的第一设计原则，优先级高于一切其他考量。**

目标：AI 负责构建通用框架和计算引擎，之后 DM 通过网站自身的 UI 工具（BUFF 编辑器、数据维护页等）完成所有内容创作——新增职业、专长、种族、背景、物品、法术等——而无需打开代码编辑器或修改 JavaScript。

### 引擎 vs 内容 的边界

| 类别 | 属于引擎（硬编码） | 属于内容（UI 可编辑） |
|------|-------------------|---------------------|
| 计算管线 | `computeBuffStats()` pass 顺序、`evaluateBuffValue()` 公式求值 | — |
| 效果类型 | `buffTypes.js` 中 10 大分类 + effectType 字典 | 每个效果的具体 value / scope / 公式参数 |
| 职业 | 职业特性 → 虚拟 BUFF 的生成逻辑（`getBuffsFromClassFeatures`） | 职业有哪些特性、每个特性的 BUFF 效果、资源规则、等级表 |
| 专长 | 专长 → 虚拟 BUFF 的生成逻辑 | 专长定义、默认 BUFF 效果、选择型 schema |
| 种族/背景 | 种族/背景 → BUFF 的注入逻辑 | 种族属性加值、特性列表、背景熟练项 |
| 物品/法术 | 装备层计算、同调规则、法术位消耗引擎 | 物品属性、法术数据（法术 = 一组效果配置：伤害/控制/变身/召唤/增益，全部可用效果编辑器表达）、充能、BUFF 效果 |
| 效果编辑器 | 效果类型字典、公式引擎、scope 匹配 | DM 用编辑器配置任意效果组合（BUFF、法术、职业特性效果等都通过同一编辑器表达） |

### 判断标准

**每次要往 `data/*.js` 里添加新条目之前，先问自己：**
- 这是在扩展引擎能力（新增 effectType、新增计算 pass）？→ 可以硬编码
- 这是在添加内容（新职业、新专长、新种族特性）？→ 应该走 UI 编辑

**当前现实**：许多内容仍然硬编码在 JS 文件中（见下方差距分析）。AI 在帮助开发时，应优先增强 UI 编辑能力，而不是简单地在 JS 文件里添加新条目。如果时间紧迫必须先硬编码，应同时留下 UI 覆盖的路径（通过 `defaultBuffPatchStore` 或 DataMaintain 自定义条目）。

### 当前差距：哪些内容还锁在代码里

| 数据 | 文件 | 条目数 | 有 UI 编辑？ | 优先级 |
|------|------|--------|-------------|--------|
| 职业 | `classDatabase.js` | ~13 职业 | 部分（仅自定义职业） | 高 |
| 职业资源规则 | `classResourceRules.js` | 35 条 | 无 | 高 |
| 职业特性 BUFF | `classFeatureDefaultBuffs.js` | 极少 | DM 补丁可覆盖 | 中 |
| 选择型特性 | `classFeatureChoiceRegistry.js` | 5 个 | DM 补丁可覆盖选项 | 中（含 JS 函数，最难 UI 化） |
| 专长 | `feats.js` | ~140 | 部分（仅自定义专长） | 高 |
| 专长默认 BUFF | `featDefaultBuffs.js` | ~106 | DM 补丁可覆盖 | 中 |
| 背景 | `backgrounds.js` | 16 | 无 | 低（纯文本，量少） |
| 魔契祈唤 | `eldritchInvocations.js` | 28 | 无 | 低 |
| 战斗风格 | `fightingStyles.js` | 10 | 无 | 低 |
| 武器精通 | `martialTechniques.js` | 62 | 无 | 低 |
| 武器 | `weaponDatabase.js` | 20 | 无 | 低 |

**已有 UI 的内容**：种族（完全用户创建）、生物库（CreatureLibraryManager）、法术（Spells 页可编辑）、物品（DataMaintain 可自定义）、自定义职业/专长（DataMaintain 可添加）。

---

## 一、项目概要

D&D 5e 团队辅助 Web 应用。React 18 + Vite 5 + Tailwind CSS 3 深色主题。后端可选 Supabase，无环境变量时回退 localStorage。部署在 Vercel (https://dnd-team-app-v3.vercel.app)。全中文 UI，最大宽度 1180px，移动端优先。

```bash
npm run dev    # 本地开发 :5173
npm run build  # 构建
```

### 使用模型

**单向线下工具**：玩家在面对面跑团时使用，DM 是外部权威层。典型流程：玩家用小助手投骰 → 问线下 DM 是否命中 → DM 查怪物 AC 后告知结果 → 玩家投伤害。

这意味着：
- **不需要** DM 端 / 对抗端 / 联机同步 / 自动化裁决
- 小助手定位是**玩家侧的计算器和骰子工具**
- DM 通过网站 UI 配置内容（效果编辑器、DataMaintain），但不通过网站主持战斗

---

## 二、核心架构：BUFF 效果管线

**这是整个应用的中枢**。所有数值（AC、HP、攻击、伤害、技能、豁免等）都通过同一条管线计算。理解这条管线 = 理解整个项目。

### 2.1 效果来源（6 大类）

```
1. 手动 BUFF（character.buffs[]）—— DM/玩家在 BUFF 编辑器创建
2. 专长（character.selectedFeats[]）—— effectMapping 生成虚拟 BUFF
3. 魔契祈唤（character.selectedInvocations[]）—— 同上
4. 战斗风格（character.selectedFightingStyles[]）—— 同上
5. 职业特性（classDatabase → getAvailableFeatures()）—— 同上
6. 装备物品（equippedHeld + equippedWorn 中的已调谐物品）—— 同上
```

**关键概念：虚拟 BUFF** — 专长/祈唤/战斗风格/职业特性/装备 不直接存在 `character.buffs` 里，而是由 `effectMapping.js` 在计算时动态生成。虚拟 BUFF 不出现在 BUFF 状态栏，但效果参与计算。

### 2.2 计算管线（必须按顺序理解）

```
getMergedBuffsForCalculator()
  → 合并顺序：装备 → 专长 → 祈唤 → 战斗风格 → 职业特性 → 手动 BUFF

getFlatEffectEntries()
  → 展平每个 BUFF 的 effects[]，处理 choice 类型展开、proficiency 迁移、disabled 过滤

computeBuffStats()  [useBuffCalculator.js]
  → Pass 0:   变身检测（creature_transform，只取第一个，不叠加）
  → Pass 0.5: 基础属性确定
  → Pass 1:   属性解析（ability_override → ability_score_uncapped → ability_score）
  → Pass 2:   攻击/伤害加值（全局 vs scope 分离）
  → Pass 3:   优势/劣势追踪
  → Pass 4:   AC 计算（变身 > armor_override > 装备AC + ac_bonus）
  → Pass 5:   HP（temp_hp 取最大不叠加，max_hp_bonus 求和）
  → Pass 6:   抗性/免疫/易伤
  → Pass 7:   速度、先攻、DC、法术攻击、专注
  → Pass 8:   力竭与状态效果（2024 规则：d20 惩罚 = -2×等级）
```

### 2.3 效果数据形状

```js
{
  effectType: string,    // 如 'ac_bonus', 'damage_bonus', 'skill_bonus'
  category: string,      // 'ability' | 'offense' | 'defense' | 'mobility_casting' | ...
  scope: string,         // 'global' | 'melee_attack' | 'ranged_attack' | ...
  scopeDetail: [],       // 范围参数
  value: any             // 数值 或 公式对象 { ref, ability, mult, add, min }
}
```

所有效果类型定义在 `src/data/buffTypes.js`（1134 行），分为 10 大分类。

---

## 三、关键文件地图（改动影响面排序）

### 3.1 核心文件（改动必须谨慎，影响全局）

| 文件 | 行数 | 职责 | 改动时必须同步检查 |
|------|------|------|-------------------|
| `src/data/buffTypes.js` | 1134 | 所有效果类型字典 + scope 定义 | `scopeMatchesCombatMean()`, `BuffForm.jsx`, `useBuffCalculator.js` |
| `src/lib/effects/effectMapping.js` | 833 | 效果提取与合并管线 | 所有数据来源的收集逻辑 |
| `src/hooks/useBuffCalculator.js` | 1102 | 计算引擎 `computeBuffStats()` | 所有数值展示组件 |
| `src/components/CombatStatus.jsx` | 3163 | BUFF 状态面板 + 战斗手段 | BUFF 展示、资源管理、主动技能 |
| `src/components/BuffForm.jsx` | 6201 | 效果编辑器（原 BUFF 编辑器） | BUFF 创建/编辑的所有 UI 逻辑 |
| `src/lib/formulas.js` | ~520 | 核心数学（evaluateBuffValue 等） | 全局使用 |
| `src/pages/CharacterSheet.jsx` | 4037 | 角色主页 | 几乎所有子组件的父级 |

### 3.2 重要子系统文件

| 文件 | 职责 |
|------|------|
| `src/components/AbilityUseModal.jsx` | 主动技能释放弹窗（1713 行） |
| `src/components/EquipmentAndInventory.jsx` | 装备 + 背包（2460 行） |
| `src/lib/activeAbilityEngine.js` | 主动技能引擎（资源消耗、冷却、使用状态） |
| `src/lib/cardModel.js` / `cardAdapter.js` | 编辑卡数据模型 |
| `src/lib/shieldEngine.js` / `shieldPoolUtils.js` | 护盾系统 + 护盾池 |
| `src/lib/chargeItemModel.js` / `chargeRecovery.js` | 充能物品模型 |
| `src/data/classDatabase.js` | 12+ 职业数据（特性、子职、施法） |
| `src/data/classResourceRules.js` | 职业资源规则（怒气、气点、法术位） |
| `src/data/classFeatureDefaultBuffs.js` | 职业特性默认 BUFF 回退 |
| `src/data/races.js` / `raceModel.js` | 种族数据 |
| `src/data/backgrounds.js` | 背景数据 |

### 3.3 存储层（双模式：Supabase / localStorage）

所有存储层遵循：`if (isSupabaseEnabled()) → Supabase CRUD else → localStorage CRUD`

| 文件 | 职责 |
|------|------|
| `src/lib/characterStore.js` | 角色 CRUD |
| `src/lib/defaultBuffPatchStore.js` | DM 默认 BUFF 补丁 |
| `src/lib/warehouseStore.js` | 团队仓库 |
| `src/lib/moduleStore.js` | 战役模块 |
| `src/lib/realtimeSync.js` | Supabase Realtime 通道 |

---

## 四、编码约定

### 4.1 通用

- **语言**：全中文 UI，代码注释可中英混合
- **样式**：Tailwind CSS 类名，深色主题 `#141b27` 背景 + `#c79a42` 金色强调
- **组件**：函数组件 + Hooks，不用 Class 组件
- **状态**：角色数据存在 character 对象中，通过 characterStore 持久化
- **不写无意义注释**：代码自解释，注释只写 WHY（非显而易见的原因）

### 4.2 数据流方向

```
data/*.js（静态字典）
  → lib/effects/effectMapping.js（提取合并）
    → hooks/useBuffCalculator.js（计算）
      → components/*（展示）
```

**永远不要反向依赖**：组件不应直接读取 data/ 中的效果定义来做计算，应通过 buffStats 对象。

### 4.3 BUFF 效果优先级

```
个人 DM 补丁（featBuffPatch / defaultBuffPatch）
  > 模块级 DM 默认配置（loadDefaultBuffPatch）
    > 代码硬编码回退（featDefaultBuffs / classFeatureDefaultBuffs）
      > 无效果
```

---

## 五、已知雷区（改一处必查另一处）

### 5.1 护盾池 (shield_pool)

- `(current)` 值在 `getFlatEffectEntries` 中作为 `ac_bonus` 注入（值=shieldPoolCurrent）
- `shield_pool` 效果物品即使未同调也会生成 BUFF 条目（`getBuffsFromEquipmentAndInventory` 特殊处理）
- `wornArmorWithShieldPool` 直接读 inventory 无 isAttuned 检查
- **两处逻辑必须保持一致**

### 5.2 主动技能释放 (AbilityUseModal)

- 掷骰后必须触发 3D 骰子动画：`window.dispatchEvent(new CustomEvent('dnd-external-roll', ...))`
- 收集 `diceAnimParts`（公式如 "10d6"）+ `diceAnimValues`（每颗骰子点数数组）
- **早期返回（治疗确认弹窗等）须在 return 前也 dispatch**
- 所有掷骰效果类型（spell/ability/damage/heal/custom_logic/spell 子效果）都须 push 动画数据
- 这是既有功能，不要当成新需求重新实现

### 5.3 装备主动技能释放

- 物品须已装备 + 已同调（`getBuffsFromEquipmentAndInventory` 过滤，背包内不生成卡片）
- `itemInventoryId` 必须设在 `buffEntry` 上（非仅 effect 上），否则 `inferSourceKey` 返空 → `findActiveAbilityFromCard` 找不到卡片 → 不显示释放按钮
- `findActiveAbilityFromCard` 陷阱：`charge_item` 存在但 `effects` 为空时须回退到 `card.activeAbility`，不能 return null

### 5.4 法术位消耗

- BuffForm 下拉只显"法术位"，`consumptionMode` 选固定/自由
- 自由消耗公式 = 基础值 × 消耗环位（`applyMultiplier` 勾选时），无基数字段
- AbilityUseModal 用 `isFixedSlotConsumption` / `isFreeSlotConsumption` 判断，环位读 `norm.slotLevel`

### 5.5 效果系统约束

- `damage_bonus` 是固定数值加成（如 +5），不支持骰子记号。需要额外骰子伤害用 `extra_damage_dice`
- BUFF 系统只能表达被动永久效果，无法表达"每回合一次"等条件限制
- 条件性效果应使用 `custom_condition` 纯文字描述，不参与数值计算
- `creature_transform` 不叠加：多个变身 BUFF 只取第一个有效的

### 5.6 选择型特性 (choice)

- `getBuffsFromClassFeatures()` 检测到注册表中的特性时，包装为 `choice` 类型结构
- `getFlatEffectEntries()` 展开 `choiceOptions[choiceSelected].effects` 注入计算器
- 选项级 DM 补丁 > 注册表硬编码效果

---

## 六、修改前必做清单

### 改 BUFF 效果类型

1. `src/data/buffTypes.js` — 在对应分类添加 `{ key, label, dataType }`
2. `scopeMatchesCombatMean()` — 如需范围匹配，添加逻辑
3. `src/hooks/useBuffCalculator.js` — 在 `computeBuffStats()` 添加处理 pass
4. `src/components/BuffForm.jsx` — 如需特殊编辑器，添加 UI
5. `src/components/CombatStatus.jsx` — 如需特殊展示，添加渲染

### 改职业数据

1. `src/data/classDatabase.js` — 添加职业条目
2. `src/data/classResourceRules.js` — 添加资源规则
3. `src/data/classFeatureDefaultBuffs.js` — 有数值收益的特性添加 BUFF
4. `src/data/classFeatureChoiceRegistry.js` — 选择型特性注册

### 改专长

1. `src/data/feats.js` — 添加定义
2. `src/data/featDefaultBuffs.js` — 添加默认效果
3. `src/data/featBuffChoices.js` — 如有选择（如 ASI），添加 schema

### 改任何计算逻辑

1. 先读 `useBuffCalculator.js` 理解当前 pass 顺序
2. 检查 `effectMapping.js` 是否需要配合修改
3. 在浏览器中验证数值变化（`npm run dev` 后检查角色面板）

---

## 七、当前开发阶段

当前处于 **编辑卡改造阶段**（MASTER_PLAN_v2 Phase 1），已完成：
- BUFF 状态栏精简、特性筛选、战斗手段卡片化
- 主动技能注册表 + 引擎 + QuickBar + ActionPanel
- 全职业 BUFF 补全（~25 条）
- 法术位自由消耗模式
- 护盾池系统
- 种族数据基础（races.js + raceModel.js）
- 背景数据（backgrounds.js）

下一步计划详见 [MASTER_PLAN_v2.md](./MASTER_PLAN_v2.md) 中的 Step 13+。

---

## 七·五、DM 能力清单（已解锁 vs 未解锁）

面向 DM 的参考：哪些 D&D 规则已经可以纯 UI 配置，哪些还必须改代码。

### 已解锁（纯 UI 完成）

| D&D 规则 | 操作路径 | 备注 |
|---------|---------|------|
| 创建自定义种族 | 种族页面 → 新建 | 完全支持 |
| 创建自定义物品 + 附魔 | 数据维护 → 物品资料库 → 添加；附魔走效果编辑器 | 完全支持 |
| 给物品加主动技能 | 物品编辑 → 附魔效果 → charge_item | 完全支持 |
| 创建临时 BUFF（增益/减益） | BUFF 状态栏 → 新建 → 效果编辑器 | 完全支持 |
| 配置专长默认 BUFF 效果 | 专长选择弹窗 → "默认 BUFF" | 需管理员权限 |
| 配置职业特性 BUFF 效果 | 角色特性区 → 编辑效果 | 需管理员权限 |
| 配置魔契祈唤/战斗风格效果 | 对应选择弹窗 → "默认 BUFF" | 需管理员权限 |
| 法术位消耗模式配置 | BuffForm → 法术位下拉 → 固定/自由 | 已统一模型 |

### 部分解锁（UI 存在但有缺口）

| D&D 规则 | 现状 | 缺口 |
|---------|------|------|
| 创建自定义职业 | 数据维护 → 粘贴 Markdown 创建 | 无下拉选择、无 spellcasting/subclasses/资源规则解析 |
| 创建自定义专长 | 数据维护 → 粘贴 Markdown 创建 | 无下拉选择、无机械效果（需管理员另配默认 BUFF） |

### 未解锁（必须改代码）

| D&D 规则 | 硬编码位置 | 说明 |
|---------|-----------|------|
| 编辑法术内容 | `spellDatabase.js` | 纯文本记录，无效果系统，无编辑 UI |
| 新增资源类型 | `classResourceRules.js` + `chargeItemModel.js` | 资源规则完全硬编码，约 30 条 |
| 配置背景数据 | `backgrounds.js` | 硬编码 16 个背景 |
| 配置武器精通 | `martialTechniques.js` | 硬编码 62 条 |
| 新增战斗风格 | `fightingStyles.js` | 硬编码 10 个 |
| 新增魔契祈唤 | `eldritchInvocations.js` | 硬编码 28 条 |

### 关键缺口优先级

1. **法术接入效果编辑器** — 法术目前无效果系统，需让法术条目拥有 effects[] 或通过 charge_item 桥接
2. **自定义职业/专长可选** — 角色创建下拉菜单需合并内置 + 自定义列表
3. **资源规则可配置** — 自定义职业无法拥有自己的资源系统

---

## 八、组件层级关系

```
Layout (RollProvider + max-w 容器)
├── BottomNav（底部导航 + 骰子结果区）
├── Dashboard（首页）
├── Characters → CharacterSheet（角色主页）★
│   ├── CharacterSheetTopBar
│   ├── AbilityModule（六维属性）
│   ├── ClassFeatureChoiceBlock（选择型特性 UI）
│   ├── CombatStatus（BUFF 状态面板）★★
│   │   ├── BuffListItem → BuffForm（BUFF 编辑器弹窗）★★
│   │   ├── BuffManager
│   │   └── AbilityUseModal（主动技能释放弹窗）★
│   ├── EquipmentAndInventory（装备 + 背包）★
│   │   ├── CharacterInventory
│   │   ├── ItemAddForm
│   │   └── BagOfHoldingPanel
│   ├── MagicCraftingPanel
│   └── CharacterSpells
├── Warehouse（团队仓库）★
├── Spells（法术浏览）
├── HouseRules / DataMaintain / ModuleLibrary
└── ThreeDiceOverlay（3D 骰子，Portal）
```

---

## 九、设计原则

1. **AI 造引擎，DM 填内容**（最高原则，详见第零节）— 新增内容应通过 UI 编辑，不硬编码到 JS 文件
2. **所有数值增益必须走 BUFF 管线** — 无论来自专长、武器、职业特性还是种族特性，必须配置为真实附魔效果，出现在 BUFF 状态栏，参与计算
3. **效果编辑器是万能入口** — 它不只是编辑 BUFF 的工具，它是 DM 表达任意 D&D 规则的核心界面（BUFF、法术、职业特性效果都通过它配置），易用性是第一优先级
4. **DM 可覆盖一切** — DM 补丁优先级最高
5. **双模式存储** — Supabase 可选，无环境变量时 localStorage 回退
6. **向后兼容** — 旧格式角色数据仍可正常加载
7. **每步独立可部署** — 不影响现有功能

---

## 十、不要做的事

- **不要** 为了添加新职业/新专长/新种族特性而直接改 `data/*.js`，应优先考虑是否能通过 DataMaintain 或效果编辑器实现
- **不要** 在组件中直接读取 `data/` 文件做数值计算，走 buffStats
- **不要** 绕过 `effectMapping.js` 直接往 `character.buffs` 注入虚拟 BUFF
- **不要** 修改 `computeBuffStats()` 的 pass 顺序，除非你理解所有 pass 之间的依赖
- **不要** 给 `damage_bonus` 加骰子支持，用 `extra_damage_dice`
- **不要** 删除 3D 骰子动画的 `dnd-external-roll` 事件派发逻辑
- **不要** 在护盾池系统中引入同调检查而不检查 `wornArmorWithShieldPool` 的一致性
- **不要** 假设 `choice` 类型 BUFF 的 `choiceSelected` 始终为 0
- **不要** 把内容逻辑写死在 JS 函数里（如 `classFeatureChoiceRegistry.js` 的 `getEffects()`），应使用数据驱动的效果数组
