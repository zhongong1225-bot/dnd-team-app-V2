# 设计：熟练项自动获得 / 祈唤与战斗风格独立卡 / 等级与 HP 权威源 / 健壮形状修正

日期：2026-09-15
状态：待用户审阅
范围来源：四角色数值审计遗留清单（玛法里奥 / 菲奥娜 / 奥利安娜）＋用户 2026-09-15 需求

## 0. 范围与推迟项

本期做：
1. 职业熟练项随选职业自动获得 ＋ 护甲硬拦截
2. 魔能祈唤独立卡、战斗风格按来源独立卡（同族样式）
3. 等级权威源统一（经验值为准）＋ HP 上限在角色列表改实时算
4. 健壮 / 灵能身躯 默认效果旧数据形状修正
5. 武器硬拦截的交接说明（交给并发窗口实现，本窗口不碰 CombatStatus.jsx）

**推迟（用户 2026-09-15 决定）**：批量导入默认配置工具＋配置清单（原第 5 块）。理由：用户希望先看清其余改动效果再决定配置落地方式。

**禁区（本期一律不改）**：`src/components/CombatStatus.jsx`、`AbilityUseModal.jsx` 的法术 DC/攻击部分、速度语义 `base_speed_increment`、`computeBuffStats.test.js`、资源规则可配置化。

## 1. 熟练项自动获得

### 1.1 规则
- 主职业：自动获得该职业声明的豁免熟练＋护甲熟练＋武器熟练。
- 兼职 / 转职（prestige）：只自动获得护甲＋武器熟练，不给豁免（用户裁定，符合 D&D 兼职规则）。
- 合并策略：**只加不删**。自动获得＝把职业声明并入角色现有熟练项的并集；角色上手动添加的永远保留；移除职业不回收已给熟练。
- 技能熟练（"从列表选 N 项"）本期不做自动选择器，维持手动。

### 1.2 数据与归一化
- 职业声明来源：`src/data/classDatabase.js` 每职业的 `saveProficiencies` / `armorProficiencies` / `weaponProficiencies`。
- 已知脏数据：个别职业（如无相影门）用中文组名（`'简易武器'`、`'轻甲'` 混用具体 id）。归一化在**授予时**做，不改职业数据本身：
  - 护甲值域＝中文标签 `['轻甲','中甲','重甲','盾牌']`（与 AbilityModule 现有选项一致）。
  - 武器值域＝档位伪 id `simple / martial / firearms` ＋ 具体武器 id；中文组名映射到对应档位伪 id；旧火器单件 id 归入 `firearms`（复用 `normalizeProfState` 的 `LEGACY_FIREARM_IDS` 口径）。
- 新增纯函数模块 `src/lib/proficiencyGrant.js`：
  - `normalizeClassProficiencyDecl(classDef)` → `{ saves:[], armors:[], weapons:[] }`
  - `computeClassProficiencyGrants(charClasses)` → 按 1.1 规则对主职业/兼职/转职分别取值后求并集
  - `mergeProficiencyGrants(character, grants)` → 返回新的 `proficiencies` 与 `savingThrows`（并集，不删）
  - 零 UI 依赖，可单测。

### 1.3 触发点
- 创建角色：`src/pages/CharacterNew.jsx` 提交 payload 时带入初始授予（主职业）。
- 改职业 / 加兼职 / 加转职：`src/pages/CharacterSheet.jsx` 的 `ClassSection.persistClass` 保存前，对**当前全部职业构成**重算授予并集并入（幂等，无需 diff）。
- 读取端不变：`AbilityModule.jsx` 的熟练项展示与 `weaponProficiency.js` 的判定照常消费 `character.proficiencies`。

### 1.4 护甲硬拦截
- 落点：`src/components/EquipmentAndInventory.jsx` 的穿/脱与同调入口。
- 判定：物品原型护甲类别（轻/中/重/盾）是否在 `char.proficiencies.armors`；无熟练则**禁止穿上**并给出原因文案（如"缺少中甲熟练"）。
- 已穿上的历史不合规装备不强制脱下（避免破坏现存角色），仅阻止新的穿入。
- 盾牌按独立类别判定。

### 1.5 武器硬拦截（交接，不实现）
- 见第 6 节交接文档。本窗口不改战斗手段派生逻辑。

## 2. 祈唤卡与战斗风格卡

### 2.1 视觉族
- 与职业特性卡同族：深色细面板＋头部能量条式标题行（金色、字距 2px）＋右侧操作按钮；卡内已选项以标签行常驻。
- 不使用 `fit-content()`；遵循既有网格/间距规范。

### 2.2 魔能祈唤卡
- 替换 `CharacterSheet.jsx` 的 `EldritchInvocationsBlock` 现有"标签块"渲染为独立卡：
  - 头部：`魔能祈唤 已选/上限` ＋ "多选"按钮（开现有 `EldritchInvocationPicker`）。
  - 卡内：已选祈唤标签行（仅展示；增删在弹窗内完成）。
- 显示条件：魔契师等级 > 0（沿用现有 `warlockLevel` 计算）。

### 2.3 战斗风格卡
- 现状：`FightingStylesBlock` 嵌在每条"战斗风格"职业特性卡内部。
- 改为：从特性卡内嵌移除；在祈唤卡同一区域，**每个来源特性一张独立卡**（头部＝`来源·战斗风格`，如"战士·战斗风格""专长·额外风格"；卡内＝该来源已选标签＋加号按钮开现有 `FightingStylePicker`）。
- 来源列表＝`getAvailableFeatures` 中 id 属于 `FIGHTING_STYLE_FEATURE_IDS` 的特性；无来源则不渲染任何风格卡。
- 选择存储结构不变（`selectedFightingStyles` 按 `sourceFeatureId` 分组），仅渲染位置/形态变化。

## 3. 等级权威源与 HP

### 3.1 总等级唯一入口
- 新增 `src/lib/characterLevel.js`：`getTotalCharacterLevel(char)`＝`xp != null ? levelFromXP(xp) : clamp(level,1,20)`。
- 统一改调该入口的位置（凡需要"总等级"处）：
  - `src/hooks/useBuffCalculator.js`（熟练加值、公式上下文 level）
  - `src/pages/CharacterSheet.jsx`（显示与对职业等级的封顶）
  - `src/pages/Characters.jsx`（列表等级）
  - `src/pages/CharacterSpells.jsx`（法术等级回退）
  - `src/lib/activeAbilityEngine.js` 中读 `character.level` 处
- `character.level` 降级为"无经验值时的回退"，不再作为权威；`storyLevel` 保持纯显示覆盖，不参与任何计算。
- 按职业算的东西（各职业特性列表、各施法职业法术位）继续用 `getCharacterClasses` 的分级，不受影响。

### 3.2 HP 上限
- 战斗面板已实时算（`calcMaxHP + getHPBuffSum + maxHpBonus`），**不动**。
- 新增 `formulas.js` 导出 `getCharacterMaxHpBase(char)`＝`calcMaxHP + getHPBuffSum`（不含 BUFF 管线部分，供无管线上下文处使用）。
- `src/pages/Characters.jsx` 列表血条改读 `getCharacterMaxHpBase`，不再读存下来的 `hp.max`。
- 口径说明：列表无 BUFF 管线上下文，故列表显示**基础上限**（生命骰＋体质），面板显示**完整上限**（再＋健壮/临时 BUFF 等管线加成）；两者差异仅在于管线加成。列表血条宽度按 100% 封顶。若以后要求列表与面板完全一致，需在列表接入管线，本期不做。
- `character.hp.max` 权威范围明确为**仅生物卡模板**（CombatStatus 现状），玩家角色不再以其为权威；不做存量数据迁移。

## 4. 健壮 / 灵能身躯 形状修正

- `src/data/featDefaultBuffs.js` 中 `tough`（健壮）与 `psionic_body`（灵能身躯）的 `max_hp_bonus` 值由旧形状 `{bonus:{ref:'level',mult:2}}` 改为扁平公式形状 `{ref:'level',mult:2}`。
- 性质说明：这是修正**既有硬编码回退的格式错误**（旧形状会被公式求值器当 0），不是新增内容；DM 默认配置仍可覆盖。
- 兼容：保留现有四处旧形状解包点（effectMapping / BuffForm / BuffListItem / CombatStatus），旧角色身上已存的旧形状个人配置继续可读，不丢。
- 测试：断言对默认配置求值＝2×总等级。

## 5. 测试与验证

- 单测（vitest，node 环境）：
  - `proficiencyGrant`：中文组名归一、主职业给豁免而兼职不给、并集只加不删、幂等。
  - `characterLevel`：有经验用经验、无经验回退 level、边界 1/20。
  - `formulas.getCharacterMaxHpBase` 与健壮默认效果求值。
- 浏览器实机（只读核对＋save- 时间戳测试角色，不写生产云）：
  - 新建角色选职业后熟练项自动出现；加兼职只加护甲/武器。
  - 无中甲熟练穿中甲被拦并提示；有熟练可穿。
  - 祈唤卡 / 风格卡渲染与弹窗选择往返正常。
  - 四审计角色：等级显示、列表 HP 血条、健壮 HP 加成符合 2×15。
- 全量测试＋构建通过；已知 5 条 cardAdapter 速度/ASI 红属并发窗口禁区，不计入本期。

## 6. 交接说明（给并发窗口）

产出文档：`docs/superpowers/plans/2026-09-15-weapon-proficiency-hard-gate-handoff.md`
内容要点：
- 需求：无武器熟练的角色，其手持武器不生成战斗手段卡、不能投攻击（用户裁定硬拦截，取代"不熟练仅不加熟练加值"）。
- 判定依据：`src/lib/weaponProficiency.js` 的 `isWeaponProtoProficient` ＋ `proficiencyTier` 唯一事实源。
- 落点：战斗手段的手持武器派生处（CombatStatus 内）。
- 与本期关系：护甲硬拦截由本窗口在装备栏完成；武器侧由该窗口实现，避免同文件互覆。
- 验收：不熟练武器不出卡；熟练档位变更即时反映；既有熟练角色无回归。

## 7. 实施顺序

1. 健壮形状修正（最小、独立）
2. proficiencyGrant ＋ 创建/改职业接线 ＋ 护甲硬拦截
3. characterLevel 统一入口 ＋ 列表 HP
4. 祈唤卡 / 风格卡 UI
5. 交接文档
每步独立可构建可部署；不新建分支（main）。
