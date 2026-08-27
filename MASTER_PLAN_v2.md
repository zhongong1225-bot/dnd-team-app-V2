# D&D Team App — 统一执行规划 v2

> 最后更新：2026-08-27
>
> 基于卡-卡槽架构重构，整合原 MASTER_PLAN 38 步。
> 原计划保留所有设计决策，仅重组执行顺序和依赖关系。

---

## 一、卡-卡槽架构设计

### 1.1 核心理念

所有功能单元统一为**卡（Card）**。每张卡都有 **BUFF 编辑器** 和 **简述栏**。卡可以选择成为不同类型：职业卡、种族卡、专长卡、背景卡、物品卡等。

**核心原则：卡只能插入对应的卡槽，不同卡拥有独特的规范样式。**

### 1.2 权限体系

| 角色 | 权限 |
|------|------|
| **玩家** | 创建/编辑自己的卡、插入卡槽、启用/禁用卡、使用 BUFF 编辑器 |
| **DM** | 创建全局卡模板、覆盖任何卡的效果（dmPatch）、控制卡槽可见性、管理权限 |
| **系统** | 自动推导职业卡（locked）、自动注入种族/背景卡、执行等级/职业限制检查 |

DM 可设定：哪些卡类型对玩家可见、是否允许玩家自建卡、是否允许自由编辑 BUFF。

### 1.3 五大卡类型

#### 职业卡（Class Card）

```
ClassCard = {
  id, name, description,           // 基础字段
  effects: Effect[],                // BUFF 效果（BUFF 编辑器可编辑）
  cardType: 'class',
  className: string,                // 所属职业（'fighter' / 'wizard' / ...）
  subclass: string | null,          // 子职（可选）
  level: number,                    // 所需等级
  isActive: boolean,                // true = 主动技能卡，false = 被动增益卡
  locked: true,                     // 系统自动推导，不可手动删除
  multiClass: boolean,              // 是否多职业卡
  multiClassSlot: string | null,    // 多职业卡槽 ID
}
```

**规则**：
- 只能插入对应职业的卡槽
- 受等级与所选职业限制（未达等级不可启用）
- 多职业角色拥有多个职业卡槽，多职业卡插入对应槽位
- 主动职业卡可关联主动技能系统（消耗资源/冷却）
- 升级时系统自动生成新职业卡

---

#### 种族卡（Race Card）

```
RaceCard = {
  id, name, description,
  effects: Effect[],
  cardType: 'race',
  raceId: string,                   // 种族 ID
  abilityBonuses: object,           // 统一赠送属性 { str: 0, dex: 2, con: 0, int: 1, ... }
  subraceId: string | null,         // 亚种（可选）
  locked: true,                     // 选择种族后自动生成
}
```

**规则**：
- 选择种族后系统自动生成种族卡
- 统一赠送属性加值（自动写入角色属性）
- 单种族卡插入种族卡槽
- 切换种族 = 移除旧种族卡 + 生成新种族卡

---

#### 专长卡（Feat Card）

```
FeatCard = {
  id, name, description,
  effects: Effect[],
  cardType: 'feat',
  featId: string,
  featTier: 'half' | 'full',        // 半专长 / 全专长
  abilityBonus: number,              // 全专长统一 +1 属性点（半专长为 0）
  abilityType: string | null,        // 加到哪个属性（全专长时必填）
  prerequisite: {                    // 前置条件
    minLevel: number,                // 最低角色等级
    requiredClass: string | null,    // 所需职业（可选）
    requiredFeat: string | null,     // 所需前置专长（可选）
  },
  slotId: string,                    // 插入的专长槽 ID
  locked: false,
}
```

**规则**：
- **半专长**：只有效果，无属性加值
- **全专长**：统一赠送 1 点属性 + 效果
- 专长槽受单职业等级要求（如 4 级战士可获得第一个专长）
- 前置条件不满足时卡片灰显不可启用
- DM 可自定义专长（创建新专长卡）

---

#### 背景卡（Background Card）

```
BackgroundCard = {
  id, name, description,
  effects: Effect[],
  cardType: 'background',
  backgroundId: string,
  skillProficiencies: string[],      // 技能熟练
  toolProficiencies: string[],       // 工具熟练
  languages: string[],               // 语言
  embeddedFeatCard: FeatCard | null, // 可嵌入 1 张专长卡
  locked: true,                      // 选择背景后自动生成
}
```

**规则**：
- 选择背景后系统自动生成背景卡
- 自动授予技能/工具/语言熟练（通过 BUFF 管线）
- **可嵌入 1 张专长卡**（背景赠送的起源专长或 DM 指定专长）
- 嵌入的专长卡遵循专长卡的所有规则

---

#### 物品卡（Item Card）

```
ItemCard = {
  id, name, description,
  effects: Effect[],
  cardType: 'item',
  itemType: string,                  // 'weapon' | 'armor' | 'shield' | 'wondrous' | 'potion' | 'scroll' | 'ring' | 'wand' | ...
  rarity: string,                    // 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary'
  attunement: boolean,               // 是否需要同调
  isAttuned: boolean,                // 当前是否已同调（勾选框）
  baseProperties: object,            // 物品基础属性（伤害骰/AC/充能等）
  charges: { current, max },         // 充能（如有）
  equipped: boolean,                 // 是否装备中
  locked: false,
}
```

**规则**：
- 先区分物品类型（武器/护甲/奇物/药水/卷轴/戒指/魔杖...）
- 具有物品的基础属性（伤害骰、AC 加值、充能次数等）
- 有 BUFF 编辑器（魔法物品的被动效果）
- **同调勾选**：需要同调的物品必须勾选同调后才生效
- 同调上限 3 件（系统检查）

---

### 1.4 卡槽系统

角色卡上按类型划分卡槽区域，每个区域只接受对应类型的卡：

```
角色卡
├── 职业卡槽区
│   ├── 主职业卡槽 × 1（接受 ClassCard）
│   └── 副职业卡槽 × N（多职业时，接受 ClassCard）
├── 种族卡槽 × 1（接受 RaceCard）
├── 背景卡槽 × 1（接受 BackgroundCard，内含 1 专长卡位）
├── 专长卡槽区
│   ├── 专长槽 × N（数量 = 角色等级中获得的专长次数，接受 FeatCard）
│   └── 每个槽显示前置条件检查状态
├── 物品卡槽区
│   ├── 装备槽（武器/护甲/饰品，接受 ItemCard）
│   └── 背包（未装备的 ItemCard）
└── 手动 BUFF 卡槽区（自由添加的 BUFF 卡，无固定类型限制）
```

### 1.5 卡片视觉规范

每种卡类型拥有独特的规范样式：

| 卡类型 | 视觉特征 |
|--------|---------|
| 职业卡 | 职业色带（左竖线）、等级徽章、主动/被动图标 |
| 种族卡 | 种族纹样边框、属性加值标签 |
| 专长卡 | 半专长=银边、全专长=金边、属性加值标签 |
| 背景卡 | 背景纹理底、内嵌专长卡预览区 |
| 物品卡 | 稀有度色框（白/绿/蓝/紫/橙）、同调勾选框、装备状态 |
| BUFF 卡 | 来源标签、持续时间标记、启用/禁用开关 |

### 1.6 统一卡片模型（基类）

所有卡类型共享以下基类字段：

```
BaseCard = {
  id: string,                       // 唯一标识
  cardType: string,                 // 'class' | 'race' | 'feat' | 'background' | 'item' | 'buff'
  name: string,                     // 显示名称
  description: string,              // 简述栏（简述文本）
  effects: Effect[],                // BUFF 效果数组（BUFF 编辑器操作目标）
  enabled: boolean,                 // 是否启用
  dmPatch: Effect[] | null,         // DM 覆盖效果（优先级最高）
  locked: boolean,                  // 系统锁定（不可删除）
  createdAt: number,                // 创建时间戳
  source: string,                   // 来源标识（'system' | 'player' | 'dm'）
}
```

### 1.7 BUFF 管线变更

```
当前：
  classFeatures(计算) + selectedFeats + buffs + race(无) + background(无)
    → getMergedBuffsForCalculator → getEffectsFromBuff → useBuffCalculator

卡槽后：
  char.cards[].effects（所有类型统一提取）
    → getMergedBuffsForCalculator → getEffectsFromBuff → useBuffCalculator
  
  管线内部逻辑不变，只是数据来源统一为 char.cards[]
  新增来源：种族卡属性加值、背景卡熟练、物品卡被动效果
```

### 1.8 四阶段实施

| 阶段 | 内容 | 核心交付 |
|------|------|---------|
| Phase A | 数据层 | BaseCard 模型 + 5 种卡类型定义 + 迁移引擎 + 向后兼容 |
| Phase B | UI 层 | 卡槽区域组件 + 5 种卡片样式渲染器 + BUFF 编辑器统一入口 |
| Phase C | 交互层 | 卡槽拖放 + 前置条件检查 + 临时卡清理 + 同调管理 |
| Phase D | 清理层 | 移除旧存储（selectedFeats/buffs/shields） + 全局兼容确认 |

---

## 二、项目现状

### 2.1 已完成步骤

| 步骤 | 内容 | 完成日期 |
|------|------|---------|
| Step 1 | BUFF 状态栏精简 | 2026-08-25 |
| Step 2 | BUFF 特性筛选 | 2026-08-25 |
| Step 3 | 战斗手段卡片组件化 | 2026-08-26 |
| Step 7 | 主动技能注册表 + 数据层（25 技能） | 2026-08-26 |
| Step 8 | 主动技能按钮栏 UI（ActionPanel + QuickBar） | 2026-08-27 |
| Step 9-12 | 全职业 BUFF 补全（~25 条） | 2026-08-26 |

### 2.2 当前数据模型

| 字段 | 位置 | 格式 |
|------|------|------|
| 职业特性 | 计算属性 | `classDatabase → getAvailableFeatures()` |
| 专长 | `char.selectedFeats[]` | `{ featId, slotId, level, sourceClass, featBuffPatch }` |
| 手动 BUFF | `char.buffs[]` | `{ id, source, effects[], enabled, duration, sourceKind }` |
| 护盾 | `char.shields[]` | `{ id, name, shieldType, activationMode, charges, effects[] }` |
| 种族 | `char.appearance.race` | 纯文本，无数据表 |
| 背景 | `char.appearance.background` | 纯文本，无数据表 |
| 主动技能状态 | `char.activeAbilityState{}` | `{ [abilityId]: { used, lastRestType } }` |
| 选择型特性 | `char.classFeatureChoices{}` | `{ [featureId]: optionId }` |

### 2.3 各系统完成度（更新）

| 系统 | 完成度 | 变化 |
|------|--------|------|
| BUFF 系统 | ~85% | 全职业 BUFF 已补全，缺种族/背景/武器精通 |
| 主动技能 | ~70% | 注册表 + 引擎 + QuickBar + ActionPanel 已完成 |
| 战斗系统 | ~40% | 不变 |
| 养成系统 | ~50% | 不变 |
| 卡槽架构 | 0% | 全新 |

---

## 三、分步实施计划

> **排序原则**：
> 1. 先做不依赖卡槽的高价值功能（立刻改善跑团体验）
> 2. 再做卡槽架构（统一地基）
> 3. 最后做依赖卡槽的高级功能（DM 编辑、养成、持久化）
>
> **约束**：每步独立可部署，不影响现有功能。

---

### Phase 0：已完成（Step 1-3, 7-8, 9-12）

已在上表列出，不再赘述。

---

### Phase 1：近期优先（不依赖卡槽）

> 目标：补全 BUFF 编辑器 UX + 种族/背景数据体系 + 战斗流程。跑团体验直接提升。

#### Step 13：BuffForm 编辑器 UX 优化（~3 天）

**目标**：解决 BUFF 编辑器的多层弹窗和长下拉问题。

**改动范围**：
- 效果大类选择：长下拉 → 分组按钮网格（2 列）
- 熟练检查表：27 个 checkbox → 搜索多选（带已选计数）
- 变身编辑器：拆分为 2 步（基础 → 高级）
- 选择型子效果：3 层弹窗 → 内嵌编辑区

**不改动**：数据结构、计算引擎。

**风险**：中。大量 UI 代码调整。

---

#### Step 14：种族数据表 + 展示页面（~4 天）

**目标**：从零构建种族数据体系。

**数据模型**：
```
Race = {
  id, name, size, speed,
  abilityBonuses,           // { str: 2, dex: 1 } 或自由分配 +2/+1
  traits[],                 // 种族特性列表
  darkvision, resistances, proficiencies,
  spells, subraces[],
  buffs[],                  // 关联 BUFF 效果
}
```

**改动范围**：
- 新建 `src/data/raceData.js`：硬编码常见种族（人类/精灵/矮人/半身人/龙裔/提夫林/半精灵/半血裔/侏儒/阿斯莫/歌利亚）
- 新建 `src/pages/RaceLibrary.jsx`：种族展示页面
- `App.jsx`：增加路由 `/more/races`
- `CharacterSheet.jsx`：角色卡增加种族选择下拉

**不改动**：BUFF 编辑器、计算引擎。

**风险**：中。角色数据模型增加 `race` 字段。

---

#### Step 15：种族 BUFF 系统（~2 天）

**目标**：种族特性自动注入 BUFF 管线。

**改动范围**：
- 新建 `src/data/raceDefaultBuffs.js`
- `effectMapping.js`：新增 `getBuffsFromRace()`
- 选择种族后自动在 BUFF 栏显示种族特性效果

**依赖**：Step 14。

**风险**：低。

---

#### Step 16：背景数据表 + 展示页面 + BUFF（~3 天）

**目标**：背景数据体系 + 熟练项自动 BUFF。

**2024 规则**：背景与起源专长/属性加值已解耦。背景仅提供技能/工具/语言熟练和特性描述。

**改动范围**：
- 新建 `src/data/backgroundData.js`：硬编码常见背景（侍僧/罪犯/民间英雄/贤者/士兵/流浪儿/工匠/隐士/贵族/水手）
- 新建 `src/pages/BackgroundLibrary.jsx`
- `effectMapping.js`：新增 `getBuffsFromBackground()`
- `CharacterSheet.jsx`：角色卡增加背景选择

**风险**：低。模式与种族一致。

---

#### Step 17：背景 BUFF + 武器精通 BUFF（~2 天）

2024 武器精通特性映射到 BUFF 效果。

**依赖**：Step 15-16（种族/背景 BUFF 流程已建立）。

---

#### Step 18：战斗手段添加弹窗拆分（~3 天）

**目标**：550 行弹窗拆为 4 个分步组件。

**改动范围**：
- 新建 `AddMeanTypeStep.jsx` / `AddWeaponStep.jsx` / `AddSpellStep.jsx` / `AddItemStep.jsx`
- `CombatStatus.jsx`：弹窗改为分步渲染

**风险**：低。纯重构。

---

#### Step 19：武器攻击面板重构（~4 天）

**目标**：武器卡片显示 `命中 +7 | 伤害 1d8+4 挥砍`，点击即投骰。

**改动范围**：
- `WeaponAttackCard.jsx`：完善攻击流程 UI
- 新建 `AttackResultPanel.jsx`
- `BottomNav.jsx`：骰子结果区增加攻击/伤害标签

**风险**：中。涉及骰子调用链路。

---

#### Step 20：法术位消耗追踪（~3 天）

**目标**：法术卡片上显示 `3环 ■■■□ 2/3`，点击消耗/恢复。

**改动范围**：
- `CombatStatus.jsx`：法术位区域增加点击交互
- `CharacterSpells.jsx`：法术列表增加法术位指示器

**风险**：低。

---

#### Step 21：战斗日志面板（~3 天）

**目标**：攻击/施法/技能结果记录，按时间倒序显示。

**改动范围**：
- 新建 `CombatLogPanel.jsx`
- `CombatStatus.jsx`：战斗手段区下方增加日志区

**依赖**：Step 19（攻击流程）。

---

#### Step 22：专注管理 + 灵感追踪（~3 天）

**改动范围**：
- 新建 `ConcentrationTracker.jsx` + `InspirationTracker.jsx`
- 角色数据增加 `concentration` / `hasInspiration` 字段

---

#### Step 23：视觉系统（~3 天）

新增 `vision` BUFF 效果类型，BUFF 管线自动合并多来源视觉能力。

**依赖**：Step 14（种族数据含视觉能力）。

---

#### Step 24：战斗特殊动作 + 双武器战斗（~4 天）

擒抱/推撞面板 + 双武器副手攻击规则。

---

#### Step 25：短休系统改进 + 生命骰（~3 天）

生命骰花费 UI + 长/短休按钮醒目化。

---

#### Step 26：属性生成系统（~3 天）

购点法 + 天命投掷。纯新增组件。

---

#### Step 27：法术材料管理（~2 天）

昂贵材料自动消耗 + 施法焦点追踪。

---

### Phase 2：卡槽架构 — 数据层（Phase A）

> 目标：建立统一卡片数据模型 + 5 种卡类型定义，迁移现有数据源，保持向后兼容。

#### Step 28：BaseCard 模型 + 卡类型定义 + 迁移引擎（~5 天）

**目标**：定义 BaseCard 基类 + 5 种卡类型结构，创建迁移引擎。

**改动范围**：
- 新建 `src/data/cardTypes.js`：
  - BaseCard 基类字段定义
  - ClassCard / RaceCard / FeatCard / BackgroundCard / ItemCard / BuffCard 类型定义
  - 卡槽类型定义（class_slot / race_slot / feat_slot / background_slot / item_slot / buff_slot）
  - 卡槽-卡类型匹配规则
  - 前置条件检查工具函数
- 新建 `src/lib/cardEngine.js`：
  - `migrateToCards(char)` — 从旧数据源迁移到 cards[]
  - `migrateFromCards(char)` — 反向兼容写入旧字段
  - `getCardEffects(cards)` — 统一提取所有卡效果
  - `validateCardSlotMatch(card, slotKind)` — 卡-槽匹配检查
  - `checkPrerequisites(card, char)` — 前置条件检查（等级/职业/前置专长）
- `CharacterSheet.jsx`：加载时调用 `migrateToCards`，保存时双向同步

**向后兼容策略**：
- 迁移后同时保留旧字段和 cards[]
- 读取时优先用 cards[]，写入时同步到旧字段
- 确保未迁移的角色数据仍可正常使用

**风险**：高。核心数据模型变更。

---

#### Step 29：职业卡迁移 + 等级/职业限制（~3 天）

**目标**：职业特性 → ClassCard，受等级与职业限制。

**改动范围**：
- `cardEngine.js`：`syncClassFeatureCards(char)` — 升级时自动生成/移除职业卡
- 主动职业卡标记 `isActive: true`，关联 activeAbilityEngine
- 多职业卡支持：`multiClass: true` + `multiClassSlot`
- 等级检查：未达等级的职业卡 `enabled = false`

---

#### Step 30：专长卡迁移 + 半/全专长区分（~3 天）

**目标**：`selectedFeats[]` → FeatCard，区分半专长和全专长。

**改动范围**：
- `cardEngine.js`：`migrateFeatsToCards(char)` — 迁移专长数据
- 全专长自动授予 +1 属性点（`abilityBonus: 1`）
- 前置条件检查：minLevel / requiredClass / requiredFeat
- 专长槽数量计算：基于角色等级中获得的专长次数

---

#### Step 31：种族卡 + 背景卡生成（~3 天）

**目标**：选择种族/背景后自动生成对应卡片。

**改动范围**：
- `cardEngine.js`：`generateRaceCard(raceId)` / `generateBackgroundCard(bgId)`
- 种族卡：统一属性加值写入 `abilityBonuses`
- 背景卡：技能/工具/语言熟练 → effects[]，内嵌专长卡位 `embeddedFeatCard`
- 切换种族/背景时：移除旧卡 + 生成新卡

---

#### Step 32：物品卡化 + 同调管理（~3 天）

**目标**：装备/魔法物品 → ItemCard，含同调勾选。

**改动范围**：
- `cardEngine.js`：`migrateItemsToCards(char)` — 装备/物品迁移
- 物品类型分类（weapon/armor/shield/wondrous/potion/scroll/ring/wand）
- 同调系统：`attunement` + `isAttuned`，上限 3 件检查
- 物品卡被动效果 → effects[]（BUFF 编辑器可编辑）
- 护盾系统合并为 ItemCard（`itemType: 'shield'`）

---

#### Step 33：迁移手动 BUFF 到卡片（~2 天）

**目标**：`buffs[]` → BuffCard。

**改动范围**：
- `cardEngine.js`：`migrateBuffsToCards(char)`
- BuffForm：保存时同时写入 cards[] 和 buffs[]
- BUFF 管线：从 cards[] 读取 buff 卡效果

---

### Phase 3：卡槽架构 — UI 层（Phase B）

> 目标：卡槽区域组件 + 5 种卡片样式渲染器 + BUFF 编辑器统一入口。

#### Step 34：卡槽区域组件 + 职业卡/种族卡渲染（~4 天）

**目标**：创建卡槽区域组件，实现职业卡和种族卡的规范样式。

**改动范围**：
- 新建 `src/components/cards/CardSlotArea.jsx`：卡槽区域容器（接受 slotKind，渲染对应卡）
- 新建 `src/components/cards/ClassCardView.jsx`：职业卡样式（职业色带 + 等级徽章 + 主动/被动图标）
- 新建 `src/components/cards/RaceCardView.jsx`：种族卡样式（纹样边框 + 属性加值标签）
- `CharacterSheet.jsx`：职业特性区域 + 种族区域 → 卡槽区域

---

#### Step 35：专长卡/背景卡/物品卡渲染器（~4 天）

**目标**：实现剩余 3 种卡片的规范样式。

**改动范围**：
- 新建 `src/components/cards/FeatCardView.jsx`：银边（半专长）/ 金边（全专长）+ 属性加值标签 + 前置条件状态
- 新建 `src/components/cards/BackgroundCardView.jsx`：纹理底 + 内嵌专长卡预览区
- 新建 `src/components/cards/ItemCardView.jsx`：稀有度色框 + 同调勾选框 + 装备状态
- 新建 `src/components/cards/BuffCardView.jsx`：来源标签 + 持续时间 + 启用/禁用

---

#### Step 36：BUFF 编辑器统一入口（~3 天）

**目标**：所有卡片的 BUFF 效果编辑走统一的 BUFF 编辑器。

**改动范围**：
- 每种卡片视图组件：非 locked 卡显示齿轮按钮 → 打开 BuffForm
- BuffForm：接收 card 对象作为编辑目标（替代直接编辑 buff/feat）
- 保存时更新 card.effects[]，同步到旧字段

---

### Phase 4：卡槽架构 — 交互层（Phase C）

> 目标：卡槽拖放 + 前置条件检查 + 临时卡清理 + 同调管理。

#### Step 37：卡槽拖放 + 前置条件检查（~4 天）

**改动范围**：
- CardSlotArea：支持卡拖入对应卡槽（类型不匹配时拒绝）
- 专长卡拖入时自动检查前置条件（等级/职业/前置专长）
- 不满足条件时卡片灰显 + 提示缺失条件
- 物品卡拖拽：装备/背包切换

---

#### Step 38：同调管理 + 临时卡清理（~3 天）

**改动范围**：
- 物品卡同调勾选：检查上限 3 件，超出时提示
- 同调物品的 BUFF 效果仅在同调勾选后生效
- 临时 BUFF 卡清理规则：
  - 持续时间 < 1 小时 → 短休清除
  - 持续时间 < 8 小时 → 长休清除
- `cardEngine.js`：`cleanupTemporaryCards(cards, restType)`

---

### Phase 5：卡槽架构 — 清理层（Phase D）

> 目标：移除旧存储，全局兼容确认。

#### Step 39：移除旧存储 + 全局兼容（~3 天）

**改动范围**：
- 移除 `char.selectedFeats[]` 直接读取 → 从 cards[] 过滤 cardType='feat'
- 移除 `char.buffs[]` 直接读取 → 从 cards[] 过滤 cardType='buff'
- 移除 `char.shields[]` → 从 cards[] 过滤 cardType='item' + itemType='shield'
- 移除 `char.classFeatureChoices{}` → 从卡片 metadata 读取
- 保留 `migrateToCards()` 作为旧存档兼容入口
- 全局搜索替换所有旧字段引用

---

### Phase 6：养成系统

> 依赖卡槽架构完成后的统一数据模型。

#### Step 40：角色创建向导（~5 天）

7 步引导：基本信息 → 种族（生成种族卡）→ 职业（生成职业卡）→ 属性 → 背景（生成背景卡+内嵌专长卡）→ 装备（生成物品卡）→ 确认。

**依赖**：Step 14, 16, 26。

---

#### Step 41：升级引导系统（~5 天）

升级时自动提示：属性提升/新专长（新专长卡）/新法术/新职业特性（新职业卡）/新主动技能。

**依赖**：Step 29（职业卡迁移）。

---

#### Step 42：商店系统（~5 天）

DM 设定商店库存，玩家浏览/购买/出售 → 物品生成 ItemCard 进入背包。

---

#### Step 43：战利品分配（~3 天）

战斗结束 → DM 录入掉落 → 分配方式 → 自动分配（生成 ItemCard）。

---

### Phase 7：日志系统

#### Step 44：日志系统基础（~5 天）

五种日志类型 + 数据模型 + 存储 + 页面 UI。

---

### Phase 8：DM 编辑体系

> 卡槽架构完成后，DM 通过权限系统直接管理卡片。

#### Step 45：DM 编辑模式框架 + 权限系统（~5 天）

统一编辑开关 + 权限控制（玩家/DM/系统） + 编辑态 UI 基础设施。

#### Step 46：DM 编辑 — 职业卡/专长卡管理（~5 天）

编辑模式下创建/修改职业卡和专长卡模板，设置前置条件。

#### Step 47：DM 编辑 — 物品卡/武器/法术管理（~4 天）

编辑模式下创建物品卡（设置类型/稀有度/同调/BUFF 效果）。

#### Step 48：DM 编辑 — 种族卡/背景卡/怪物管理（~4 天）

#### Step 49：房规可视化开关（~3 天）

---

### Phase 9：数据持久化 + 高级功能

#### Step 50：数据持久化加固（~5 天）

自动备份 + 数据导出/导入。

#### Step 51：版本历史 + 离线模式（~7 天）

角色数据变更历史 + Service Worker。

#### Step 52：野兽/生物库用户录入（~4 天）

#### Step 53：召唤系统（~5 天）

#### Step 54：3D 骰子动画优化（~3 天）

---

## 四、实施路线图总览

| 阶段 | 步骤 | 内容 | 预估工期 | 依赖 |
|------|------|------|---------|------|
| **已完成** | 1-3, 7-8, 9-12 | BUFF 精简/筛选/组件化/主动技能/全职业 BUFF | — | — |
| **Phase 1** | 13 | BuffForm UX 优化 | 3 天 | 无 |
| | 14-15 | 种族数据表 + BUFF | 6 天 | 无 |
| | 16-17 | 背景数据表 + BUFF + 武器精通 | 5 天 | 14-15 |
| | 18-19 | 战斗弹窗拆分 + 武器攻击重构 | 7 天 | 无 |
| | 20-21 | 法术位追踪 + 战斗日志 | 6 天 | 19 |
| | 22-27 | 专注/灵感/视觉/战斗动作/短休/属性/材料 | 20 天 | 14 |
| **Phase 2** | 28 | BaseCard 模型 + 卡类型定义 + 迁移引擎 | 5 天 | 无 |
| | 29-30 | 职业卡迁移 + 专长卡迁移（半/全） | 6 天 | 28 |
| | 31-33 | 种族卡/背景卡/物品卡/BUFF卡迁移 | 8 天 | 28, 14-16 |
| **Phase 3** | 34-35 | 卡槽区域 + 5 种卡片样式渲染器 | 8 天 | 28-33 |
| | 36 | BUFF 编辑器统一入口 | 3 天 | 34-35 |
| **Phase 4** | 37-38 | 卡槽拖放 + 同调管理 + 临时卡清理 | 7 天 | 34-36 |
| **Phase 5** | 39 | 移除旧存储 + 全局兼容 | 3 天 | 28-38 |
| **Phase 6** | 40-43 | 角色创建/升级引导/商店/战利品 | 18 天 | Phase 5 |
| **Phase 7** | 44 | 日志系统 | 5 天 | 无 |
| **Phase 8** | 45-49 | DM 编辑体系 + 权限系统 | 21 天 | Phase 5 |
| **Phase 9** | 50-54 | 持久化/生物库/召唤/骰子优化 | 24 天 | 视具体步骤 |

**推荐执行顺序**（按跑团周期）：

- **第 1-2 周**：Step 13-17（BUFF UX + 种族/背景体系）→ 角色构建立刻完整
- **第 3-4 周**：Step 18-21（战斗 UI 重构）→ 战斗中可直接用
- **第 5-6 周**：Step 22-27（专注/视觉/战斗动作/短休等）→ 战斗规则补全
- **第 7-9 周**：Step 28-39（卡槽架构全 4 阶段）→ 统一地基完成
- **第 10-13 周**：Step 40-49（养成 + DM 编辑 + 权限）→ 功能全面
- **第 14-18 周**：Step 50-54（持久化 + 高级功能）→ 长期保障

每个 Step 独立可部署，不影响现有功能。

---

## 五、设计约束

### 5.1 卡-槽严格匹配

职业卡只能插入职业卡槽，专长卡只能插入专长卡槽，以此类推。类型不匹配时拖放拒绝。

### 5.2 职业卡系统锁定

`locked: true` 的职业卡由系统自动管理。升级时新增，降级时移除。玩家不可手动删除。

### 5.3 专长前置条件

专长卡插入专长槽时自动检查：minLevel / requiredClass / requiredFeat。不满足条件时卡片灰显。

### 5.4 背景卡内嵌专长

背景卡可嵌入 1 张专长卡。嵌入的专长卡遵循所有专长卡规则（前置条件/BUFF/属性加值）。

### 5.5 同调上限

物品卡同调勾选上限 3 件。超出时系统拒绝并提示。同调物品的 BUFF 仅在同调后生效。

### 5.6 DM 补丁优先级

DM 对卡片的补丁 (`dmPatch`) 优先级最高：DM patch > 卡片自身 effects > 硬编码默认。

### 5.7 权限分层

玩家只能操作自己角色的卡。DM 可创建全局模板、覆盖效果、控制可见性。系统自动推导 locked 卡。

### 5.8 向后兼容

迁移引擎 `migrateToCards()` 必须处理所有旧格式角色数据。未迁移的角色仍可正常加载和使用。

### 5.9 性能约束

`char.cards[]` 预期长度 20-50 张。渲染和计算不应产生可感知的延迟。
