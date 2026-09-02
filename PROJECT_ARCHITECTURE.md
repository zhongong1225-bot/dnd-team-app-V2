# D&D Team App — 项目架构日志

> 本文档是项目的核心参考手册。无论在哪台设备开发，读完本文档即可理解整个系统的数据构成、计算管线和扩展方式。
>
> 功能蓝图与阶段规划请参阅 [MASTER_PLAN.md](./MASTER_PLAN.md)。
>
> 最后更新：2026-08-26

---

## 一、技术栈与部署

- **框架**：React 18 + Vite 5
- **样式**：Tailwind CSS 3（深色主题 #141b27 + 金色 #c79a42）
- **路由**：React Router v6（lazy loading）
- **后端**：Supabase（可选，无环境变量时回退 localStorage）
- **部署**：Vercel，生产地址 https://dnd-team-app-v3.vercel.app
- **最大宽度**：1180px，响应式，无横向滚动
- **语言**：全中文 UI

---

## 二、目录结构总览

```
src/
├── main.jsx                    # 入口：AuthProvider > ModuleProvider > App
├── App.jsx                     # 路由 + lazy loading
├── config/version.js           # APP_VERSION = '3.0.0'
├── contexts/
│   ├── AuthContext.jsx         # 基于名字的身份认证（非 Supabase Auth）
│   ├── ModuleContext.jsx       # 战役模块管理 + Realtime 同步
│   └── RollContext.jsx        # 骰子弹窗状态
├── data/                       # ★ 静态数据定义（系统的"字典"）
│   ├── buffTypes.js            # ★★ 核心：所有 BUFF 效果类型定义（1036行）
│   ├── classDatabase.js        # 12+ 职业数据（特性、子职、施法）
│   ├── classResourceRules.js   # 职业资源规则（怒气、气点、法术位等）
│   ├── classFeatureDefaultBuffs.js  # 职业特性默认 BUFF 回退
│   ├── classFeatureChoiceRegistry.js # 选择型职业特性注册表
│   ├── featDefaultBuffs.js     # 专长默认 BUFF 回退
│   ├── featBuffChoices.js      # 专长选择型效果 schema
│   ├── feats.js                # 专长定义列表
│   ├── spellDatabase.js        # 法术数据库
│   ├── itemDatabase.js         # 物品模板库
│   ├── weaponDatabase.js       # 20 种标准武器
│   ├── creatureLibrary.js      # 生物变身数据库
│   ├── dndSkills.js            # 19 个技能定义
│   ├── fightingStyles.js       # 10 种战斗风格
│   ├── eldritchInvocations.js  # 27 个魔契师祈唤
│   ├── currencyConfig.js       # 货币汇率
│   └── ...
├── lib/                        # ★ 工具函数与存储层
│   ├── formulas.js             # ★ 核心数学（AC、HP、ability mod、buff 值求值）
│   ├── characterStore.js       # 角色 CRUD（Supabase / localStorage 双模式）
│   ├── combatState.js          # 调谐系统
│   ├── equipmentLayers.js      # 三层护甲 + 盾牌
│   ├── encumbrance.js          # 负重规则
│   ├── defaultBuffPatchStore.js # DM 默认 BUFF 补丁存储
│   ├── buffSourceKind.js       # BUFF 来源分类
│   ├── warehouseStore.js       # 团队仓库
│   ├── moduleStore.js          # 战役模块
│   ├── pasteParser.js          # 粘贴/导入解析器
│   ├── realtimeSync.js         # Supabase Realtime 通道
│   └── effects/
│       ├── effectMapping.js    # ★★ 核心：效果统一提取 + 合并管线
│       ├── effectModel.js      # 效果模型类型定义
│       └── index.js            # re-export
├── hooks/
│   ├── useBuffCalculator.js    # ★★ 核心：BUFF 计算引擎（964行）
│   ├── useCombatState.js       # 调谐状态 hook
│   └── useEncumbrance.js       # 负重 hook
├── components/                 # UI 组件
│   ├── CombatStatus.jsx        # ★ BUFF 状态面板（5055行，最大组件）
│   ├── BuffForm.jsx            # ★ BUFF 编辑器（3906行）
│   ├── BuffListItem.jsx        # 单条 BUFF 展示
│   ├── BuffManager.jsx         # BUFF 列表管理
│   ├── EquipmentAndInventory.jsx # 装备 + 背包（2337行）
│   ├── ThreeDiceOverlay.jsx    # 3D 骰子（matter-js + three.js）
│   ├── BottomNav.jsx           # 底部导航
│   └── ...
└── pages/
    ├── CharacterSheet.jsx      # ★ 角色主页（2887行）
    ├── Warehouse.jsx           # ★ 团队仓库页（3065行）
    ├── Characters.jsx          # 角色列表
    ├── Spells.jsx              # 法术浏览
    └── ...
```

---

## 三、角色数据模型（Character Schema）

角色是整个系统的中心数据结构，存储在 localStorage（`starlight_characters`）或 Supabase（`characters` 表）。

### 3.1 身份信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string (UUID) | 唯一标识 |
| `owner` | string | 角色所属玩家名 |
| `moduleId` | string | 所属战役模块 |
| `name` | string | 角色名 |
| `cardType` | string | `'main'` / `'class_template'` / `'creature_template'` |

### 3.2 职业与等级

| 字段 | 类型 | 说明 |
|------|------|------|
| `class` | string | 主职业名（中文） |
| `subclass` | string | 子职名 |
| `classLevel` | number | 主职业等级 |
| `multiclass` | Array | 兼职 `[{class, level, subclass?}]` |
| `prestige` | Array |  prestige 职业 `[{class, level}]` |
| `level` | number | 总等级（计算值） |
| `xp` | number | 经验值 |
| `storyLevel` | number? | DM 设定的剧情等级（覆盖 XP） |

### 3.3 六维属性

```js
abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
```

### 3.4 战斗状态

| 字段 | 类型 | 说明 |
|------|------|------|
| `hp` | `{current, max, temp}` | 生命值 |
| `conditions` | string[] | 活跃状态（中毒、魅惑等） |
| `exhaustionLevel` | number | 力竭等级（0-6） |
| `deathSaves` | `{success, failure}` | 死亡豁免 |

### 3.5 技能与豁免

| 字段 | 类型 | 说明 |
|------|------|------|
| `savingThrows` | `{str:false, dex:false, ...}` | 豁免熟练 |
| `skills` | `{acrobatics: 'prof', ...}` | 技能熟练度（`none`/`half`/`prof`/`expertise`） |
| `proficiencies` | `{weapons:[], tools:[], armors:[], languages:[]}` | 基础熟练 |

### 3.6 专长 / 祈唤 / 战斗风格

| 字段 | 类型 | 说明 |
|------|------|------|
| `selectedFeats` | Array | `[{featId, slotId?, level?, sourceClass?}]` |
| `selectedFightingStyles` | Array | `[{styleId, sourceFeatureId}]` |
| `selectedInvocations` | Array | `[{invocationId, invocationBuffPatch?}]` |

### 3.7 职业特性选择

```js
classFeatureChoices: { [featureId]: optionId }
// 例：{ primal_order: 'spellschool', elemental_fury: 'forceful' }
```

### 3.8 BUFF 列表

```js
buffs: [{
  id: string,
  name: string,
  source: string,          // 来源标签
  effects: [effect, ...],  // ★ 附魔效果数组
  enabled: boolean,
  duration: string?,
  sourceKind: string?,     // feat / equipment / temporary / class_race / adventure
  // ... 其他元数据
}]
```

### 3.9 装备与背包

| 字段 | 说明 |
|------|------|
| `equippedHeld` | 手持装备 `[{id, inventoryId}]`（mainHand, offHand, backup1-4） |
| `equippedWorn` | 穿戴装备 `[{id, inventoryId}]`（innerRobe, bodyArmor, outerRobe, shield） |
| `inventory` | 所有物品条目数组 |
| `wallet` | 货币余额 |
| `bagOfHoldingModules` | 次元袋存储模块 |

### 3.10 法术与资源

| 字段 | 说明 |
|------|------|
| `spells` | 已知/准备法术 |
| `spellSlots` / `spellSlotsMax` | 法术位 |
| `classResources` | 职业资源（怒气、气点等）`[{resourceKey, name, current, max, recovery}]` |

---

## 四、BUFF 效果系统（核心机制）

BUFF 系统是本应用的"中枢神经"，连接所有数据来源到最终角色数值。

### 4.1 效果数据形状

每个附魔效果（effect）的标准结构：

```js
{
  effectType: string,    // 如 'skill_bonus', 'damage_bonus'
  category: string,      // 如 'ability', 'offense', 'defense'
  scope: string,         // 如 'global', 'melee_attack', 'druid_cantrip'
  scopeDetail: [],       // 范围的详细参数
  value: any             // 数值 / 公式对象 / 文本
}
```

### 4.2 十大效果分类（BUFF_TYPES）

定义在 `src/data/buffTypes.js`：

| 分类 | 颜色 | 包含效果 |
|------|------|----------|
| **ability** | 金色 | ability_score, ability_override, ability_score_uncapped, skill_bonus, save_bonus, adv_skill, adv_save, initiative_buff, extra_attunement_slots |
| **offense** | 红色 | attack_bonus, damage_bonus, attack_damage_bonus, attack_distance_range, attack_area, damage_piercing_traits, crit_range_expand, crit_extra_dice, extra_damage_dice, infinite_ammo, spell_ability_attack |
| **defense** | 橙色 | ac_bonus, armor_override, resist_type, immune_type, vulnerable_type, damage_reduction, max_hp_bonus, temp_hp, regeneration, condition_immunity, death_ward |
| **mobility_casting** | 紫色 | base_speed_increment, terrain_ignore, concentration_save_enhance, spell_range_extension, spell_attack_bonus, save_dc_bonus, spell_damage_bonus 等 |
| **active_release** | 青色 | charge_item（充能触发） |
| **container** | 绿色 | item_storage（次元袋等） |
| **proficiency** | 青色 | specific_tool_proficiency, instrument_proficiency, armor_proficiency, weapon_proficiency, language_proficiency, vehicle_proficiency, weapon_mastery |
| **transformation** | 粉色 | creature_transform（荒野变形/变形术） |
| **choice** | 紫色 | choice（玩家选择型效果） |
| **custom** | 灰色 | custom_condition（纯文字描述，不参与计算） |

### 4.3 范围（Scope）系统

决定一个效果在什么条件下生效：

| scope | 含义 |
|-------|------|
| `global` | 全局生效 |
| `self_weapon` | 仅特定武器 |
| `physical_attack` | 物理攻击 |
| `melee_attack` | 近战攻击 |
| `ranged_attack` | 远程攻击 |
| `natural_weapon` | 天生武器 |
| `creature_type` | 对特定生物类型 |
| `damage_type` | 特定伤害类型 |
| `weapon_category` | 特定武器类别 |
| `druid_cantrip` | 德鲁伊戏法 |
| `weapon_or_beast` | 武器攻击或野兽形态攻击 |
| `custom` | 自定义 |

`scopeMatchesCombatMean(scope, ctx)` 是核心匹配函数——判断某个范围的效果是否适用于当前攻击上下文。

### 4.4 值的公式系统

`value` 字段支持两种格式：

**直接数值**：`4.5`（如 damage_bonus 的平均值）

**公式对象**：通过 `evaluateBuffValue(value, context)` 求值
```js
{
  ref: 'abilityModifier',  // 引用类型
  ability: 'wis',          // 指定属性（部分 ref 需要）
  mult: 2,                 // 乘数（默认 1）
  add: 0,                  // 加数（默认 0）
  min: 1                   // 最低值（可选）
}
```

支持的 `ref` 值：
- `abilityModifier` — 属性调整值
- `abilityScore` — 属性原始值
- `proficiency` — 熟练加值
- `level` — 总角色等级
- `classLevel` — 特定职业等级（需 `className`）
- `spellDc` — 法术 DC
- `spellAttack` — 法术攻击加值
- `speed` — 基础速度

---

## 五、数据流与计算管线

这是理解"一个 BUFF 如何影响角色数值"的完整链路。

### 5.1 效果来源（6 大类）

```
1. 手动 BUFF（character.buffs[]）—— DM/玩家直接在 BUFF 编辑器创建
2. 专长（character.selectedFeats）—— 通过 effectMapping 自动生成虚拟 BUFF
3. 魔契祈唤（character.selectedInvocations）—— 同上
4. 战斗风格（character.selectedFightingStyles）—— 同上
5. 职业特性（通过 getAvailableFeatures 获取）—— 同上
6. 装备物品（equippedHeld + equippedWorn 中的已调谐物品）—— 同上
```

### 5.2 效果优先级

每个来源（专长/祈唤/战斗风格/职业特性）的效果解析优先级：

```
个人 DM 补丁（featBuffPatch / defaultBuffPatch）
  > 模块级 DM 默认配置（loadDefaultBuffPatch）
    > 代码硬编码回退（featDefaultBuffs / classFeatureDefaultBuffs）
      > 无效果
```

### 5.3 合并顺序

`getMergedBuffsForCalculator()` 按以下顺序合并所有来源：

```
装备效果 → 专长 → 祈唤 → 战斗风格 → 职业特性 → 手动 BUFF
```

### 5.4 效果展开

`getFlatEffectEntries()` 将合并后的 BUFF 列表展平为计算器可消费的格式：

```
对每个 BUFF：
  1. getEffectsFromBuff() → 提取效果数组（兼容新旧格式）
  2. migrateProficiencyTextToArray() → 迁移旧文本格式
  3. normalizeEffectCategory() → 规范化分类名
  4. 特殊处理 choice 类型：展开选中选项的子效果
  5. 跳过 enabled === false 的 BUFF
  6. 保留 scope / scopeDetail / itemInventoryId 供条件匹配
```

### 5.5 计算管线（computeBuffStats）

`useBuffCalculator.js` 中的 `computeBuffStats()` 是纯函数计算引擎，分多个 pass 处理：

```
Pass 0: 检测 creature_transform（变身效果，只取第一个，不叠加）
  → 荒野变形模式自动设置：keepAbilities=[int,wis,cha]
  → AC = max(野兽AC, 13+WIS调整值)
  → HP = 保留原HP + 临时HP（德鲁伊等级×1，月亮结社×3）

Pass 0.5: 确定基础属性
  → 有变身：用生物属性，覆盖保留属性
  → 无变身：用角色原始属性

Pass 1: 属性解析
  → ability_override → 设定绝对基础值
  → ability_score_uncapped → 加值（通常上限20，break20时上限30）
  → ability_score → 授予豁免熟练

Pass 2: 攻击/伤害加值
  → 分离全局 vs 范围效果
  → attack_bonus / damage_bonus 全局部分 → attackAll / dmgAll
  → 范围效果留给 CombatStatus 按攻击匹配

Pass 3: 优势/劣势
  → 按类别追踪：melee, ranged, save, skill
  → 状态效果：中毒→近战/远程/技能劣势，等

Pass 4: AC 计算
  → 优先级：creature_transform > armor_override > getAC(装备)
  → ac_bonus 叠加

Pass 5: HP
  → temp_hp：取最大值（不叠加）
  → max_hp_bonus：求和
  → regeneration：求和

Pass 6: 抗性/免疫/易伤
  → 收集 resist_type / immune_type / vulnerable_type 数组

Pass 7: 速度、先攻、DC、法术攻击、专注等

Pass 8: 力竭与状态效果
  → D&D 2024 力竭规则：d20 惩罚 = -2×等级，速度惩罚 = 5×等级
```

### 5.6 计算结果

返回 `buffStats` 对象，被 CombatStatus、CharacterSheet 等组件消费：

```js
{
  abilities: { str, dex, con, int, wis, cha },
  ac, acBonus,
  tempHp, maxHpBonus, regeneration,
  meleeAttackBonus, rangedAttackBonus,
  meleeDamageBonus, rangedDamageBonus,
  attackAll, dmgAll,           // 全局加值
  initBonus, speedBonus,
  saveBonusPerAbility: { str, dex, ... },
  skillBonusPerSkill: { acrobatics, ... },
  saveDcBonus, spellAttackBonus,
  spellDamageBonuses: [...],
  resistTypes: [], immuneTypes: [], vulnerableTypes: [],
  advantage: { melee, ranged, save, skill },
  creatureTransform: Object|null,
  // ... 更多
}
```

---

## 六、文件职责地图

### 6.1 核心文件（改动影响面最大）

| 文件 | 行数 | 职责 | 改动影响 |
|------|------|------|----------|
| `buffTypes.js` | 1036 | 所有效果类型字典 | 新增效果类型必须改这里 + scopeMatchesCombatMean + BuffForm + useBuffCalculator |
| `effectMapping.js` | 601 | 效果提取与合并管线 | 改这里影响所有数据来源的收集 |
| `useBuffCalculator.js` | 964 | 计算引擎 | 改这里影响所有数值展示 |
| `CombatStatus.jsx` | 5055 | BUFF 状态面板 | 改这里影响 BUFF 展示和资源管理 |
| `BuffForm.jsx` | 3906 | BUFF 编辑器 | 改这里影响 BUFF 创建/编辑 |
| `formulas.js` | 523 | 核心数学 | evaluateBuffValue 被全局使用 |
| `classDatabase.js` | 2000+ | 职业数据 | 新增职业必须改这里 |

### 6.2 数据文件

| 文件 | 职责 |
|------|------|
| `featDefaultBuffs.js` | 专长默认效果回退 |
| `classFeatureDefaultBuffs.js` | 职业特性默认效果回退（目前仅德鲁伊） |
| `classFeatureChoiceRegistry.js` | 选择型特性注册（目前仅德鲁伊 2 个） |
| `classResourceRules.js` | 职业资源规则（怒气/气点/法术位等） |
| `feats.js` | 专长定义列表 |
| `spellDatabase.js` | 法术数据库 |
| `itemDatabase.js` | 物品模板库 |
| `weaponDatabase.js` | 标准武器库 |
| `creatureLibrary.js` | 变身生物数据库 |
| `dndSkills.js` | 19 个技能定义 |
| `fightingStyles.js` | 10 种战斗风格 |
| `eldritchInvocations.js` | 27 个魔契祈唤 |
| `featBuffChoices.js` | 专长选择型效果 schema |
| `currencyConfig.js` | 货币汇率 |

### 6.3 存储层文件

| 文件 | 职责 |
|------|------|
| `characterStore.js` | 角色 CRUD（Supabase / localStorage 双模式） |
| `defaultBuffPatchStore.js` | DM 默认 BUFF 补丁 |
| `warehouseStore.js` | 团队仓库 |
| `moduleStore.js` | 战役模块 |
| `moduleSnapshotStore.js` | 自动备份快照 |
| `moduleArchiveStore.js` | 模块归档/恢复 |
| `currencyStore.js` | 团队金币池 |
| `realtimeSync.js` | Supabase Realtime 通道 |

---

## 七、关键设计模式

### 7.1 双模式存储

所有存储层遵循同一模式：
```js
if (isSupabaseEnabled()) → Supabase CRUD
else → localStorage CRUD
```

### 7.2 虚拟 BUFF

专长、祈唤、战斗风格、职业特性不直接存储在 `character.buffs` 中，而是在计算时由 `effectMapping.js` 动态生成"虚拟 BUFF"。这些虚拟 BUFF 不出现在 BUFF 状态栏，但它们的效果参与计算。

DM 可以通过 `defaultBuffPatchStore` 为任何专长/职业特性配置自定义效果，覆盖硬编码回退。

### 7.3 三层护甲

装备系统支持三层穿戴：
- 内袍（innerRobe）
- 护甲（bodyArmor）
- 外袍（outerRobe）
- 盾牌（shield）

每层只能装备一件物品。AC 计算综合所有层。

### 7.4 战役模块系统

团队通过"模块"（module）共享数据。每个模块包含：
- 角色列表
- 团队仓库
- 房屋规则
- 金币池
- DM BUFF 补丁
- 快照备份

### 7.5 选择型 BUFF 数据形状

选择型效果（如原初职能：术师/卫士）的特殊数据结构：

```js
{
  choiceOptions: [
    { name: '术师', effects: [{ effectType: 'skill_bonus', ... }] },
    { name: '卫士', effects: [{ effectType: 'weapon_proficiency', ... }] }
  ],
  choiceSelected: 0  // 选中的选项索引
}
```

`getFlatEffectEntries()` 会展开 `choiceOptions[choiceSelected].effects` 注入计算管线。

---

## 八、扩展指南

### 8.1 新增一个效果类型

1. **`buffTypes.js`**：在对应分类的 `effects[]` 中添加 `{ key, label, dataType }`
2. **`scopeMatchesCombatMean()`**：如果新效果需要范围匹配，添加对应逻辑
3. **`useBuffCalculator.js`**：在 `computeBuffStats()` 中添加处理 pass
4. **`BuffForm.jsx`**：如果需要特殊编辑器，添加对应的 UI 组件
5. **`CombatStatus.jsx`**：如果需要特殊展示，添加渲染逻辑

### 8.2 新增一个职业

1. **`classDatabase.js`**：在 `CLASS_DATA` 中添加职业条目（hitDice, features, subclasses）
2. **`classResourceRules.js`**：在 `RESOURCE_RULES` 中添加职业资源规则
3. **`classFeatureDefaultBuffs.js`**：为有数值收益的特性添加默认 BUFF 效果
4. **`classFeatureChoiceRegistry.js`**：如有选择型特性，注册到选择表

### 8.3 新增一个专长

1. **`feats.js`**：在 `FEATS` 数组中添加定义
2. **`featDefaultBuffs.js`**：在 `HARDCODED_FEAT_BUFFS` 中添加默认效果
3. **`featBuffChoices.js`**：如果专长包含选择（如 ASI），添加 schema

### 8.4 新增一个选择型职业特性

1. **`classFeatureChoiceRegistry.js`**：注册选项和 `getEffects(optionId)`
2. **`classFeatureDefaultBuffs.js`**：添加 `cond()` 文字描述作为未选择时的回退
3. `CharacterSheet.jsx` 的 `ClassFeatureChoiceBlock` 会自动渲染选择 UI

### 8.5 新增一个 scope 类型

1. **`buffTypes.js`**：在 `SCOPE_KIND` 中添加定义
2. **`SCOPE_KIND_OPTIONS`**：添加下拉选项
3. **`scopeMatchesCombatMean()`**：添加匹配逻辑
4. **`formatScopeBrief()`**：添加展示文本

---

## 九、设计约束与已知坑

### 9.1 效果系统约束

- **damage_bonus 是固定数值加成**（如 +5），不支持骰子记号。需要额外骰子伤害时使用 `extra_damage_dice`（如 `{ plus: '2d10', type: '光耀' }`），每次攻击实际掷骰
- **BUFF 系统只能表达被动永久效果**。无法表达"每回合一次"或"仅变身期间"等条件限制
- **条件性/主动性效果**应使用 `custom_condition` 纯文字描述，不参与数值计算
- **creature_transform 不叠加**：多个变身 BUFF 只取第一个有效的

**伤害相关效果类型区分：**

| 效果类型 | 作用 | 是否掷骰 | 适用场景 |
|----------|------|----------|----------|
| `damage_bonus` | 固定数值加成（如 +5） | 否 | 武器伤害固定加值 |
| `extra_damage_dice` | 额外伤害骰（如 2d10） | 是 | 月辉形态、原力蛮击等额外子伤害 |
| `spell_damage_bonus` | 法术伤害加成 | extraDice 部分掷骰 | 法术伤害增强（支持每骰加值、额外骰子、固定加值） |

### 9.2 选择型特性的数据流（已修复）

**问题**：`getBuffsFromClassFeatures()` 对选择型特性返回扁平效果数组，BUFF 编辑器无法展示/编辑各选项效果。

**解决方案**：`getBuffsFromClassFeatures()` 检测到 `CLASS_FEATURE_CHOICE_REGISTRY` 中的特性时，将效果包装为 `choice` 类型结构：

```js
effects = [{
  effectType: 'choice',
  category: 'custom',
  scope: 'global',
  scopeDetail: [],
  value: {
    choiceOptions: [
      { name: '术师', effects: [custom_condition描述 + skill_bonus效果] },
      { name: '卫士', effects: [custom_condition描述 + proficiency效果] },
    ],
    choiceSelected: 0,  // 玩家当前选择的索引
  },
}]
```

**数据流**：
1. `getBuffsFromClassFeatures()` → 生成 choice 结构虚拟 BUFF
2. BUFF 编辑器 → 检测 `subSelect: 'choice'` → 渲染 `ChoiceBUFFEditor`（DM 可查看/编辑每个选项效果）
3. `getFlatEffectEntries()` → 展开 `choiceOptions[choiceSelected].effects` → 注入计算器
4. 每个选项的 `getEffects()` 自动包含 `custom_condition` 描述文本

**优先级**：选项级 DM 补丁 > 注册表硬编码效果。特性级 DM 补丁保持扁平格式（向后兼容）。

### 9.3 职业特性 BUFF 覆盖不全

**当前状态**：`classFeatureDefaultBuffs.js` 仅有德鲁伊 14 个特性条目。其余 11+ 职业全部为空。大量有数值收益的职业特性（如野蛮人的无甲防御 +10 速度、吟游诗人的万事通、战士的改进暴击等）缺少真实 BUFF 效果。

### 9.4 公式值 ref 对照表

| ref 值 | 含义 | 需要的额外字段 |
|--------|------|----------------|
| `abilityModifier` | 属性调整值 | `ability` |
| `abilityScore` | 属性原始值 | `ability` |
| `proficiency` | 熟练加值 | 无 |
| `level` | 总等级 | 无 |
| `classLevel` | 职业等级 | `className` |
| `spellDc` | 法术 DC | `ability` |
| `spellAttack` | 法术攻击 | `ability` |
| `speed` | 基础速度 | 无 |

### 9.5 熟练效果数组格式

熟练类效果（乐器/工具/语言/武器精通）使用 `proficiencyChecklist` 数组格式：
```js
{
  effectType: 'weapon_proficiency',
  value: { proficiencyChecklist: ['martial'] }
}
```

旧文本格式通过 `migrateProficiencyTextToArray()` 自动迁移。

---

## 十、组件层级关系

```
Layout (RollProvider + max-w 容器)
├── BottomNav（底部导航）
├── Dashboard（首页）
├── Characters → CharacterSheet（角色主页，lazy）
│   ├── CharacterSheetTopBar（角色头部信息）
│   ├── AbilityModule（六维属性）
│   ├── ClassFeatureChoiceBlock（选择型特性 UI）
│   ├── CombatStatus（BUFF 状态面板）★
│   │   ├── BuffListItem（每条 BUFF）
│   │   │   └── BuffForm（BUFF 编辑器，弹窗）★
│   │   └── BuffManager（BUFF 管理）
│   ├── EquipmentAndInventory（装备 + 背包）★
│   │   ├── CharacterInventory（物品列表）
│   │   ├── ItemAddForm（添加/编辑物品）
│   │   └── BagOfHoldingPanel（次元袋）
│   ├── MagicCraftingPanel（魔法物品制作）
│   └── CharacterSpells（法术列表）
├── Warehouse（团队仓库）★
├── Spells（法术浏览）
├── HouseRules（房屋规则）
├── DataMaintain（数据维护）
├── ModuleLibrary（模块库）
├── CreatureLibraryManager（生物库管理）
└── ThreeDiceOverlay（3D 骰子，Portal）
```

---

## 十一、构建与部署

```bash
# 本地开发
npm run dev          # Vite dev server, port 5173

# 本地构建
npm run build        # 输出到 dist/

# 部署到 Vercel
vercel --prod        # 或 git push 触发自动部署
```

环境变量（可选）：
- `VITE_SUPABASE_URL` — Supabase 项目 URL
- `VITE_SUPABASE_ANON_KEY` — Supabase 匿名 key
- 未设置时自动回退 localStorage 模式

---

## 十二、待办与改进方向

### 高优先级

1. **修复选择型特性 BUFF 数据流** — 让选项效果在 BUFF 编辑器中可见可编辑
2. **补全德鲁伊缺失的真实 BUFF 效果** — 元素神威（+300尺射程、2d8伤害）等
3. **逐步扩展其他职业的 BUFF 效果** — 优先常用职业（野蛮人、战士、武僧等）

### 设计原则

所有数值增益（无论来自专长、武器、职业特性还是种族特性）必须：
1. 配置为 BUFF 编辑器里的真实附魔效果
2. 出现在 BUFF 状态栏中
3. 参与角色数值计算
4. DM 可通过页面直接修改
