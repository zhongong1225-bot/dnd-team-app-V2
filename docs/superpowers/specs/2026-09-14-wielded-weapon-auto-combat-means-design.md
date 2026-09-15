# 战斗手段：手持武器自动派生 + 释放流程统一

日期：2026-09-14
状态：待审阅
范围：单个实现计划可容纳。分为"引擎能力"与"接线改造"两组工作，可分次部署。

---

## 一、问题

战斗手段区要求玩家为每一把想用的武器手动建一张卡，并且卡用**背包数组下标**（`weaponInventoryIndex`）定位武器。三个后果：

1. 拿到新武器必须手动配卡，否则没有攻击入口。
2. 背包重组、物品增删导致下标漂移，卡会指向错误的武器；`CombatStatus.jsx:3049` 在下标失效时整卡不渲染，表现为"卡莫名消失"。
3. 卡上的自动增益是一份**写盘的快照**，与 BUFF 栏存在时间差。

对照项目"单向线下工具"的使用模型（AGENTS.md 第一节），玩家侧工具该做的是"把当前手里握的东西立刻可投"，而不是让人维护配置表。

## 二、目标与非目标

**目标**

- 武器卡从装备派生，不配置即可用；换武器、背包重组、存档重载都不出错。
- 卡上所有数值实时反映 BUFF 栏（含已上身的临时 BUFF）。
- 攻击释放流程与主动技能释放流程统一为同一套五步流，删除输入对手 AC 的环节。
- 命中与伤害的计算符合规则：熟练同时门控命中与伤害加值；副手附赠攻击默认不加属性调整值，可被效果解锁。

**非目标**

- 不做武器换手动作建模（玩家与 DM 口头处理）。
- 不做徒手打击卡。
- 不做多重攻击（Extra Attack）对副手附赠攻击的追加逻辑。
- 不把战斗手段并入 `cardModel` / `cardAdapter` 统一卡模型（独立工程，另立设计）。
- 不迁移存量手动武器卡的配置（决策：全部删净，见第十一节）。

## 三、方案选择

| 方案 | 说明 | 结论 |
|------|------|------|
| A 渲染期派生 | 卡不落库，从装备槽现场算出；玩家配置挂在装备物品条目上 | **采用** |
| B 写回式补齐 | 保留 `combatMeans` 数组，装备变化时自动插入条目 | 否决：产生"派生副本 vs 源"两份数据，需持续对齐，是本项目既有的事故模式 |
| C 并入统一卡模型 | 战斗手段与 BUFF 卡槽合并为一套模型 | 否决：等于重写角色页，超出本需求 |

方案 A 同时天然修掉下标漂移：装备槽记录主手/副手用的本来就是物品唯一编号（`equippedHeld[i].inventoryId`，见 `equipmentSlotUtils.js:77` `buildItemSlotMap`），只有战斗手段卡退化成了数组下标。

## 四、架构：四个部件

```
装备槽 + 背包条目 + 熟练项 + buffStats
        │
        ▼
  [① 派生器]  deriveWieldedWeaponMeans(character, ctx)   ← 纯函数，新文件
        │  读取 [② 物品上的武器配置]
        ▼
  合并：派生武器卡 + combatMeans 中的非物理卡
        │
        ▼
  [③ 渲染层]  WeaponAttackCard（复用）/ 灰卡 / 天生武器卡 / 生物法术卡
        │
        ▼
  [④ 释放流]  AbilityUseModal 五步流（复用）
```

| 部件 | 职责 | 依赖 | 位置 |
|------|------|------|------|
| ① 派生器 | 输入角色数据，输出应显示的武器卡（含可用性、标签、关联物品编号） | 装备槽、`getItemById`、熟练项、`buffStats`（读双持客） | 新增 `src/lib/combatMeans/deriveWieldedWeapons.js` |
| ② 武器配置 | 存某件物品上的玩家个性化设定 | 背包条目 | `entry.combatMeanConfig` |
| ③ 渲染层 | 画卡 | 现有 `COMBAT_MEAN_ROW_GRID` 与卡片组件 | `CombatStatus.jsx` 渲染段 |
| ④ 释放流 | 投命中 → 问 DM → 投伤害 | 现有 `AbilityUseModal` | `AbilityUseModal.jsx` |

派生器不认识 UI、不写任何数据，可独立单测。规则将来扩展（徒手打击、换手建模）只改它。

## 五、派生规则

手持槽不止两个：主手、副手固定（`EquipmentAndInventory.jsx:117` `HELD_LABELS`），玩家可用"＋"追加备用手持位（`EquipmentAndInventory.jsx:588` `addHeldSlot`，槽位 id 形如 `held_<时间戳>`）。派生器**遍历全部手持槽**。

对每个手持槽 `i`，取其 `inventoryId` 对应的背包条目与原型：

| 条件 | 结果 |
|------|------|
| 槽空 | 不出卡 |
| 原型类型为近战武器 / 远程武器 / 枪械 | 出可用卡 |
| 原型类型为法器 | 不出卡（法杖不产生"1d6 钝击"无意义卡；德鲁伊的攻击手段来自施法模块与法术卡） |
| 其他类型（盾牌、弹药等） | 不出卡 |

**槽位标签与动作类型**

| 槽 | 标签 | 动作徽章 |
|----|------|----------|
| `i === 0` | 主手 | 1 动作 |
| `i === 1` | 副手 | 附赠动作 |
| `i >= 2` | 备用 | 1 动作 |

**副手合法性**（仅 `i === 1` 判定）

1. 主手为双手武器（`combatMeanUtils.js:98` `weaponHasTwoHanded`）→ 非法，原因"主手为双手武器，副手被占用"。
2. 副手武器具轻型词条（`combatMeanUtils.js:101` `weaponHasLight`）→ 合法。
3. 副手武器不具双手词条，且角色有"双持客"效果 → 合法。
4. 其余 → 非法，原因"缺少轻型词条，且未获得双持客"。

远程/枪械作副手按 2 处理（手弩具轻型，符合规则）。

**非法副手不出可用卡，而是出一张灰色不可用卡**，附原因文案。灰卡保留占位是有意的：让玩家看清"这身装备为什么不出副手卡"，而不是以为功能坏了。三态（可用 / 灰 / 空）用形状与图标区分，不只靠颜色（既有 UI 约定）。灰卡不显示投骰按钮，命中与伤害列显示 `—`。

**变身状态**：`buffStats.creatureTransform` 生效时，派生器返回空数组。此时战斗手段区只保留变身天生武器卡与生物法术卡。退出变身武器卡自动回来。

**派生卡标识**：`wielded_<i>_<inventoryId>`。必须由槽位序号 + 物品编号确定性拼出，禁止随机数或时间戳——组合技要稳定引用它。

## 六、武器配置存储

存在背包条目上，不写物品原型：

```
entry.combatMeanConfig = {
  nameSuffix: string,
  damageTypeOverride: string,
  versatileMode: 'one_hand' | 'two_hand' | 'ranged' | null,
  extraDamageDice: [],
  targetCreatureType: string,
  disabledAutoGainKeys: string[],
}
```

六项，与现卡可配项一一对应（熟练除外，见第七节），无新增无删减。**不含数值**（`disabledAutoGainKeys` 存的是增益标识，不是增益值）。

- 写：仅玩家在当前角色上操作。不写 `itemDatabase.js` 原型，避免污染全库与其他角色。
- 跟随物品：入仓库、跨角色转移时随条目走（附魔设定属于这把武器）；物品删除时一并消失，不留孤儿。
- 同一把剑在主手与备用位间移动，配置不丢（认物品编号，不认槽位）。
- 自定义武器与内置武器同一条路径。

**删除**：卡上不再有"武器熟练"勾选框（`AddWeaponStep.jsx:101-104`），熟练改由第七节推导。

## 七、熟练与计算规则

**熟练来源**：`char.proficiencies.weapons`——角色页"熟练项设置"里的武器熟练清单，存的是武器原型编号数组（`AbilityModule.jsx:630-665`）。"简易武器""军用武器"两个整组按钮（`AbilityModule.jsx:636-647`）实质是把整组编号批量写入该数组。派生卡判定熟练 = 手持武器的原型编号是否在数组中。

**必须先补的数据缺口**：分组编号清单在代码里写了两遍且都不全——

- `AbilityModule.jsx:30-37` `SIMPLE_WEAPON_IDS` / `MARTIAL_WEAPON_IDS`（按原型编号）
- `buffTypes.js:784-793` `SIMPLE_WEAPON_CATEGORIES` / `MARTIAL_WEAPON_CATEGORIES`（按类别名），`isSimpleWeaponProto` / `isMartialWeaponProto`（`buffTypes.js:796-815`，目前未导出）

战镐、矛、轻剑之外的部分军用武器、火器类未归组。后果是静默的：点了"军用武器"的角色，手里未归组的武器被判不熟练，命中与伤害双双偏低。

**处理**：给武器原型新增 `proficiencyTier`（取值 `simple` / `martial` / `firearm`）字段作为唯一事实源，上述两处清单与两个判定函数改为读它；物品编辑器（`ItemAddForm`）暴露该字段，否则 DM 自制武器无法标注。
**保险**：分级不明的武器一律按熟练处理（宁滥勿缺，不因数据遗漏压低数值）。

**计算规则四条**，全部落在 `combatMeanUtils.js:363` `computePhysicalWeaponStats` 一处，不新增第二套算法：

1. 命中 = 属性调整值 +（熟练时）熟练加值；被 BUFF 归入"专家"的类别熟练加值翻倍（`combatMeanUtils.js:373,435` 已实现）。
2. **不熟练 → 伤害不加属性调整值**。当前未实现（`combatMeanUtils.js:436` 只看攻击模式，不看熟练）。
3. **副手附赠攻击 → 伤害不加属性调整值**，除非有"双武器战斗"效果。前半已实现（`weaponVersatileMode === 'bonus_action'` 置 0），"除非"缺失。
4. 规则原文是"无法加入属性调整值（**除非该调整值为负数**）"——负数不属于被剥夺加值，而是**正常参与计算**。当前实现把这一档硬置 0，等于白送负调整值角色。改为取"置 0"与"加该负值"中更差者，即负数照常扣。

即：

```
canAddAbilityMod = 熟练
                && !(是副手附赠攻击 && 无双武器战斗效果)
damageMod = canAddAbilityMod ? abilityMod
          : Math.min(0, abilityMod)      // 负数仍要加
```

## 八、引擎新增：两个效果类型

本次唯一需要扩展引擎内容的部分（登记进 `buffTypes.js` 效果字典，并在 `useBuffCalculator.js` 的 `computeBuffStats` 中聚合；不改 pass 顺序，挂在既有的速度/DC 那一趟）：

| 效果 | 语义 | 消费方 |
|------|------|--------|
| `two_weapon_fighting_bonus`（**已存在但是孤儿**） | 副手附赠攻击的伤害可加属性调整值 | `computePhysicalWeaponStats` 规则 3 |
| `offhand_ignores_light`（新增） | 副手可持不具有双手词条的单手武器 | 派生器副手合法性判定 3 |

**孤儿效果**：`two_weapon_fighting_bonus` 全项目只出现在 `featDefaultBuffs.js:389`（双持客的默认效果），没有任何代码读它——这张默认 BUFF 挂着但数值上完全不生效。

**归属也要改正**：那条效果是"双武器战斗"战斗风格（`fightingStyles.js:48-52`）的收益；双持客专长原文（`feats.js:146-149`）自己写明额外攻击**不能**加属性调整值，它给的是"可以用非轻型武器"。所以：

- 双持客的默认效果（`featDefaultBuffs.js:377-395`）改为 `offhand_ignores_light`。专长已有代码级默认表，这是一处内容归属纠错。
- 两个效果登记进 `buffTypes.js` 效果字典，登记后**自动出现在效果编辑器**里，无需新 UI。

**"双武器战斗"的收益不需要新建任何文件或回退表**——核实结果：战斗风格的选择器已经挂在职业特性卡上（`CharacterSheet.jsx:2095-2166` `FightingStylesBlock`，按 `sourceFeatureId` 归属到具体职业特性，存 `char.selectedFightingStyles`），并且选择弹窗 `FightingStylePicker.jsx:176-184,206+` 里已经有"配置默认 BUFF（DM）"入口调用效果编辑器，配置按模组绑定、之后选该风格的人自动获得。

所以本次引擎工作只有三件：把 `two_weapon_fighting_bonus` 与 `offhand_ignores_light` 登记进效果字典；在 `computeBuffStats` 里聚合；在 `computePhysicalWeaponStats` 与派生器里消费。DM 侧由你在"双武器战斗 → 配置默认 BUFF"里挂上效果即可，符合"AI 造引擎、DM 填内容"，不产生第二套来源。

若通用编辑器对布尔型效果的输入不够直观，则在 `BuffForm.jsx` 为这两个效果提供专用控件（预期不需要）。

## 九、实时性不变量

**战斗手段卡不持有任何数值快照。** 命中、伤害、额外伤害骰、优势/劣势，一律在渲染那一帧从当前 BUFF 集合现算。BUFF 栏内任意一条（专长、祈唤、战斗风格、职业特性、装备附魔、手动 BUFF、临时栏已应用下来的 BUFF、架势、专注、变身）上身/停用/删除，卡上数字同帧变化，不等任何写回。

- 计入：BUFF 栏中当前生效的一切，包含从"临时 BUFF"栏点"应用"复制到 `char.buffs` 的那些。
- 不计入：临时栏里尚未应用的模板（`buffStash.js`，仅作待用模板）。这一条保持现状。
- 攻击加值在投攻击骰那一瞬现算；伤害加值在投伤害骰那一瞬**重新**现算。两次各自读当前 BUFF，不跨步传递快照。

**要删除的代码**：`CombatStatus.jsx:903-929` 那段把 `buildDefaultGainsFromBuffs` 结果写进 `cm.gains` 并持久化的同步 effect。它存在的唯一理由是维护快照。连带删除 `showAddCombatMeanModal || editingCombatMeanId` 的早退分支——正是它造成"弹窗里预览是新数、弹窗背后卡是旧数"。

**自动增益改为渲染期现算**：每次渲染由 `buffStats` 反推该卡当前应得哪些增益（复用 `buildDefaultGainsFromBuffs`，改为不被持久化调用），再按物品 `combatMeanConfig.disabledAutoGainKeys` 过滤掉玩家关掉的。源 BUFF 消失则条目自然不存在，不产生残值。

## 十、释放流程统一

现有战斗手段点击后的路径与主动技能路径不一致，且违反使用模型：

- 武器卡 / 变身天生武器卡 / 变身生物法术卡点击 → 投 d20 → 弹 `CombatStatus.jsx:3673-3886` 的面板，**要求输入对手 AC**，未命中时 `CombatStatus.jsx:1372` 调 `alert()` 提示。

本项目是玩家侧线下工具，命中与否由线下 DM 裁定（AGENTS.md 第一节）。工具索要 AC 并自行判命中/未命中属于越界。

**统一为主动释放的五步流**（`AbilityUseModal.jsx:6` 注释与 `:1257` step 状态、`:1649-1685` 攻击骰界面）：

> **全局不变量（2026-09-15 用户裁定）**：统一范围覆盖**全部四类战斗手段卡**——武器卡（含派生卡）、法术攻击卡、道具卡、组合技卡——点击释放一律复用 `AbilityUseModal` **同一个弹窗、同一步骤序**，不得再有独立的伤害确认面板，也不得在卡片组件内部自建任何"投攻击→投伤害"的分步界面。组合技卡由它的主手段卡承载释放，因此随主手段一并覆盖。
> 边界：本不变量只管**释放**流程。铅笔打开的是配置编辑器（选武器/选主手段/配增益），与释放弹窗是两回事，不受此约束。
> 推论：后续任务实现某一类卡时，若发现还残留旧面板路径，应一并摘除而不是保留两条入口。

```
prepare → confirm → roll_attack → roll_damage → result
```

`roll_attack` 步投出 d20 后显示"询问 DM：攻击总值 X 是否命中？"，给"未命中"与"命中，投伤害"两个按钮，**没有输入框**。进入 `roll_damage` 时按第九节重新现算伤害加值。`result` 汇总命中骰、伤害骰与重击。

**三处一起改，旧面板整条删除**：武器卡（含派生卡）、变身天生武器卡（`CombatStatus.jsx:3236-3311`）、变身生物法术卡（`CombatStatus.jsx:3314` 起）。删除对象：`CombatStatus.jsx` 中 `damageRollConfirm` 的两个渲染块（`:3673-3886`、`:3889-3940`）与 `handleCreatureSpellAttackResult`（`:1359-1397`）。

顺带清理：`chargeItemModel.js:956-975` `getMainHandWeaponDamageType` 按 `slot.slotId === 'mainHand'` 与 `mainHand.weaponId` 查找，而真实手持槽形状是 `{ id: 'main' | 'off' | 'held_<t>', inventoryId }`，条件永不成立，属死代码。改为复用派生器的主手解析结果或直接用 `buildItemSlotMap`。

## 十一、存量数据清理与组合技

**清理**：角色加载时，`combatMeans` 中所有 `type === 'physical'` 条目**一次性清空，不迁移配置、不留孤儿卡**。物品上的 `combatMeanConfig` 从空白开始，玩家自行重配。

**组合技必须一并处理**，否则功能静默损坏：组合技卡靠 `primaryMeanId` 引用一张武器卡（`CombatStatus.jsx:2975,3050`），目标被清空后现有代码遇 `!comboPrimary` 直接 `return null`，所有挂在武器上的组合技无声消失。

- 存量组合技若 `primaryMeanId` 指向被清掉的物理条目：置空该字段，卡片渲染为灰色不可用并写明"未选择主手段"，玩家重选即恢复。
- 组合技编辑弹窗（`AddComboStep`）的"主手段"选择器改为列出：当前派生卡 + 列表中剩余法术卡。选择派生卡时存其稳定 id `wielded_<i>_<inventoryId>`。
- 派生卡 id 确定性生成是这套引用成立的前提（见第五节）。

**存档兼容**：旧存档缺 `entry.combatMeanConfig` 时按"全默认、全自动"处理；`combatMeans` 中的物理条目在读取阶段即被过滤，渲染层不再为其保留分支。

## 十二、文件影响

| 文件 | 改动 |
|------|------|
| `src/lib/combatMeans/deriveWieldedWeapons.js` | 新增：派生器纯函数 + 副手合法性 + 稳定 id |
| `src/lib/combatMeans/deriveWieldedWeapons.test.js` | 新增：规则单测 |
| `src/components/combat/combatMeanUtils.js` | `computePhysicalWeaponStats` 落地计算规则 2/3/4；自动增益改为现算入口 |
| `src/components/CombatStatus.jsx` | 武器卡数组改为派生 + 非物理存量合并；删同步 effect `:903-929`；删 `damageRollConfirm` 两块与 `handleCreatureSpellAttackResult`；`getWeaponsFromInventory` 由派生器取代；物理条目读取期过滤 |
| `src/components/combat/WeaponAttackCard.jsx` | 接受派生卡；槽位标签；三态样式；点击改走五步流 |
| `src/components/combat/AddWeaponStep.jsx` | 删"武器熟练"勾选框；增益清单改现算；保存写入 `entry.combatMeanConfig` |
| `src/components/AbilityUseModal.jsx` | 支持以武器卡为输入的攻击→伤害五步流 |
| `src/data/buffTypes.js` | 登记两个效果；`isSimpleWeaponProto` / `isMartialWeaponProto` 改为读 `proficiencyTier` 并导出 |
| `src/hooks/useBuffCalculator.js` | `computeBuffStats` 聚合两个新效果为 `buffStats` 上的布尔字段 |
| `src/data/itemDatabase.js` | 武器原型补 `proficiencyTier`，补齐未归组武器 |
| `src/components/ItemAddForm.jsx` | 暴露 `proficiencyTier`，供 DM 标注自制武器 |
| `src/components/AbilityModule.jsx` | 分组按钮改读 `proficiencyTier`，删本地两份清单 |
| `src/data/featDefaultBuffs.js` | 双持客默认效果改正为 `offhand_ignores_light`（原挂的 `two_weapon_fighting_bonus` 属双武器战斗） |
| `src/components/BuffForm.jsx` | 仅在通用输入不够直观时，为两个新效果提供专用控件 |
| `src/lib/chargeItemModel.js` | 修 `getMainHandWeaponDamageType` 死代码 |

## 十三、测试与验证

**派生器单测**（纯函数，逐条断言标签、可用性、灰卡原因）：空手；仅主手；双持两把轻型；双持非轻型且无双持客（灰）；双持非轻型有双持客（可用）；主手双手＋副手有物（灰）；一个备用手持位；变身状态（返回空）；主手法器（不出卡）；槽位指向已不存在的物品（不出卡、不抛错）。

**计算单测**：不熟练 → 命中不加熟练且伤害不加调整值；熟练 → 两者都加；副手附赠攻击 → 不加调整值；有双武器战斗 → 加；属性调整值为 −2 且不满足加值条件 → 伤害为 −2 而非 0；分级不明 → 按熟练处理。

**迁移单测**：喂一份含两张物理卡 + 一张引用其一的组合技的存档，断言物理条目被清除、组合技 `primaryMeanId` 被置空、组合技卡渲染为"未选择主手段"而非消失。

**浏览器实测**（`npm run dev`，本地 5173 单一实例）：

1. 主手换武器 → 卡自动跟着换，无需任何配置。
2. 背包增删条目 → 卡不消失、不错位（旧 bug 复现路径）。
3. 荒野变形 → 武器卡整排消失，只剩天生武器；解除后回来。
4. 副手拿非轻型 → 灰卡带原因；学到双持客后灰卡转可用。
5. 开一个新临时 BUFF 上身 → 卡上命中/伤害同帧变化，不需要重开弹窗。
6. 点武器卡名字 → 五步流：投 d20 → 出现"询问 DM"两按钮、无 AC 输入框 → 点"命中，投伤害" → 伤害用当帧数值。
7. 主手清空后，引用它的组合技卡显示"未选择主手段"而不是消失。
8. 在"双武器战斗 → 配置默认 BUFF"里挂上 `two_weapon_fighting_bonus` 并保存 → 副手卡的伤害立刻出现属性调整值；停用该风格后立刻消失。这条同时验证"引擎提供效果、DM 填内容"的链路完整。

## 十四、已确认的决策记录

| 决策 | 选择 |
|------|------|
| 生成范围 | 全部手持槽：主手 + 副手 + 备用 |
| 自动与手动共存 | 全自动，手动配置降级为挂在物品上的补丁 |
| 变身时 | 隐藏所有武器卡，只留天生武器 |
| 存量手动卡 | 全部删净，不迁移 |
| 副手合法性 | 需轻型词条，或双持客效果解锁非轻型单手武器 |
| 主手双手武器时 | 副手显示灰色不可用卡 |
| 精通（武器特性） | 不进战斗手段，不给勾选框 |
| 熟练 | 由角色熟练项自动推导，同时门控命中与伤害 |
| 数值实时性 | 卡上不得有快照；攻击与伤害各自在投骰瞬间现算 |
| 释放流程 | 与主动释放五步流统一，删除输入 AC 的旧面板（三处一起改） |
| 新增效果 | 双武器战斗（副手可加调整值）、双持客（副手免轻型要求） |
| 负数属性调整值 | 正常参与计算，不归零（规则原文"除非为负数"即此意，用户 2026-09-14 确认） |
| 战斗风格接线 | 不新建默认效果表、不新增 UI。选择器已在职业特性卡上（`FightingStylesBlock`），弹窗已有"配置默认 BUFF（DM）"；本次只把效果登记进字典并接上消费端 |
