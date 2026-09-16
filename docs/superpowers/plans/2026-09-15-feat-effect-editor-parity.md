# 专长效果编辑器对齐职业特性 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让专长卡的齿轮编辑器打开时显示该专长**实际生效**的效果（含代码内置模板），保存后写入当前战役并对同战役所有角色生效。

**Architecture:** 专长 BUFF 配置有三级优先级（角色专属补丁 > 战役 DM 收录 > 代码硬编码模板）。计算管线走满三级，齿轮编辑器只走前两级，因此"卡能用、编辑器空白"。本计划把战役级存储层补齐到与职业特性同构（墓碑 + 卡范围 + 变更广播），抽出一个共享的三级解析函数供编辑器与专长选择器复用，再把齿轮编辑器的读写目标从"角色"改为"战役"。

**Tech Stack:** React 18 + Vite 5 + Tailwind 3；Vitest 4（`environment: 'node'`，include `src/**/*.test.js`，靠 stub `global.localStorage` 测存储层）；Supabase/localStorage 双模存储。

**Spec:** 无独立 spec 文档。需求来自 2026-09-15 对话中确认的两项决策 —— ①专长保存目标改为战役（对齐职业特性）②完整对齐职业特性编辑器。根因结论见下方"背景"。

## Global Constraints

每个任务的隐含要求，逐条来自 AGENTS.md 与既有约定：

- 全中文 UI 文案；代码注释只写 WHY，不写 WHAT
- 优先级链**不得改变**：个人 DM 补丁 > 模块级 DM 默认配置 > 代码硬编码回退 > 无效果（AGENTS.md §4.3）
- 向后兼容：旧角色数据里 `character.selectedFeats[].featBuffPatch` 仍可正常加载并参与计算，不得静默丢弃
- 不新建分支，在 `main` 上工作；开发服务器用 5173
- 本计划**不含部署**；部署需另改 `docs/VERSIONING.md` 版本号并征得用户确认
- 不写"防御性"分支处理内部不可能出现的状态
- 每个任务结束时单独 commit，一次一个可部署单元

---

## 背景：根因（已核实，勿重复调查）

| 消费端 | 位置 | 读了几级 | 结果 |
|---|---|---|---|
| 计算管线 | `src/lib/effects/effectMapping.js:186-194` `resolveFeatPatch` | 三级（含 `HARDCODED_FEAT_BUFFS`） | 卡上释放按钮、消耗、召唤全部正常 |
| 卡片效果摘要 | `src/pages/CharacterSheet.jsx:3454-3465` `featBuffTagsFor` | 复用 `resolveFeatPatch` | 摘要显示"消耗：星辰点 / 必中祝福 / 召唤 ×1" |
| **齿轮编辑器** | `src/pages/CharacterSheet.jsx:3919-3924` | **两级，缺第三级** | **编辑器空白** |
| 专长选择器"默认 BUFF" | `src/components/FeatPickerModal.jsx:423-427` | 三级，但缺墓碑判断 | 能看到模板 |

`神导之力`（`star_divine_guidance`）与 `星辰替身`（`star_doppelganger`）的效果**只存在于** `src/data/featDefaultBuffs.js:1001-1024` 与 `:1202-1232`，形态是单条 `charge_item` 效果。`src/data/feats.js` 里只有 `{id, name, category, description}`，没有任何结构化效果。所以"几乎全部硬编码"的判断成立。

对照实现（这是本次要复刻的目标形态）：`src/pages/CharacterSheet.jsx:3172-3182` 职业特性编辑器的 `initial.effects` —— 非空 DM 配置 → 墓碑则空 → 否则硬编码。

### 连带缺陷（一并在本计划修复）

1. `defaultBuffPatchStore.js:176-180` 专长分支不返回 `cardScope`，但 `CharacterSheet.jsx:3944` 在读它 → 永远 `undefined`，"卡范围"一栏恒空。
2. `defaultBuffPatchStore.js:218-221` 专长保存空效果时**删除**模板，而职业特性在 `:246-249` 写**墓碑**。专长因此无法表达"DM 明确清空"，一旦编辑器补上硬编码回退，清空会立刻被模板复活。
3. `defaultBuffPatchStore.js:61-78` `saveLib`（专长写入路径）只派发 `dnd-realtime-module-library`，**不派发** `DEFAULT_BUFF_PATCHES_EVENT`。而 `CharacterSheet.jsx:4472-4476` 只监听后者来递增 `buffPatchRev` → 保存专长战役配置后卡片不重算。`saveRaw`（职业特性路径）在 `:111-115` 有派发。
4. 齿轮编辑器缺 `readOnly: !isAdmin` 与 `footerHint`，非管理员能进编辑且看不出"这是模板还是已收录"。

---

## 文件结构

| 文件 | 本次职责 |
|---|---|
| `src/lib/defaultBuffPatchStore.js` | 专长分支补齐与职业特性同构的存储语义：墓碑、cardScope、变更广播 |
| `src/lib/defaultBuffPatchStore.feat.test.js` | 新建，锁定上述三条语义 |
| `src/pages/ModuleLibrary.jsx` | BUFF 模板列表隐藏墓碑条目 |
| `src/components/BuffManager.jsx` | 冒险 BUFF 导入列表隐藏墓碑条目 |
| `src/lib/effects/effectMapping.js` | 新增导出 `resolveFeatDefaultEffects`：专长战役级效果的唯一三级解析入口 |
| `src/lib/effects/resolveFeatDefaultEffects.test.js` | 新建，锁定三级优先级与墓碑压制 |
| `src/pages/CharacterSheet.jsx` | `FeatsSection` 接 `isAdmin`；齿轮编辑器改读写战役、补三级回退/墓碑/提示/只读 |
| `src/components/FeatPickerModal.jsx` | 改用共享解析函数（补墓碑），保存时保留 cardScope |

任务顺序有依赖：Task 1 → Task 2（墓碑落地后必须立刻隐藏，否则空模板泄漏进列表）→ Task 3 → Task 4/5。

---

## Task 1: 专长补丁存储层 —— 墓碑、cardScope、变更广播

**Files:**
- Modify: `src/lib/defaultBuffPatchStore.js:61-78`（`saveLib`）
- Modify: `src/lib/defaultBuffPatchStore.js:170-181`（`loadDefaultBuffPatch` 专长分支）
- Modify: `src/lib/defaultBuffPatchStore.js:210-239`（`saveDefaultBuffPatch` 专长分支）
- Test: `src/lib/defaultBuffPatchStore.feat.test.js`（新建）

**Interfaces:**
- Consumes: 无（起点任务）
- Produces:
  - `loadDefaultBuffPatch(moduleId, 'feat', featId)` 返回 `{ effects, duration?, enabled?, tombstone?, cardScope? } | null`
  - `saveDefaultBuffPatch(moduleId, 'feat', featId, { effects, enabled, sourceName?, duration?, cardScope? })`：空效果写墓碑模板而非删除；写后派发 `DEFAULT_BUFF_PATCHES_EVENT`
  - `clearDefaultBuffPatch(moduleId, 'feat', featId)` 语义不变：彻底删除，允许硬编码复活

- [ ] **Step 1: 写失败测试**

创建 `src/lib/defaultBuffPatchStore.feat.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDefaultBuffPatch,
  loadDefaultBuffPatch,
  clearDefaultBuffPatch,
  DEFAULT_BUFF_PATCHES_EVENT,
} from './defaultBuffPatchStore'

const MOD = 'test-mod'
const FEAT = 'war_caster'
const oneEffect = [{ effectType: 'ac_bonus', category: 'defense', scope: 'global', value: 1 }]

let mem, events
beforeEach(() => {
  mem = {}
  events = []
  global.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] },
  }
  global.window = { dispatchEvent: (e) => events.push(e) }
})

describe('专长 DM 补丁与职业特性同构', () => {
  it('保存非空效果可读回，并保留 cardScope', () => {
    const cardScope = { type: 'melee_attack' }
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true, cardScope })
    const patch = loadDefaultBuffPatch(MOD, 'feat', FEAT)
    expect(patch.effects).toEqual(oneEffect)
    expect(patch.cardScope).toEqual(cardScope)
    expect(patch.tombstone).toBeUndefined()
  })

  it('scope 为 global 的 cardScope 不落库，读回不带该字段', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, {
      effects: oneEffect, enabled: true, cardScope: { type: 'global' },
    })
    expect(loadDefaultBuffPatch(MOD, 'feat', FEAT).cardScope).toBeUndefined()
  })

  it('DM 显式清空效果应留墓碑而非删除，以压制硬编码回退', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true })
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: [], enabled: true })
    const patch = loadDefaultBuffPatch(MOD, 'feat', FEAT)
    expect(patch).not.toBeNull()
    expect(patch.effects).toEqual([])
    expect(patch.tombstone).toBe(true)
  })

  it('clearDefaultBuffPatch 彻底删除模板（返回 null，允许硬编码复活）', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true })
    clearDefaultBuffPatch(MOD, 'feat', FEAT)
    expect(loadDefaultBuffPatch(MOD, 'feat', FEAT)).toBeNull()
  })

  it('enabled=false 应被读回', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: false })
    expect(loadDefaultBuffPatch(MOD, 'feat', FEAT).enabled).toBe(false)
  })

  it('专长保存应广播 DEFAULT_BUFF_PATCHES_EVENT，使角色卡立即重算', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true })
    expect(events.some((e) => e.type === DEFAULT_BUFF_PATCHES_EVENT)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run src/lib/defaultBuffPatchStore.feat.test.js`
Expected: 3 failed / 3 passed。失败应为"保留 cardScope"、"留墓碑"、"广播 DEFAULT_BUFF_PATCHES_EVENT"三条；通过的是"global 的 cardScope 不落库"（现状恒不返回该字段）、"clearDefaultBuffPatch 彻底删除"、"enabled=false 读回"。

- [ ] **Step 3: 实现 —— `saveLib` 补事件广播**

把 `src/lib/defaultBuffPatchStore.js` 第 75-77 行：

```js
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dnd-realtime-module-library'))
  }
```

改为：

```js
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dnd-realtime-module-library'))
    // 专长配置存在模组库而非独立补丁表，须同样通知 BUFF 重算，否则保存后卡片停留在旧数值
    window.dispatchEvent(
      new CustomEvent(DEFAULT_BUFF_PATCHES_EVENT, { detail: { moduleId: normMod(moduleId) } }),
    )
  }
```

- [ ] **Step 4: 实现 —— 专长读取分支补 tombstone / cardScope**

把 `loadDefaultBuffPatch` 内第 170-181 行的专长分支改为：

```js
  if (kind === 'feat') {
    const library = loadLib(moduleId)
    const idx = findFeatTemplate(library, id)
    if (idx === -1) return null
    const t = library.buffTemplates[idx]
    const duration = cloneDurationRaw(t.duration)
    return {
      effects: Array.isArray(t.effects) ? t.effects : [],
      ...(t.tombstone ? { tombstone: true } : {}),
      ...(duration ? { duration } : {}),
      ...(t.enabled === false ? { enabled: false } : {}),
      ...(t.cardScope && typeof t.cardScope === 'object' ? { cardScope: t.cardScope } : {}),
    }
  }
```

- [ ] **Step 5: 实现 —— 专长保存分支改墓碑语义 + 持久化 cardScope**

把 `saveDefaultBuffPatch` 内第 210-239 行的专长分支改为：

```js
  if (kind === 'feat') {
    const library = loadLib(moduleId)
    const idx = findFeatTemplate(library, id)
    const effects = patch && Array.isArray(patch.effects) ? patch.effects : []
    const duration = cloneDurationRaw(patch?.duration)
    const enabled = patch?.enabled !== false
    const sourceName = patch?.sourceName || id
    const hasCardScope = !!(patch?.cardScope && typeof patch.cardScope === 'object'
      && patch.cardScope.type && patch.cardScope.type !== 'global')
    const tplId = idx !== -1 ? library.buffTemplates[idx].id : generateId('bufftpl')

    let tpl
    if (effects.length === 0 && !duration && enabled && !hasCardScope) {
      // 墓碑：DM 显式清空须与「从未配置」区分，否则读取端回退硬编码模板使清空复活
      tpl = { id: tplId, source: sourceName, sourceKind: 'feat', featId: id, effects: [], enabled: true, tombstone: true }
    } else {
      tpl = {
        id: tplId,
        source: sourceName,
        sourceKind: 'feat',
        featId: id,
        effects: effects.map((e) => ({ ...e })),
        enabled,
      }
      if (duration) tpl.duration = duration
      if (hasCardScope) tpl.cardScope = { ...patch.cardScope }
    }

    if (idx !== -1) library.buffTemplates[idx] = tpl
    else library.buffTemplates.push(tpl)

    saveLib(moduleId, library)
    return
  }
```

- [ ] **Step 6: 跑测试，确认全部通过**

Run: `npx vitest run src/lib/defaultBuffPatchStore.feat.test.js`
Expected: 6 passed

- [ ] **Step 7: 跑存储层既有测试，确认无回归**

Run: `npx vitest run src/lib/defaultBuffPatchStore.tombstone.test.js src/lib/defaultBuffPatchStore.duration.test.js`
Expected: 全部 passed。若 `duration` 测试因专长分支改动失败，说明 `cloneDurationRaw` 调用位置被改坏 —— 回到 Step 5 核对，不要改测试。

- [ ] **Step 8: Commit**

```bash
git add src/lib/defaultBuffPatchStore.js src/lib/defaultBuffPatchStore.feat.test.js
git commit -m "fix: 专长 DM 补丁补齐墓碑/卡范围语义并广播重算，与职业特性同构"
```

---

## Task 2: 列表消费端隐藏墓碑模板

墓碑落在 `library.buffTemplates` 里，而两个列表只按 `sourceKind` 过滤，因此清空后的专长会以"空 BUFF"身份出现在战役资料库列表和"添加冒险 BUFF"导入列表里，玩家导入后什么都得不到。

> 墓碑对玩家隐藏后，DM 解除它只有两条路径：专长卡齿轮编辑器的"清除"按钮（走 `clearDefaultBuffPatch`，彻底删除），或重新保存一份非空效果（覆盖墓碑）。两条都在 Task 4/5 的改动范围内，因此不会出现"清空后卡死在看不见的状态"。

**Files:**
- Modify: `src/pages/ModuleLibrary.jsx:187-192`（`filteredBuffTemplates`）
- Modify: `src/components/BuffManager.jsx:341-345`（`importableBuffTemplates`）

**Interfaces:**
- Consumes: Task 1 写入的 `tombstone: true` 字段
- Produces: 无新接口；仅保证墓碑模板不出现在任何面向玩家的列表

- [ ] **Step 1: 战役资料库过滤掉墓碑**

`src/pages/ModuleLibrary.jsx` 第 187-192 行，在 `sourceKind` 排除之后插入一行：

```js
    return buffTemplates.filter((t) => {
      if (!t || t.tombstone) return false
      if (excluded.has(t.sourceKind)) return false
      if (buffKindFilter && t.sourceKind !== buffKindFilter) return false
      if (!q) return true
      return String(t.source ?? '').toLowerCase().includes(q)
    })
```

- [ ] **Step 2: 冒险 BUFF 导入列表过滤掉墓碑**

`src/components/BuffManager.jsx` 第 341-345 行同样处理：

```js
    return all.filter((t) => {
      if (!t || t.tombstone) return false
      if (excluded.has(t.sourceKind)) return false
      if (!q) return true
      return String(t.source ?? '').toLowerCase().includes(q)
    })
```

- [ ] **Step 3: 确认没有第三处消费 buffTemplates**

Run: `npx rg -n "buffTemplates" src --glob "!*.test.js"`
Expected: 除已改的两处、`defaultBuffPatchStore.js`、`moduleLibraryStore.js` 外无其它面向列表的读取点。若出现新读取点（例如导出/统计），一并加 `tombstone` 过滤并在 commit message 里注明。

- [ ] **Step 4: 构建校验**

Run: `npm run build`
Expected: 构建成功，无新增告警。

- [ ] **Step 5: Commit**

```bash
git add src/pages/ModuleLibrary.jsx src/components/BuffManager.jsx
git commit -m "fix: 战役资料库与冒险BUFF列表隐藏已清空的专长墓碑模板"
```

> 说明：这两处是组件内 `useMemo` 过滤器，`environment: 'node'` 下无法渲染组件，故不写单测；Task 6 用浏览器实测覆盖。

---

## Task 3: 抽出专长战役级效果的唯一解析入口

现在三级查找在 `effectMapping.js:186-194`（计算）、`CharacterSheet.jsx:3919-3924`（编辑器，缺级）、`FeatPickerModal.jsx:423-427`（选择器，缺墓碑）各写了一遍。再抄第四份必然再次分叉，所以先收敛成一个函数。

**Files:**
- Modify: `src/lib/effects/effectMapping.js`（在 `resolveFeatPatch` 之后新增导出）
- Test: `src/lib/effects/resolveFeatDefaultEffects.test.js`（新建）

**Interfaces:**
- Consumes: Task 1 的 `loadDefaultBuffPatch(moduleId, 'feat', featId)`（含 `tombstone`）；`HARDCODED_FEAT_BUFFS`（已在 `effectMapping.js:15` 导入）
- Produces: `resolveFeatDefaultEffects(featId, moduleId) => Array<Effect>` —— 被 Task 4、Task 5 消费

- [ ] **Step 1: 写失败测试**

创建 `src/lib/effects/resolveFeatDefaultEffects.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveFeatDefaultEffects } from './effectMapping'
import { saveDefaultBuffPatch } from '../defaultBuffPatchStore'
import { HARDCODED_FEAT_BUFFS } from '../../data/featDefaultBuffs'

const MOD = 'test-mod'
const FEAT = Object.keys(HARDCODED_FEAT_BUFFS)[0]

let mem
beforeEach(() => {
  mem = {}
  global.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] },
  }
  global.window = { dispatchEvent: () => {} }
})

describe('resolveFeatDefaultEffects', () => {
  it('无战役配置时回退硬编码模板', () => {
    expect(resolveFeatDefaultEffects(FEAT, MOD)).toEqual(HARDCODED_FEAT_BUFFS[FEAT].effects)
  })

  it('战役配置非空时优先于硬编码模板', () => {
    const dm = [{ effectType: 'ac_bonus', category: 'defense', scope: 'global', value: 9 }]
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: dm, enabled: true })
    expect(resolveFeatDefaultEffects(FEAT, MOD)).toEqual(dm)
  })

  it('DM 显式清空后返回空数组，硬编码模板不得复活', () => {
    expect(loadAndClear(FEAT)).toEqual([])
  })

  it('无硬编码记录的专长返回空数组', () => {
    expect(resolveFeatDefaultEffects('__nonexistent_feat__', MOD)).toEqual([])
  })

  it('moduleId 缺失时安全返回硬编码或空数组', () => {
    expect(resolveFeatDefaultEffects(FEAT, '')).toEqual(HARDCODED_FEAT_BUFFS[FEAT].effects)
  })
})
```

上面"显式清空"那条需要一个先写入非空、再清空的辅助函数才能区分墓碑与空配置。把它补在 `describe` 之前：

```js
// 先落一份非空配置再清空，才会产生墓碑；直接保存空效果同样产生墓碑，
// 但只有"曾有内容"这条路径能证明读取端不是因缺记录而返回空。
function loadAndClear(featId) {
  saveDefaultBuffPatch(MOD, 'feat', featId, { effects: [{ effectType: 'ac_bonus', value: 3 }], enabled: true })
  saveDefaultBuffPatch(MOD, 'feat', featId, { effects: [], enabled: true })
  return resolveFeatDefaultEffects(featId, MOD)
}
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run src/lib/effects/resolveFeatDefaultEffects.test.js`
Expected: 全部失败，报 `resolveFeatDefaultEffects is not a function`（或 import 解析失败）。

- [ ] **Step 3: 实现**

在 `src/lib/effects/effectMapping.js` 第 194 行（`resolveFeatPatch` 结束的 `}`）之后插入：

```js
/**
 * 专长「战役级默认效果」的唯一解析入口：DM 收录配置 > 墓碑（视为已清空）> 代码硬编码模板。
 * 齿轮编辑器与专长选择器共用，避免与计算管线 resolveFeatPatch 的优先级再次分叉。
 * 不含角色专属补丁 —— 那一层只在 resolveFeatPatch 参与计算时生效。
 */
export function resolveFeatDefaultEffects(featId, moduleId) {
  if (!featId) return []
  const dp = moduleId ? loadDefaultBuffPatch(moduleId, 'feat', featId) : null
  if (dp && Array.isArray(dp.effects) && dp.effects.length) return dp.effects
  if (dp?.tombstone) return []
  const hardcoded = HARDCODED_FEAT_BUFFS[featId]
  return Array.isArray(hardcoded?.effects) ? hardcoded.effects : []
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run src/lib/effects/resolveFeatDefaultEffects.test.js`
Expected: 5 passed

> `FEAT` 取自 `Object.keys(HARDCODED_FEAT_BUFFS)[0]`，当前为 `alert`（`src/data/featDefaultBuffs.js:17`，含 2 条效果）。若该常量的键顺序日后变化，测试仍自适应，无需改。

- [ ] **Step 5: 跑全量单测确认无回归**

Run: `npm run test:unit`
Expected: 全部 passed。

- [ ] **Step 6: Commit**

```bash
git add src/lib/effects/effectMapping.js src/lib/effects/resolveFeatDefaultEffects.test.js
git commit -m "refactor: 抽出 resolveFeatDefaultEffects 作为专长战役级效果唯一解析入口"
```

---

## Task 4: 专长齿轮编辑器改读写战役 + 补三级回退

**Files:**
- Modify: `src/pages/CharacterSheet.jsx` — `function FeatsSection({` 形参行（当前 `:3395`）
- Modify: `src/pages/CharacterSheet.jsx` — `<FeatsSection` 挂载处（当前 `:5289`）
- Modify: `src/pages/CharacterSheet.jsx` — 编辑器弹窗：从 `{/* 专长 BUFF 编辑器弹窗 */}`（当前 `:3906`）到该 IIFE 闭合的 `})()}`（当前约 `:3968`）
- Modify: `src/pages/CharacterSheet.jsx` 顶部 `:47-55` 的 `effectMapping` import

> **行号会漂。** 本仓有并发窗口在同一工作树提交，`CharacterSheet.jsx` 的行号在计划编写期间已前移过一轮。以 `{/* 专长 BUFF 编辑器弹窗 */}`、`function FeatsSection({`、`<FeatsSection ` 三处文本锚点定位，行号仅作参考。
>
> **动手前先跑 `git diff --quiet HEAD -- src/pages/CharacterSheet.jsx`。** 该文件当前有并发会话的未提交改动，必须等它提交干净再改 —— 否则 `git add` 会把别人的在途工作卷进本次 commit。

**Interfaces:**
- Consumes: Task 3 的 `resolveFeatDefaultEffects(featId, moduleId)`；Task 1 的 `loadDefaultBuffPatch` 专长分支（`tombstone` / `cardScope` / `enabled`）、`saveDefaultBuffPatch`、`clearDefaultBuffPatch`
- Produces: 无新导出；产出行为 —— 齿轮保存写 `saveDefaultBuffPatch(moduleId, 'feat', featId, ...)`

- [ ] **Step 1: 导入共享解析函数**

`src/pages/CharacterSheet.jsx` 第 47-55 行的 import 块内，在 `resolveFeatPatch,` 之后加一行：

```js
  resolveFeatDefaultEffects,
```

- [ ] **Step 2: `FeatsSection` 接 `isAdmin`**

`function FeatsSection({ char, level, canEdit, onSave, ... })` 形参列表加 `isAdmin`：

```js
function FeatsSection({ char, level, canEdit, isAdmin, onSave, formulaContext, sheetModuleId, buffPatchRev, referenceData, baseReferenceData }) {
```

`<FeatsSection ` 挂载处补传 `isAdmin={isAdmin}`：

```jsx
                  <FeatsSection char={char} level={level} canEdit={canEdit} isAdmin={isAdmin} onSave={persist} formulaContext={buffFormulaContext} sheetModuleId={sheetModuleId} buffPatchRev={buffPatchRev} referenceData={referenceData} baseReferenceData={baseReferenceData} />
```

- [ ] **Step 3: 改写编辑器弹窗**

把 `src/pages/CharacterSheet.jsx:3915-3975` 整块替换为：

```jsx
      {/* 专长效果编辑器弹窗：读写当前战役的专长默认配置，与职业特性同构 */}
      {featBuffEditor && (() => {
        const editRow = featBuffEditor.row
        const editFeatId = editRow?.featId
        const featName = resolveRuleText(overridesMap, buildFeatNameKey(editFeatId), featById.get(editFeatId)?.name || editFeatId)
        const defaultPatch = loadDefaultBuffPatch(moduleId, 'feat', editFeatId)
        const moduleEffects = resolveFeatDefaultEffects(editFeatId, moduleId)
        const moduleTypes = new Set(moduleEffects.map((e) => e.effectType).filter(Boolean))
        const personalEffects = Array.isArray(editRow?.featBuffPatch?.effects) ? editRow.featBuffPatch.effects : []
        const shadowingEffects = personalEffects.filter((e) => !e.effectType || !moduleTypes.has(e.effectType))
        return (
          <BuffEditorModal
            open
            onClose={() => setFeatBuffEditor(null)}
            title={`编辑专长效果：${featName}`}
            description={shadowingEffects.length
              ? `保存后对当前战役所有角色生效。该角色另有 ${shadowingEffects.length} 条专属效果优先生效，点"清除"可一并移除。`
              : '保存后对当前战役所有角色生效。'}
            buffFormProps={{
              key: `feat-buff-${editFeatId}`,
              compact: true,
              readOnly: !isAdmin,
              hideDuration: true,
              charResources: char?.classResources,
              spellSlots: getMaxSpellSlotsByRing(char),
              charClasses,
              referenceData, baseReferenceData, formulaContext,
              footerHint: defaultBuffCloudHint({
                online: isSupabaseEnabled(),
                saved: !!(defaultPatch && !defaultPatch.tombstone && Array.isArray(defaultPatch.effects) && defaultPatch.effects.length),
              }),
              initial: {
                source: featName,
                effects: moduleEffects,
                enabled: defaultPatch?.enabled !== false,
                cardScope: defaultPatch?.cardScope,
              },
              onSave: (buff) => {
                saveDefaultBuffPatch(moduleId, 'feat', editFeatId, {
                  effects: buff.effects,
                  enabled: buff.enabled,
                  sourceName: featName,
                  cardScope: buff.cardScope,
                })
                setFeatBuffEditor(null)
              },
              onClear: () => {
                clearDefaultBuffPatch(moduleId, 'feat', editFeatId)
                if (personalEffects.length) {
                  const raw = char?.selectedFeats ?? []
                  onSave({
                    selectedFeats: raw.map((f) => {
                      if (f?.featId !== editFeatId) return f
                      const next = { ...f }
                      delete next.featBuffPatch
                      return next
                    }),
                  })
                }
                setFeatBuffEditor(null)
              },
            }}
          />
        )
      })()}
```

关键差异对照：

| 项 | 改前 | 改后 |
|---|---|---|
| `initial.effects` | 个人 → 战役 → `[]`（缺硬编码） | `resolveFeatDefaultEffects`（战役 → 墓碑 → 硬编码） |
| 保存目标 | `character.selectedFeats[].featBuffPatch` | `saveDefaultBuffPatch(moduleId, 'feat', featId)` |
| `onClear` | 只删角色专属补丁 | 删战役配置 + 一并删该角色专属补丁 |
| `readOnly` | 无 | `!isAdmin` |
| `footerHint` | 无 | `defaultBuffCloudHint`，区分"模板"与"已收录" |
| `cardScope` | 读专长分支永不返回的字段，恒 `undefined` | 读 Task 1 后确实返回的值 |

`initial` 与 `onSave` 都不再收发 `duration`：专长表单两处入口（这里和 `FeatPickerModal`）恒带 `hideDuration`，若把历史遗留的 duration 回传保存，Task 1 的墓碑判定（要求 `!duration`）会被绕过，DM 清空效果后硬编码模板将复活。

> **与并发窗口的协调点。** `BuffEditorModal.jsx` 刚新增 `intro` 插槽（描述下方的规则原文块），而「专长弹窗接规则原文」是该系列的待接线目标之一 —— 与本任务改的是**同一个调用点**。动手前先确认：① `git diff --quiet HEAD -- src/components/BuffEditorModal.jsx` 是否已干净；② `grep -n "intro=" src/pages/CharacterSheet.jsx` 看职业特性/祈唤弹窗是否已在用。若已在用，本次顺带给专长弹窗接上 `intro`（内容取 `formatFeatDescriptionForDisplay` 或 `resolveRuleText` 的专长描述）；若 `intro` 尚未落地，**不要自己发明一个替代实现**，跳过此项继续做本任务其余步骤。

- [ ] **Step 4: 确认 `featBuffEditor.slot` 无残留依赖**

Run: `npx rg -n "featBuffEditor\.slot|setFeatBuffEditor\(\{ row" src/pages/CharacterSheet.jsx`
Expected: 只剩 `setFeatBuffEditor({ row, slot })` / `setFeatBuffEditor({ row })` 两处调用点（`:3703-3712`、`:3854-3863`），且编辑器内不再读 `slot`。传 `slot` 无害，保留不动 —— 不要为此改调用点。

- [ ] **Step 5: 确认没有遗留的旧保存路径**

Run: `npx rg -n "featBuffPatch = \{" src/pages/CharacterSheet.jsx`
Expected: 无输出。若仍有，说明 Step 3 未替换干净。

- [ ] **Step 6: 全量单测 + 构建**

Run: `npm run test:unit && npm run build`
Expected: 测试全 passed，构建成功。

- [ ] **Step 7: 浏览器实测（不可跳过）**

Run: `npm run dev`（5173，main 分支）

逐项验证并记录实际所见：
1. 打开任一角色 → 专长区 → 点 `神导之力` 卡上的齿轮 → 编辑器里应出现 1 条"能量输出/主动释放"效果，内容含"消耗 1 点星辰点""必中祝福"。
2. 底部提示应显示"当前为默认模板…"（未收录态）。
3. 改一个数值 → 保存 → 卡片第 4 列摘要与释放按钮**立刻**变化（验证 Task 1 的事件广播）。
4. 重开齿轮 → 提示变为"已存入云端/已保存到本地浏览器"，内容仍是刚保存的。
5. 切到同战役的另一个角色 → 该专长齿轮 → 看到同一份配置（验证战役级共享）。
6. 点"清除" → 重开齿轮 → 回到硬编码模板；战役资料库的 BUFF 模板列表里不出现该专长的空条目（验证 Task 2）。
7. 用非管理员账号登录 → 齿轮编辑器应为只读。

若第 3 步不生效，先按记忆 `qoderwork-memory-098b455bc0c7` 排查是否访问了累积的旧 Vite 实例，再怀疑代码。

- [ ] **Step 8: Commit**

```bash
git add src/pages/CharacterSheet.jsx
git commit -m "fix: 专长齿轮编辑器补硬编码回退并改存战役，对齐职业特性"
```

---

## Task 5: 专长选择器复用共享解析函数

`FeatPickerModal.jsx:423-427` 自己抄了一份两级 + 硬编码，缺墓碑；保存时也不带 `cardScope`，一旦 DM 在齿轮里配过卡范围、再从选择器保存就会把它抹掉。

**Files:**
- Modify: `src/components/FeatPickerModal.jsx:415-436`
- Modify: `src/components/FeatPickerModal.jsx` 顶部 import（`HARDCODED_FEAT_BUFFS` 若无其它用途则移除）

**Interfaces:**
- Consumes: Task 3 的 `resolveFeatDefaultEffects`；Task 1 的 `saveDefaultBuffPatch` 专长分支
- Produces: 无新接口

- [ ] **Step 1: 改用共享函数并保留 cardScope**

把 `src/components/FeatPickerModal.jsx:415-436` 的 `BuffForm` 调用改为：

```jsx
                    <BuffForm
                      key={`feat-buff-${selectedFeat.id}`}
                      compact
                      readOnly={!isAdmin}
                      hideDuration
                      referenceData={formulaContext}
                      initial={{
                        source: resolveRuleText(overridesMap, buildFeatNameKey(selectedFeat.id), selectedFeat.name),
                        effects: resolveFeatDefaultEffects(selectedFeat.id, moduleId),
                        enabled: loadDefaultBuffPatch(moduleId, 'feat', selectedFeat.id)?.enabled !== false,
                        cardScope: loadDefaultBuffPatch(moduleId, 'feat', selectedFeat.id)?.cardScope,
                      }}
                      onSave={(buff) => {
                        saveDefaultBuffPatch(moduleId, 'feat', selectedFeat.id, {
                          effects: buff.effects,
                          enabled: buff.enabled,
                          sourceName: resolveRuleText(overridesMap, buildFeatNameKey(selectedFeat.id), selectedFeat.name),
                          cardScope: buff.cardScope,
                        })
                      }}
                      onCancel={() => {}}
                    />
```

- [ ] **Step 2: 调整 import**

在 `FeatPickerModal.jsx` 的 `effectMapping` import 中加入 `resolveFeatDefaultEffects`；然后检查 `HARDCODED_FEAT_BUFFS` 是否还有使用：

Run: `grep -c -w "HARDCODED_FEAT_BUFFS" src/components/FeatPickerModal.jsx`
Expected: 若为 `1`（只剩 import 行），删除该 import 行；若 ≥2，保留并在 commit message 注明剩余用处。

> **删 import 不能用 build/lint 把关。** 本仓 ESLint 关闭了 `no-undef`，Vite 也不解析标识符 —— 删掉仍被引用的 import 后 `npm run build` 与 `npm run lint` 全绿，页面却直接白屏。唯一可靠的把关是上面的 `grep -w` 计数，加上 Step 4 在浏览器里**实际打开这个弹窗并看到效果列表**。

- [ ] **Step 3: 全量单测 + 构建**

Run: `npm run test:unit && npm run build`
Expected: 全 passed，构建成功。

- [ ] **Step 4: 浏览器实测**

1. 角色页 → 专长槽位 → 打开专长选择弹窗 → 选一个有硬编码模板的专长 → "默认 BUFF" 区应显示模板内容（改前也显示，用于确认没改坏）。
2. 选一个 DM 已明确清空的专长 → 应显示空白效果，**不得**复活硬编码模板。
3. 在齿轮编辑器配好"卡范围"并保存 → 回到选择器再保存一次 → 重开齿轮，卡范围应仍在（验证不再被抹掉）。

- [ ] **Step 5: Commit**

```bash
git add src/components/FeatPickerModal.jsx
git commit -m "fix: 专长选择器改用共享效果解析入口，尊重墓碑并保留卡范围"
```

---

## Task 6: 收尾回归

**Files:** 无新增修改（发现问题回到对应 Task 修）

- [ ] **Step 1: 全量单测**

Run: `npm run test:unit`
Expected: 全部 passed，含新增 2 个测试文件。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 计算管线未被改动的证明**

动手前（Task 1 之前）先记下基线：

```bash
git rev-parse HEAD > .qoder-tmp/feat-editor-baseline.txt
```

此处与基线比对：

```bash
git diff "$(cat .qoder-tmp/feat-editor-baseline.txt)" --stat -- src/hooks/useBuffCalculator.js src/lib/effects/effectMapping.js
```

Expected: `useBuffCalculator.js` 无改动；`effectMapping.js` 只多了 `resolveFeatDefaultEffects` 一个函数（`resolveFeatPatch` 未被改）。若 `resolveFeatPatch` 被改动，说明越界了 —— 回退该处。

- [ ] **Step 4: 旧数据兼容抽查**

在浏览器里打开一个**改动前就配过专长**的角色（记忆 `reference-browser-verification-tooling` 提到的 save-时间戳测试角色即可）：
- 卡片效果摘要应与改动前一致（个人补丁仍参与计算，未被丢弃）
- 打开齿轮应看到**战役配置或硬编码模板**，而不是他个人的配置 —— 这是本次刻意的语义变更，描述文字里的"该角色另有 N 条专属效果优先生效"提示必须出现

若提示未出现而个人补丁确实存在，说明 `moduleTypes` 判定过宽，回到 Task 4 Step 3 核对 `shadowingEffects` 过滤条件。

- [ ] **Step 5: 向用户汇报，不自行部署**

汇报内容：修了什么、专长配置现在存哪、以及"角色专属补丁仍优先但编辑器不再写它"这一行为变更。等用户确认后才考虑版本号与部署（AGENTS.md §十）。

---

## 明确不在本计划范围内

- 专长编辑器的**卡名称 / 卡描述**编辑头部（职业特性在 `CharacterSheet.jsx:3103-3150` 有，专长没有）。需要 `editCardName`/`editCardDesc` 状态并与 `resolveRuleText` 规则文案覆盖机制协调，属独立一轮改动。
- 把 `character.selectedFeats[].featBuffPatch` 这一层从计算管线里移除。AGENTS.md §4.3 仍把它列为最高优先级，移除需先改文档并做数据迁移。
- 其它三类硬编码内容（背景 `backgrounds.js`、武器精通 `martialTechniques.js`、战斗风格 `fightingStyles.js`）的 UI 化。
