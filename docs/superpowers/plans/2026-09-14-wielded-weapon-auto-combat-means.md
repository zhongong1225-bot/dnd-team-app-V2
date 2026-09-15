# 战斗手段：手持武器自动派生 + 释放流程统一 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让战斗手段区的武器卡从手持装备槽自动派生、数值实时跟随 BUFF 栏，并把攻击释放统一到主动技能的五步流（投骰后只问 DM 是否命中，界面不出现对手 AC 输入框）。

**Architecture:** 渲染期派生（方案 A）：新增纯函数派生器读装备槽 + 背包条目 + 熟练项 + buffStats，产出卡数组，与 `combatMeans` 中剩余的非物理卡合并后渲染；玩家个性化设定写在背包条目的 `combatMeanConfig` 上，卡本身不落库、不存任何数值快照。命中与伤害各自在投骰那一刻现算，释放走 `AbilityUseModal` 的五步状态机（新增 `attackPreset` 入口）。释放侧的契约是**preset 只带取值器不带数值**，取值器由 `CombatStatus` 里一张按卡 id 覆写的 ref 注册表提供（Task 13），所以"弹窗开着、中途新挂 BUFF"也能进这一次结算。

**Tech Stack:** React 18 函数组件 + Hooks、Vite 5、Tailwind 3、Vitest 4（`npx vitest run <file>`，DOM 测试文件顶部加 `// @vitest-environment jsdom`）。

**设计文档：** `docs/superpowers/specs/2026-09-14-wielded-weapon-auto-combat-means-design.md`

**行号约定**：本文出现的 `:123` 一律是**改动前**的现状行号，只用于帮助定位；每个 Task 执行时请以符号名 grep 为准。Phase B/C 的多个 Task 会在 `CombatStatus.jsx` 中部插入与删除代码，越往后的 Task 行号漂移越大。

---

## 与设计文档的四处偏离（先读，执行时照本计划）

1. **派生器位置**：设计文档写 `src/lib/combatMeans/deriveWieldedWeaponMeans.js`，改为 `src/components/combat/deriveWieldedWeaponMeans.js`。原因：派生器要复用 `combatMeanUtils.js` 里的 `weaponHasLight` / `weaponHasTwoHanded` / `getDefaultWeaponMode`，放在 `src/lib/` 会形成 `lib → components` 的反向依赖（AGENTS.md 4.2 明令禁止）。
2. **武器配置字段为七项**：设计文档第六节列了六项，漏了现卡已有的"属性"（`abilityForAttack`）。删掉它会让手动改过属性的玩家静默丢失设置，属功能回归，故补进 `combatMeanConfig`。
3. **熟练清单有三份不是两份**：除设计文档点名的 `SIMPLE_WEAPON_IDS` / `MARTIAL_WEAPON_IDS`，还有 `AbilityModule.jsx:39` 的 `FIREARM_WEAPON_IDS`；三把枪从不以原型 id 进入 `char.proficiencies.weapons`，只有伪 id `'firearms'`。熟练判定必须同时认伪 id。
4. **第十节对旧面板的两处描述需要纠正**：其一，那个面板**没有**对手 AC 输入框（`CombatStatus.jsx:3691-3873` 实际是"命中投掷 / 伤害投掷 + BUFF 加值逐条勾选 + 额外伤害骰逐条勾选 + 手动重击勾选"），索要 DC 并 `alert('攻击未命中')` 的逻辑在 `handleCreatureSpellAttackResult`（`:1359-1397`）里，而该函数**没有任何调用点**、是死代码。其二，面板的调用方不是三处而是五处：`SpellAttackCard.jsx:160,177` 与 `ItemUseCard.jsx:232,245,478,493` 也在用，所以删除动作不能塞进一个 Task——Task 13 迁移武器卡与两类变身卡，Task 14 迁移法术卡与道具卡之后才删面板。附带结论：本次真正删掉的用户可见功能是**逐条勾选与手动重击确认**（Task 13 Step 0 为此设了确认门），不是"输 AC"。

**档位取值原则**：以 `AbilityModule` 的三份 id 清单为准（它驱动"熟练项设置"勾选框，是玩家实际体验到的分类）。这自动修好 `buffTypes.js` 类别清单漏掉的 7 把武器（飞镖、长柄刀、骑枪、巨锤、钉头锤、战镐、鞭）与 5 个死字符串（战镰/晨星/钐镰/网/轻剑），并消除"矛 / 吹箭筒"两处两份清单结论相反的冲突（分别按现状判简易 / 军用）。弯刀 2024 规则应为简易，本计划**不改**（改档会让已有存档的整组折叠标签变化，属规则裁定，交 DM 决定）。`zhaoyun_arcane_cards`、`smart_weapon` 两条**不打标**，由"分级不明按熟练"的安全阀兜底。

---

## 文件结构

**新建**

| 文件 | 责任 |
|------|------|
| `src/lib/weaponProficiency.js` | 纯函数：档位归属 → 熟练判定。不依赖组件、不依赖 buffStats |
| `src/lib/weaponProficiency.test.js` | 上者的规则单测 |
| `src/components/combat/deriveWieldedWeaponMeans.js` | 纯函数：装备槽 + 背包 + 熟练 → 武器卡数组（含副手合法性、灰卡原因、稳定 id） |
| `src/components/combat/deriveWieldedWeaponMeans.test.js` | 派生规则单测 |

**修改**（按改动顺序）

| 文件 | 责任变化 |
|------|---------|
| `src/data/buffTypes.js` | 导出 `getWeaponProficiencyTier` / `isSimpleWeaponProto` / `isMartialWeaponProto` 并改为读 `proficiencyTier`；登记两个新效果 |
| `src/data/itemDatabase.js` | 39 把武器原型补 `proficiencyTier`；`addCustomItem` 白名单放行该字段 |
| `src/components/ItemAddForm.jsx` | 武器字段区暴露熟练档位（仅写原型，不写条目） |
| `src/components/AbilityModule.jsx` | 删三份硬编码 id 清单，改由原型算 |
| `src/data/featDefaultBuffs.js` | 双持客默认效果归属纠错 |
| `src/hooks/useBuffCalculator.js` | 聚合两个新效果为 `buffStats` 上的布尔 |
| `src/components/combat/combatMeanUtils.js` | 伤害加值规则 2/3/4；新增 `sanitizeLegacyCombatMeans`；`getCombatMeanLabel` 优先读派生卡的物品条目名 |
| `src/components/CombatStatus.jsx` | 派生接线、删快照同步 effect、建实时计划注册表、删伤害确认面板与 `handleCreatureSpellAttackResult` |
| `src/components/combat/WeaponAttackCard.jsx` | 接受派生卡；槽位标签；灰卡三态；每次渲染登记计划、点击改走 `openWeaponAttackFlow` |
| `src/components/combat/SpellAttackCard.jsx` | 点击改走注册表 + `attackPreset`；豁免型去掉中间确认面板 |
| `src/components/combat/ItemUseCard.jsx` | 两处释放入口改走注册表；`onCommitted` 落地充能与法术位 |
| `src/components/combat/AddWeaponStep.jsx` | 删熟练勾选；改为物品配置编辑 |
| `src/components/combat/AddComboStep.jsx` | 主手段来源含派生卡；物理项读 `weaponOpt` |
| `src/components/combat/AddMeanTypeStep.jsx` | 删"物理武器"入口（武器不再手动添加） |
| `src/components/AbilityUseModal.jsx` | 新增 `attackPreset` 入口（优势 / 重击范围 / 现算伤害） |
| `src/lib/chargeItemModel.js` | 修 `getMainHandWeaponDamageType`（"与主手武器同类型"特效恒不生效） |

**部署检查点**：Task 1–4 完成即可独立构建上线（纯引擎与数据，无行为变化风险）；Task 5 起是行为改造，建议一起做完再部署。

---

## Phase A — 引擎地基

### Task 1: 熟练档位单一事实源

**Files:**
- Create: `src/lib/weaponProficiency.js`
- Test: `src/lib/weaponProficiency.test.js`
- Modify: `src/data/buffTypes.js:783-815`

- [ ] **Step 1: 写失败测试**

创建 `src/lib/weaponProficiency.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { isWeaponProtoProficient, collectTierMemberIds } from './weaponProficiency'

const TIER_IDS = {
  simple: ['club', 'dagger'],
  martial: ['longsword', 'greatsword'],
  firearm: ['gun_pistol'],
}

describe('isWeaponProtoProficient', () => {
  it('按原型 id 命中', () => {
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, ['longsword'], TIER_IDS)).toBe(true)
  })
  it('整组全选推定熟练（老存档：点过军用武器按钮）', () => {
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, ['longsword', 'greatsword'], TIER_IDS)).toBe(true)
  })
  it('整组只选一半不算熟练', () => {
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, ['greatsword'], TIER_IDS)).toBe(false)
  })
  it('火器只认伪 id firearms，也兼容存档残留的枪 id', () => {
    expect(isWeaponProtoProficient({ id: 'gun_pistol', proficiencyTier: 'firearm' }, ['firearms'], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient({ id: 'gun_pistol', proficiencyTier: 'firearm' }, ['gun_pistol'], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient({ id: 'gun_pistol', proficiencyTier: 'firearm' }, ['longsword'], TIER_IDS)).toBe(false)
  })
  it('档位不明按熟练处理（宁滥勿缺）', () => {
    expect(isWeaponProtoProficient({ id: 'smart_weapon' }, [], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient(null, [], TIER_IDS)).toBe(true)
  })
})

describe('collectTierMemberIds', () => {
  it('按档位归组并只保留武器类型', () => {
    const ids = collectTierMemberIds([
      { id: 'club', 类型: '近战武器', proficiencyTier: 'simple' },
      { id: 'longsword', 类型: '近战武器', proficiencyTier: 'martial' },
      { id: 'gun_pistol', 类型: '枪械', proficiencyTier: 'firearm' },
      { id: 'holy_symbol_amulet', 类型: '法器', proficiencyTier: undefined },
      { id: 'zhaoyun_arcane_cards', 类型: '近战武器' },
    ])
    expect(ids).toEqual({ simple: ['club'], martial: ['longsword'], firearm: ['gun_pistol'] })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/weaponProficiency.test.js`
Expected: FAIL —`Failed to load ... weaponProficiency` / `isWeaponProtoProficient is not a function`

- [ ] **Step 3: 实现档位解析（放在 buffTypes，避免两处判定）**

编辑 `src/data/buffTypes.js`，删除 `:783-815` 的 `SIMPLE_WEAPON_CATEGORIES`、`MARTIAL_WEAPON_CATEGORIES`、`isSimpleWeaponProto`、`isMartialWeaponProto` 四段，替换为：

```js
/** 武器熟练档位的整组授予伪 id（写进 char.proficiencies.weapons） */
export const WEAPON_TIER_GRANTED_IDS = { simple: 'simple', martial: 'martial', firearm: 'firearms' }

/** 武器原型的熟练档位：'simple' | 'martial' | 'firearm' | null（null = 未标注） */
export function getWeaponProficiencyTier(proto) {
  if (!proto) return null
  const t = String(proto.proficiencyTier ?? '').trim()
  if (t === 'simple' || t === 'martial' || t === 'firearm') return t
  if (proto.isMartial === true) return 'martial'
  if (proto.isSimple === true) return 'simple'
  if (String(proto.类型 ?? '').trim() === '枪械') return 'firearm'
  return null
}

/** 武器是否属于简易武器 */
export function isSimpleWeaponProto(proto) {
  return getWeaponProficiencyTier(proto) === 'simple'
}

/** 武器是否属于军用武器 */
export function isMartialWeaponProto(proto) {
  return getWeaponProficiencyTier(proto) === 'martial'
}
```

同文件 `:850` 的 `isNaturalWeaponProto` 里那行对被删常量的引用改为：

```js
    if (getWeaponProficiencyTier(proto) || type === '近战武器' || type === '远程武器' || type === '枪械') return false
```

- [ ] **Step 4: 实现判定函数**

创建 `src/lib/weaponProficiency.js`：

```js
/**
 * 武器熟练判定：角色是否熟练这件武器。
 * 档位事实源在 Weapon.prototype.proficiencyTier，判定同时认三种授予形式：
 * 单把武器 id、整组伪 id（'simple'/'martial'/'firearms'）、整组逐一全选（旧存档）。
 */
import { getWeaponProficiencyTier, WEAPON_TIER_GRANTED_IDS } from '../data/buffTypes'

const WEAPON_ITEM_TYPES = new Set(['近战武器', '远程武器', '枪械'])

/** 从物品清单（内置 + 自定义）按档位归组出原型 id */
export function collectTierMemberIds(items) {
  const out = { simple: [], martial: [], firearm: [] }
  for (const it of items || []) {
    if (!it?.id || !WEAPON_ITEM_TYPES.has(String(it.类型 ?? '').trim())) continue
    const tier = getWeaponProficiencyTier(it)
    if (tier && out[tier]) out[tier].push(it.id)
  }
  return out
}

/**
 * @param {object|null} proto 武器原型
 * @param {string[]} profWeapons char.proficiencies.weapons
 * @param {{simple:string[],martial:string[],firearm:string[]}} tierMemberIds collectTierMemberIds 的结果
 */
export function isWeaponProtoProficient(proto, profWeapons, tierMemberIds) {
  const owned = new Set(Array.isArray(profWeapons) ? profWeapons : [])
  const tier = getWeaponProficiencyTier(proto)
  if (!tier) return true
  if (proto?.id && owned.has(proto.id)) return true
  if (owned.has(WEAPON_TIER_GRANTED_IDS[tier])) return true
  const members = tierMemberIds?.[tier] || []
  return members.length > 0 && members.every((id) => owned.has(id))
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/lib/weaponProficiency.test.js src/hooks/useBuffCalculator.test.js src/lib/buffEffectCoverage.test.js`
Expected: 全部 PASS（`buffEffectCoverage.test.js` 会验证效果字典没被上面第三段的删改破坏）

- [ ] **Step 6: 提交**

```bash
git add src/lib/weaponProficiency.js src/lib/weaponProficiency.test.js src/data/buffTypes.js
git commit -m "feat: 武器熟练档位 proficiencyTier 成为唯一事实源并导出判定函数"
```

---

### Task 2: 数据与 UI 接上档位

**Files:**
- Modify: `src/data/itemDatabase.js:170-255`（武器原型）、`:645-667`（`addCustomItem` 白名单）
- Modify: `src/components/AbilityModule.jsx:30-39,257-297,636-647`
- Modify: `src/components/ItemAddForm.jsx:290,402,466,667,705,1050+`

- [ ] **Step 1: 给 39 把武器原型补 `proficiencyTier`**

在 `src/data/itemDatabase.js` 里，给每个武器原型对象的 `类型:` 行之后插入一行档位。

`proficiencyTier: 'simple'`（14 条）：`club` `dagger` `greatclub` `handaxe` `javelin` `light_hammer` `mace` `quarterstaff` `sickle` `spear` `dart` `light_crossbow` `shortbow` `sling`

`proficiencyTier: 'martial'`（22 条）：`battleaxe` `flail` `glaive` `greataxe` `greatsword` `halberd` `lance` `longsword` `maul` `morningstar` `pike` `rapier` `scimitar` `shortsword` `trident` `war_pick` `warhammer` `whip` `blowgun` `hand_crossbow` `heavy_crossbow` `longbow`

`proficiencyTier: 'firearm'`（3 条）：`gun_blunderbuss` `gun_musket` `gun_pistol`

`zhaoyun_arcane_cards`、`smart_weapon` **不加字段**（走"档位不明按熟练"安全阀）。

改完后的样例（`club` 与 `gun_pistol`）：

```js
  { id: 'club', 类型: '近战武器', 子类型: '近战', 类别: '短棒', proficiencyTier: 'simple', 攻击: '1d4 钝击', 伤害: '钝击', 附注: '轻型', /* ... */ },
  { id: 'gun_pistol', 类型: '枪械', 子类型: '', 类别: '手铳', proficiencyTier: 'firearm', 攻击: '1d10 穿刺', 伤害: '穿刺', 附注: '弹药（射程 30/90；子弹），装填', /* ... */ },
```

- [ ] **Step 2: 让自定义武器存得下这个字段**

`src/data/itemDatabase.js` 的 `addCustomItem`（`:640`）白名单里，在 `攻击距离:` 之前加一行：

```js
    proficiencyTier: ['simple', 'martial', 'firearm'].includes(item.proficiencyTier) ? item.proficiencyTier : '',
```

`forkItemAsCustom`（`:692`）保留原型全字段，无需改动。

- [ ] **Step 3: 删掉 AbilityModule 的三份清单**

`src/components/AbilityModule.jsx` 删除 `:30-39` 的 `SIMPLE_WEAPON_IDS` / `MARTIAL_WEAPON_IDS` / `FIREARM_WEAPON_IDS` 三个常量。
`FIREARM_WEAPON_IDS` 在 `normalizeProfState`（`:44-47`）还被用作旧存档迁移，用本地常量替代：

```js
const LEGACY_FIREARM_IDS = ['gun_blunderbuss', 'gun_musket', 'gun_pistol']
```

（把 `:44` 与 `:46` 两处 `FIREARM_WEAPON_IDS` 改名为 `LEGACY_FIREARM_IDS`，迁移语义不变。）

在文件顶部的 import 中加入：

```js
import { getItemList, ITEM_DATABASE } from '../data/itemDatabase'
import { collectTierMemberIds } from '../lib/weaponProficiency'
```

`weaponOptions`（`:257-269`）改为按档位过滤，并追加三个整组伪选项：

```js
  const weaponOptions = useMemo(() => {
    const list = getItemList()
      .filter((it) => (it?.类型 === '近战武器' || it?.类型 === '远程武器' || it?.类型 === '枪械') && it?.类别 && it?.id && it.id !== 'smart_weapon')
      .map((it) => ({ id: it.id, label: String(it.类别).trim() }))
    const seen = new Set()
    const base = list.filter((x) => { if (seen.has(x.id)) return false; seen.add(x.id); return true })
    return [...base, { id: 'firearms', label: '枪械' }]
  }, [])
```

`:271-272` 两行改为从原型派生（同时提供整组按钮与折叠标签所需）。**只取内置 `ITEM_DATABASE`，不要取 `getItemList()`**：整组成员集合必须与旧存档批量写入的那份内置 id 列表一致，否则只要有人往团队共享的自定义物品库里加一把军用武器，所有靠"逐一全选"推定熟练的老角色就会集体失去军用熟练加值。内置按钮不勾选自定义武器是改造前的既有行为，自定义武器仍可在下拉里逐把勾选。

```js
  const tierMemberIds = useMemo(() => collectTierMemberIds(ITEM_DATABASE), [])
  const simpleWeaponIds = tierMemberIds.simple
  const martialWeaponIds = tierMemberIds.martial
```

`selectedWeaponLabels`（`:274-297`）中把折叠判断从"整组 id 全选"改为"整组 id 全选 **或** 有整组伪 id"：

```js
    const simpleAll = selected.has('simple') || (simpleWeaponIds.length > 0 && simpleWeaponIds.every((id) => selected.has(id)))
    const martialAll = selected.has('martial') || (martialWeaponIds.length > 0 && martialWeaponIds.every((id) => selected.has(id)))
```

`:292` 的 `covered` 集合改为 `new Set([...simpleWeaponIds, ...martialWeaponIds, 'simple', 'martial', 'firearms'])`。

- [ ] **Step 4: 整组按钮同时写整组伪 id**

`toggleWeaponGroup`（`:362-367`）当前只批量写 id。改签名接受档位，写"伪 id + 逐一 id"（逐一 id 让折叠标签与逐把显示都保持现状）：

```js
  const toggleWeaponGroup = (tier, ids) => {
    const allOn = ids.every((id) => proficiencies.weapons.includes(id)) && proficiencies.weapons.includes(WEAPON_TIER_GRANTED_IDS[tier])
    const grantedId = WEAPON_TIER_GRANTED_IDS[tier]
    setProf((prev) => {
      const base = normalizeProfState(prev)
      let next = allOn
        ? base.weapons.filter((id) => !ids.includes(id) && id !== grantedId)
        : Array.from(new Set([...base.weapons, ...ids, grantedId]))
      return { ...base, weapons: next }
    })
  }
```

import 追加 `WEAPON_TIER_GRANTED_IDS`（来自 `../data/buffTypes`）。两个按钮（`:636`、`:643`）改为：

```jsx
                    onClick={() => toggleWeaponGroup('simple', simpleWeaponIds)}
                    onClick={() => toggleWeaponGroup('martial', martialWeaponIds)}
```

按钮的高亮条件同步改用 `simpleAll` / `martialAll` 语义：

```jsx
                    className={`px-2 py-1 rounded border text-xs ${simpleWeaponIds.every((id) => proficiencies.weapons.includes(id)) && proficiencies.weapons.includes('simple') ? 'border-[#C79A42] bg-[#C79A42]/20 text-[#C79A42]' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}
```

军用按钮同理，把 `'simple'` 换成 `'martial'`、`simpleWeaponIds` 换成 `martialWeaponIds`。

- [ ] **Step 5: ItemAddForm 暴露档位（只写原型）**

`src/components/ItemAddForm.jsx`：

1. import 追加 `WEAPON_PROFICIENCY_OPTIONS`（来自 `../data/buffTypes`）。
2. 在 `weaponRange` 状态（`:290`）旁加：`const [weaponTier, setWeaponTier] = useState(() => '')`
3. 在武器原型解析的两处初始化里带上档位——`:402` 附近与 `:466` 附近各加一行：

```js
      setWeaponTier((entry?.proficiencyTier ?? proto?.proficiencyTier ?? '').trim())
```

`:409` 的重置分支里加 `setWeaponTier('')`。
4. 在武器字段区（`{isWeapon ? (` 起，约 `:1050`）现有"攻击距离"输入旁加一个下拉：

```jsx
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="shrink-0 text-dnd-text-muted">熟练档位</span>
                  <select
                    value={weaponTier}
                    onChange={(e) => setWeaponTier(e.target.value)}
                    className={inputClass + ' h-8 min-w-0 flex-1 text-xs'}
                    title="决定该武器被简易/军用/火器整组熟练按钮与 Buff 起效范围如何归类"
                  >
                    <option value="">未标注（视为已熟练）</option>
                    {WEAPON_PROFICIENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
```

5. **只写进原型**，不写进背包条目：`addCustomItem(baseItem)`（`:667`）的 `baseItem` 对象里加 `proficiencyTier: isWeapon ? weaponTier : ''`；`updateCustomItem(proto.id, typePatch)`（`:705`）的 `typePatch` 里同样加这一行。

- [ ] **Step 6: 构建验证**

Run: `npm run build`
Expected: 构建成功，无 `SIMPLE_WEAPON_CATEGORIES is not defined` 之类报错

- [ ] **Step 7: 手动验证档位标注**

`npm run dev` → 角色页 → 六维属性区 → "熟练项设置" → 点"军用武器" → 关闭后重新打开，确认军用按钮呈金色高亮、清单里 22 把军用武器全部勾选、武器下拉新增的"钉头锤/战镐/鞭/骑枪/巨锤/长柄刀"也在其中。

- [ ] **Step 8: 提交**

```bash
git add src/data/itemDatabase.js src/components/AbilityModule.jsx src/components/ItemAddForm.jsx
git commit -m "feat: 武器原型标注 proficiencyTier，熟练项分组改读档位"
```

---

### Task 3: 登记两个战斗风格/专长效果并聚合

**Files:**
- Modify: `src/data/buffTypes.js:440-450`（offense 效果表）
- Modify: `src/hooks/useBuffCalculator.js:550-558`、`:1104` 附近返回对象
- Test: `src/hooks/computeBuffStats.test.js`（已存在，追加用例）

- [ ] **Step 1: 写失败测试**

在 `src/hooks/computeBuffStats.test.js` 末尾追加（沿用该文件已有的构造 character 的 helper 风格；若该文件用内联对象，则照抄一个）：

```js
describe('双武器战斗与双持客效果聚合', () => {
  const charWith = (effects) => ({
    level: 5, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    buffs: [{ id: 'b1', name: '测试', enabled: true, effects }],
  })

  it('two_weapon_fighting_bonus 聚合为布尔', () => {
    const stats = computeBuffStats(charWith([{ effectType: 'two_weapon_fighting_bonus', category: 'offense', scope: 'global', scopeDetail: [], value: true }]), [])
    expect(stats.twoWeaponFightingBonus).toBe(true)
  })

  it('offhand_ignores_light 聚合为布尔', () => {
    const stats = computeBuffStats(charWith([{ effectType: 'offhand_ignores_light', category: 'offense', scope: 'global', scopeDetail: [], value: true }]), [])
    expect(stats.offhandIgnoresLight).toBe(true)
  })

  it('停用时不聚合', () => {
    const stats = computeBuffStats(charWith([{ effectType: 'offhand_ignores_light', category: 'offense', scope: 'global', scopeDetail: [], value: false }]), [])
    expect(stats.offhandIgnoresLight).toBeFalsy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/hooks/computeBuffStats.test.js`
Expected: FAIL —`stats.twoWeaponFightingBonus` 为 `undefined`

- [ ] **Step 3: 登记进效果字典**

`src/data/buffTypes.js` 的 `offense.effects` 数组内，`extra_attacks`（`:445`）之后插入：

```js
      // 副手附赠攻击可加属性调整值（战斗风格"双武器战斗"的收益）
      { key: 'two_weapon_fighting_bonus', label: '副手加属性', dataType: 'boolean' },
      // 副手可持不具有双手词条的单手武器（专长"双持客"的收益）
      { key: 'offhand_ignores_light', label: '副手免轻型', dataType: 'boolean' },
```

- [ ] **Step 4: 在 computeBuffStats 中聚合**

`src/hooks/useBuffCalculator.js`，在 `:550-558` 那个已经收集 `conditionImmunities` / `weaponExpertiseCategories` 的循环里加两个布尔累加器（循环上方声明，循环内判定）：

```js
    const weaponExpertiseCategories = new Set()
    let twoWeaponFightingBonus = false
    let offhandIgnoresLight = false
    for (const b of entries) {
      if (b.effectType === 'condition_immunity' && Array.isArray(b.value)) {
        for (const c of b.value) conditionImmunities.add(String(c))
      }
      if (b.effectType === 'weapon_expertise' && Array.isArray(b.value)) {
        for (const c of b.value) weaponExpertiseCategories.add(String(c))
      }
      if (b.effectType === 'two_weapon_fighting_bonus') twoWeaponFightingBonus = truthyEffectValue(b.value) || twoWeaponFightingBonus
      if (b.effectType === 'offhand_ignores_light') offhandIgnoresLight = truthyEffectValue(b.value) || offhandIgnoresLight
    }
```

`truthyEffectValue` 放同文件顶部（`computeBuffStats` 之外）：

```js
/** 布尔型效果取值：兼容 true / 'true' / {value:true} / 1 */
function truthyEffectValue(raw) {
  if (raw === true || raw === 1 || raw === 'true') return true
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw.value === true || raw.value === 1
  return false
}
```

返回对象里 `weaponExpertiseCategories: [...weaponExpertiseCategories],`（`:1104`）之后加：

```js
      twoWeaponFightingBonus,
      offhandIgnoresLight,
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/hooks/computeBuffStats.test.js src/hooks/useBuffCalculator.test.js src/lib/buffEffectCoverage.test.js`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add src/data/buffTypes.js src/hooks/useBuffCalculator.js src/hooks/computeBuffStats.test.js
git commit -m "feat: 登记并聚合 副手加属性/副手免轻型 两个效果"
```

---

### Task 4: 双持客默认效果归属纠错

**Files:**
- Modify: `src/data/featDefaultBuffs.js:377-395`

- [ ] **Step 1: 改默认效果**

`dual_wielder` 条目里那两行 `effectType: 'two_weapon_fighting_bonus'` + `value: { addAbilityMod: true }` 整段替换为：

```js
    {
      effectType: 'offhand_ignores_light',
      category: 'offense',
      scope: 'global',
      scopeDetail: [],
      value: true,
    },
```

理由（写进提交信息，不写进代码注释）：`feats.js:146-149` 双持客原文给的是"副手可用非轻型武器"，"副手能加属性调整值"属战斗风格"双武器战斗"。旧效果全项目无人读取，是死配置。

- [ ] **Step 2: 全库确认没有残留引用**

Run: `grep -rn "addAbilityMod" src/`
Expected: 无输出（该字段只在这一处出现过）。若有输出，逐个改判后再提交。

- [ ] **Step 3: 构建 + 提交**

```bash
npm run build
git add src/data/featDefaultBuffs.js
git commit -m "fix: 双持客默认效果改为副手免轻型，属性加值归双武器战斗"
```

> **DM 侧待办（不写代码）**：上线后在角色页战斗风格"双武器战斗 → 配置默认 BUFF"里挂"副手加属性"效果并保存，副手卡才会加属性调整值。

---

## Phase B — 派生器与实时化

### Task 5: 派生器纯函数

**Files:**
- Create: `src/components/combat/deriveWieldedWeaponMeans.js`
- Test: `src/components/combat/deriveWieldedWeaponMeans.test.js`

- [ ] **Step 1: 写失败测试**

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { deriveWieldedWeaponMeans, makeWieldedMeanId } from './deriveWieldedWeaponMeans'

let seq = 0
/** 造一份角色：held 传原型 id 数组（null = 空槽） */
function charWith(held) {
  const inventory = []
  const equippedHeld = held.map((id, i) => {
    if (!id) return { id: i === 0 ? 'main' : i === 1 ? 'off' : `held_${i}`, inventoryId: null }
    const entry = { id: `inv_${++seq}`, itemId: id }
    inventory.push(entry)
    return { id: i === 0 ? 'main' : i === 1 ? 'off' : `held_${i}`, inventoryId: entry.id }
  })
  return { inventory, equippedHeld }
}
const TIER_IDS = {
  simple: ['club', 'dagger', 'spear', 'light_crossbow'],
  martial: ['longsword', 'greatsword', 'war_pick'],
  firearm: ['gun_pistol'],
}
const ALL_PROF = ['simple', 'martial', 'firearms']
const CTX = { profWeapons: ALL_PROF, tierMemberIds: TIER_IDS }

const bySlot = (cards) => Object.fromEntries(cards.map((c) => [c.slotIndex, c]))

describe('deriveWieldedWeaponMeans', () => {
  it('空手不出卡', () => {
    expect(deriveWieldedWeaponMeans(charWith([null, null]), CTX)).toEqual([])
  })

  it('仅主手：一张主手可用卡，标签与动作正确', () => {
    const cards = deriveWieldedWeaponMeans(charWith(['longsword']), CTX)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ slotIndex: 0, slotLabel: '主手', actionLabel: '1 动作', available: true })
  })

  it('双持两把轻型：副手为附赠动作且走附赠攻击模式', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'dagger']), CTX))
    expect(cards[0].available).toBe(true)
    expect(cards[1]).toMatchObject({ slotLabel: '副手', actionLabel: '附赠动作', available: true, weaponVersatileMode: 'bonus_action' })
  })

  it('副手非轻型且无双持客 → 灰卡带原因', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'longsword']), CTX))
    expect(cards[1]).toMatchObject({ available: false, unavailableReason: '缺少轻型词条，且未获得双持客' })
    expect(cards[1].weaponProficient).toBe(true)
  })

  it('副手非轻型但有双持客 → 可用', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'war_pick']), { ...CTX, offhandIgnoresLight: true }))
    expect(cards[1].available).toBe(true)
    expect(cards[1].unavailableReason).toBe('')
  })

  it('主手双手武器 → 副手灰卡且原因为被占用', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['greatsword', 'dagger']), CTX))
    expect(cards[1]).toMatchObject({ available: false, unavailableReason: '主手为双手武器，副手被占用' })
  })

  it('备用手持位同样出卡，标签为备用、动作为 1 动作', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['longsword', null, 'spear']), CTX))
    expect(cards[2]).toMatchObject({ slotIndex: 2, slotLabel: '备用', actionLabel: '1 动作', available: true })
  })

  it('变身状态返回空数组', () => {
    expect(deriveWieldedWeaponMeans(charWith(['longsword']), { ...CTX, isTransformed: true })).toEqual([])
  })

  it('法器不出卡', () => {
    expect(deriveWieldedWeaponMeans(charWith(['focus_staff']), CTX)).toEqual([])
  })

  it('盾牌不出卡', () => {
    expect(deriveWieldedWeaponMeans(charWith(['longsword', 'shield']), CTX)).toHaveLength(1)
  })

  it('槽位指向已不存在的物品：不出卡也不抛错', () => {
    const char = { inventory: [], equippedHeld: [{ id: 'main', inventoryId: 'inv_missing' }] }
    expect(deriveWieldedWeaponMeans(char, CTX)).toEqual([])
  })

  it('不熟练的武器 weaponProficient 为 false', () => {
    const cards = deriveWieldedWeaponMeans(charWith(['war_pick']), { ...CTX, profWeapons: ['club'] })
    expect(cards[0].weaponProficient).toBe(false)
  })

  it('id 由槽位序号 + 物品编号确定性拼出', () => {
    const char = charWith(['longsword'])
    const cards = deriveWieldedWeaponMeans(char, CTX)
    expect(cards[0].id).toBe(makeWieldedMeanId(0, char.inventory[0].id))
    expect(cards[0].id).toBe(`wielded_0_${char.inventory[0].id}`)
  })

  it('武器原型解析走 getItemById（内置武器可查到 proto）', () => {
    const cards = deriveWieldedWeaponMeans(charWith(['longsword']), CTX)
    expect(cards[0].weaponOpt.proto.id).toBe('longsword')
    expect(cards[0].weaponOpt.entry.itemId).toBe('longsword')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/combat/deriveWieldedWeaponMeans.test.js`
Expected: FAIL —模块不存在

- [ ] **Step 3: 实现派生器**

创建 `src/components/combat/deriveWieldedWeaponMeans.js`：

```js
/**
 * 手持武器 → 战斗手段卡 派生器（纯函数，不写任何数据）
 *
 * 输出对象刻意保持与旧 combatMeans 条目同形（type/weaponNameSuffix/…/gains），
 * 这样 computePhysicalWeaponStats 与 WeaponAttackCard 无需第二套算法。
 */
import { getItemById } from '../../data/itemDatabase'
import { isWeaponProtoProficient } from '../../lib/weaponProficiency'
import {
  weaponHasLight, weaponHasTwoHanded, weaponHasVersatile, getDefaultWeaponMode,
} from './combatMeanUtils'

const WEAPON_TYPES = new Set(['近战武器', '远程武器', '枪械'])

export const WIELDED_UNAVAILABLE_MAIN_TWO_HANDED = '主手为双手武器，副手被占用'
export const WIELDED_UNAVAILABLE_NO_LIGHT = '缺少轻型词条，且未获得双持客'

/** 派生卡 id：必须由槽位序号 + 物品编号确定性拼出（组合技要稳定引用它） */
export function makeWieldedMeanId(slotIndex, inventoryId) {
  return `wielded_${slotIndex}_${inventoryId}`
}

function slotLabelFor(index) {
  if (index === 0) return '主手'
  if (index === 1) return '副手'
  return '备用'
}

function weaponOptFor(entry) {
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  if (!proto) return null
  const 攻击 = entry.攻击 ?? proto.攻击 ?? '—'
  const 伤害 = entry.伤害 ?? proto.伤害 ?? '—'
  const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
  return { entry, proto, name, 攻击, 伤害 }
}

/** 副手合法性：返回 '' 表示合法 */
function offhandBlockReason(mainOpt, offOpt, ctx) {
  // 多用武器可单手持有，不会占用副手
  if (mainOpt && weaponHasTwoHanded(mainOpt) && !weaponHasVersatile(mainOpt)) return WIELDED_UNAVAILABLE_MAIN_TWO_HANDED
  if (weaponHasLight(offOpt)) return ''
  if (ctx.offhandIgnoresLight && !weaponHasTwoHanded(offOpt)) return ''
  return WIELDED_UNAVAILABLE_NO_LIGHT
}

/**
 * @param {object} character 角色数据（读 equippedHeld / inventory）
 * @param {object} ctx
 * @param {string[]} ctx.profWeapons char.proficiencies.weapons
 * @param {object} ctx.tierMemberIds collectTierMemberIds 的结果
 * @param {boolean} ctx.offhandIgnoresLight buffStats.offhandIgnoresLight
 * @param {boolean} ctx.isTransformed buffStats.creatureTransform 是否生效
 */
export function deriveWieldedWeaponMeans(character, ctx = {}) {
  if (ctx.isTransformed) return []
  const heldSlots = Array.isArray(character?.equippedHeld) ? character.equippedHeld : []
  const inventory = Array.isArray(character?.inventory) ? character.inventory : []
  if (heldSlots.length === 0) return []

  const resolved = heldSlots.map((slot, i) => {
    const inventoryId = slot?.inventoryId
    if (!inventoryId) return null
    const invIndex = inventory.findIndex((e) => e?.id === inventoryId)
    if (invIndex < 0) return null
    const opt = weaponOptFor(inventory[invIndex])
    if (!opt || !WEAPON_TYPES.has(String(opt.proto.类型 ?? '').trim())) return null
    return { ...opt, invIndex, inventoryId }
  })

  const mainOpt = resolved[0]

  return resolved
    .map((opt, i) => {
      if (!opt) return null
      const cfg = (opt.entry.combatMeanConfig && typeof opt.entry.combatMeanConfig === 'object') ? opt.entry.combatMeanConfig : {}
      const isOffhand = i === 1
      let available = true
      let unavailableReason = ''
      if (isOffhand) {
        unavailableReason = offhandBlockReason(mainOpt, opt, ctx)
        available = unavailableReason === ''
      }
      const modeFromConfig = ['one_hand', 'two_hand', 'ranged', 'bonus_action'].includes(cfg.versatileMode) ? cfg.versatileMode : null
      const weaponVersatileMode = modeFromConfig || (isOffhand ? 'bonus_action' : getDefaultWeaponMode(opt))
      return {
        id: makeWieldedMeanId(i, opt.inventoryId),
        type: 'physical',
        derived: true,
        slotIndex: i,
        slotLabel: slotLabelFor(i),
        actionLabel: isOffhand ? '附赠动作' : '1 动作',
        available,
        unavailableReason,
        weaponInventoryId: opt.inventoryId,
        weaponInventoryIndex: opt.invIndex,
        weaponOpt: opt,
        weaponProficient: isWeaponProtoProficient(opt.proto, ctx.profWeapons, ctx.tierMemberIds),
        weaponNameSuffix: typeof cfg.nameSuffix === 'string' ? cfg.nameSuffix : '',
        damageType: typeof cfg.damageTypeOverride === 'string' ? cfg.damageTypeOverride : '',
        weaponVersatileMode,
        extraDamageDice: Array.isArray(cfg.extraDamageDice) ? cfg.extraDamageDice : [],
        targetCreatureType: typeof cfg.targetCreatureType === 'string' ? cfg.targetCreatureType : '',
        abilityForAttack: typeof cfg.abilityForAttack === 'string' && cfg.abilityForAttack ? cfg.abilityForAttack : null,
        disabledAutoGainKeys: Array.isArray(cfg.disabledAutoGainKeys) ? cfg.disabledAutoGainKeys : [],
        gains: [],
      }
    })
    .filter(Boolean)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/combat/deriveWieldedWeaponMeans.test.js`
Expected: 全部 PASS。已核实 `itemDatabase.js:311` 的 `shield` 原型为 `类型: '盔甲'` + `子类型: '盾牌'`，本就不在武器类型白名单内，"盾牌不出卡"应由类型白名单自然通过；若仍失败，检查 `weaponOptFor` 是否错误地返回了非武器条目，不要放宽白名单。

- [ ] **Step 5: 提交**

```bash
git add src/components/combat/deriveWieldedWeaponMeans.js src/components/combat/deriveWieldedWeaponMeans.test.js
git commit -m "feat: 手持武器自动派生战斗手段卡纯函数"
```

- [ ] **Step 6（实现后回填的交接要点，供 Task 6/9/11/16 参考）**

副手识别按**数组下标 `i === 1`**，不按 `slot.id === 'off'`。理由：`equipmentSlotUtils.js` 的 `SLOT_GROUPS`/`buildItemSlotMap`/`applySlotChange` 全按 `held_${index}` 下标语义读写，`EquipmentAndInventory.jsx` 的 `HELD_FIXED = 2` 使前两格永不被压缩或重排；而 `'main'`/`'off'` 只是新存档的默认字面量，`migrateSlots` 会把老槽位写成 `held_${i}`，`buffEffectCoverage.test.js:102` 里甚至有完全不带 `id` 的存档 —— 认 id 会让这些角色的副手**漏掉合法性校验**（更坏的失效方向）。

派生卡输出的取值约定：
- 卡上没有展示名字段；名字取 `card.weaponOpt.name`，背包下标取 `card.weaponInventoryIndex`（`weaponOpt` 本身没有 `.index`）。`buildDefaultGainsFromBuffs` 走的正是 `character.inventory[cm.weaponInventoryIndex]`，Task 8 无需改。
- `damageType` 未配置时是 `''`，而旧持久化卡是 `null`；`weaponVersatileMode` 恒为具体字符串，旧卡可能是 `null`。后续任何 `!= null` 判断都要改成真值判断。
- `available` **只**表达副手合法性，不含不熟练/装填/同调/资源状态。不熟练要不要灰卡、灰卡文案放哪，由 Task 6/9 决定；两处以上用到的原因字符串应收进共享枚举。
- 备用位（下标 ≥ 2）各出一张 `1 动作` 卡，不做互相占用检查（设计已核准），Task 16 文档需向玩家说明。
- `cfg.versatileMode` 优先于副手的 `bonus_action` 默认值。Task 11 若允许在副手物品上选攻击模式，必须先定这条优先级。
- `extraDamageDice` / `disabledAutoGainKeys` 从 `entry.combatMeanConfig` 浅拷贝出来，防止下游 `push` 直接改写已存档物品数据。
- 派生 id 前缀 `wielded_` 与持久化 id 前缀 `cm_` 天然不冲突；若合并后的列表要过 `normalizeCombatMeanType`，注意它会为 spell/combo 补 `null` 键。

---

### Task 6: 伤害加值规则 2/3/4

**Files:**
- Modify: `src/components/combat/combatMeanUtils.js:371,436`
- Test: `src/components/combat/combatMeanUtils.test.js`（已存在，追加）

- [ ] **Step 1: 写失败测试**

追加到 `src/components/combat/combatMeanUtils.test.js`（该文件首行已有 `// @vitest-environment jsdom`）：

```js
import { computePhysicalWeaponStats } from './combatMeanUtils'
import { getItemById } from '../../data/itemDatabase'

function optFor(itemId) {
  const proto = getItemById(itemId)
  return { entry: { id: 'inv_x', itemId }, proto, name: proto.类别, 攻击: proto.攻击, 伤害: proto.伤害 }
}
const CTX = {
  effectiveAbilities: { str: 6, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  prof: 3, spellAbility: 'int', buffStats: {}, flatBuffEffects: [], itemFormulaContext: {},
}
const cm = (over) => ({ type: 'physical', weaponProficient: true, gains: [], extraDamageScores: [], ...over })

describe('computePhysicalWeaponStats 属性调整值门控', () => {
  it('熟练 + 主手 → 命中加熟练、伤害加调整值', () => {
    const s = computePhysicalWeaponStats(cm({}), optFor('longsword'), CTX)
    expect(s.abilityMod).toBe(-2)
    expect(s.physicalAttackBonus).toBe(-2 + 3)
    expect(s.damageMod).toBe(-2)
  })

  it('不熟练 → 命中不加熟练，伤害不加调整值（负数仍扣）', () => {
    const s = computePhysicalWeaponStats(cm({ weaponProficient: false }), optFor('longsword'), CTX)
    expect(s.physicalAttackBonus).toBe(-2)
    expect(s.damageMod).toBe(-2)
  })

  it('不熟练 + 正调整值 → 伤害为 0', () => {
    const ctx = { ...CTX, effectiveAbilities: { ...CTX.effectiveAbilities, str: 20 } }
    const s = computePhysicalWeaponStats(cm({ weaponProficient: false }), optFor('longsword'), ctx)
    expect(s.abilityMod).toBe(5)
    expect(s.damageMod).toBe(0)
  })

  it('副手附赠攻击 → 不加调整值（正数被剥夺）', () => {
    const ctx = { ...CTX, effectiveAbilities: { ...CTX.effectiveAbilities, str: 20 } }
    const s = computePhysicalWeaponStats(cm({ weaponVersatileMode: 'bonus_action' }), optFor('dagger'), ctx)
    expect(s.damageMod).toBe(0)
  })

  it('副手附赠攻击 + 双武器战斗效果 → 加调整值', () => {
    const ctx = { ...CTX, effectiveAbilities: { ...CTX.effectiveAbilities, str: 20 }, buffStats: { twoWeaponFightingBonus: true } }
    const s = computePhysicalWeaponStats(cm({ weaponVersatileMode: 'bonus_action' }), optFor('dagger'), ctx)
    expect(s.damageMod).toBe(5)
  })

  it('规则原文"除非为负数"：负调整值被剥夺时仍照常扣', () => {
    const s = computePhysicalWeaponStats(cm({ weaponVersatileMode: 'bonus_action' }), optFor('dagger'), CTX)
    expect(s.abilityMod).toBe(-2)
    expect(s.damageMod).toBe(-2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: FAIL —"不熟练"用例的 `damageMod` 期望 `-2` 实得 `-2`（巧合通过），"副手附赠攻击 + 双武器战斗"期望 `5` 实得 `0`，"正调整值不熟练"期望 `0` 实得 `5`

- [ ] **Step 3: 落地三条规则**

`src/components/combat/combatMeanUtils.js:436` 一行替换为：

```js
  const isBonusActionOffhand = cm.weaponVersatileMode === 'bonus_action'
  const canAddAbilityMod = weaponProficient && !(isBonusActionOffhand && !buffStats?.twoWeaponFightingBonus)
  const damageMod = canAddAbilityMod ? abilityMod : Math.min(0, abilityMod)
```

返回对象（`:443-449`）里补上这两个诊断字段，供卡面 tooltip 与测试使用：

```js
    canAddAbilityMod, isBonusActionOffhand,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/combat/combatMeanUtils.js src/components/combat/combatMeanUtils.test.js
git commit -m "fix: 熟练与副手附赠攻击门控伤害属性调整值，负数照常扣"
```

---

### Task 7: 存量物理卡清理 + 组合技解绑

**Files:**
- Modify: `src/components/combat/combatMeanUtils.js`（新增导出）
- Test: `src/components/combat/combatMeanUtils.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { sanitizeLegacyCombatMeans } from './combatMeanUtils'

describe('sanitizeLegacyCombatMeans', () => {
  it('清掉物理条目并把引用它的组合技解绑', () => {
    const raw = [
      { id: 'cm_0_physical', type: 'physical', weaponInventoryIndex: 2 },
      { id: 'cm_1_spell', type: 'spell_attack', spellName: '火焰箭' },
      { id: 'cm_2_combo', type: 'combo', primaryMeanId: 'cm_0_physical', attachments: [{ name: '至圣斩' }] },
      { id: 'cm_3_combo', type: 'combo', primaryMeanId: 'cm_1_spell', attachments: [] },
    ]
    const out = sanitizeLegacyCombatMeans(raw)
    expect(out.map((m) => m.id)).toEqual(['cm_1_spell', 'cm_2_combo', 'cm_3_combo'])
    expect(out[1].primaryMeanId).toBe(null)
    expect(out[2].primaryMeanId).toBe('cm_1_spell')
  })

  it('无物理条目时返回同一引用（避免无谓重渲染）', () => {
    const raw = [{ id: 'a', type: 'spell_attack' }]
    expect(sanitizeLegacyCombatMeans(raw)).toBe(raw)
  })

  it('非物理条目原样保留字段', () => {
    const raw = [{ id: 'i', type: 'item', itemInventoryIndex: 0 }]
    expect(sanitizeLegacyCombatMeans(raw)).toEqual(raw)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: FAIL —`sanitizeLegacyCombatMeans is not a function`

- [ ] **Step 3: 实现**

追加到 `src/components/combat/combatMeanUtils.js` 末尾：

```js
/**
 * 存量清理：物理武器卡改由手持槽派生，combatMeans 中的 type==='physical' 条目一律丢弃，
 * 并解绑引用了被丢弃条目的组合技（否则组合技卡会在渲染层静默消失）。
 */
export function sanitizeLegacyCombatMeans(means) {
  const arr = Array.isArray(means) ? means : []
  if (!arr.some((m) => m?.type === 'physical')) return arr
  const droppedIds = new Set(arr.filter((m) => m?.type === 'physical').map((m) => m.id))
  return arr
    .filter((m) => m?.type !== 'physical')
    .map((m) => (m?.type === 'combo' && droppedIds.has(m.primaryMeanId) ? { ...m, primaryMeanId: null } : m))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/combat/combatMeanUtils.js src/components/combat/combatMeanUtils.test.js
git commit -m "feat: 战斗手段存量物理条目清理并解绑引用它的组合技"
```

- [ ] **Step 6（实现后回填的交接要点，供 Task 9/10/16 参考）**

物理判定是**反向白名单**，不是 `type === 'physical'`。`NON_PHYSICAL_MEAN_TYPES = {spell_attack, spell, item, combo}`（`combatMeanUtils.js:729`），其余（含缺 `type`、拼错）一律按物理清掉。这与 `CombatStatus.jsx:633-636` 的 `normalizeCombatMeanType` 已逐值核对等价——**本 Step 上方原文里 `m?.type === 'physical'` 的写法已废弃**，照抄会漏清老存档里没写 `type` 的武器卡，Task 9 接线后与派生卡重复出现两张同名武器卡。`spell` 是 `spell_attack` 的历史别名，必须留在白名单内，误杀会让法术卡消失。

解绑 `primaryMeanId` 与"卡片是否显示"**无关**：`CombatStatus.jsx:2975` 取主卡、`:3050` `if (isCombo && !comboPrimary) return null`，悬空 id 与 `null` 两种情况组合技卡都不渲染。解绑的真实价值只在持久层与编辑回填——`:1128` 打开组合技编辑器时 `setAddComboPrimaryId(cm.primaryMeanId ?? null)`，留着悬空 id 会回填一个下拉里选不中的主手段，置 `null` 才表达"待重选"。卡面文案与"未选主手段"占位由 Task 10 负责。

返回引用契约（已用测试锁死）：数组且无需清理 → **同一引用**；有清理 → 新数组且**未受影响元素仍是原对象**（只有被解绑的 combo 新建）；非数组 → 每次新空数组。Task 9 的持久化守卫必须用 `sanitized !== raw` 引用比较，调用处**不得再包 `[...]` / `.slice()`**，否则引用恒不等 → 每次 effect 都 `saveCombatMeans` → 写循环。

**Task 9 待收**：把 `normalizeCombatMeanType` 上收进 `combatMeanUtils.js` 导出、组件反向 import，并让 `NON_PHYSICAL_MEAN_TYPES` 由它派生，消除现在这份"两处注释互指"的双份口径（`utils:728` 已指名组件函数，组件侧的互指那半句还没补）。本轮不上收是因为它会改 `CombatStatus.jsx`，与本任务「只加纯函数不接线」的范围冲突。

---

### Task 8: 自动增益改为渲染期现算

**Files:**
- Modify: `src/components/combat/combatMeanUtils.js:599-703`
- Test: `src/components/combat/combatMeanUtils.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { computeLiveGains } from './combatMeanUtils'

const BUFF = (effects) => [{ id: 'b', name: 'x', enabled: true, effects }]

describe('computeLiveGains', () => {
  const cm = { type: 'spell_attack', spellName: '灼热之手', gains: [{ id: 'g0', type: 'damageBonus', value: 1, enabled: true }] }

  it('不持久化：同一入参重复调用返回等值内容', () => {
    const a = computeLiveGains(cm, { buffStats: {}, mergedBuffs: BUFF([{ effectType: 'damage_bonus', scope: 'global', scopeDetail: [], value: 2 }]) })
    const b = computeLiveGains(cm, { buffStats: {}, mergedBuffs: BUFF([{ effectType: 'damage_bonus', scope: 'global', scopeDetail: [], value: 2 }]) })
    expect(a.map(({ id, ...rest }) => rest)).toEqual(b.map(({ id, ...rest }) => rest))
  })

  it('保留手动增益', () => {
    const live = computeLiveGains(cm, { buffStats: {}, mergedBuffs: [] })
    expect(live.some((g) => g.type === 'damageBonus' && g.value === 1 && !g.auto)).toBe(true)
  })

  it('按 disabledAutoGainKeys 过滤掉指定类型', () => {
    const live = computeLiveGains({ ...cm, disabledAutoGainKeys: ['extraDice'] }, {
      buffStats: {},
      mergedBuffs: BUFF([{ effectType: 'extra_damage_dice', scope: 'global', scopeDetail: [], value: '2d6 火焰' }]),
    })
    expect(live.some((g) => g.type === 'extraDice')).toBe(false)
  })

  it('源 BUFF 消失后不留残值', () => {
    const withBuff = computeLiveGains(cm, { buffStats: {}, mergedBuffs: BUFF([{ effectType: 'dice_floor_2', scope: 'global', scopeDetail: [], value: true }]) })
    expect(withBuff.some((g) => g.type === 'diceFloor2')).toBe(true)
    const without = computeLiveGains(cm, { buffStats: {}, mergedBuffs: [] })
    expect(without.some((g) => g.type === 'diceFloor2')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: FAIL —`computeLiveGains is not a function`

- [ ] **Step 3: 实现现算入口**

追加到 `src/components/combat/combatMeanUtils.js` 的增益工具区（`mergeAutoGains` 之后）：

```js
/**
 * 渲染期现算该卡当前应得的增益：自动部分由 BUFF 集合反推，手动部分留在卡上。
 * 不写盘 —— 这是"卡上不得有数值快照"不变量的落点。
 * @param {object} cm
 * @param {{buffStats:object, mergedBuffs:array, character:object, formulaContext:object, primaryForGains?:object}} opts
 */
export function computeLiveGains(cm, opts = {}) {
  const { buffStats, mergedBuffs, character, formulaContext, primaryForGains } = opts
  const source = primaryForGains || cm
  const isSpellMean = source?.type === 'spell_attack' || source?.type === 'spell'
  const auto = buildDefaultGainsFromBuffs(source, buffStats, mergedBuffs, isSpellMean, character || null, formulaContext || {})
  const disabled = new Set(Array.isArray(cm?.disabledAutoGainKeys) ? cm.disabledAutoGainKeys : [])
  const keptAuto = disabled.size ? auto.filter((g) => !disabled.has(g.type)) : auto
  const manual = (Array.isArray(cm?.gains) ? cm.gains : []).filter((g) => g && !g.auto)
  return [...keptAuto, ...manual]
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/combat/combatMeanUtils.js src/components/combat/combatMeanUtils.test.js
git commit -m "feat: computeLiveGains 渲染期现算战斗手段增益"
```

- [ ] **Step 6（实现后回填的交接要点，供 Task 9/11/13/14 参考）**

自动增益 id 已改为**确定性** `'auto_' + type`（`pushOnce`，`combatMeanUtils.js:608`），不再是 `Date.now()+随机`。依据：`computeLiveGains` 每帧调用，而 `GainEditor.jsx:76` 用 `key={g.id}`、`:80` 用 `updateItem(g.id, {enabled})` 按 id 寻址，随机 id 会让勾选写到下一帧就不存在的 id 上。安全性由 `hasAutoGain(type)` 保证（每种 type 最多一条 auto 增益，全仓已 grep 确认无人按 `g_` 前缀解析 id，区分自动/手动一律读 `g.auto` 布尔位）。**注意 id 固定 ≠ 已合并**：`damage_bonus`/`attack_bonus`/`per_die_bonus` 跨 BUFF 求和，而 `extraDice`/`advantage`/`diceFloor2` 只取首个来源、其余静默丢弃（既有行为，非本任务引入）。

`computeLiveGains` 的调用约定（已写进函数 JSDoc）：每次返回**新数组**，**禁止**放进 `useMemo`/`useEffect` 的依赖或回写磁盘；手动项与 `cm.gains` **共享对象引用**，改写必须走 `{...g, ...patch}`。真正影响取数的入参只有三个：`mergedBuffs` 必须是含虚拟 BUFF 的合并全集（漏虚拟 BUFF = 专长/特性加值静默归零）、`character` 缺失会让物理卡拿不到 `weaponProto`（带 scope 的加值全部落空）、`formulaContext` 缺失会让 `attack_enhancement_bonus` / `hit_bonus` 求值为 NaN 被丢弃。`opts.buffStats` 目前是**死参数**（`buildDefaultGainsFromBuffs` 按 `cm.type` 自判，不读它），保留只为 Task 9 调用点形状稳定。

**已确认缺口**：`item` 类型卡在 `buildDefaultGainsFromBuffs` 里 `isPhysical`/`isSpellAttack` 皆假，`scopeMatches` 只放行 `global` 范围（`:633-638`）—— 道具卡上的非 global 加值拿不到。属既有行为，Task 14 迁移道具卡时一并处理，本任务未动。

**Task 11 待收**：`GainEditor` 现在用 `enabled: false` 关闭自动增益（`:78-80` 那条勾选框），但自动部分是每帧现算的，下一次渲染就会把 `enabled` 冲掉 —— 真正的开关是写 `cm.disabledAutoGainKeys`（按 type）。Task 11 做武器配置编辑器时必须把这条勾选框改成读写 `disabledAutoGainKeys`，否则"关掉某条自动增益"不可持久。同时 `mergeAutoGains` / `gainsContentEqual` 是旧快照写盘路径的部件，Task 9 Step 3 删 effect 后若组件无引用则一并清理（函数本身可留到无引用再删）。

---

### Task 9: CombatStatus 接入派生卡并删除快照同步

**Files:**
- Modify: `src/components/CombatStatus.jsx:329-341,498-513,637-661,880-929,962-974,1510-1543,2968-3090,3535-3560`
- Modify: `src/components/combat/AddMeanTypeStep.jsx`（删"武器攻击"入口与 `initWeaponPick`）

> 这一步改动集中在一个 3900 行文件里，**逐小步走、每步跑构建**，不要攒到最后一次编译。

- [ ] **Step 1: 引入派生器；先摸清 weaponsFromInv 的全部引用点**

在 import 区加入：

```js
import { deriveWieldedWeaponMeans } from './combat/deriveWieldedWeaponMeans'
import { collectTierMemberIds } from '../lib/weaponProficiency'
import { getItemList, ITEM_DATABASE } from '../data/itemDatabase'
import { sanitizeLegacyCombatMeans, computeLiveGains } from './combat/combatMeanUtils'
```

`grep -n "weaponsFromInv" src/components/CombatStatus.jsx src/components/combat/*.jsx` 得到 9 处（本文件）+ 3 处（子组件）。逐点归属如下，**先通读再动手**，否则会撞上"变量已删、引用还在"的构建错误：

| 位置 | 当前用途 | 由哪一步处理 |
|------|---------|-------------|
| `CombatStatus.jsx:329-341` | `getWeaponsFromInventory` 函数定义 | Task 11 Step 5 删除 |
| `:1543` | `weaponsFromInv` memo 定义 | Task 11 Step 5 删除 |
| `:965-974` | `openAddCombatMeanModal` 取首把武器初始化表单 | Step 4 |
| `:1510-1541` | `buildComboEffectiveMean` + `rollComboDamage`（组合技直接投伤害，**全项目无调用方，是死代码**） | Step 4 整段删除 |
| `:1545-1568` | `openEditWeaponMean` 编辑初值 | Task 11 Step 3 |
| `:1590-1614` | `previewWeaponStats` 编辑器预览 | Task 11 Step 4 |
| `:2994` | 渲染段解析 `weaponOpt` | Step 5 |
| `:3540`、`:3547` | `AddMeanTypeStep` 的 props 与"武器攻击"按钮回调 | Step 6 |
| `:3611` | `AddComboStep` 的 props（主手段标签） | Task 10 |
| `:3628` | `AddWeaponStep` 的 props（武器下拉） | Task 11 Step 2 |
| `AddMeanTypeStep.jsx:8,15-17,35-43` | "武器攻击"按钮 + `initWeaponPick` | Step 6 |
| `AddComboStep.jsx:16,33,72,104` | 主手段下拉与附加组件取数 | Task 10 |
| `AddWeaponStep.jsx:20,29,33,61` | 武器选择下拉 | Task 11 Step 2 |

**本 Step 只加 import。** `getWeaponsFromInventory`（`:329-341`）与 `const weaponsFromInv = useMemo(...)`（`:1543`）这两处定义一路保留到**最后一名消费者**改完（Task 11 Step 5）再删 —— 提前删除会让构建长时间停在红态，无法判断自己改对了哪一步。

- [ ] **Step 2: 存量清理 + 读档过滤**

`combatMeans` 的 state 初始化器（`:637-661`）与 `char.combatMeans` 同步 effect（`:880-901`）两处，都在 `Array.isArray(...)` 之后套一层 `sanitizeLegacyCombatMeans`。初始化器改成以 `sanitizeLegacyCombatMeans(Array.isArray(char?.combatMeans) ? char.combatMeans : [])` 作为被 map 的源；同步 effect 同改。同时把两处 map 里透传的字段补上 `disabledAutoGainKeys`：

```js
      disabledAutoGainKeys: Array.isArray(m.disabledAutoGainKeys) ? m.disabledAutoGainKeys : [],
```

（`saveCombatMeans`（`:935-961`）的写回对象里也加同一行。）

紧接同步 effect 之后，加一次性持久化。**不要**自己写 `raw.some((m) => m?.type === 'physical')` 当守卫（那是第三种口径：`sanitizeLegacyCombatMeans` 认"缺 type / 未知 type 也算物理"，字面量比较会漏判老存档，结果是只清内存、永不落盘）。守卫直接复用清理函数的引用契约——返回同一引用就代表无需写回：

```js
  const legacyPurgeRef = useRef(false)
  useEffect(() => {
    if (legacyPurgeRef.current) return
    legacyPurgeRef.current = true
    const raw = Array.isArray(char?.combatMeans) ? char.combatMeans : []
    const purged = sanitizeLegacyCombatMeans(raw)
    if (purged !== raw) saveCombatMeans(purged)
  }, [char?.id, char?.combatMeans])
```

`purged !== raw` 是唯一正确的判定条件：**任何**在调用处再包一层 `[...]` / `.slice()` 的写法都会让引用恒不等，每次 `char.combatMeans` 变化都触发一次写回，与 `saveCombatMeans` 的整条 upsert 撞成写循环（见「一次用户动作只写一次」约束）。同理 `purged` 可能正是 `char.combatMeans` 本体，必须按不可变对待，禁止 `push` / `splice`。

- [ ] **Step 3: 删除快照同步 effect**

整段删除 `:903-929` 的 `/** 全局自动同步：当 BUFF 变化且不在编辑弹窗内时… */` useEffect（含 `if (showAddCombatMeanModal || editingCombatMeanId) return` 那行）。删除后 grep `mergeAutoGains` 与 `gainsContentEqual`，若在本文件已无引用则一并从 import 去掉。

- [ ] **Step 4: 构建派生卡数组，并删除组合技直投伤害死代码**

在 `combatMeans` state 初始化器（`:637-661`）**之后**、`damageRollConfirm` state（`:686`）之前插入下面这段。
必须放在 `combatMeans` 之后：`renderedMeans` 引用了它，放在 `mergedBuffs`（`:498`）与 `buffStats`（`:514`）处会踩到 `const` 的暂时性死区、渲染时直接抛 `Cannot access 'combatMeans' before initialization`。

```js
  const tierMemberIds = useMemo(() => collectTierMemberIds(ITEM_DATABASE), [])
  const profWeaponIds = useMemo(
    () => (Array.isArray(char?.proficiencies?.weapons) ? char.proficiencies.weapons : []),
    [char?.proficiencies?.weapons],
  )
  const derivedMeans = useMemo(
    () => deriveWieldedWeaponMeans(char, {
      profWeapons: profWeaponIds,
      tierMemberIds,
      offhandIgnoresLight: !!buffStats?.offhandIgnoresLight,
      isTransformed: !!buffStats?.creatureTransform,
    }),
    [char, profWeaponIds, tierMemberIds, buffStats?.offhandIgnoresLight, buffStats?.creatureTransform],
  )
  /** 渲染列表：派生武器卡在前，剩余非物理卡在后 */
  const renderedMeans = useMemo(() => [...derivedMeans, ...combatMeans], [derivedMeans, combatMeans])
```

删除 `:1505-1541` 的三个函数：`getComboAttachmentDice`、`buildComboEffectiveMean`、`rollComboDamage`。
`rollComboDamage` 全项目无调用方（组合技的伤害已走渲染段的 `cardCtx` 现算路径），它引用的 `weaponsFromInv` 是本 Step 之后最难消的一处，整段删掉最省事。
删除后 `grep -n "getComboAttachmentDice\|buildComboEffectiveMean" src/components/CombatStatus.jsx` 应无输出。

`openAddCombatMeanModal`（`:962-974`）里"取第一把武器来初始化武器表单"的整段 `if (first) { … } else { … }` 替换为固定默认值（武器不再由该弹窗添加）：

```js
    setAddWeaponIndex(null)
    setAddAbility('str')
    setAddWeaponMode('one_hand')
```

- [ ] **Step 5: 渲染段改为读派生卡**

`combatMeans.map` 区（`:2973`起）按下列 6 处**最小改动**，不要整段重写：

1. `:2973`：`combatMeans.map((cm) => {` → `renderedMeans.map((cm) => {`
2. `:2975`：`combatMeans.find((m) => m.id === cm.primaryMeanId)` → `renderedMeans.find(...)`
   （组合技可以把主手段选成一张派生武器卡，查表必须覆盖派生卡）
3. `:2976-2988` 的 `displayMean` 组合技分支：保留 `gains: cm.gains`（那是组合技自己的**手动**增益），另加一行把禁用项带过来：

```js
                  disabledAutoGainKeys: Array.isArray(cm.disabledAutoGainKeys) ? cm.disabledAutoGainKeys : [],
```

4. `:2994` 的武器取数改为直接读派生卡自带的对象：

```js
            const weaponOpt = isPhysical ? (displayMean.weaponOpt || null) : null
```

5. 在 `:2995` 的 `physStats` 计算**之前**插入现算增益，并把结果喂进去（原稿这里写成了 `if (isPhysical && weaponOpt) {` 的半截代码块，实际不存在这样的分支结构，别照抄）：

```js
            const liveGains = computeLiveGains(displayMean, {
              buffStats, mergedBuffs, character: char, formulaContext: itemFormulaContext,
              primaryForGains: isCombo ? comboPrimary : null,
            })
            const physStats = isPhysical && weaponOpt
              ? computePhysicalWeaponStats({ ...displayMean, gains: liveGains }, weaponOpt, {
                  effectiveAbilities,
                  prof,
                  spellAbility,
                  buffStats,
                  flatBuffEffects,
                  itemFormulaContext,
                })
              : null
```

6. `:3024` 的 `const gains = physStats?.gains ?? getEnabledGains(displayMean)` 改为回退到现算结果（`physStats.gains` 已是 `liveGains` 里启用项的子集，非物理卡走后半段）：

```js
            const gains = physStats?.gains ?? liveGains.filter((g) => g.enabled !== false)
```

`isSpellAttack` / `spellOpt`（`:3040-3041`）本就在早退判断之前，**不需要移动**。

把 `:3050` 的 `if (isCombo && !comboPrimary) return null` 换成占位卡 —— 派生化之后，旧组合技若把主手段指向了已被清理的物理卡，直接 `return null` 会让这张卡**静默消失**，玩家只剩一个空栏位：

```js
            if (isCombo && !comboPrimary) return (
              <div key={cm.id} className={`rounded-lg border border-dashed border-gray-600/70 bg-gray-800/40 p-2 ${COMBAT_LIST_ROW_SHADOW}`}>
                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                  <span>组合技</span>
                  <span className="text-white/70">{cm.name || cm.id}</span>
                  <span>未选择主手段，请点铅笔重新选择</span>
                </div>
              </div>
            )
```

`:3087-3088` 的武器卡分支**不改签名**：`<WeaponAttackCard displayMean={displayMean} weaponOpt={weaponOpt} ctx={cardCtx} comboSuffix={comboSuffix} />`。派生标记、槽位标签、灰卡原因都在 `displayMean` 上（派生器已经写好），Task 13 里组件直接读 `displayMean.derived` / `displayMean.slotLabel`，不要再传一个 `derived` prop。

`cardCtx`（`:3055-3079`）本 Step 不动。它的两个新入口 `registerWeaponPlan` / `openWeaponAttackFlow` 在 Task 13 Step 2 加入，`setDamageRollConfirm` / `handleCreatureSpellAttackResult` 在 Task 14 Step 3 随面板一起删。（`rollAllWeaponDamage` 在 `WeaponAttackCard.jsx:76` 只被解构、从未调用，`ctx` 里保留它属既有冗余，本计划不动。）

- [ ] **Step 6: 添加战斗手段弹窗不再提供"武器攻击"**

`AddMeanTypeStep.jsx`：
- 删除 `:15-17` 的"武器攻击"按钮整块。
- 删除 props 解构里的 `weaponsFromInv`（`:8`）。
- 删除 `:34-43` 的 `initWeaponPick` 与 `:45-54` 的 `initComboPick`（`grep -rn "initWeaponPick\|initComboPick" src/` 只在 `CombatStatus.jsx:39` 的 import 里出现，两个函数都没有调用方）。
- 保留 `onPickWeapon` 这个 prop 名可以删，但**保留组件本身与 `addMeanStep === 'weapon'` 分支**——Task 11 复用它做"编辑武器配置"。

`CombatStatus.jsx`：
- `:39` 改为 `import AddMeanTypeStep from './combat/AddMeanTypeStep'`。
- `:3540` 的 `weaponsFromInv={weaponsFromInv}` 删掉。
- `:3546-3555` 的 `onPickWeapon={…}` 整块删掉（它引用了 `weaponsFromInv[0]`），连带 `initWeaponPick` 那行注释如果存在也删。

此时"添加战斗手段"只剩 道具攻击 / 法术攻击 / 组合技 三项。

- [ ] **Step 7: 构建**

Run: `npm run build`
Expected: 成功。**本 Task 不删 `weaponsFromInv` 定义** —— `AddComboStep`（Task 10）与 `openEditWeaponMean` / `previewWeaponStats` / `AddWeaponStep`（Task 11）仍在读它，现在删会直接构建失败。本 Task 只把渲染段与"添加战斗手段"弹窗从它身上摘干净。

`combatMeanUtils.js:554-561` 的 `getCombatMeanLabel` 仍按 `weaponInventoryIndex` 查表，派生卡没有该字段时会回显"武器"，在 Task 10 一并修。

- [ ] **Step 8: 提交**

```bash
git add src/components/CombatStatus.jsx src/components/combat/AddMeanTypeStep.jsx
git commit -m "feat: 战斗手段武器卡改为手持槽派生并移除增益快照同步"
```

---

### Task 10: 组合技接入派生武器卡（设计文档第 11 节）

**Files:**
- Modify: `src/components/combat/combatMeanUtils.js:554-569`（`getCombatMeanLabel`）
- Modify: `src/components/combat/AddComboStep.jsx:16,27-49,60,72,104`
- Modify: `src/components/CombatStatus.jsx:1092-1094,1126-1143,1580,3542,3568-3575,3611`
- Test: `src/components/combat/combatMeanUtils.test.js`

- [ ] **Step 1: 写失败测试**

追加到 `src/components/combat/combatMeanUtils.test.js`：

```js
import { getCombatMeanLabel } from './combatMeanUtils'

describe('getCombatMeanLabel 对派生武器卡', () => {
  it('优先用 weaponOpt.name + 后缀', () => {
    const derived = { id: 'wielded_0_inv_9', type: 'physical', derived: true, weaponOpt: { name: '长剑' }, weaponNameSuffix: '（+1）' }
    expect(getCombatMeanLabel(derived, {})).toBe('长剑 （+1）')
  })
  it('派生卡不依赖 weaponInventoryIndex 查表', () => {
    const derived = { id: 'wielded_1_inv_9', type: 'physical', derived: true, weaponOpt: { name: '匕首' } }
    expect(getCombatMeanLabel(derived, { weaponsFromInv: [{ index: 0, name: '别的武器' }] })).toBe('匕首')
  })
  it('旧式按背包下标的条目仍能解析（回归保护）', () => {
    const legacy = { id: 'cm_0', type: 'physical', weaponInventoryIndex: 2 }
    expect(getCombatMeanLabel(legacy, { weaponsFromInv: [{ index: 1, name: 'A' }, { index: 2, name: '战锤' }] })).toBe('战锤')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: FAIL —前两条实得 `'武器'`（走了 `weaponInventoryIndex` 查表分支）

- [ ] **Step 3: 让标签函数先认 weaponOpt**

`combatMeanUtils.js:556-561` 的 physical 分支替换为（先读卡自带的 `weaponOpt`，再回退旧的下标查表）：

```js
  if (mean.type === 'physical') {
    const suffix = mean.weaponNameSuffix ? String(mean.weaponNameSuffix).trim() : ''
    if (mean.weaponOpt?.name) return mean.weaponOpt.name + (suffix ? ` ${suffix}` : '')
    const w = weaponsFromInv.find((x) => x.index === mean.weaponInventoryIndex)
    if (w) return w.name + (suffix ? ` ${suffix}` : '')
    return '武器' + (suffix ? ` (${suffix})` : '') + (mean.weaponInventoryIndex != null ? ` #${mean.weaponInventoryIndex}` : '')
  }
```

Run: `npx vitest run src/components/combat/combatMeanUtils.test.js`
Expected: PASS

- [ ] **Step 4: 候选清单并表**

`CombatStatus.jsx:1580` 的 `nonComboCombatMeans` 改为从 `renderedMeans` 过滤，让派生武器卡进入"主手段"下拉：

```js
  const nonComboCombatMeans = useMemo(() => renderedMeans.filter((m) => m.type !== 'combo'), [renderedMeans])
```

`:3542`（`AddMeanTypeStep` 的 `combatMeans` 与 `onPickCombo` 初始化）与 `:3611`（`AddComboStep` 的 `combatMeans`）两处传参改为 `combatMeans={renderedMeans}`；`:3611` 同时删掉 `weaponsFromInv={weaponsFromInv}`，`:3540` 已在 Task 9 Step 6 删除。
`:3569` 的 `const primary = combatMeans[0] || null` 因传参已改为 `renderedMeans` 而自动变成"首选主手武器"，无需再改逻辑。

> `AddMeanTypeStep` 里"组合技"按钮的禁用条件是 `combatMeans.length === 0`（`:24`），传 `renderedMeans` 后，只手持武器、没有手动卡片的玩家也能创建组合技。

- [ ] **Step 5: 存取两处查表覆盖派生卡**

`confirmAddComboMean`（`:1093`）与 `openEditComboMean`（`:1138`）里的 `combatMeans.find((m) => m.id === ...)` 均改为 `renderedMeans.find(...)`。
存进去的 `primaryMeanId` 就是派生卡的稳定 id `wielded_<槽位>_<背包编号>`（Task 5 的 `makeWieldedMeanId`），换手/换武器后该 id 自然变化，下一次渲染会走 Task 9 的"未选择主手段"占位卡，而不是静默消失。

- [ ] **Step 6: AddComboStep 内部取数改读 weaponOpt**

`AddComboStep.jsx`：
- props 解构（`:16`）删去 `weaponsFromInv`。
- `resolveSource`（`:33-38`）的 physical 分支不再查背包下标：

```js
        if (mean.type === 'physical') {
          const suffix = mean.weaponNameSuffix ? String(mean.weaponNameSuffix).trim() : ''
          const parsed = mean.weaponOpt ? parseWeaponAttack(getWeaponAttackStringForParsing(mean.weaponOpt, mean.weaponVersatileMode)) : null
          base.name = (mean.weaponOpt?.name || '武器') + (suffix ? ` ${suffix}` : '')
          base.damageDice = parsed?.dice || ''
          base.damageType = mean.damageType || parsed?.type || ''
        } else if (mean.type === 'spell_attack') {
```

- 两处 `getCombatMeanLabel(m, { weaponsFromInv, itemMeansFromInv })`（`:72` 主手段下拉、`:104` 附加组件来源下拉）改为 `getCombatMeanLabel(m, { itemMeansFromInv })`。

- [ ] **Step 7: 构建 + 浏览器验证 + 提交**

Run: `npm run build && npx vitest run src/components/combat/`
Expected: 构建成功、combat 目录测试全绿

`npm run dev` → 5173：主手拿长剑 → "+添加战斗手段" → 组合技 → "主手段"下拉第一项是"长剑" → 保存 → 列表出现组合技卡；重开该组合技，主手段仍是长剑；把长剑从主手挪走 → 组合技卡显示"未选择主手段，请点铅笔重新选择"，不消失。

```bash
git add src/components/combat/combatMeanUtils.js src/components/combat/combatMeanUtils.test.js src/components/combat/AddComboStep.jsx src/components/CombatStatus.jsx
git commit -m "feat: 组合技主手段可选手持派生武器卡"
```

---

### Task 11: 武器配置编辑器改写物品条目

**Files:**
- Modify: `src/components/combat/AddWeaponStep.jsx:101-104` 及字段来源
- Modify: `src/components/CombatStatus.jsx`（`openEditWeaponMean` / 保存路径）
- Modify: `src/components/combat/combatMeanUtils.js:560`

> **Task 9 收尾轮留下的中间态（本 Task 必须闭合）**：派生卡的铅笔能打开武器表单，表单里的 `previewWeaponStats` 还会即时反映改动，但保存最终落到 `updateCombatMean`，而该函数开头已加派生守卫 → **改动静默丢弃**（比原来的"写进 combatMeans 却没人读"更诚实，但玩家仍会误判已生效）。本 Task 把保存路径改写进 `entry.combatMeanConfig` 之后，这条链才算通；在改写完成前不要移除该守卫。

- [ ] **Step 1: 删熟练勾选框**

`AddWeaponStep.jsx:101-104` 那整个 `<label className="flex items-center gap-2 cursor-pointer">…武器熟练…</label>` 删除。在其原位置改为只读的熟练指示（玩家不用配，但要能看懂为什么数值是这样）：

```jsx
        <div className="flex items-center gap-2 text-xs">
          <span className={weaponProficient ? 'text-dnd-gold-light' : 'text-dnd-text-muted'}>
            {weaponProficient ? '✓ 已熟练（命中含熟练加值，伤害含属性调整值）' : '未熟练（命中不含熟练加值，伤害不含属性调整值）'}
          </span>
        </div>
```

组件 props 里 `weaponProficient` 保留为**只读**、删掉 `setWeaponProficient`；其值来自 `deriveWieldedWeaponMeans` 的结果（调用方传入）。

- [ ] **Step 2: 保存写入条目配置而非 combatMeans**

`CombatStatus.jsx` 中 `openEditWeaponMean` 与武器保存回调（grep `weaponNameSuffix` / `addWeaponNameSuffix` 定位保存处）改为读写 `entry.combatMeanConfig`：

```js
  const saveWeaponConfig = (derivedMean, nextConfig) => {
    const inv = Array.isArray(char?.inventory) ? char.inventory : []
    const idx = inv.findIndex((e) => e?.id === derivedMean.weaponInventoryId)
    if (idx < 0) return
    const prev = (inv[idx].combatMeanConfig && typeof inv[idx].combatMeanConfig === 'object') ? inv[idx].combatMeanConfig : {}
    const nextEntry = { ...inv[idx], combatMeanConfig: { ...prev, ...nextConfig } }
    onSave({ inventory: inv.map((e, i) => (i === idx ? nextEntry : e)) })
  }
```

编辑器提交时把表单值映射成七项配置：

```js
      saveWeaponConfig(editingDerivedMean, {
        nameSuffix: addWeaponNameSuffix,
        damageTypeOverride: addDamageType,
        versatileMode: addWeaponMode,
        extraDamageDice: addWeaponExtraDice,
        targetCreatureType: addTargetCreatureType,
        abilityForAttack: addAbility,
        disabledAutoGainKeys: GAIN_TYPES.map((g) => g.key).filter((k) => !addGains.some((x) => x.type === k || !autoKeys.has(x.type))),
      })
```

其中 `autoKeys` 为该卡当前自动增益的 type 集合（用 `computeLiveGains` 的 `auto: true` 项算）。玩家从增益清单里**取消勾选**某条自动增益 → 该 type 进入 `disabledAutoGainKeys`。

- [ ] **Step 3: 编辑弹窗初值来自派生卡**

`openEditWeaponMean(mean)`（只对 `mean.derived === true` 调用）改为：

```js
    setEditingDerivedMean(mean)
    setAddMeanStep('weapon')
    setAddWeaponNameSuffix(mean.weaponNameSuffix || '')
    setAddDamageType(mean.damageType || '')
    setAddWeaponMode(mean.weaponVersatileMode || getDefaultWeaponMode(mean.weaponOpt))
    setAddWeaponExtraDice(Array.isArray(mean.extraDamageDice) ? [...mean.extraDamageDice] : [])
    setAddTargetCreatureType(mean.targetCreatureType || '')
    setAddAbility(mean.abilityForAttack || inferPhysicalWeaponAbilityFromProto(mean.weaponOpt.proto))
    setAddWeaponIndex(mean.weaponInventoryIndex)
```

`AddWeaponStep` 的武器下拉（`:53-62`）在编辑派生卡时禁用（武器由装备槽决定，不能改选），其余字段照常可编辑。做法：`disabled={!canEdit || editingDerivedMean?.derived}`，并在 `title` 上说明"要换武器请在装备栏调整手持槽"。

- [ ] **Step 4: 修 describeCombatMean 的武器命名**

`combatMeanUtils.js:560` 依赖 `mean.weaponInventoryIndex` 拼 `武器 #下标`。改为优先用名字：

```js
    return mean.weaponOpt?.name ? `${mean.weaponOpt.name}${mean.weaponNameSuffix || ''}` : '武器'
```

- [ ] **Step 5: 构建 + 浏览器验证 + 提交**

Run: `npm run build`，然后 `npm run dev`（本地 5173 单实例）：主手拿一把长剑 → 战斗手段出现"主手 长剑"卡 → 点铅笔 → 改"追加名称"为"（+1）"保存 → 卡名即时带上后缀；重开编辑器初值正确；勾选/取消某条自动增益后刷新页面配置仍在。

```bash
git add src/components/combat/AddWeaponStep.jsx src/components/CombatStatus.jsx src/components/combat/combatMeanUtils.js
git commit -m "feat: 武器战斗手段配置改存于物品条目"
```

---

## Phase C — 释放流程统一

### Task 12: AbilityUseModal 支持物理攻击预设

**Files:**
- Modify: `src/components/AbilityUseModal.jsx:1262-1290,1517-1545,1546-1600`

> 新增可选 prop `attackPreset`。五个使用点（武器卡 / 变身天生武器卡 / 变身生物法术卡 / 法术攻击卡 / 道具卡）都用它，其中前三处在 Task 13 接线、后两处在 Task 14 接线。
>
> **契约：preset 只带取值器，不带数值。** `attackPreset = { name, getAttack(), getDamagePlan() }`。
> 弹窗可能在"命中已投、伤害未投"之间停留很久，期间玩家新挂的 BUFF 必须进入这次伤害。若 preset 里存 `attackBonus: 7` 这种字面量，弹窗持有的就是点击那一刻的快照，违反"卡上不得有数值快照"不变量。所以两个 getter 由调用方在**投骰那一刻**现算，模态框自身不持有数值。

- [ ] **Step 1: 接收 preset 并强制无资源攻击流**

`:13` 的 React import 补上 `useRef`（当前只有 `useState, useCallback, useMemo`）：

```js
import { useState, useCallback, useMemo, useRef } from 'react'
```

`:1262` 签名加 `attackPreset`，并在函数体顶部立一个"每次都刷新"的 ref（`useCallback` 的依赖里带对象会让回调反复重建，读 ref 最省事）：

```js
export default function AbilityUseModal({ chargeValue, activeAbility, char, featureName, onConfirm, onClose, attackPreset }) {
  // 投骰瞬间读最新 preset，避免弹窗打开期间的旧闭包把数值冻成快照
  const presetRef = useRef(attackPreset)
  presetRef.current = attackPreset
```

`:1268` 的 `norm` 改为：

```js
  const norm = useMemo(() => {
    const base = normalizeChargeItemValue(effectiveChargeValue)
    return attackPreset ? { ...base, resourceType: 'none', effects: [] } : base
  }, [effectiveChargeValue, attackPreset])
```

`:1287` 的 `flowType` 改为：

```js
  const flowType = attackPreset ? 'attack' : classifyFlowType(norm.effects)
```

`featureName` 在 preset 模式下取 preset 的名字：在 ref 之后加 `const displayName = attackPreset?.name || featureName || ''`，并把组件内所有渲染标题用的 `featureName` 换成 `displayName`（grep 确认，共 3–4 处：`使用 ${featureName}`、`攻击骰结果（${featureName}）` 等）。

- [ ] **Step 2: 攻击步支持优势与重击范围**

`executeAttackStep`（`:1517-1545`）整体替换：

```js
  const executeAttackStep = useCallback(() => {
    const { patch: resourcePatch, lines: resourceLines } = consumeResources()
    flashIrreversible()

    const atk = presetRef.current?.getAttack ? presetRef.current.getAttack() : null
    const isPreset = !!atk
    const atkBonus = isPreset ? (Number(atk.bonus) || 0) : (computeSpellAttack() || 0)
    const adv = atk && (atk.advantage === 'advantage' || atk.advantage === 'disadvantage') ? atk.advantage : null
    const critMin = Number.isFinite(Number(atk?.critThreatMinNatural)) && atk?.critThreatMinNatural != null
      ? Math.max(1, Math.min(20, Math.floor(Number(atk.critThreatMinNatural)))) : 20
    const critDiceMultiplier = Math.max(2, Number(atk?.critDiceMultiplier) || 2)

    let natural, diceValues, formula
    if (adv) {
      const a = rollDice('1d20'), b = rollDice('1d20')
      diceValues = [a.total, b.total]
      formula = '2d20'
      natural = adv === 'advantage' ? Math.max(a.total, b.total) : Math.min(a.total, b.total)
    } else {
      const single = rollDice('1d20')
      natural = single.total
      diceValues = [single.total]
      formula = '1d20'
    }
    const total = natural + atkBonus
    const isCrit = isPreset ? natural >= critMin : natural === 20

    setAttackResult({
      natural, bonus: atkBonus, total, isCrit, critMin, critDiceMultiplier,
      isFumble: natural === 1 && !isCrit, advantage: adv, resourcePatch, resourceLines,
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dnd-external-roll', { detail: { animate: true, formula, diceValues } }))
    }

    setStep('roll_attack')
  }, [consumeResources, computeSpellAttack, flashIrreversible])
```

`attackPreset` 不再进依赖数组：数值一律经 `presetRef.current` 现读，回调本身保持稳定即可。

`:1686` 的重击文案改为按阈值显示（读 `attackResult`，不读已废弃的静态字段）：

```jsx
              {attackResult.isCrit && <div className="text-xs text-yellow-400 mt-1">⚡ 天然 {attackResult.natural} ≥ {attackResult.critMin} — 重击！</div>}
```

并在其下加一行优势标注：

```jsx
              {attackResult.advantage && <div className="text-[10px] text-gray-500 mt-1">{attackResult.advantage === 'advantage' ? '优势投掷' : '劣势投掷'}（取{attackResult.advantage === 'advantage' ? '高' : '低'}）</div>}
```

- [ ] **Step 3: 伤害步现算并投掷**

`executeFinalStep`（`:1546-1589`）里，在 `:1562` 的 `processAllEffects(...)` 那一行**之前**插入 preset 分支（此时 `resourcePatch` 与 `allLines` 已就绪）。preset 时不走效果管线：

```js
    // 物理攻击预设：伤害在投骰这一刻由调用方的 getDamagePlan() 现算
    if (presetRef.current?.getDamagePlan) {
      const plan = presetRef.current.getDamagePlan() || {}
      const diceList = Array.isArray(plan.diceList) ? plan.diceList : []
      const flatMod = Number(plan.flatMod) || 0
      const mult = attackInfo?.isCrit ? Math.max(2, Number(attackInfo.critDiceMultiplier) || 2) : 1
      const byType = {}
      const animParts = [], animValues = []
      for (const d of diceList) {
        const expr = String(d?.dice || '').trim()
        if (!expr) continue
        const type = String(d?.type || '').trim() || '—'
        for (let k = 0; k < mult; k++) {
          const pool = rollCombatDicePool(expr)
          if (!pool.parsed) continue
          byType[type] = (byType[type] || 0) + pool.diceSum + pool.flatMod
          animParts.push(expr)
          animValues.push(...pool.rolls)
        }
      }
      if (flatMod) {
        const types = Object.keys(byType)
        const bucket = types.length === 1 ? types[0] : '—'
        byType[bucket] = (byType[bucket] || 0) + flatMod
      }
      const linesText = Object.entries(byType).map(([t, v]) => `${v} ${t}`).join(' + ') || '0'
      allLines.push(`🩸 伤害: ${linesText}`)
      if (mult > 1) allLines.push(`⚡ 重击：伤害骰 ×${mult}`)
      if (animParts.length > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dnd-external-roll', {
          detail: { animate: true, formula: animParts.join(','), diceValues: animValues },
        }))
      }
      setResultFailed(false)
      setResultLines(allLines)
      setStep('result')
      onConfirm(resourcePatch, allLines)
      return
    }
```

按伤害类型分桶是必要的：`damageList` 里主骰与 `extra_damage_dice` 的类型常常不同（"1d8 挥砍 + 2d6 火焰"），合成一个无类型总数会让玩家无法向 DM 报伤害构成。

`AbilityUseModal.jsx:32` 现为 `import { rollDice } from '../data/weaponDatabase'`，并列加上取池函数（`rollDice` 只回总数，拿不到逐颗点数与 flatMod）：

```js
import { rollDice, rollCombatDicePool } from '../data/weaponDatabase'
```

`:1553` 的命中行已含"，暴击"，无需再改。

- [ ] **Step 4: 构建验证**

Run: `npm run build && npx vitest run`
Expected: 构建成功、既有单测不回归（本 Task 不加新测试：preset 分支的行为在 Task 13 / Task 14 接线完成后走浏览器实测清单验证，纯 UI 状态机难以在无渲染测试环境下覆盖）

- [ ] **Step 5: 提交**

```bash
git add src/components/AbilityUseModal.jsx
git commit -m "feat: AbilityUseModal 支持物理攻击预设（优势/重击范围/现算伤害）"
```

---

### Task 13: 实时计划注册表 + 武器卡与变身卡改走五步流

**Files:**
- Modify: `src/components/CombatStatus.jsx:686`（新增 state/ref）`,:1590` 附近（注册表与打开器）`,:3055-3079`（cardCtx）`,:3236-3311`（天生武器卡）`,:3405-3450`（生物法术卡）`,:3660-3670`（模态框挂载点）
- Modify: `src/components/combat/WeaponAttackCard.jsx:70-78,133-171,177-204,244`

> **统一范围（2026-09-15 用户裁定）**：武器卡（含派生）、法术攻击卡、道具卡、组合技卡**四类全部**走 `AbilityUseModal` 同一个弹窗、同一步骤序；卡片内部自建的"投攻击→投伤害"分步界面都在删除范围内，不得新增第三条释放路径。铅笔打开的配置编辑器不在此列。
>
> **本 Task 不删旧面板。** `SpellAttackCard` / `ItemUseCard` 仍在用它（核实：`SpellAttackCard.jsx:160,177`、`ItemUseCard.jsx:232,245,478,493`），删除动作放在 Task 14。
>
> 执行前已核实的三条事实，直接决定本 Task 的写法：
> 1. 旧面板**不是**"输入对手 AC"的面板。它显示"命中投掷 / 伤害投掷"两按钮 + BUFF 加值逐条勾选 + 额外伤害骰逐条勾选 + 手动重击勾选（`:3691-3873`）。命中投掷走的也是 `openForCheck`（问 DM），没有自判命中。所以本次删除真正去掉的功能是**逐条勾选与手动重击确认**——这是用户可见的行为变化，Step 0 的门禁必须走。
> 2. `handleCreatureSpellAttackResult`（`:1359-1397`，内含 `alert('攻击未命中！')` 与 `targetDC` 参数）**没有任何调用点**，是死代码；`grep -rn "handleCreatureSpellAttackResult(" src/` 无输出。Task 14 一并删。
> 3. `lastDamageRoll`（`:1259-1263`）唯一用途是派发 `dnd-external-roll` 事件，不是持久日志。弹窗内直接 dispatch 等价，改流不会丢"伤害记录"。
>
> **为什么不把 preset 数值存进 state**：点击时若把 `attackBonus: 7` 写进 state，模态框在整个"命中→伤害"期间持有的就是那一刻的快照，玩家中途新挂的 BUFF 进不了这次伤害，违反无快照不变量。同理，从点击闭包里传 getter 也不行——闭包捕获的是**那次渲染**的 const。解法：卡片在**每次渲染**时把"怎么算"登记进一个 ref 注册表，state 只存注册表的 key；投骰瞬间按 key 取当前登记项，拿到的永远是最近一次渲染算出的算法。

- [ ] **Step 0: 功能变化确认门（不可跳过）**

向用户复述并等待确认：武器卡与变身卡释放时不再弹出"伤害构成确认"面板，因此失去三项手动控制——BUFF 加值逐条勾选、额外伤害骰逐条勾选、手动勾选重击。改为由 BUFF 管线与重击范围自动决定，命中后直接投全部伤害。用户认可后再继续。

- [ ] **Step 1: CombatStatus 建立注册表与打开器**

`:686` 的 `damageRollConfirm` state **保留不动**（Task 14 删），在其下方加：

```js
  const [attackPresetKey, setAttackPresetKey] = useState(null)
  /** 实时攻击计划：id -> { name, getAttack, getDamagePlan, onCommitted? }，由各卡片每次渲染覆写 */
  const weaponPlans = useRef({})
```

（`useRef` 已在 `:5` 引入，无需改动 import。）

在 `previewWeaponStats`（`:1590` 附近）旁加四个函数：

```js
  /** 卡片渲染期登记"怎么算"；每次渲染覆写，注册表里永远是当前 BUFF 下的算法 */
  const registerWeaponPlan = useCallback((id, plan) => {
    if (id && plan) weaponPlans.current[id] = plan
  }, [])

  const openWeaponAttackFlow = useCallback((id) => {
    if (weaponPlans.current[id]) setAttackPresetKey(id)
  }, [])

  /** 计划登记项可选携带 onCommitted：道具/法术卡用它落地充能与法术位消耗 */
  const commitWeaponPlan = useCallback((id) => {
    weaponPlans.current[id]?.onCommitted?.()
  }, [])

  const attackPreset = attackPresetKey ? {
    // 名称与两个取值器都在弹窗渲染/投骰时才读注册表，弹窗不持有任何数值
    get name() { return weaponPlans.current[attackPresetKey]?.name || '武器攻击' },
    getAttack: () => weaponPlans.current[attackPresetKey]?.getAttack() || { bonus: 0 },
    getDamagePlan: () => weaponPlans.current[attackPresetKey]?.getDamagePlan() || { diceList: [], flatMod: 0 },
  } : null
```

两个执行期注意点：
- `get name()` 是访问器，读的是**弹窗渲染时**的注册表。战斗手段列表（`:3535-3617`）在 JSX 中先于模态框（`:3660`）渲染，所以弹窗取到的是本轮渲染刚写入的名字。
- 卡被卸服/换手导致登记项消失时，注册表**保留最后一条**、不清理。这让已经开在半程的流程能收尾，而不是把弹窗静默吞掉。

在 `:3670`（现有 `executeAbilityModal` 模态框块之后）并列挂载预设模态框。`onConfirm` 只关窗 + 触发 `onCommitted`，忽略 `lines`——与 `:3665-3667` 现有主动技能的行为一致（该处也只用 `patch`，日志不落盘）：

```jsx
      {attackPreset && (
        <AbilityUseModal
          char={char}
          attackPreset={attackPreset}
          onConfirm={(patch) => {
            if (patch && Object.keys(patch).length > 0) onSave(patch)
            commitWeaponPlan(attackPresetKey)
            setAttackPresetKey(null)
          }}
          onClose={() => setAttackPresetKey(null)}
        />
      )}
```

- [ ] **Step 2: cardCtx 增加两个成员**

`:3055-3079` 的 `cardCtx` 里，`removeCombatMean, openForCheck, rollAllWeaponDamage, rollDamageDice,` 那一行下方加：

```js
              registerWeaponPlan, openWeaponAttackFlow,
```

**本 Step 不删** `setDamageRollConfirm` / `handleCreatureSpellAttackResult`（`:3074`），法术卡与道具卡还在用。

- [ ] **Step 3: 武器卡登记计划并改点击**

`WeaponAttackCard.jsx:73-78` 的解构里删去 `openForCheck`、`setDamageRollConfirm`、`handleCreatureSpellAttackResult`，加上 `registerWeaponPlan, openWeaponAttackFlow`：

```js
  const {
    canEdit, isCombo, gains,
    openEditWeaponMean, openEditComboMean, removeCombatMean,
    rollAllWeaponDamage, renderAutoGainBadges,
    registerWeaponPlan, openWeaponAttackFlow,
  } = ctx
```

`:171` 改为：

```js
  const nameColumnClickable = !!(openWeaponAttackFlow && hasDamage)
```

在 `:171` 与 `return (` 之间插入登记（必须在 `damageList`、`fullName`、`extraFiltered` 之后，否则 TDZ 报错）：

```jsx
  // 每次渲染覆写：投骰瞬间读到的就是当前 BUFF 下的数值，弹窗不持有快照
  registerWeaponPlan?.(displayMean.id, {
    name: fullName,
    getAttack: () => ({
      bonus: physicalAttackBonus,
      advantage: gainAdvantage,
      critThreatMinNatural: weaponCritThreatMin,
      critDiceMultiplier: weaponCritDiceMult,
    }),
    getDamagePlan: () => ({ diceList, flatMod: totalDamageMod }),
  })
```

`:179-201` 的 `onClick` 整块替换为一行：

```jsx
          onClick={nameColumnClickable ? () => openWeaponAttackFlow(displayMean.id) : undefined}
```

灰卡：在 `if (!weaponOpt) return null` 之后、登记之前插入不可用态早退（派生卡不可用时不给点击、不给删除按钮）：

```jsx
  if (displayMean.derived && displayMean.available === false) {
    return (
      <div className="rounded-lg border border-dashed border-gray-600/70 bg-gray-800/40 p-2">
        <div className={COMBAT_MEAN_ROW_GRID}>
          <div className="flex items-center gap-1 min-w-0 pr-2">
            <span className="shrink-0 text-[10px] leading-none px-1 py-[1px] rounded border bg-gray-700/60 text-gray-500 border-gray-600/70">{displayMean.actionLabel}</span>
            <span className="text-gray-500 font-medium text-sm truncate min-w-0">{weaponOpt?.name}{displayMean.weaponNameSuffix || ''}</span>
            <span className="shrink-0 text-[10px] text-gray-500">不可用</span>
          </div>
          <div className={`pl-2 border-l border-gray-600 text-gray-500 ${CM_MEAN_LABEL} truncate`}>{displayMean.slotLabel}</div>
          <div className={`pl-2 border-l border-gray-600 text-gray-500 ${CM_MEAN_LABEL}`} />
          <div className="pl-2 border-l border-gray-600 text-gray-500 text-xs truncate min-w-0" title={displayMean.unavailableReason}>{displayMean.unavailableReason || '不可用'}</div>
          <div className="pl-1 border-l border-gray-600" />
        </div>
      </div>
    )
  }
```

可用卡名称列（`:204`）改成读派生卡的标签：

```jsx
          <ActionLabelBadge source={displayMean.actionLabel || '1 动作'} />
          {displayMean.slotLabel && <span className="shrink-0 text-[10px] text-gray-500">{displayMean.slotLabel}</span>}
```

删除按钮（`:244`）对派生卡不显示：`{canEdit && !displayMean.derived && (`。派生卡的"移除"就是回装备栏把武器挪走。

- [ ] **Step 4: 变身天生武器卡改走注册表**

`CombatStatus.jsx:3236-3311`。当前攻击列显示 `nwAttackBonus`（`:3296`），既不含 BUFF 近战加值、投骰时也不加 —— 与其它所有卡的口径不一致。抽一个局部变量，**显示与投骰共用它**：

```js
            const nwTotalAttackBonus = nwAttackBonus + (buffStats?.meleeAttackBonus || 0)
            registerWeaponPlan(`nw_${idx}`, {
              name: weapon.name,
              getAttack: () => ({ bonus: nwTotalAttackBonus, advantage: null, critThreatMinNatural: null, critDiceMultiplier: 2 }),
              getDamagePlan: () => ({ diceList: dmgDice ? [{ dice: dmgDice, type: dmgTypeLabel }] : [], flatMod: physMeleeDmgBonus }),
            })
```

（`physMeleeDmgBonus` 在 `:3245` 已经等于 `buffStats?.meleeDamageBonus || 0`，直接复用，不要再加一遍。）

> 有意的行为变化：变身天生武器的**攻击加值从此含 BUFF 近战加值**（伤害加值本来就含，见记忆"变身武器物理伤害加值"）。浏览器实测第 5 条要核对这一点。

`:3260-3279` 的 `onClick` 整块替换：

```jsx
                    onClick={() => openWeaponAttackFlow(`nw_${idx}`)}
```

`:3296` 的攻击列显示改用同一变量：

```jsx
{nwTotalAttackBonus >= 0 ? '+' : ''}{nwTotalAttackBonus}
```

- [ ] **Step 5: 变身生物法术卡**

`CombatStatus.jsx:3405-3450`。攻击型（`rollButtonType === 'attack'`）改为登记 + 打开：在 `:3404` 的 `return (` 之前插入

```js
            registerWeaponPlan(`cs_${idx}`, {
              name: spell.name,
              getAttack: () => ({ bonus: nwSpellAtk, advantage: null, critThreatMinNatural: buffStats?.critThreatMinNatural, critDiceMultiplier: 2 }),
              getDamagePlan: () => ({ diceList: spellDamageList, flatMod: 0 }),
            })
```

`:3411-3444` 的 `onClick` 整块替换：

```jsx
                    onClick={(showRollButton && hasSpellDamage) ? () => {
                      if (rollButtonType === 'attack') openWeaponAttackFlow(`cs_${idx}`)
                      else handleCreatureSpellSaveDamage(spell.name, spellDamageList, spell.slotLevel, spellData)
                    } : undefined}
```

豁免型不再经过确认面板，直接调 `handleCreatureSpellSaveDamage`（`:1400-1415`）——它本来就只是"把面板上那颗按钮的回调就地执行"，投掷与 3D 动画都在其内部（`rollDamageDice`），无行为变化。

- [ ] **Step 6: 构建 + 单测**

Run: `npm run build && npx vitest run`
Expected: 构建成功、既有单测不回归

- [ ] **Step 7: 浏览器实测（必做，不可跳过）**

`npm run dev` → 5173：
1. 点武器卡名称 → d20 动画 → 弹窗显示"询问 DM：攻击总值 X 是否命中？"+「未命中」「命中，投伤害」两按钮，**页面上没有任何输入框、没有勾选列表**。
2. 点「命中，投伤害」→ 伤害骰动画 + 结果行按伤害类型分桶（"1d8+3 挥砍 + 2d6 火焰"式）。
3. **无快照验证**：停在"询问 DM"这一步之前，先在 BUFF 栏挂一条 +2 近战伤害增益 → 再点武器卡 → 命中后点「命中，投伤害」→ 伤害含这 +2。反向再做一次（去掉增益），数字要跟着变。
4. 天然 20 以上才判重击，且重击时伤害骰按"暴击×"翻倍；结果行出现"⚡ 重击：伤害骰 ×N"。
5. 荒野变形 → 天生武器卡走同一弹窗，卡上攻击列数值 = 弹窗里的加值。
6. 生物法术卡：攻击型走弹窗；豁免型点一下直接投伤害、不再弹中间确认。
7. 副手灰卡：无点击手型、无删除按钮、伤害列显示不可用原因。
8. 回归：法术攻击卡 / 道具卡仍能释放（它们还在用旧面板）。

- [ ] **Step 8: 提交**

```bash
git add src/components/CombatStatus.jsx src/components/combat/WeaponAttackCard.jsx
git commit -m "feat: 武器与变身卡释放改走五步流，数值投骰瞬间现算"
```

---

### Task 14: 法术卡与道具卡迁移，删除伤害确认面板

**Files:**
- Modify: `src/components/combat/SpellAttackCard.jsx:56-58,144,150-197`
- Modify: `src/components/combat/ItemUseCard.jsx:156,222-267,299,463-511`
- Modify: `src/components/CombatStatus.jsx:686,1359-1397,3074,3673-3886,3888-3942`

- [ ] **Step 1: 法术攻击卡改走注册表**

`SpellAttackCard.jsx:56-58` 的解构：删 `setDamageRollConfirm`，加 `registerWeaponPlan, openWeaponAttackFlow`（`openForCheck`、`rollDamageDice`、`consumeSpellSlotForMean` 保留，快捷骰子按钮还在用）。

`:144` 改为：

```js
  const nameColumnClickable = hasDamage && !!openWeaponAttackFlow
```

在 `return (` 之前登记。**法术位消耗必须留在点击时刻**（与现状一致，`:150` 的 `consumeSpellSlotForMean` 在弹窗之前就跑了），`onCommitted` 只用于本卡没有的额外副作用：

```jsx
  registerWeaponPlan?.(displayMean.id, {
    name: fullName,
    getAttack: () => ({ bonus: spellAttackForMean, advantage: null, critThreatMinNatural: buffStats?.critThreatMinNatural, critDiceMultiplier: 2 }),
    getDamagePlan: () => ({ diceList: damageList, flatMod: spellDamageMod }),
  })
```

`:152-195` 的 `onClick` 整块替换：

```jsx
          onClick={nameColumnClickable ? () => {
            if (!consumeSpellSlotForMean(displayMean, displayMean.spellName || '法术')) return
            if (hitRes === 'spell_attack' && spellAttackForMean != null) openWeaponAttackFlow(displayMean.id)
            else if (hitRes !== 'spell_attack' && hitValue != null) {
              rollDamageDice(effectivePrimaryDice, (displayMean.spellName || '法术') + ' ' + (getDamageTypeLabel(displayMean.damageTypeSpell) || ''), 'spell_attack-' + displayMean.id, spellDamageMod, false, getDamageTypeLabel(displayMean.damageTypeSpell) || '', { extraDice: allSpellExtraDice, floor2: spellDamageFloor2 })
            }
          } : undefined}
```

豁免型不再经过中间确认面板：原本面板的"投掷伤害"按钮执行的就是这个 `onRollDamage` 回调，现在点名称一步到位。

- [ ] **Step 2: 道具卡两处按钮改走注册表**

`ItemUseCard.jsx` 有两个释放入口：主行名称列（`:467-511`）与展开行的快捷骰子（`:223-267`）。两处的 `selectedSub` 来自同一个下拉，登记 key 必须带上子法术序号以免互相覆盖：`item_${itemMeanOpt.index}_sub_${subIndex}`。

`:156` 的解构删 `setDamageRollConfirm`、`handleCreatureSpellAttackResult`，加 `registerWeaponPlan, openWeaponAttackFlow`。

攻击型分支改为：先 `registerWeaponPlan(key, { name: selectedSub.spellName || itemMeanOpt.name, getAttack: () => ({ bonus: selectedSub._atkValue || 0, advantage: null, critThreatMinNatural: buffStats?.critThreatMinNatural, critDiceMultiplier: 2 }), getDamagePlan: () => ({ diceList: damageList, flatMod: focusSpellDamageExtras.flatBonus || 0 }), onCommitted: () => setFocusUsePending({ inventoryIndex: itemMeanOpt.index, name: itemMeanOpt.name, combatMeanId: meanId, spellSub: selectedSub, gains, spellDamageExtras: selectedSub?._damageExtras || { flatBonus: 0, extraDice: [] }, damageFloor2: selectedSub?._diceFloor2 || false }) })`，再 `openWeaponAttackFlow(key)`。

> **已在 Task 9 收尾轮完成**：`ItemUseCard.jsx` 三处 `getEnabledGainsFromMean(cm)` 已换成 ctx/props 里现算的 `gains`，该 helper 已删除（快照冻结会造成卡面显示与投掷加值分叉）。本 Task 只需 `grep -rn "getEnabledGainsFromMean" src/` 确认无残留。
> 同一轮还把"子法术 → 伤害骰列表"提成模块级 `buildSubSpellDamageList(selectedSub)`（原先主组件 `ItemUseCard` 的名称列分支裸引用 `damageList`，那是 `FocusItemCard` 的局部变量，点击即 ReferenceError）。因此本 Task Step 2 片段里所有 `diceList: damageList` 的取数，在**主组件作用域**内必须写成 `diceList: buildSubSpellDamageList(selectedSub)`；在 `FocusItemCard` 内仍可直接用 `damageList`（那行现在是 `const damageList = buildSubSpellDamageList(selectedSub)`）。

`onCommitted` 是必需的：道具的充能与法术位消耗发生在 `useFocusCharge`（`:1221-1235`）内部，五步流本身 resourceType 为 none，不接这一步就会**永远不扣充能**。它在命中与未命中两条路径都会被调用一次（`AbilityUseModal` 的 `handleMiss` 同样调 `onConfirm`），与现状"投完攻击才进消耗面板"相比只是把扣费时机挪到结算之后，方向是变保守不变松。

豁免型分支：删掉外层 `setDamageRollConfirm`，直接执行它原来的 `onRollDamage` 内容（`setFocusUsePending({...})`），即 `:248-258` 那段就是模板。后面的法器使用面板（`:3510-3530`）保留——那才是真正扣资源与投伤害的地方。

`:299` 的第二个 `ctx` 解构（展开行组件内）同样处理。

- [ ] **Step 3: 删除面板与死代码**

`CombatStatus.jsx` 删除：
- `:686` `const [damageRollConfirm, setDamageRollConfirm] = useState(null)`
- `:1359-1397` 整个 `handleCreatureSpellAttackResult`（已核实无调用点）
- `:3672-3886` 攻击型面板整块（含其上注释行）
- `:3888-3942` 豁免型面板整块（含其上注释行）
- `cardCtx` 中 `:3074` 的 `setDamageRollConfirm, handleCreatureSpellAttackResult,`
- 随之失效的 `rollDamageDice(... { onResult })` 回调路径：面板用 `document.getElementById('damage-result-display')` 直接改 DOM 显示结果（`:3808-3866`），面板删了就没有这些节点；`rollDamageDice` 本身的 `onResult` 参数保持原样不动，其它调用方不传它。

Run: `grep -rn "damageRollConfirm\|handleCreatureSpellAttackResult" src/`
Expected: 无输出

Run: `npm run build && npx vitest run`
Expected: 构建成功、既有单测不回归

- [ ] **Step 4: 浏览器实测**

1. 法术攻击卡（豁免型）：点名称 → 直接投伤害，无中间面板；法术位正常 -1；取消/关闭路径不适用（没有可取消的中间步）。
2. 法术攻击卡（攻击型）：走五步流，命中后伤害含升环后的骰子（对照卡上伤害文本）。
3. 道具卡：攻击型走完流程后充能 -1、若配了法术位也 -1；未命中路径同样扣（与 Step 2 说明一致）。
4. 道具卡展开行的下拉切到另一个子法术再释放，投的是**切换后**那条的骰子与加值（验证 key 未互相覆盖）。
5. 全部战斗手段卡都释放一遍，控制台无报错。

- [ ] **Step 5: 提交**

```bash
git add src/components/CombatStatus.jsx src/components/combat/SpellAttackCard.jsx src/components/combat/ItemUseCard.jsx
git commit -m "refactor: 战斗手段释放统一为五步流，删除伤害确认面板"
```

---

## Phase D — 收尾

### Task 15: 修 getMainHandWeaponDamageType（"与主手武器同类型"特效恒不生效）

**Files:**
- Modify: `src/lib/chargeItemModel.js:1051-1070` 与其 import 段（`:36-40`）

- [ ] **Step 1: 改为读真实手持槽与真实字段**

已核实的事实：
- 函数定义在 `chargeItemModel.js:1051`（不是 956）。两个调用点：`AbilityUseModal.jsx:791`、`activeAbilityEngine.js:474`，都用于 `syncWithWeapon` 的伤害型特效，拿不到值就回退 `'fire'`（火焰），即"与主手武器同类型"的特效会静默变成火焰。
- 它查的三个字段在真实数据里都不存在：`held[i].slotId`（真实形状 `{ id: 'main' | 'off' | 'held_<t>', inventoryId }`）、`mainHand.weaponId`、`invEntry.damageType`（武器原型用中文键 `伤害: '钝击'`，见 `itemDatabase.js:172-195`）。`:1054` 的 `|| held[0]` 兜底让主手查找侥幸命中，但随后两个分支都取不到字段，恒返回 `''`。

`:1051-1070` 整体替换：

```js
export function getMainHandWeaponDamageType(char) {
  if (!char) return ''
  const held = Array.isArray(char.equippedHeld) ? char.equippedHeld : []
  const main = held.find((s) => s?.id === 'main') || held[0]
  if (!main?.inventoryId) return ''
  const invEntry = (Array.isArray(char.inventory) ? char.inventory : []).find((i) => i?.id === main.inventoryId || i?.inventoryId === main.inventoryId)
  if (!invEntry) return ''
  const proto = invEntry.itemId ? getItemById(invEntry.itemId) : null
  return getDamageTypeValue(invEntry.伤害 || invEntry.damageType || proto?.伤害 || '') || ''
}
```

（`getDamageTypeValue` 已在 `:37` 引入，中文标签→英文 value 正是调用方要的形态。`getItemById` 本文件尚未引入，在 import 段加一行；`itemDatabase.js` 只 import `lib/supabase` 与 `lib/teamDataSupabase`，不会与 `chargeItemModel` 形成循环。）

- [ ] **Step 2: 全量测试 + 构建**

Run: `npx vitest run && npm run build`
Expected: 全绿、构建成功

- [ ] **Step 3: 提交**

```bash
git add src/lib/chargeItemModel.js
git commit -m "fix: getMainHandWeaponDamageType 按真实手持槽形状解析"
```

---

### Task 16: 全量验证 + 文档回写

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全绿。重点核对本次改动直接覆盖的四份：`src/lib/weaponProficiency.test.js`、`src/components/combat/deriveWieldedWeaponMeans.test.js`、`src/components/combat/combatMeanUtils.test.js`、`src/hooks/computeBuffStats.test.js`，以及回归面 `src/hooks/useBuffCalculator.test.js`、`src/lib/buffEffectCoverage.test.js`

- [ ] **Step 2: 跑设计文档第十三节的浏览器实测清单（1–8 条）**

重点复核最易出错的三条：
- 第 2 条：背包增删条目后卡不消失不错位（旧 bug 的复现路径）——在背包里删除派生卡所引用武器**前面**的一项，确认卡仍指向同一把武器。
- 第 5 条：新开一个临时 BUFF 上身，卡上命中/伤害同帧变化，不需要重开弹窗。
- 第 8 条：在"双武器战斗 → 配置默认 BUFF"挂上"副手加属性"并保存 → 副手卡伤害立刻出现属性调整值；停用该战斗风格后立刻消失。

- [ ] **Step 3: 确认无回归的三处**

- BUFF 状态栏其余卡片（法术攻击 / 道具 / 组合技）仍能释放。
- 主动技能释放（QuickBar / ActionPanel / 装备主动技能）弹窗未被 `attackPreset` 分支影响。
- 角色页"熟练项设置"折叠标签与实际勾选一致。

- [ ] **Step 4: 回写设计文档的四处偏离**

编辑 `docs/superpowers/specs/2026-09-14-wielded-weapon-auto-combat-means-design.md`：
- 第六节"六项"改"七项"并补 `abilityForAttack`。
- 第十二节文件表里派生器路径改为 `src/components/combat/deriveWieldedWeaponMeans.js`，并补 `AddComboStep.jsx` / `AddMeanTypeStep.jsx` / `SpellAttackCard.jsx` / `ItemUseCard.jsx` 四行。
- 第七节"两份清单"改为"三份清单（含 FIREARM_WEAPON_IDS）"。
- 第十节：删掉"**要求输入对手 AC**"的说法，改为"点击后进入带逐条勾选与手动重击确认的伤害面板"；"三处一起改"改为"五处一起改，拆为 Task 13（武器卡与两类变身卡）+ Task 14（法术卡与道具卡）"；面板行号 `:3673-3886` / `:3889-3940` 更正为 `:3672-3886` / `:3888-3942`；`handleCreatureSpellAttackResult` 标注为"已核实无调用点的死代码"。
- 第十节末段"顺带清理"的行号 `chargeItemModel.js:956-975` 更正为 `:1051-1070`，并把根因从"条件永不成立"改准为"`slotId` / `weaponId` / `damageType` 三个字段在真实数据里都不存在，`|| held[0]` 兜底后仍取不到伤害类型"。
- 第十三节实测清单补两条：组合技下拉能选到派生武器卡并正常释放；释放流程中途新挂的 BUFF 会进入本次伤害结算（注册表实时取值）。

- [ ] **Step 5: 提交**

```bash
git add docs/superpowers/specs/2026-09-14-wielded-weapon-auto-combat-means-design.md
git commit -m "docs: 同步手持武器派生实现与设计文档的四处偏差"
```

> **部署**：本计划不自动部署。要上线时先按 AGENTS.md 更新 `VERSIONING.md` 版本号并征得确认。

---

## 本计划不处理、但已发现的既有问题（交用户裁定）

1. **`weapon_category` 起效范围不认武器 id**：`scopeMatchesCombatMean` 的兜底 `protoMatchesWeaponBuffKey`（`buffTypes.js:635-641`）只比对 `类型` / `类别`，而 `featDefaultBuffs.js:15,29` 写入的 scopeDetail 是原型 id（`'club'`、`'dagger'`…）。结果是"军用武器/简易武器"这类默认 BUFF 在数值上从不命中，属于静默失效。修它会改变已有角色的数值，需要单独决策。
2. **武器精通（Mastery）三把枪缺失**：`gun_blunderbuss` / `gun_musket` / `gun_pistol` 没有 `精通` 字段，`AbilityModule` 也不显示精通列。本计划的"精通不进战斗手段"决策与之一致，未处理。
3. **`weaponDatabase.js` 是另一套简化武器库**（20 条、英文字段、`getWeaponById` 不查 itemDatabase），与本次的档位体系无关；内部 `rapier` 名称"细剑"与主库"刺剑"不一致。
4. **AbilityUseModal 的法术攻击加值不吃 BUFF**：`computeSpellAttack`（`AbilityUseModal.jsx:1360`）只算 `熟练 + 属性调整值`。主动技能释放路径的既有缺口，与本次战斗手段改造独立。
5. **豁免型变身生物法术只投第一条伤害**：`handleCreatureSpellSaveDamage`（`CombatStatus.jsx:1400-1415`）取 `finalDamageList[0]` 后 `return`，多段伤害（如"8d6 寒冷 + 2d6 寒冷"分两条）会静默丢掉后面的条目。Task 13 让该分支直接调它，行为与现状一致（今天也是同一条路径），未在本计划内修。
6. **攻击型法器法术完全不扣资源**：`ItemUseCard.jsx:230-247`（展开行）与 `:473-490`（主行）的攻击型分支只弹确认面板，从不进入 `useFocusCharge`，因此既不扣充能也不扣法术位；豁免型分支才走 `setFocusUsePending`。Task 14 Step 2 用 `onCommitted` 把它接回消耗路径，属**顺带修复**，实测第 3 条要专门核对扣费次数。
7. ~~**副手合法性只查副手自己的轻型，不查主手**~~（**Task 11 已闭合，无需裁定**）：设计核准的模型是"副手武器需轻型，主手双手则副手被占用"；既有 `isDualWieldingLightWeapons` 要求**两把都轻型**（2014 口径），与派生卡对同一角色判"可用"相矛盾。`9ff8b93` 把"附赠攻击"从武器模式选项里删除（它是副手槽的属性，不是武器属性），该 helper 的唯一调用点随之消失并被删除，两套口径的分歧不再影响任何逻辑。副手合法性现在只由派生器的 `offhandBlockReason` 决定。
8. **派生卡 id 含槽位序号，换槽即换 id**（Task 10 需处理）：`makeWieldedMeanId(slotIndex, inventoryId)` 形如 `wielded_1_inv_42`。把同一把武器从副手挪到主手（`applySlotChange`）后 id 改变，按 id 引用的组合技步骤会静默解绑。Task 10 落组合技引用时应以 `weaponInventoryId` 为身份、`slotIndex` 只做展示，或在换槽时改写组合技里的 id。
9. **"玩家关掉的自动增益"谓词写了三遍**（Task 11 审查建议 4，未在本批展开）：`GainEditor` 的回填、`deriveDisabledAutoGainKeys`、`CombatStatus` 的 `manualGainsDisabled` 判定各自用 `g.auto && g.enabled === false` 表达同一件事。改一处容易漏改另两处，Task 13 若再碰增益链路应抽成单一谓词。
10. **法术/道具/组合技卡关掉的自动增益刷新即复活**（Task 11 审查建议 5，武器卡路径正确）：只有派生武器卡把禁用类型落盘为 `disabledAutoGainKeys`；这四类卡的保存路径只写 `gains` 不写该键，而 `computeLiveGains` 会丢弃存档里 `auto: true` 的条目并换成现算结果——现算结果不受 `cm.gains` 里的 `enabled: false` 约束。派生器的 `GainEditor` 回填对这三类卡是死工。属既有缺口（本计划前也不持久化），Task 13/14 迁移保存路径时一并裁决。
11. **三处"用到却没在作用域里定义"的引用现在就活在 HEAD 里**（Task 11 审查建议 6，已用独立 `no-undef` 探针核实，非误报）：同文件内有多个组件，符号定义在**另一个组件**的作用域里，编译与 `build` 都不报错，只有真正走到那条渲染分支才 ReferenceError 白屏。
    - `ItemUseCard.jsx:242/243/248`：`FocusItemCard`（`:176` 起）的**攻击型**分支引用了默认导出 `ItemUseCard`（`:286` 起）里的 `focusBuffBonuses` / `focusExtraDamageDice` 与 `buffStats` prop → 法器的攻击型内含法术一点骰子就崩。**Task 14 会重写这块**（Step 2 把攻击型接回消耗路径、并删除伤害确认面板），属顺带修复，实测第 6 条时一并核对。
    - `CharacterInventory.jsx:1218`：`editingProto` 声明在 `:1019` 的另一层作用域，编辑弹窗里"法器充能上限"那一行一点开就崩。本计划不碰该文件，**交用户裁定**。
    - `CharacterSheet.jsx:979`（HEAD 行号）：`setRaceFeatPickerOpen` 声明在 `:4482` 的主组件里，`RaceBackgroundInline`（`:751` 起）种族特性行上的"选择"按钮一点就崩。本计划不碰该文件，**交用户裁定**。
12. **要不要把 `no-undef` 开进仓库 lint 配置**（Task 11 审查建议，本计划未采纳）：`eslint.config.js` 目前不开 `no-undef`，Vite/esbuild 只转译不解析标识符，所以"用到未导入/未声明"永远过编译——这正是第 11 条能长期存活的土壤。全仓探下来只有 3 处真错（见上），开启的噪声极低。未采纳的原因：这是共享工作树，改全局 lint 配置会波及他人在改的文件的提交门禁。**复现命令**（临时配置，不改仓库）：造一份只含 `languageOptions.globals = { browser, es2022 }` + `rules: { 'no-undef': 'error' }` 的 flat config，`npx eslint --no-config-lookup --no-ignore --config <该文件> src`。注意 `src/**/*.test.js` 里的 `process` / `global` 需补 node globals 才不会误报。
