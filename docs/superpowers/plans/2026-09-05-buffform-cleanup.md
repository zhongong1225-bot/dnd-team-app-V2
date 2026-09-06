# BuffForm 效果编辑器清理实施计划（修 Bug + 清无用 + 低风险去重）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 BuffForm.jsx 的 3 个真实 Bug（effectCondition 不持久化、ContainedSpellEditor 缺 referenceData、自动保存丢 cardScope），清除确认无用的死代码，并完成 4 组低风险去重（保存打包统一、命中选项统一、默认值/骨架统一、护甲覆盖转换统一）。

**Architecture:** 全部改动集中在 `src/components/BuffForm.jsx` 单文件内：把重复逻辑提取为模块级纯函数或组件内共用函数，删除零调用代码。不拆文件、不改界面外观、不改数据格式、保留旧格式兼容代码。

**Tech Stack:** React 18 函数组件 + Hooks；Vite 5 构建；ESLint 9 检查。项目无组件级单测设施（vitest 在但无 @testing-library/react），故验证方式为 `npm run build` + `npm run lint` + 浏览器手动清单，不新增测试依赖。

**用户已确认的范围边界：**
- 只做：修 Bug、清无用代码、第 1-4 组去重。
- 不做：第 5/6 组去重（效果行组件合并、inline/panel 控件合并）、拆文件、删除旧格式兼容代码。

**核查后的范围修正（与初步审计的差异）：**
- 原"Bug 4 条件分支内 Hook"经逐处核查不成立：全文件无条件分支内 Hook。真实问题是 `editingModuleId` 状态声明晚于引用它的函数（脆弱顺序）+ 纯调试用 useEffect，归入 Task 8 处理。
- 原"第 4 组"中的法术位恢复解析、骰子字符串解析经核查语义不同（clamp 规则/解析对象不一致），不是重复，不动。第 4 组只保留护甲覆盖转换统一。
- 预计净减约 250-300 行（6570 → 约 6280-6320），低于初步估计；原因是部分疑似重复经核查被排除。

---

### Task 1: 修复 effectCondition 不持久化（Bug 1）

**Files:**
- Modify: `src/components/BuffForm.jsx`（normalizeInitialEffects 的 mapEffect 返回对象，约 206-216 行；triggerAutoSave 的 out 组装，约 5659 行；handleSubmit 的 out 组装，约 5730 行）

**背景:** EffectConditionEditor（约 6415 行）通过 `updateModule(mod.id, { effectCondition })` 把条件写进 effectModules 状态（约 6185 行调用），但两条保存通路的 out 对象和载入的 mapEffect 都不带该字段，导致设置了也存不住、读不回。下游计算管线（effectMapping/useBuffCalculator）已支持读取 `effect.effectCondition`，补齐持久化即恢复功能。

- [ ] **Step 1: 载入侧补字段**

在 `normalizeInitialEffects` 的 `mapEffect` 返回对象中，`customText` 行之后、`upgrade` 行之前插入一行：

```js
      effectCondition: typeof e.effectCondition === 'string' ? e.effectCondition : '',
```

- [ ] **Step 2: 自动保存侧补字段**

在 `triggerAutoSave` 内 `const out = { category: mod.category, effectType, scope, scopeDetail, value: val }` 之后插入：

```js
        if (mod.effectCondition) out.effectCondition = mod.effectCondition
```

- [ ] **Step 3: 手动保存侧补字段**

在 `handleSubmit` 内同样的 `const out = { ... }` 行之后插入完全相同的一行：

```js
      if (mod.effectCondition) out.effectCondition = mod.effectCondition
```

- [ ] **Step 4: 构建与检查**

Run: `npm run build`
Expected: 构建成功，无错误。
Run: `npx eslint src/components/BuffForm.jsx`
Expected: 无新增 error（既有 warning 忽略）。

- [ ] **Step 5: 浏览器验证**

Run: `npm run dev`，打开角色页 → BUFF 状态栏 → 编辑任意一条 BUFF → 展开某效果行 → "生效条件"下拉选"仅在变身状态下生效" → 点保存 → 关闭编辑器再重新打开。
Expected: 重开后该效果的生效条件仍显示"仅在变身状态下生效"。

- [ ] **Step 6: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "fix: 效果编辑器生效条件(effectCondition)持久化修复"
```

---

### Task 2: 修复 ContainedSpellEditor 缺 referenceData（Bug 2）

**Files:**
- Modify: `src/components/BuffForm.jsx`（ContainedSpellEditor 参数解构约 587-596 行；EffectValueEditor panel 分支调用处约 4924-4933 行）

**背景:** 组件体内约 643 行把 `referenceData` 传给 NumberStepper，但参数解构里没有它，模块作用域也没有同名变量 → 渲染到"总能量"行（hideCharges 为假时）会抛 ReferenceError。全文件仅 4924 一处调用该组件，且调用处所在作用域有 `activeReferenceData` 可用。

- [ ] **Step 1: 参数解构补字段**

把 ContainedSpellEditor 的参数解构改为（在 `useWandScrollTable,` 之后加一行 `referenceData,`）：

```js
function ContainedSpellEditor({
  module,
  onChange,
  spellDC,
  spellAttackBonus,
  useWandScrollTable,
  referenceData,
  primaryOnly = false,
  hideCharges = false,
  rowPrefix,
}) {
```

- [ ] **Step 2: 调用处传值**

在约 4924 行的 `<ContainedSpellEditor` 调用中，`useWandScrollTable={useWandScrollTable}` 之后加一行：

```jsx
          referenceData={activeReferenceData}
```

- [ ] **Step 3: 构建与检查**

Run: `npm run build`
Expected: 构建成功。
Run: `npx eslint src/components/BuffForm.jsx`
Expected: 无新增 error。

- [ ] **Step 4: 浏览器验证**

`npm run dev` → 角色页 → 效果编辑器（任一入口）→ 添加"内含法术"类效果 → 展开编辑。
Expected: "总能量"步进行正常渲染，浏览器控制台无 `ReferenceError: referenceData is not defined`。

- [ ] **Step 5: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "fix: 内含法术编辑器补传 referenceData 消除渲染崩溃"
```

---

### Task 3: 统一两条保存通路的打包逻辑（第 1 组去重 + 修 Bug 3）

**Files:**
- Modify: `src/components/BuffForm.jsx`（主组件内：triggerAutoSave 约 5641-5687、handleSubmit 约 5711-5760）

**背景:** 手动保存与 800ms 防抖自动保存的打包代码逐行相同，仅三处差异：手动多 `cardScope` 字段（自动保存缺失 = Bug 3）、手动多空名拦截、提交出口不同。提取共用函数后，自动保存自动获得 cardScope，Bug 3 随之修复。注意：本 Task 在 Task 1 之后执行，共用函数体内必须包含 Task 1 加入的 effectCondition 行。

- [ ] **Step 1: 新增共用打包函数**

在主组件内、`triggerAutoSave` 定义之前插入：

```js
  /** 保存数据统一打包：手动保存与防抖自动保存共用，保证字段一致 */
  const buildSavePayload = (opts = {}) => {
    const { requireSource = false } = opts
    if (requireSource && !source.trim()) return null
    const catDataByKey = BUFF_TYPES
    const effects = effectModules.map((mod) => {
      if (mod.effectType === 'charge_item') {
        return { category: 'active_release', effectType: 'charge_item', scope: 'global', scopeDetail: [], value: { ...mod.value } }
      }
      const catData = catDataByKey[mod.category]
      const effList = catData?.effects ?? []
      const effectType = effList.some((e) => e.key === mod.effectType) ? mod.effectType : (effList[0]?.key ?? '')
      const currentEffect = effList.find((x) => x.key === effectType)
      let val = normalizeValueForSave(mod, currentEffect)
      if (currentEffect?.key?.startsWith('custom_')) {
        val = typeof mod.customText === 'string' ? mod.customText : (typeof val === 'string' ? val : '')
      }
      const { scope, scopeDetail } = normalizeScope(mod.scope, mod.scopeDetail)
      const out = { category: mod.category, effectType, scope, scopeDetail, value: val }
      if (mod.effectCondition) out.effectCondition = mod.effectCondition
      if (effectType === 'ability_score_uncapped' && mod.break20 && typeof mod.break20 === 'object' && Object.keys(mod.break20).length) {
        out.break20 = mod.break20
      }
      if (mod.upgrade && mod.upgrade.className && mod.upgrade.level >= 1) {
        const upgradeVal = normalizeValueForSave({ ...mod, value: mod.upgrade.value, customText: '' }, currentEffect)
        out.upgrade = { className: mod.upgrade.className, level: mod.upgrade.level, value: upgradeVal }
      }
      return out
    }).filter((ef) => ef.effectType)
    const durType = duration?.type || 'permanent'
    const hasChargeItem = effects.some((ef) => ef.effectType === 'charge_item')
    const isTimedDuration = !['permanent', 'instant', 'custom'].includes(durType)
    if (isTimedDuration && !hasChargeItem) {
      effects.push({ category: 'active_release', effectType: 'charge_item', scope: 'global', scopeDetail: [], value: normalizeChargeItemValue({}) })
    }
    const payload = {
      ...initial,
      source: source.trim(),
      duration: duration?.type ? duration : (duration || undefined),
      effects,
      enabled: initial?.enabled !== false,
      cardScope: !hasChargeItem ? cardScope : undefined,
    }
    if (!initial?.fromFeat && !initial?.fromItem) {
      payload.sourceKind = normalizeBuffSourceKindKey(sourceKind)
    }
    return payload
  }
```

- [ ] **Step 2: 重写 triggerAutoSave**

将整个 `triggerAutoSave` 的 useCallback 替换为：

```js
  /** 防抖自动保存：在用户停止编辑 800ms 后触发 */
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      const payload = buildSavePayload()
      ;(onAutoSave || onSave)(payload)
    }, 800)
  }, [effectModules, source, duration, sourceKind, cardScope, initial, onSave, onAutoSave])
```

- [ ] **Step 3: 重写 handleSubmit**

将整个 `handleSubmit` 替换为：

```js
  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = buildSavePayload({ requireSource: true })
    if (!payload) return
    onSave(payload)
  }
```

- [ ] **Step 4: 构建与检查**

Run: `npm run build` && `npx eslint src/components/BuffForm.jsx`
Expected: 构建成功；无新增 error。

- [ ] **Step 5: 浏览器验证（含 Bug 3 回归）**

1. 编辑一条被动 BUFF：改名称与某效果数值 → 点保存 → 刷新页面 → 改动都在。
2. 同一条被动 BUFF：把"起效范围"改成武器类范围 → 不点保存、停止编辑 1 秒以上（触发自动保存）→ 刷新页面 → 重开编辑器 → 起效范围仍是武器类（验证自动保存不再丢 cardScope）。
3. 把名称清空后点保存 → 不应保存（空名拦截仍在）。

- [ ] **Step 6: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "refactor: 统一手动/自动保存打包逻辑，修复自动保存丢失 cardScope"
```

---

### Task 4: 命中选项列表统一为模块级常量（第 2 组去重）

**Files:**
- Modify: `src/components/BuffForm.jsx`（模块级约 81 行后新增常量；删除 4 处局部定义：约 603-612、1278-1287、2024-2029、2486-2491；改引用：约 1645、1681、2095、2125）

**背景:** 8 项命中选项（六属性豁免+法攻+效应）内容完全相同，定义了 4 次；RandomTableEditor 内那份（2486-2491）定义后从未使用，是死副本。

- [ ] **Step 1: 新增模块级常量**

在 `const ABILITY_LABELS = {...}`（约 81 行）之后插入：

```js
/** 命中判定下拉统一选项：六属性豁免 + 法术攻击 + 效应 */
const HIT_RESOLUTION_OPTIONS = [
  { value: 'dex_save', label: '敏捷' },
  { value: 'str_save', label: '力量' },
  { value: 'con_save', label: '体质' },
  { value: 'wis_save', label: '感知' },
  { value: 'int_save', label: '智力' },
  { value: 'cha_save', label: '魅力' },
  { value: 'spell_attack', label: '法攻' },
  { value: 'none', label: '效应' },
]
```

- [ ] **Step 2: 删除 ContainedSpellEditor 内局部定义**

删除约 603-612 行的 `const HIT_RESOLUTION_OPTIONS = [ ... ]` 整块（该组件内 653、709 行的引用自动指向模块级常量，名字相同无需改）。

- [ ] **Step 3: 删除 ChargeItemEditor 内局部定义并改引用**

删除约 1278-1287 行的 `const HIT_OPTIONS = [ ... ]` 整块；把约 1645 行与 1681 行的 `HIT_OPTIONS` 改为 `HIT_RESOLUTION_OPTIONS`。

- [ ] **Step 4: 删除 ActiveEffectsList 内局部定义并改引用**

删除约 2024-2029 行的 `const HIT_OPTIONS = [ ... ]` 整块；把约 2095 行与 2125 行的 `HIT_OPTIONS` 改为 `HIT_RESOLUTION_OPTIONS`。

- [ ] **Step 5: 删除 RandomTableEditor 内死副本**

删除约 2486-2491 行的 `const HIT_OPTIONS = [ ... ]` 整块（该组件内无其他引用）。

- [ ] **Step 6: 构建、检查与验证**

Run: `npm run build` && `npx eslint src/components/BuffForm.jsx`
Expected: 成功、无新增 error（不应出现 HIT_OPTIONS 未定义报错）。
浏览器：打开充能物品编辑区与主动卡效果列表，含法术效果行的"命中"下拉应有 8 个选项。

- [ ] **Step 7: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "refactor: 命中选项列表统一为模块级常量，删除 4 处重复定义"
```

---

### Task 5: 默认值填充与空效果骨架统一（第 3 组去重）

**Files:**
- Modify: `src/components/BuffForm.jsx`（模块级约 195 行后新增两个函数；替换约 6161-6170、6505-6514、224、5695-5704、5362-5373、5501、5509）

- [ ] **Step 1: 新增两个模块级函数**

在 `serializeAttackDamageBonusForSave` 函数结束（约 195 行）之后插入：

```js
/** 切换效果类型时的默认值结构（行内编辑器与弹窗编辑器共用） */
function patchDefaultsForEffectType(effectType, currentValue) {
  const patch = { effectType }
  if (effectType === 'initiative_buff') patch.value = { bonus: 0, proficient: false }
  if (effectType === 'attack_damage_bonus') patch.value = normalizeAttackDamageBonusModuleValue(currentValue)
  if (effectType === 'spell_damage_bonus') patch.value = { type: '', diceFloor: 0, perDieBonus: 0, extraDice: '', flatBonus: 0 }
  if (effectType === 'spell_ability_attack') patch.value = { ability: 'int' }
  if (effectType === 'base_speed_increment') patch.value = { walk: 0, fly: 0, swim: 0, climb: 0 }
  if (effectType === 'ability_score_uncapped') patch.break20 = {}
  if (effectType === 'choice') patch.value = { choiceOptions: [{ name: '选项 A', effects: [] }, { name: '选项 B', effects: [] }], choiceSelected: 0 }
  return patch
}

/** 空效果模块骨架：统一三处创建点的 id 生成与字段集合 */
function createEmptyEffectModule(overrides = {}) {
  return {
    id: 'e_' + Math.random().toString(36).slice(2),
    category: '',
    effectType: '',
    scope: SCOPE_KIND.global,
    scopeDetail: [],
    value: 0,
    break20: {},
    customText: '',
    upgrade: null,
    ...overrides,
  }
}
```

- [ ] **Step 2: 行内编辑器效果类型切换改用共用函数**

把约 6161-6170 行的 onChange 回调体（7 个 if 链）替换为：

```jsx
                          onChange={(e) => {
                            updateModule(mod.id, patchDefaultsForEffectType(e.target.value, mod.value))
                          }}
```

- [ ] **Step 3: 弹窗编辑器效果类型切换改用共用函数**

把约 6505-6514 行的 onChange 回调体（同样的 7 个 if 链）替换为：

```jsx
          onChange={(e) => {
            updateDraft(patchDefaultsForEffectType(e.target.value, draft.value))
          }}
```

- [ ] **Step 4: normalizeInitialEffects 兜底骨架改用共用函数**

把约 224 行替换为：

```js
  return [createEmptyEffectModule()]
```

- [ ] **Step 5: addEffectDirectly 改用共用函数**

把约 5695-5704 行的 newMod 对象字面量替换为：

```js
    const newMod = createEmptyEffectModule({
      category,
      effectType: effectKey,
      value: effectKey === 'charge_item' ? normalizeChargeItemValue({}) : 0,
    })
```

- [ ] **Step 6: ChoiceBUFFEditor.addModule 改用共用函数**

把约 5362-5373 行的 setEditingModule 对象字面量替换为：

```js
  const addModule = () => {
    setEditingModule(createEmptyEffectModule())
  }
```

- [ ] **Step 7: UpgradeEditor 默认升级结构去重**

在 UpgradeEditor 内 `const [expanded, setExpanded] = useState(!!upgrade)` 之后插入：

```js
  const makeDefaultUpgrade = () => ({ className: charClasses[0]?.className ?? '', level: 1, value: baseValue ?? 0 })
```

把 `const upg = upgrade || { className: charClasses[0]?.className ?? '', level: 1, value: baseValue ?? 0 }` 改为 `const upg = upgrade || makeDefaultUpgrade()`；把 handleEnable 内 `onChange({ className: charClasses[0]?.className ?? '', level: 1, value: baseValue ?? 0 })` 改为 `onChange(makeDefaultUpgrade())`。

- [ ] **Step 8: 构建、检查与验证**

Run: `npm run build` && `npx eslint src/components/BuffForm.jsx`
Expected: 成功、无新增 error。
浏览器：效果编辑器中切换效果类型到"法术增伤"（应出现空结构控件）、"选择型"（应默认两个选项）、点"添加效果"新增一行、选择型 BUFF 内添加效果模块——均正常。

- [ ] **Step 9: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "refactor: 效果类型默认值与空模块骨架统一为共用函数"
```

---

### Task 6: 护甲覆盖保存转换只留一份（第 4 组去重）

**Files:**
- Modify: `src/components/BuffForm.jsx`（normalizeValueForSave 内约 272-283 行）

**背景:** 护甲覆盖的归一逻辑在 normalizeValueForSave 内联写了一遍（272-283），又有独立函数 normalizeArmorOverrideValue（约 3309 行，ArmorOverrideEditor 载入在用），两者字段与默认值完全一致。函数声明会提升，可被前面的代码调用。

- [ ] **Step 1: 内联块改为调用独立函数**

把约 272-283 行替换为：

```js
  if (needsSubSelect === 'armorOverride') {
    return normalizeArmorOverrideValue(value)
  }
```

- [ ] **Step 2: 构建、检查与验证**

Run: `npm run build` && `npx eslint src/components/BuffForm.jsx`
Expected: 成功、无新增 error。
浏览器：编辑一条含"护甲覆盖"效果的 BUFF，改基础 AC/ Dex 上限/额外值 → 保存 → 重开 → 数值不变。

- [ ] **Step 3: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "refactor: 护甲覆盖归一逻辑收敛到 normalizeArmorOverrideValue"
```

---

### Task 7: 死代码清理 A — 零调用组件与函数

**Files:**
- Modify: `src/components/BuffForm.jsx`（删除约 3424-3573、100-107；改 6570 导出行；清理导入块 1-79）

**背景:** AttackDamageBonusFields 全项目零调用（仅定义 + 导出行提及）；getAbilityFieldValue 零调用。删除后部分导入会失去使用者，需逐一核验后清理。

- [ ] **Step 1: 删除 AttackDamageBonusFields 组件**

删除从 `function AttackDamageBonusFields({ module, onChange, compactClass, inline, variant = 'all', hideWeaponAddButtons = false, referenceData }) {`（约 3424 行）到其闭合 `}`（约 3573 行，下一行是空行、再下一行是 `/** 单条效果的数值/选项编辑区...` 注释）的整段。

- [ ] **Step 2: 导出行移除该名字**

把文件末尾导出行中的 `AttackDamageBonusFields, ` 删除（保留其余导出名字不变）。

- [ ] **Step 3: 删除 getAbilityFieldValue**

删除约 100-107 行的 `function getAbilityFieldValue(obj, key) { ... }` 整段（含其上方约 99 行的注释行 `/** 读取属性对象里的值... */`）。

- [ ] **Step 4: 清理失去使用者的导入**

对以下每个名字执行 `grep -n "<名字>" src/components/BuffForm.jsx`，若仅剩导入行则从导入块删除该名字（已确认当前即零使用：`DAMAGE_DICE_ARROW_OPTIONS`、`getMergedSpells`、`CLASS_LIST`、`SCOPE_TYPE`、`formatRecoveryBrief`；删除组件后预计还有 `WEAPON_BUFF_CATEGORY_SELECT_OPTIONS`）：

```bash
grep -n "DAMAGE_DICE_ARROW_OPTIONS\|getMergedSpells\|CLASS_LIST\|SCOPE_TYPE\b\|formatRecoveryBrief\|WEAPON_BUFF_CATEGORY_SELECT_OPTIONS\|ADVANTAGE_OPTIONS" src/components/BuffForm.jsx
```

判定规则：某名字除导入行外无其他匹配 → 删除该导入；`ADVANTAGE_OPTIONS` 若在其他效果分支仍有使用则保留。注意 `SCOPE_TYPE` 用带词边界的模式匹配，避免误判 `SCOPE_TYPE_OPTIONS`（后者仍在使用，保留）。

- [ ] **Step 5: 构建、检查与验证**

Run: `npm run build` && `npx eslint src/components/BuffForm.jsx`
Expected: 成功；不应出现未定义标识符报错。
浏览器冒烟：打开效果编辑器，编辑并保存一条 BUFF，正常即可。

- [ ] **Step 6: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "chore: 删除零调用的 AttackDamageBonusFields 与 getAbilityFieldValue 及失效导入"
```

---

### Task 8: 死代码清理 B — 死分支、死状态、调试日志、Hook 顺序

**Files:**
- Modify: `src/components/BuffForm.jsx`（约 1651-1652、2101-2102、4098-4113、3599-3614、3633-3638、5762、5771-5772、5782-5788、5794）

- [ ] **Step 1: 删除未使用的局部变量**

删除约 1651-1652 行（ChargeItemEditor 内 `const spellScalingEnabled = ...` 与 `const spellSU = ...`）和约 2101-2102 行（ActiveEffectsList 内同名两行）。

- [ ] **Step 2: 删除不可达的施法属性分支**

删除 EffectValueEditor inline 分支中约 4098-4113 行的 `if (currentEffect?.key === 'spell_ability_attack') { ... }` 整块。该条件与同 if 链前面约 3806 行的分支完全相同，此处永远不可达。保留 3806-3823 那份。

- [ ] **Step 3: 删除死状态与死 effect**

删除 EffectValueEditor 内约 3599-3606 行 `selectedSkillId` 状态、约 3607-3614 行 `selectedAbilityId` 状态、约 3633-3638 行只写不读的 useEffect（三者均无渲染侧读取）。

- [ ] **Step 4: 删除调试日志与调试 effect**

删除约 5782-5788 行整段（注释 `// 监控 initial 变化...` + 只含 console.log/console.warn 的 useEffect）。在卸载清理 effect（约 5791-5796）中只删除 `console.log('[BuffForm] Unmounting')` 一行，保留 clearTimeout 逻辑。

- [ ] **Step 5: 删除被注释的自动保存代码**

删除 updateModule 内约 5771-5772 行两行注释（`// 模块更新后触发自动保存...` 与 `// setTimeout(() => triggerAutoSave(), 0)`）。行为不变：updateModule 仍不触发自动保存。

- [ ] **Step 6: 上移 editingModuleId 状态声明**

把约 5762 行 `const [editingModuleId, setEditingModuleId] = useState(null)` 剪切到主组件状态区（约 5631 行 `const [pickerCategory, setPickerCategory] = useState('ability')` 之后），消除"函数先引用、状态后声明"的脆弱顺序。

- [ ] **Step 7: 构建、检查与验证**

Run: `npm run build` && `npx eslint src/components/BuffForm.jsx`
Expected: 成功、无新增 error。
浏览器冒烟：效果编辑器展开/收起效果行、行内切换效果类型、保存；控制台无多余 `[BuffForm]` 日志。

- [ ] **Step 8: 提交**

```bash
git add src/components/BuffForm.jsx
git commit -m "chore: 清理死分支/死状态/调试日志，上移 editingModuleId 声明"
```

---

### Task 9: 全量验证与收尾

**Files:** 无代码改动（除非验证发现问题，回到对应 Task 修复）

- [ ] **Step 1: 构建与 lint**

Run: `npm run build`
Expected: 成功。
Run: `npm run lint`
Expected: BuffForm.jsx 无 error；其他文件的既有问题不在本计划范围。

- [ ] **Step 2: 行数核对**

Run: `wc -l src/components/BuffForm.jsx`（Git Bash 下可用 `sed -n '$=' src/components/BuffForm.jsx`）
Expected: 约 6280-6320 行（起点 6570）。

- [ ] **Step 3: 浏览器全量手动清单**

`npm run dev` 后逐项验证：
1. BUFF 状态栏：新建 BUFF → 加数值效果 → 设生效条件 → 设起效范围 → 保存 → 重开全在。
2. 自动保存：编辑后停手 1 秒 → 刷新页面 → 数据在（含起效范围）。
3. 职业特性"编辑效果"入口、专长"默认 BUFF"入口：打开编辑器改数值保存，重开在。
4. 装备充能物品：改充能次数/添加伤害效果（命中下拉 8 项）→ 保存 → 重开在。
5. 主动卡内含法术：总能量行渲染正常、加法术行、改环位/消耗/命中/距离 → 保存 → 重开在。
6. 选择型 BUFF：加选项、删选项、选项内加效果模块 → 保存 → 重开在。
7. 随机表效果：加条目、骰子/扑克模式切换 → 保存 → 重开在。
8. 护甲覆盖效果：改基础 AC 保存重开数值不变。

- [ ] **Step 4: 记录结果**

向用户汇报：实际净减行数、8 项清单通过情况、遗留事项（第 5/6 组去重未做，留待后续单独计划）。

---

## 风险与回退

- 每个 Task 独立提交，任何一步验证失败可 `git revert` 单个提交或回到上一提交继续排查。
- Task 3 改动保存主链路，风险最高：若手动清单第 1/2 项失败，优先核对 buildSavePayload 与原两段代码的字段差异（cardScope、sourceKind、enabled、duration 四项）。
- 全程不删除任何旧格式兼容代码（normalizeInitialEffects 的迁移逻辑、concentration 旧文案转换等一律保留）。
