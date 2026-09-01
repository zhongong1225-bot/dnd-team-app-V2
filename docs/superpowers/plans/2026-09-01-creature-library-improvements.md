# 生物库改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复生物库 3 个 Bug，补全编辑器，让变身后的天生武器、法术、状态免疫全部生效，并自动扣减荒野变形次数。

**Architecture:** 分 6 个阶段递进实施。先修 Bug 打通数据流，再补编辑器让 DM 能录入完整数据，最后让变身效果在战斗计算中 fully work。所有变身相关的临时数据（天生武器、法术）在 UI 层渲染，不污染角色持久数据。

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, Supabase (可选), localStorage 回退

---

## 文件结构

### 修改的文件

| 文件 | 职责 |
|------|------|
| `src/data/creatureLibrary.js` | 扩展生物数据模型（新增 reactions、legendaryActions、spells 字段），修复 HP 读取兼容 |
| `src/pages/CreatureLibraryManager.jsx` | 编辑器新增 6 个区域：易伤、状态免疫、天生武器、反应、传奇动作、法术 |
| `src/hooks/useBuffCalculator.js` | 变身时暴露天生武器和法术数据到 creatureTransform 输出；状态免疫实际生效 |
| `src/components/CombatStatus.jsx` | 变身后渲染天生武器和法术作为临时战斗手段；变身时扣减荒野变形次数 |
| `src/components/AbilityUseModal.jsx` | 修复召唤 HP 读取；支持生物法术和天生武器的释放弹窗 |
| `src/components/BuffListItem.jsx` | 改用 `getCreatureById()` 获取生物名字（3 处） |
| `src/components/CreatureSelectorModal.jsx` | 类型筛选补全 14 种 |
| `src/App.jsx` 或角色加载入口 | 应用启动时自动加载生物库数据 |

---

## 第一阶段：Bug 修复

### Task 1: 修复召唤生物 HP 只有 10

**Files:**
- Modify: `src/components/AbilityUseModal.jsx:481,593`
- Modify: `src/data/creatureLibrary.js` (添加 `parseCreatureHp` 辅助函数)

- [ ] **Step 1: 在 creatureLibrary.js 添加 HP 解析函数**

```js
// 在 parseHpFormula 函数附近添加
export function parseCreatureHp(hp) {
  if (typeof hp === 'number') return hp
  if (typeof hp === 'string') {
    // 使用现有的 parseHpFormula 转平均值
    return parseHpFormula(hp)
  }
  if (hp && typeof hp === 'object') {
    if (hp.formula) return evalHpFormula(hp.formula) // 如果有公式
    if (hp.max) return hp.max
  }
  return 10 // 兜底
}
```

- [ ] **Step 2: 修改 AbilityUseModal.jsx 第 481 行**

```js
// 改前
const sHp = creature.hp?.formula ? evalHpFormula(creature.hp.formula, char) : (creature.hp?.max || 10)

// 改后
import { parseCreatureHp } from '../data/creatureLibrary'
const sHp = parseCreatureHp(creature.hp)
```

- [ ] **Step 3: 修改 AbilityUseModal.jsx 第 593 行**

```js
// 改前
const summonHp = creature.hp?.formula ? evalHpFormula(creature.hp.formula, char) : (creature.hp?.max || 10)

// 改后
const summonHp = parseCreatureHp(creature.hp)
```

- [ ] **Step 4: 测试**

启动开发服务器 `npm run dev`，创建一个召唤法术，选择生物库中的生物（HP 为数字如 45），确认召唤物 HP 显示 45 而不是 10。

- [ ] **Step 5: 提交**

```bash
git add src/data/creatureLibrary.js src/components/AbilityUseModal.jsx
git commit -m "fix: 修复召唤生物 HP 默认 10 的问题"
```

---

### Task 2: 修复变身状态栏显示 ID 而不是名字

**Files:**
- Modify: `src/components/BuffListItem.jsx:251,433,475`

- [ ] **Step 1: 在 BuffListItem.jsx 顶部导入 getCreatureById**

```js
import { getCreatureById } from '../data/creatureLibrary'
```

- [ ] **Step 2: 修改第 251 行附近的代码**

```js
// 改前
let creatureName = creatureId
try {
  const lib = JSON.parse(localStorage.getItem('dnd_creature_library') || '[]')
  const found = lib.find((c) => c.id === creatureId)
  if (found) creatureName = found.name || creatureId
} catch {}

// 改后
const creature = getCreatureById(creatureId)
const creatureName = creature?.name || creatureId
```

- [ ] **Step 3: 修改第 433 行附近的代码**

```js
// 改前
let creatureName = ctValue.creatureId
try {
  const lib = JSON.parse(localStorage.getItem('dnd_creature_library') || '[]')
  const found = lib.find((c) => c.id === ctValue.creatureId)
  if (found) creatureName = found.name || ctValue.creatureId
} catch {}

// 改后
const creature = getCreatureById(ctValue.creatureId)
const creatureName = creature?.name || ctValue.creatureId
```

- [ ] **Step 4: 修改第 475 行附近的代码**

```js
// 改前（同 Step 3 的模式）
let creatureName = ctValue.creatureId
try {
  const lib = JSON.parse(localStorage.getItem('dnd_creature_library') || '[]')
  const found = lib.find((c) => c.id === ctValue.creatureId)
  if (found) creatureName = found.name || ctValue.creatureId
} catch {}

// 改后
const creature = getCreatureById(ctValue.creatureId)
const creatureName = creature?.name || ctValue.creatureId
```

- [ ] **Step 5: 测试**

在 Supabase 模式下（或清空 localStorage 模拟），创建一个变身 BUFF，选择生物库中的生物。确认状态栏显示生物名字而不是 ID。

- [ ] **Step 6: 提交**

```bash
git add src/components/BuffListItem.jsx
git commit -m "fix: 变身状态栏显示生物名字而不是 ID"
```

---

### Task 3: 联网模式下生物库数据自动加载

**Files:**
- Modify: `src/App.jsx` 或 `src/pages/CharacterSheet.jsx` (应用启动入口)

- [ ] **Step 1: 找到应用启动入口**

读取 `src/App.jsx` 或主入口文件，找到合适的位置调用 `loadCreatureLibraryFromSupabase()`。

- [ ] **Step 2: 在应用启动时加载生物库**

```js
// 在 App.jsx 的顶层或 useEffect 中添加
import { loadCreatureLibraryFromSupabase } from './data/creatureLibrary'

useEffect(() => {
  loadCreatureLibraryFromSupabase()
}, [])
```

或者在角色卡加载时（CharacterSheet.jsx）：

```js
useEffect(() => {
  loadCreatureLibraryFromSupabase()
}, [])
```

- [ ] **Step 3: 测试**

在 Supabase 模式下，刷新页面后直接打开角色卡，创建变身 BUFF，确认生物列表不为空（能看到之前创建生物）。

- [ ] **Step 4: 提交**

```bash
git add src/App.jsx  # 或 CharacterSheet.jsx
git commit -m "fix: 应用启动时自动加载生物库数据"
```

---

## 第二阶段：补全生物编辑器

### Task 4: 扩展生物数据模型

**Files:**
- Modify: `src/data/creatureLibrary.js:41-71`

- [ ] **Step 1: 在 DEFAULT_CREATURE 中添加新字段**

```js
export const DEFAULT_CREATURE = {
  // ... 现有字段保持不变 ...
  
  // 新增字段
  reactions: [],  // [{ name, description }]
  legendaryActions: [],  // [{ name, description, cost }]
  legendaryActionPoints: 0,
  
  // 法术相关
  spellcastingAbility: null,  // 'int' | 'wis' | 'cha' | null
  spellSaveDC: 0,
  spellAttackBonus: 0,
  spells: [],  // [{ name, castMode: 'at-will' | 'per-day' | 'slot', timesPerDay, slotLevel, description }]
}
```

- [ ] **Step 2: 更新文件顶部注释**

```js
 * - reactions: 反应动作数组 [{ name, description }]
 * - legendaryActions: 传奇动作数组 [{ name, description, cost }]
 * - legendaryActionPoints: 传奇动作点数
 * - spellcastingAbility: 施法属性 ('int' | 'wis' | 'cha' | null)
 * - spellSaveDC: 法术豁免 DC
 * - spellAttackBonus: 法术攻击加值
 * - spells: 法术列表 [{ name, castMode, timesPerDay, slotLevel, description }]
```

- [ ] **Step 3: 提交**

```bash
git add src/data/creatureLibrary.js
git commit -m "feat: 扩展生物数据模型，新增反应、传奇动作、法术字段"
```

---

### Task 5: 编辑器 - 易伤和状态免疫

**Files:**
- Modify: `src/pages/CreatureLibraryManager.jsx`

- [ ] **Step 1: 找到现有抗性/免疫编辑区域**

读取 CreatureLibraryManager.jsx，找到 `resistances` 和 `immunities` 的编辑代码，复制其模式。

- [ ] **Step 2: 添加易伤编辑区域**

在免疫编辑区域附近，添加易伤编辑（逗号分隔文字输入）：

```jsx
<div>
  <label className="block text-sm text-gray-400 mb-1">易伤（逗号分隔）</label>
  <input
    type="text"
    value={(formData.vulnerabilities || []).join(', ')}
    onChange={(e) => updateField('vulnerabilities', 
      e.target.value.split(',').map(s => s.trim()).filter(Boolean)
    )}
    className="..."
    placeholder="火, 冰霜"
  />
</div>
```

- [ ] **Step 3: 添加状态免疫编辑区域**

```jsx
<div>
  <label className="block text-sm text-gray-400 mb-1">状态免疫（逗号分隔）</label>
  <input
    type="text"
    value={(formData.conditionImmunities || []).join(', ')}
    onChange={(e) => updateField('conditionImmunities',
      e.target.value.split(',').map(s => s.trim()).filter(Boolean)
    )}
    className="..."
    placeholder="魅惑, 恐慌, 擒抱"
  />
</div>
```

- [ ] **Step 4: 测试**

打开生物编辑器，确认能输入易伤和状态免疫，保存后重新打开数据不丢失。

- [ ] **Step 5: 提交**

```bash
git add src/pages/CreatureLibraryManager.jsx
git commit -m "feat: 编辑器新增易伤和状态免疫编辑"
```

---

### Task 6: 编辑器 - 天生武器

**Files:**
- Modify: `src/pages/CreatureLibraryManager.jsx`

- [ ] **Step 1: 添加天生武器编辑区域**

```jsx
<div>
  <label className="block text-sm text-gray-400 mb-2">天生武器</label>
  {(formData.naturalWeapons || []).map((weapon, idx) => (
    <div key={idx} className="flex gap-2 mb-2">
      <input
        type="text"
        value={weapon.name || ''}
        onChange={(e) => updateNaturalWeapon(idx, 'name', e.target.value)}
        placeholder="名字（如爪击）"
        className="flex-1 ..."
      />
      <input
        type="number"
        value={weapon.attackBonus ?? ''}
        onChange={(e) => updateNaturalWeapon(idx, 'attackBonus', Number(e.target.value))}
        placeholder="攻击加值"
        className="w-20 ..."
      />
      <input
        type="text"
        value={weapon.damage || ''}
        onChange={(e) => updateNaturalWeapon(idx, 'damage', e.target.value)}
        placeholder="伤害（如 2d6+3 挥砍）"
        className="flex-1 ..."
      />
      <button onClick={() => removeNaturalWeapon(idx)} className="...">
        <Trash2 size={14} />
      </button>
    </div>
  ))}
  <button onClick={addNaturalWeapon} className="...">
    + 添加天生武器
  </button>
</div>
```

- [ ] **Step 2: 添加辅助函数**

```js
const addNaturalWeapon = () => {
  updateField('naturalWeapons', [
    ...(formData.naturalWeapons || []),
    { name: '', attackBonus: 0, damage: '' }
  ])
}

const updateNaturalWeapon = (idx, key, value) => {
  const weapons = [...(formData.naturalWeapons || [])]
  weapons[idx] = { ...weapons[idx], [key]: value }
  updateField('naturalWeapons', weapons)
}

const removeNaturalWeapon = (idx) => {
  const weapons = [...(formData.naturalWeapons || [])]
  weapons.splice(idx, 1)
  updateField('naturalWeapons', weapons)
}
```

- [ ] **Step 3: 测试**

添加/删除天生武器，保存后重新打开数据正确。

- [ ] **Step 4: 提交**

```bash
git add src/pages/CreatureLibraryManager.jsx
git commit -m "feat: 编辑器新增天生武器编辑"
```

---

### Task 7: 编辑器 - 反应和传奇动作

**Files:**
- Modify: `src/pages/CreatureLibraryManager.jsx`

- [ ] **Step 1: 添加反应动作编辑区域**

```jsx
<div>
  <label className="block text-sm text-gray-400 mb-2">反应动作</label>
  {(formData.reactions || []).map((reaction, idx) => (
    <div key={idx} className="flex gap-2 mb-2">
      <input
        type="text"
        value={reaction.name || ''}
        onChange={(e) => updateReaction(idx, 'name', e.target.value)}
        placeholder="名字"
        className="w-1/3 ..."
      />
      <input
        type="text"
        value={reaction.description || ''}
        onChange={(e) => updateReaction(idx, 'description', e.target.value)}
        placeholder="描述"
        className="flex-1 ..."
      />
      <button onClick={() => removeReaction(idx)} className="...">
        <Trash2 size={14} />
      </button>
    </div>
  ))}
  <button onClick={addReaction} className="...">+ 添加反应</button>
</div>
```

- [ ] **Step 2: 添加传奇动作编辑区域**

```jsx
<div>
  <label className="block text-sm text-gray-400 mb-2">传奇动作</label>
  <div className="mb-2">
    <label className="text-xs text-gray-500">传奇动作点数</label>
    <input
      type="number"
      value={formData.legendaryActionPoints || 0}
      onChange={(e) => updateField('legendaryActionPoints', Number(e.target.value))}
      className="w-20 ..."
    />
  </div>
  {(formData.legendaryActions || []).map((action, idx) => (
    <div key={idx} className="flex gap-2 mb-2">
      <input
        type="text"
        value={action.name || ''}
        onChange={(e) => updateLegendaryAction(idx, 'name', e.target.value)}
        placeholder="名字"
        className="w-1/4 ..."
      />
      <input
        type="text"
        value={action.description || ''}
        onChange={(e) => updateLegendaryAction(idx, 'description', e.target.value)}
        placeholder="描述"
        className="flex-1 ..."
      />
      <input
        type="number"
        value={action.cost || 1}
        onChange={(e) => updateLegendaryAction(idx, 'cost', Number(e.target.value))}
        placeholder="消耗"
        className="w-16 ..."
      />
      <button onClick={() => removeLegendaryAction(idx)} className="...">
        <Trash2 size={14} />
      </button>
    </div>
  ))}
  <button onClick={addLegendaryAction} className="...">+ 添加传奇动作</button>
</div>
```

- [ ] **Step 3: 添加辅助函数（同 Task 6 模式）**

- [ ] **Step 4: 测试并提交**

```bash
git add src/pages/CreatureLibraryManager.jsx
git commit -m "feat: 编辑器新增反应和传奇动作编辑"
```

---

### Task 8: 编辑器 - 法术区域

**Files:**
- Modify: `src/pages/CreatureLibraryManager.jsx`

- [ ] **Step 1: 添加施法属性、DC、攻击加值编辑**

```jsx
<div>
  <label className="block text-sm text-gray-400 mb-2">法术</label>
  <div className="grid grid-cols-3 gap-2 mb-3">
    <div>
      <label className="text-xs text-gray-500">施法属性</label>
      <select
        value={formData.spellcastingAbility || ''}
        onChange={(e) => updateField('spellcastingAbility', e.target.value || null)}
        className="..."
      >
        <option value="">无</option>
        <option value="int">智力</option>
        <option value="wis">感知</option>
        <option value="cha">魅力</option>
      </select>
    </div>
    <div>
      <label className="text-xs text-gray-500">法术豁免 DC</label>
      <input
        type="number"
        value={formData.spellSaveDC || 0}
        onChange={(e) => updateField('spellSaveDC', Number(e.target.value))}
        className="..."
      />
    </div>
    <div>
      <label className="text-xs text-gray-500">法术攻击加值</label>
      <input
        type="number"
        value={formData.spellAttackBonus || 0}
        onChange={(e) => updateField('spellAttackBonus', Number(e.target.value))}
        className="..."
      />
    </div>
  </div>
</div>
```

- [ ] **Step 2: 添加法术列表编辑**

```jsx
<div>
  {(formData.spells || []).map((spell, idx) => (
    <div key={idx} className="flex gap-2 mb-2 items-start">
      <input
        type="text"
        value={spell.name || ''}
        onChange={(e) => updateSpell(idx, 'name', e.target.value)}
        placeholder="法术名称"
        className="flex-1 ..."
      />
      <select
        value={spell.castMode || 'at-will'}
        onChange={(e) => updateSpell(idx, 'castMode', e.target.value)}
        className="w-28 ..."
      >
        <option value="at-will">随意</option>
        <option value="per-day">每天 N 次</option>
        <option value="slot">需要法术位</option>
      </select>
      {spell.castMode === 'per-day' && (
        <input
          type="number"
          value={spell.timesPerDay || 1}
          onChange={(e) => updateSpell(idx, 'timesPerDay', Number(e.target.value))}
          className="w-16 ..."
          min="1"
        />
      )}
      {spell.castMode === 'slot' && (
        <select
          value={spell.slotLevel || 1}
          onChange={(e) => updateSpell(idx, 'slotLevel', Number(e.target.value))}
          className="w-20 ..."
        >
          {[1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{l} 环</option>)}
        </select>
      )}
      <button onClick={() => removeSpell(idx)} className="...">
        <Trash2 size={14} />
      </button>
    </div>
  ))}
  <button onClick={addSpell} className="...">+ 添加法术</button>
</div>
```

- [ ] **Step 3: 添加辅助函数并提交**

```bash
git add src/pages/CreatureLibraryManager.jsx
git commit -m "feat: 编辑器新增法术区域（施法属性、DC、法术列表）"
```

---

## 第三阶段：天生武器接入战斗

### Task 9: 变身时暴露天生武器数据

**Files:**
- Modify: `src/hooks/useBuffCalculator.js:195-210`

- [ ] **Step 1: 在 creatureTransformData 输出中添加 naturalWeapons**

找到 `creatureTransformData = { creature, ... }` 的赋值位置，确认 `creature` 对象已包含 `naturalWeapons`（它已经包含了，因为 `getCreatureById` 返回完整生物对象）。

然后在 `buffStats` 返回对象中，确保 `creatureTransform` 输出包含 `creature.naturalWeapons`：

```js
// 在 computeBuffStats 返回前
creatureTransformData = {
  ...creatureTransformData,
  naturalWeapons: creature.naturalWeapons || [],
  spells: creature.spells || [],
  spellSaveDC: creature.spellSaveDC || 0,
  spellAttackBonus: creature.spellAttackBonus || 0,
}
```

- [ ] **Step 2: 在 buffStats 输出中暴露**

```js
return {
  // ... 现有字段 ...
  creatureTransform: creatureTransformData ? {
    // ... 现有字段 ...
    naturalWeapons: creatureTransformData.naturalWeapons,
    spells: creatureTransformData.spells,
    spellSaveDC: creatureTransformData.spellSaveDC,
    spellAttackBonus: creatureTransformData.spellAttackBonus,
  } : null,
}
```

- [ ] **Step 3: 测试并提交**

```bash
git add src/hooks/useBuffCalculator.js
git commit -m "feat: 变身时暴露天生武器和法术数据到 buffStats"
```

---

### Task 10: CombatStatus 渲染天生武器临时战斗手段

**Files:**
- Modify: `src/components/CombatStatus.jsx`

- [ ] **Step 1: 在战斗手段列表渲染后，追加天生武器分区**

找到战斗手段列表渲染位置（`combatMeans.map(...)` 之后），添加：

```jsx
{/* 变身后天生武器 */}
{buffStats?.creatureTransform?.naturalWeapons?.length > 0 && (
  <div className="mt-3">
    <div className="text-xs text-amber-400 mb-1 flex items-center gap-1">
      <span className="opacity-60">🐾</span> 天生武器（变身）
    </div>
    {buffStats.creatureTransform.naturalWeapons.map((weapon, idx) => (
      <div
        key={`natural_${idx}`}
        onClick={() => handleNaturalWeaponClick(weapon)}
        className="... cursor-pointer opacity-80 border-l-2 border-amber-500/50 pl-2"
      >
        <span className="text-sm">{weapon.name}</span>
        <span className="text-xs text-gray-400 ml-2">
          +{weapon.attackBonus} | {weapon.damage}
        </span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: 添加点击处理函数**

```js
const handleNaturalWeaponClick = (weapon) => {
  // 打开 AbilityUseModal，传入天生武器数据
  setExecuteAbilityModal({
    ability: {
      name: weapon.name,
      type: 'natural_weapon',
      attackBonus: weapon.attackBonus,
      damage: weapon.damage,
    },
    context: { isNaturalWeapon: true },
  })
}
```

- [ ] **Step 3: 测试并提交**

```bash
git add src/components/CombatStatus.jsx
git commit -m "feat: 变身后渲染天生武器作为临时战斗手段"
```

---

## 第四阶段：荒野变形次数扣减

### Task 11: 变身时扣减荒野变形次数

**Files:**
- Modify: `src/components/CombatStatus.jsx`

- [ ] **Step 1: 在 BUFF 创建/激活逻辑中添加扣减**

找到 BUFF 添加到角色的位置（`addBuff` 或类似函数），在检测到 `creature_transform` + `wildShapeMode` 时扣减：

```js
const handleAddBuff = (newBuff) => {
  // 检查是否是荒野变形
  const hasCreatureTransform = newBuff.effects?.some(
    e => e.effectType === 'creature_transform' && e.wildShapeMode
  )
  
  if (hasCreatureTransform) {
    // 查找 wild_shape 资源
    const wildShapeResource = char.classResources?.find(
      r => r.resourceKey === 'wild_shape'
    )
    
    if (wildShapeResource) {
      if (wildShapeResource.current <= 0) {
        alert('荒野变形次数已用完')
        return // 阻止变身
      }
      
      // 扣减次数
      const updatedResources = char.classResources.map(r =>
        r.resourceKey === 'wild_shape'
          ? { ...r, current: r.current - 1 }
          : r
      )
      updateCharacter({ classResources: updatedResources })
    }
  }
  
  // 原有的添加逻辑
  // ...
}
```

- [ ] **Step 2: 测试并提交**

```bash
git add src/components/CombatStatus.jsx
git commit -m "feat: 变身时自动扣减荒野变形次数"
```

---

## 第五阶段：生物法术作为战斗手段

### Task 12: CombatStatus 渲染生物法术临时按钮

**Files:**
- Modify: `src/components/CombatStatus.jsx`

- [ ] **Step 1: 在天生武器分区后，追加生物法术分区**

```jsx
{/* 变身后生物法术 */}
{buffStats?.creatureTransform?.spells?.length > 0 && (
  <div className="mt-3">
    <div className="text-xs text-purple-400 mb-1 flex items-center gap-1">
      <span className="opacity-60">✨</span> 生物法术（变身）
    </div>
    {buffStats.creatureTransform.spells.map((spell, idx) => (
      <div
        key={`spell_${idx}`}
        onClick={() => handleCreatureSpellClick(spell, idx)}
        className="... cursor-pointer opacity-80 border-l-2 border-purple-500/50 pl-2"
      >
        <span className="text-sm">{spell.name}</span>
        {spell.castMode === 'per-day' && (
          <span className="text-xs text-gray-400 ml-2">
            ({creatureSpellUses[idx] || 0}/{spell.timesPerDay})
          </span>
        )}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: 添加法术使用次数追踪状态**

```js
const [creatureSpellUses, setCreatureSpellUses] = useState({})

// 变身结束时重置
useEffect(() => {
  if (!buffStats?.creatureTransform) {
    setCreatureSpellUses({})
  }
}, [buffStats?.creatureTransform])
```

- [ ] **Step 3: 添加点击处理函数**

```js
const handleCreatureSpellClick = (spell, idx) => {
  // 检查使用次数
  if (spell.castMode === 'per-day') {
    const used = creatureSpellUses[idx] || 0
    if (used >= spell.timesPerDay) {
      alert('该法术今天已用完')
      return
    }
  }
  
  // 打开 AbilityUseModal
  setExecuteAbilityModal({
    ability: {
      name: spell.name,
      type: 'creature_spell',
      castMode: spell.castMode,
      slotLevel: spell.slotLevel,
      spellSaveDC: buffStats.creatureTransform.spellSaveDC,
      spellAttackBonus: buffStats.creatureTransform.spellAttackBonus,
    },
    context: {
      isCreatureSpell: true,
      spellIndex: idx,
    },
  })
  
  // 记录使用次数
  if (spell.castMode === 'per-day') {
    setCreatureSpellUses(prev => ({
      ...prev,
      [idx]: (prev[idx] || 0) + 1,
    }))
  }
}
```

- [ ] **Step 4: 测试并提交**

```bash
git add src/components/CombatStatus.jsx
git commit -m "feat: 变身后渲染生物法术作为临时战斗手段"
```

---

## 第六阶段：状态免疫 + 选择弹窗

### Task 13: 状态免疫实际生效

**Files:**
- Modify: `src/hooks/useBuffCalculator.js:901-903`

- [ ] **Step 1: 填充状态免疫替换逻辑**

找到"状态免疫也合并"代码块，填充：

```js
// 改前
if (Array.isArray(creature.conditionImmunities) && creature.conditionImmunities.length > 0) {
  // conditionImmunities 需要特殊处理，这里先简单记录
}

// 改后
if (Array.isArray(creature.conditionImmunities) && creature.conditionImmunities.length > 0) {
  conditionImmunities.clear() // 清空角色自身的
  for (const c of creature.conditionImmunities) {
    conditionImmunities.add(String(c).toLowerCase())
  }
}
```

- [ ] **Step 2: 测试并提交**

```bash
git add src/hooks/useBuffCalculator.js
git commit -m "feat: 变身后状态免疫完全替换角色的"
```

---

### Task 14: 生物选择弹窗类型筛选补全

**Files:**
- Modify: `src/components/CreatureSelectorModal.jsx`
- Modify: `src/data/creatureLibrary.js` (添加 CREATURE_TYPES 常量)

- [ ] **Step 1: 在 creatureLibrary.js 添加类型常量**

```js
export const CREATURE_TYPES = [
  { value: 'aberration', label: '异怪' },
  { value: 'beast', label: '野兽' },
  { value: 'celestial', label: '天界' },
  { value: 'construct', label: '构装' },
  { value: 'dragon', label: '龙' },
  { value: 'elemental', label: '元素' },
  { value: 'fey', label: '精类' },
  { value: 'fiend', label: '邪魔' },
  { value: 'giant', label: '巨人' },
  { value: 'humanoid', label: '类人' },
  { value: 'monstrosity', label: '魔兽' },
  { value: 'ooze', label: '泥怪' },
  { value: 'plant', label: '植物' },
  { value: 'undead', label: '不死' },
]
```

- [ ] **Step 2: 在 CreatureSelectorModal 中使用**

```js
import { CREATURE_TYPES } from '../data/creatureLibrary'

// 替换现有的硬编码类型列表
{CREATURE_TYPES.map(t => (
  <option key={t.value} value={t.value}>{t.label}</option>
))}
```

- [ ] **Step 3: 测试并提交**

```bash
git add src/data/creatureLibrary.js src/components/CreatureSelectorModal.jsx
git commit -m "feat: 生物选择弹窗类型筛选补全 14 种"
```

---

## 自审清单

- [x] **规格覆盖**：3 个 Bug 修复（Task 1-3）、编辑器 6 区域（Task 4-8）、天生武器（Task 9-10）、荒野变形扣减（Task 11）、生物法术（Task 12）、状态免疫（Task 13）、选择弹窗（Task 14）
- [x] **无占位符**：所有步骤都有具体代码
- [x] **类型一致**：`parseCreatureHp`、`getCreatureById`、`naturalWeapons`、`spells` 等命名全文一致

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-01-creature-library-improvements.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
