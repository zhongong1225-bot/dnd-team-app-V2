# 装备卡统一列表改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将装备栏和背包栏合并为统一的物品列表，每件物品使用 6 列标准网格卡片，通过第 2 列下拉菜单控制装备状态。

**Architecture:** 新建 `equipmentSlotUtils.js`（数据映射 + 排序 + 槽位变更）和 `EquipmentItemCard.jsx`（6 列网格卡片组件），重构 `EquipmentAndInventory.jsx` 的渲染部分，用统一列表替换当前的双分区（装备左右分栏 + 背包 7 列网格）。保留次元袋模块、容器嵌套、钱包货币等复杂子系统。

**Tech Stack:** React 18, Tailwind CSS 3, lucide-react

**设计规范:** `docs/CARD_LAYOUT_SPEC.md`（标准网格 `46px 76px 376px 136px 1fr 76px`）

---

## 当前状态分析

### 现有渲染结构（将被替换）

```
EquipmentAndInventory
├── 装备分区 (sectionCardShellClass)
│   ├── 手持卡 (nestedCardClass) — 左侧
│   │   ├── 主手/副手 固定槽 — EquipSlotBadge + select + AttuneToggle
│   │   └── 备用1-3 动态槽 — 同上 + 删除按钮
│   └── 身穿卡 (nestedCardShellClass) — 右侧
│       ├── 身体 固定槽 — EquipSlotBadge + select + AttuneToggle
│       └── 可添加槽(head/feet/...) — 部位select + 物品select + AttuneToggle
└── 背包分区 (sectionCardShellClass)
    ├── 钱包/货币区 (CurrencyGrid)
    ├── 次元袋模块区 (BagModuleSection)
    └── 物品列表 (7列网格 inventoryItemRowGridUnified)
        ├── 普通物品 — 7列: 名称|充能|释放|护盾池|数量|重量|操作
        └── 容器物品 — 同上 + 展开嵌套物品
```

### 目标渲染结构

```
EquipmentAndInventory
├── 钱包/货币区 (CurrencyGrid) — 保持不变
├── 次元袋模块区 (BagModuleSection) — 保持不变
├── 已装备物品区 (视觉分组，不同背景/边框)
│   └── EquipmentItemCard × N — 6列标准网格
│       ├── Col1: 同调勾选框 (AttuneToggle)
│       ├── Col2: 装备位下拉 (<select> + <optgroup>)
│       ├── Col3: 名称 + 能量条按钮(充能/护盾池步进器)
│       ├── Col4: BUFF简称标签
│       ├── Col5: 数量 + 重量 (右对齐)
│       └── Col6: 编辑 + 存仓库 + 删除 (3图标)
├── 背包物品区
│   └── EquipmentItemCard × N — 同6列网格
│       └── (同上，Col2下拉显示"背包")
├── 容器嵌套子列表 — 保持现有嵌套渲染
└── 添加物品按钮 — 移至底部
```

### 数据模型（不变）

```js
character.equippedHeld = [
  { id: 'main', inventoryId: 'inv_0_Longsword' },   // 主手
  { id: 'off',  inventoryId: 'inv_1_Shield' },       // 副手
  { id: 'held_xxx', inventoryId: null },              // 备用1
]
character.equippedWorn = [
  { id: 'body', inventoryId: 'inv_2_ChainMail' },    // 身穿(身体)
  { id: 'worn_xxx', slotId: 'feet', inventoryId: 'inv_3_Boots' }, // 脚穿
]
character.inventory = [
  { id: 'inv_0_Longsword', itemId: '...', qty: 1, ... },
  { id: 'inv_4_Potion', itemId: '...', qty: 3, ... },  // 背包(不在任何装备槽)
]
```

物品当前槽位通过反向查找推导：遍历 equippedHeld + equippedWorn 找到 inventoryId 匹配项。

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `src/lib/equipmentSlotUtils.js` | 槽位映射、统一列表构建、排序、槽位变更处理 |
| 新建 | `src/components/EquipmentItemCard.jsx` | 6 列标准网格装备卡片组件 |
| 修改 | `src/components/EquipmentAndInventory.jsx` | 用统一列表替换当前双分区渲染 |
| 不变 | `src/components/CardView.jsx` | 保持种族/职业/专长卡片不变 |
| 不变 | `src/lib/inventoryItemCardStyles.js` | 保留供次元袋/容器嵌套/仓库复用 |

---

### Task 1: 创建 equipmentSlotUtils.js

**Files:**
- Create: `src/lib/equipmentSlotUtils.js`

- [ ] **Step 1: 定义槽位常量和映射函数**

创建 `src/lib/equipmentSlotUtils.js`，包含：

```js
/**
 * 装备槽位工具：统一列表构建、排序、槽位变更。
 * 将 equippedHeld + equippedWorn + inventory 映射为统一的已排序物品列表。
 */

// 槽位定义（下拉菜单 optgroup 结构）
export const SLOT_GROUPS = [
  {
    group: '手持',
    slots: [
      { value: 'held_0', label: '主手' },
      { value: 'held_1', label: '副手' },
    ],
  },
  {
    group: '备用',
    slots: [
      { value: 'held_2', label: '备用1' },
      { value: 'held_3', label: '备用2' },
      { value: 'held_4', label: '备用3' },
    ],
  },
  {
    group: '穿戴',
    slots: [
      { value: 'worn_body', label: '身穿' },
      { value: 'worn_feet', label: '脚穿' },
      { value: 'worn_hands', label: '手穿' },
      { value: 'worn_head', label: '头带' },
      { value: 'worn_neck', label: '脖带' },
      { value: 'worn_eyes', label: '指戴' },  // 注意：eyes→指戴 按spec
      { value: 'worn_shoulder', label: '外袍' },
    ],
  },
  {
    group: '',
    slots: [
      { value: 'backpack', label: '背包' },
    ],
  },
]

// 排序优先级（数值越小越靠前）
const SLOT_PRIORITY = {
  'held_0': 0,   // 主手
  'held_1': 1,   // 副手
  'held_2': 2,   // 备用1
  'held_3': 3,   // 备用2
  'held_4': 4,   // 备用3
  'worn_body': 10,
  'worn_feet': 11,
  'worn_hands': 12,
  'worn_head': 13,
  'worn_neck': 14,
  'worn_eyes': 15,
  'worn_shoulder': 16,
  'backpack': 100,
}

/**
 * 为每个物品推导当前槽位值。
 * @returns {Map<string, string>} inventoryId → slotValue
 */
export function buildItemSlotMap(heldSlots, wornSlots) {
  const map = new Map()
  heldSlots.forEach((slot, i) => {
    if (slot.inventoryId) map.set(slot.inventoryId, `held_${i}`)
  })
  wornSlots.forEach((slot) => {
    if (slot.inventoryId) {
      const key = slot.id === 'body' ? 'worn_body' : `worn_${slot.slotId || 'head'}`
      map.set(slot.inventoryId, key)
    }
  })
  return map
}

/**
 * 构建统一物品列表（已排序）。
 * 排除：次元袋锚点(inBagOfHolding/bagModuleAnchorId)、钱包货币行(walletCurrencyId)
 */
export function buildUnifiedItemList(inv, heldSlots, wornSlots) {
  const slotMap = buildItemSlotMap(heldSlots, wornSlots)
  const items = []

  inv.forEach((entry, invIndex) => {
    // 排除次元袋和货币行
    if (entry?.inBagOfHolding || entry?.bagModuleAnchorId) return
    if (entry?.walletCurrencyId) return

    const slotValue = slotMap.get(entry.id) || 'backpack'
    items.push({
      entry,
      invIndex,
      slotValue,
      isEquipped: slotValue !== 'backpack',
      priority: SLOT_PRIORITY[slotValue] ?? 100,
    })
  })

  // 排序：已装备按优先级，背包保持原顺序
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.invIndex - b.invIndex
  })

  return items
}

/**
 * 处理槽位变更。
 * 核心逻辑：从旧位置移除 → 放入新位置（必要时交换/踢出已有物品）
 */
export function applySlotChange(heldSlots, wornSlots, inv, invIndex, newSlotValue) {
  const entry = inv[invIndex]
  if (!entry) return { heldSlots, wornSlots }

  const oldSlotValue = buildItemSlotMap(heldSlots, wornSlots).get(entry.id) || 'backpack'
  if (oldSlotValue === newSlotValue) return { heldSlots, wornSlots }

  let nextHeld = heldSlots.map(s => ({ ...s }))
  let nextWorn = wornSlots.map(s => ({ ...s }))

  // 1. 从旧位置移除
  if (oldSlotValue.startsWith('held_')) {
    const idx = parseInt(oldSlotValue.split('_')[1])
    if (nextHeld[idx]) nextHeld[idx] = { ...nextHeld[idx], inventoryId: null }
  } else if (oldSlotValue.startsWith('worn_')) {
    const wornKey = oldSlotValue.slice(5)
    if (wornKey === 'body') {
      nextWorn[0] = { ...nextWorn[0], inventoryId: null }
    } else {
      const wi = nextWorn.findIndex(s => s.id !== 'body' && `worn_${s.slotId}` === oldSlotValue)
      if (wi >= 0) nextWorn[wi] = { ...nextWorn[wi], inventoryId: null }
    }
  }

  // 2. 放入新位置（处理冲突）
  if (newSlotValue.startsWith('held_')) {
    const idx = parseInt(newSlotValue.split('_')[1])
    // 确保 heldSlots 足够长
    while (nextHeld.length <= idx) {
      nextHeld.push({ id: 'held_' + Date.now() + '_' + nextHeld.length, inventoryId: null })
    }
    // 如果目标槽已有物品，踢到背包（已在步骤1清除了旧物品，但目标槽可能有其他物品）
    nextHeld[idx] = { ...nextHeld[idx], inventoryId: entry.id }
  } else if (newSlotValue.startsWith('worn_')) {
    const wornKey = newSlotValue.slice(5)
    if (wornKey === 'body') {
      nextWorn[0] = { ...nextWorn[0], inventoryId: entry.id }
    } else {
      // 查找或创建对应穿戴槽
      let wi = nextWorn.findIndex(s => s.id !== 'body' && s.slotId === wornKey)
      if (wi >= 0) {
        nextWorn[wi] = { ...nextWorn[wi], inventoryId: entry.id }
      } else {
        // 创建新穿戴槽
        nextWorn.push({
          id: 'worn_' + Date.now(),
          slotId: wornKey,
          inventoryId: entry.id,
        })
      }
    }
  }
  // 'backpack' → 已在步骤1移除，不放入任何槽

  return { heldSlots: nextHeld, wornSlots: nextWorn }
}

/**
 * 获取物品可选的装备位列表（用于下拉过滤）。
 * 根据物品类型过滤：盾牌不能选主手，武器不能选穿戴等。
 */
export function getAvailableSlotsForItem(entry, inv) {
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  const t = proto?.类型 ?? ''
  const sub = proto?.子类型 ?? ''

  const isHeldItem = t === '近战武器' || t === '远程武器' || t === '枪械' || t === '法器'
  const isShield = t === '盔甲' && sub === '盾牌'
  const isArmor = t === '盔甲' && sub !== '盾牌'
  const isClothing = t === '衣服'

  const result = []
  for (const group of SLOT_GROUPS) {
    const filtered = group.slots.filter(slot => {
      if (slot.value === 'backpack') return true
      if (slot.value === 'held_0') return isHeldItem // 主手：武器/法器
      if (slot.value === 'held_1') return isHeldItem || isShield // 副手：武器/盾牌/法器
      if (slot.value.startsWith('held_')) return isHeldItem || isShield // 备用：同上
      if (slot.value === 'worn_body') return isArmor || isClothing // 身穿：盔甲/衣服
      return true // 其他穿戴槽：任意物品
    })
    if (filtered.length > 0) {
      result.push({ ...group, slots: filtered })
    }
  }
  return result
}
```

注意：`getAvailableSlotsForItem` 需要导入 `getItemById`：

```js
import { getItemById } from '../data/itemDatabase'
```

- [ ] **Step 2: 验证构建**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: 构建成功，无错误

- [ ] **Step 3: Commit**

```bash
git add src/lib/equipmentSlotUtils.js
git commit -m "feat: add equipmentSlotUtils for unified equipment list"
```

---

### Task 2: 创建 EquipmentItemCard 组件

**Files:**
- Create: `src/components/EquipmentItemCard.jsx`

- [ ] **Step 1: 创建 6 列标准网格卡片组件**

创建 `src/components/EquipmentItemCard.jsx`。这是一个自包含组件，渲染单件装备的 6 列网格卡片。

组件签名：

```jsx
/**
 * 装备物品卡 — 6列标准网格。
 * 设计规范：docs/CARD_LAYOUT_SPEC.md
 *
 * 网格：46px | 76px | 376px | 136px | 1fr | 76px  (高度52px)
 */
export default function EquipmentItemCard({
  entry,             // inventory entry 对象
  invIndex,          // 在 inv 数组中的索引
  slotValue,         // 当前槽位值 ('held_0', 'worn_body', 'backpack' 等)
  canEdit,           // 是否可编辑
  // 同调
  isAttuned,         // boolean
  attunedCount,      // 当前同调数
  maxAttunementSlots,// 最大同调位
  onAttuneToggle,    // (inventoryId, checked) => void
  // 槽位
  availableSlotGroups, // getAvailableSlotsForItem() 返回值
  onSlotChange,      // (invIndex, newSlotValue) => void
  // 名称/详情
  displayName,       // 显示名称
  magicBonus,        // 魔法加值 (number)
  brief,             // 说明文本
  briefExpanded,     // 是否展开说明
  onToggleBrief,     // () => void
  // 充能/护盾池
  charge,            // 当前充能
  maxCharge,         // 最大充能
  onChargeChange,    // (newValue) => void
  shieldPoolCurrent, // 护盾池当前值
  shieldPoolMax,     // 护盾池最大值
  onShieldPoolChange,// (newValue) => void
  hasActiveAbility,  // boolean
  activeAbilityName, // string
  onUseAbility,      // () => void
  hasContainedSpell, // boolean
  onContainedSpellCharge, // (v) => void
  // 数量/重量
  qty,               // 数量
  onQtyChange,       // (newValue) => void
  weightLb,          // 重量(lb)
  showQty,           // 是否显示数量（不可叠加物品不显示）
  // BUFF标签
  buffTags,          // string[]
  // 操作
  onEdit,            // () => void
  onStoreToVault,    // () => void
  onDelete,          // () => void
  // 拖拽
  draggable,         // boolean
  onDragStart,       // (e) => void
  onDragEnd,         // (e) => void
  onDragOver,        // (e) => void
  onDrop,            // (e) => void
})
```

6 列渲染内容：

**Col 1 (46px) — 同调勾选框：**
```jsx
<div className="flex items-center justify-center h-full" style={{ borderRight: '1px solid #2a3a4e' }}>
  {canEdit ? (
    <input
      type="checkbox"
      checked={isAttuned}
      onChange={(e) => onAttuneToggle?.(entry.id, e.target.checked)}
      disabled={!isAttuned && attunedCount >= maxAttunementSlots}
      className="w-4 h-4 accent-dnd-gold cursor-pointer"
      title={isAttuned ? '已同调（点击取消）' : `同调（${attunedCount}/${maxAttunementSlots}）`}
    />
  ) : (
    isAttuned && <Sparkles className="w-3.5 h-3.5 text-dnd-gold" />
  )}
</div>
```

**Col 2 (76px) — 装备位下拉：**
```jsx
<div className="flex items-center justify-center h-full px-2" style={{ borderRight: '1px solid #2a3a4e' }}>
  <select
    value={slotValue}
    onChange={(e) => onSlotChange?.(invIndex, e.target.value)}
    disabled={!canEdit}
    className="w-full h-7 text-[11px] text-center rounded border border-[#3a4a5e] bg-[#253345] text-[#8899aa] px-1"
  >
    {availableSlotGroups.map((group, gi) => (
      group.group ? (
        <optgroup key={gi} label={group.group}>
          {group.slots.map(slot => (
            <option key={slot.value} value={slot.value}>{slot.label}</option>
          ))}
        </optgroup>
      ) : (
        group.slots.map(slot => (
          <option key={slot.value} value={slot.value}>{slot.label}</option>
        ))
      )
    ))}
  </select>
</div>
```

**Col 3 (376px) — 名称 + 能量条按钮：**

根据是否有主动技能/充能/护盾池，显示不同内容：

- **无主动技能**：纯名称文字（16px, 600 weight），可点击展开说明
- **有充能（charge_item）**：能量条一体按钮 — 名称 + 充能步进器（- 数值 +），背景显示充能进度
- **有护盾池（shield_pool）**：护盾池计数器（ShieldPoolCounter）
- **有主动技能**：释放按钮（Sparkles 图标）
- **有内含法术**：ContainedSpellUseButton

充能与护盾池互斥，同一位置只显示一种。

**Col 4 (136px) — BUFF 简称标签：**
```jsx
<div className="flex flex-col items-start justify-center gap-0.5 h-full px-2" style={{ borderRight: '1px solid #2a3a4e' }}>
  {buffTags.map((tag, i) => (
    <span key={i} className="text-[8px] px-1 border border-[#2a3a4e] rounded-sm bg-[#1a2535] text-[#8899aa] whitespace-nowrap leading-3 h-3">
      {tag}
    </span>
  ))}
</div>
```

**Col 5 (1fr) — 数量 + 重量（右对齐）：**
```jsx
<div className="flex items-center justify-end gap-2 h-full px-2">
  {showQty && (
    <div className="w-[5.125rem] flex items-center justify-end">
      {canEdit ? (
        <NumberStepper value={qty} onChange={onQtyChange} min={1} compact pill subtle />
      ) : (
        <span className="text-xs tabular-nums">{qty}</span>
      )}
    </div>
  )}
  <div className="w-16 flex items-center justify-end text-[10px] tabular-nums">
    {weightLb > 0 ? (
      <span className="text-dnd-text-body">{formatDisplayWeightLb(weightLb)} lb</span>
    ) : (
      <span className="opacity-0">—</span>
    )}
  </div>
</div>
```

**Col 6 (76px) — 三齿轮操作：**
```jsx
<div className="flex items-center justify-center gap-1 h-full">
  <button onClick={onStoreToVault} className={actionIconBtnClass} title="存到团队仓库">
    <Package size={14} />
  </button>
  <button onClick={onEdit} className={actionIconBtnClass} title="编辑">
    <Pencil size={14} />
  </button>
  <button onClick={onDelete} className={actionIconBtnDangerClass} title="删除">
    <Trash2 size={14} />
  </button>
</div>
```

**外层容器：**
```jsx
<div
  className="min-w-0"
  draggable={draggable}
  onDragStart={onDragStart}
  onDragEnd={onDragEnd}
  onDragOver={onDragOver}
  onDrop={onDrop}
>
  <div
    className="rounded-md border border-gray-600/45 bg-gradient-to-b from-[#161e2b] via-[#141c28] to-[#121a25] overflow-hidden ring-1 ring-inset ring-white/[0.028] hover:border-gray-500/55 transition-colors"
    style={{ marginBottom: '8px' }}
  >
    {/* 52px 标题行 */}
    <div className="grid items-center" style={{
      gridTemplateColumns: '46px 76px 376px 136px 1fr 76px',
      height: '52px',
      gap: 0,
    }}>
      {/* Col 1-6 */}
    </div>
    {/* 展开的说明内容 */}
    {briefExpanded && brief && (
      <div className="px-3 py-2 border-t border-gray-700/40">
        <p className="text-[10.6px] leading-relaxed text-dnd-text-body/90 whitespace-pre-wrap break-words">
          {brief}
        </p>
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 2: 验证构建**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add src/components/EquipmentItemCard.jsx
git commit -m "feat: add EquipmentItemCard with 6-column standard grid"
```

---

### Task 3: 重构 EquipmentAndInventory 渲染层

**Files:**
- Modify: `src/components/EquipmentAndInventory.jsx:1287-2381`（渲染部分）

这是最大的改造步骤。替换当前的双分区渲染（装备左右分栏 + 背包 7 列网格）为统一列表。

- [ ] **Step 1: 添加 imports 和 useMemo**

在 `EquipmentAndInventory.jsx` 顶部添加：

```js
import { buildUnifiedItemList, applySlotChange, getAvailableSlotsForItem } from '../lib/equipmentSlotUtils'
import EquipmentItemCard from './EquipmentItemCard'
```

在组件内部（`layoutOrder` 之后）添加统一列表的 useMemo：

```js
const unifiedItems = useMemo(
  () => buildUnifiedItemList(inv, heldSlots, wornSlots),
  [inv, heldSlots, wornSlots]
)
```

- [ ] **Step 2: 添加槽位变更处理器**

```js
const handleSlotChange = (invIndex, newSlotValue) => {
  const result = applySlotChange(heldSlots, wornSlots, inv, invIndex, newSlotValue)
  saveWithEquipment({
    equippedHeld: result.heldSlots,
    equippedWorn: result.wornSlots,
  })
}
```

- [ ] **Step 3: 替换装备分区渲染**

将 lines 1291-1610（整个装备分区，包括手持卡和身穿卡）替换为：

```jsx
{/* —— 已装备物品 —— */}
{unifiedItems.filter(item => item.isEquipped).length > 0 && (
  <div className={sectionCardShellClass}>
    <div className={`${cardHeadClass} flex items-center justify-between`}>
      <h4 className={subTitleClass + ' mb-0'}>已装备</h4>
      <p className="text-dnd-text-muted text-xs mb-0 tabular-nums">
        同调位：<span className="text-white font-medium">{attunedCount}/{maxAttunementSlots}</span>
      </p>
    </div>
    <div className="p-2">
      {unifiedItems.filter(item => item.isEquipped).map((item) => (
        <EquipmentItemCard
          key={item.entry.id}
          entry={item.entry}
          invIndex={item.invIndex}
          slotValue={item.slotValue}
          canEdit={canEdit}
          isAttuned={!!item.entry.isAttuned}
          attunedCount={attunedCount}
          maxAttunementSlots={maxAttunementSlots}
          onAttuneToggle={toggleAttunedForEntry}
          availableSlotGroups={getAvailableSlotsForItem(item.entry, inv)}
          onSlotChange={handleSlotChange}
          displayName={getEntryDisplayName(item.entry)}
          magicBonus={Number(item.entry.magicBonus) || 0}
          brief={getItemBrief(item.entry)}
          briefExpanded={!!backpackItemBriefOpen[item.entry.id]}
          onToggleBrief={() => setBackpackItemBriefOpen(prev => ({ ...prev, [item.entry.id]: !prev[item.entry.id] }))}
          charge={Number(item.entry.charge) || 0}
          onChargeChange={(v) => setCharge(item.invIndex, v)}
          // ... 其余 props 按现有逻辑传递
          onEdit={() => startEdit(item.invIndex)}
          onDelete={() => removeItem(item.invIndex)}
        />
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: 替换背包分区渲染**

将 lines 1612-2040 的普通物品 7 列网格渲染替换为：

```jsx
{/* —— 背包物品 —— */}
<div className={sectionCardShellClass}>
  <div className={`${cardHeadClass} flex items-center justify-between gap-2`}>
    <h4 className={subTitleClass + ' mb-0'}>背包</h4>
    {canEdit && (
      <button type="button" onClick={() => setAddFormOpen(true)} className="h-7 px-2 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors shrink-0">
        添加物品
      </button>
    )}
  </div>
  <div className="p-2">
    {unifiedItems.filter(item => !item.isEquipped).map((item) => (
      <EquipmentItemCard
        key={item.entry.id}
        entry={item.entry}
        invIndex={item.invIndex}
        slotValue="backpack"
        canEdit={canEdit}
        // ... 同上传递 props
        onSlotChange={handleSlotChange}
      />
    ))}
    {unifiedItems.filter(item => !item.isEquipped).length === 0 && (
      <p className="text-center text-gray-500 text-xs py-4">背包为空</p>
    )}
  </div>
</div>
```

- [ ] **Step 5: 保留次元袋和容器嵌套**

次元袋模块区（BagModuleSection）和容器嵌套子列表保持现有渲染逻辑不变。这些是独立的子系统，不在本次改造范围内。

具体保留：
- 次元袋锚点行（isAnchor 分支）— 保持 col-span 全宽的模块卡片
- 容器展开后的 nestedInventory 列表 — 保持现有 7 列嵌套网格
- 钱包/货币区（CurrencyGrid）— 保持不变

- [ ] **Step 6: 删除不再需要的旧代码**

删除以下不再使用的代码段：
- 手持卡渲染（heldSlots.map 的 EquipSlotBadge + select 循环）
- 身穿卡渲染（wornAddable.map 的 EquipSlotBadge + select 循环）
- 背包 7 列网格中普通物品的渲染分支
- `EquipSlotBadge` 组件（如果不再被其他地方引用）
- `equipRowClass`、`equipSelectClass`、`equipAddBtnClass` 等旧样式常量（如果不再使用）

- [ ] **Step 7: 验证构建**

Run: `npx vite build --mode development 2>&1 | tail -20`
Expected: 构建成功，无错误

- [ ] **Step 8: Commit**

```bash
git add src/components/EquipmentAndInventory.jsx
git commit -m "feat: unify equipment and backpack into single item list with 6-column grid"
```

---

### Task 4: 浏览器验证

**Files:** 无代码修改，纯验证

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`

- [ ] **Step 2: 验证装备卡 6 列布局**

在浏览器中打开角色页，检查：
1. 每件装备显示为 6 列网格卡片（52px 高）
2. Col 1: 同调勾选框可点击切换
3. Col 2: 下拉菜单显示正确的装备位选项（手持/备用/穿戴/背包分组）
4. Col 3: 物品名称显示正确，有充能的物品显示能量条按钮
5. Col 4: BUFF 标签区域（可能为空）
6. Col 5: 数量和重量右对齐
7. Col 6: 三个操作图标（存仓库/编辑/删除）

- [ ] **Step 3: 验证槽位切换**

1. 将背包物品的下拉从"背包"改为"主手" → 物品卡片移到"已装备"区
2. 将已装备物品改为"背包" → 物品卡片移到"背包"区
3. 验证 `buildEquipmentForAC` 仍然正确计算 AC（身穿盔甲、手持盾牌）

- [ ] **Step 4: 验证同调**

1. 勾选同调框 → 同调计数 +1
2. 达到上限后其他物品的勾选框禁用
3. 取消勾选 → 计数 -1

- [ ] **Step 5: 验证次元袋和容器**

1. 次元袋模块仍正常显示为可展开的锚点卡片
2. 容器物品展开后嵌套列表正常
3. 次元袋内物品不受统一列表影响

- [ ] **Step 6: 验证编辑/删除**

1. 点击编辑图标 → ItemAddForm 弹窗打开
2. 点击删除图标 → 物品被移除
3. 点击存仓库图标 → 物品存入团队仓库

- [ ] **Step 7: Commit 修复（如有）**

```bash
git add -A
git commit -m "fix: resolve equipment card rendering issues from browser testing"
```

---

## 风险与注意事项

1. **数据模型不变**：equippedHeld/equippedWorn 结构保持不变，统一列表只是视图层的映射
2. **buildEquipmentForAC 兼容**：槽位变更仍通过 saveWithEquipment → buildEquipmentForAC 路径
3. **次元袋/容器/货币**：这三个子系统保持现有渲染逻辑，不在本次改造范围
4. **拖拽排序**：统一列表暂不实现拖拽重排序（背包物品按添加顺序，已装备按槽位优先级）
5. **备用槽动态增减**：备用槽数量仍通过"添加备用"按钮控制，下拉菜单中的备用选项数量与 heldSlots 长度同步
6. **穿戴槽动态增减**：类似备用槽，穿戴槽通过"添加身穿"按钮控制
