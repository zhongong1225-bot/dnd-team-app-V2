import { isSupabaseEnabled } from './supabase'
import * as whSupabase from './warehouseStoreSupabase'
import { normalizeArcaneChestCount } from './arcaneChestCapacity'
import { CURRENCY_IDS, getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'

const WAREHOUSE_KEY_PREFIX = 'dnd_warehouse_'
const WAREHOUSE_KEY_LEGACY = 'dnd_warehouse'

/** Supabase 启用时按模组缓存仓库列表 */
const warehouseCache = {}

function warehouseKey(moduleId) {
  return WAREHOUSE_KEY_PREFIX + (moduleId || 'default')
}

/** 本地：读取 { items, arcaneChestCount }，兼容旧版 data 为纯数组 */
function readLocalWarehousePack(moduleId) {
  migrateWarehouseIfNeeded(moduleId)
  try {
    const raw = localStorage.getItem(warehouseKey(moduleId))
    const parsed = raw ? JSON.parse(raw) : null
    return whSupabase.normalizeWarehouseRowData(parsed)
  } catch {
    return { items: [], arcaneChestCount: 1 }
  }
}

function persistWarehouse(moduleId, payload) {
  const pack = whSupabase.normalizeWarehouseRowData(payload)
  const data = {
    items: Array.isArray(pack.items) ? [...pack.items] : [],
    arcaneChestCount: normalizeArcaneChestCount(pack.arcaneChestCount),
  }
  if (isSupabaseEnabled()) {
    const mod = moduleId ?? 'default'
    warehouseCache[mod] = data
    return whSupabase.saveWarehouseRow(moduleId, data)
  }
  try {
    localStorage.setItem(warehouseKey(moduleId), JSON.stringify(data))
  } catch (_) {}
}

/** 从 Supabase 拉取仓库并写入缓存（启用 Supabase 时由仓库页在 useEffect 中调用） */
export async function loadWarehouseIntoCache(moduleId) {
  if (!isSupabaseEnabled()) return
  const pack = await whSupabase.fetchWarehouse(moduleId)
  warehouseCache[moduleId ?? 'default'] = pack
}

/** 迁移：默认模组首次读取时从旧 key 迁入 */
function migrateWarehouseIfNeeded(moduleId) {
  if (moduleId !== 'default') return
  try {
    const legacy = localStorage.getItem(WAREHOUSE_KEY_LEGACY)
    if (!legacy) return
    const list = JSON.parse(legacy)
    if (Array.isArray(list) && list.length > 0) {
      localStorage.setItem(warehouseKey('default'), JSON.stringify(list))
      localStorage.removeItem(WAREHOUSE_KEY_LEGACY)
    }
  } catch (_) {}
}

/** 备份 / 导出用 */
export function getWarehouseSnapshot(moduleId) {
  return { items: getWarehouse(moduleId), meta: { arcaneChestCount: getArcaneChestCount(moduleId) } }
}

function normalizeWarehouseCurrencyQty(currencyId, raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (currencyId === 'gem_lb') return Math.round(n * 10) / 10
  return Math.floor(n)
}

/**
 * 向秘法箱（团队仓库）增加钱币实物堆；同币种无 itemId 时合并数量，新堆置顶。
 */
export async function addWarehouseCurrencyStack(moduleId, currencyId, amount) {
  if (!CURRENCY_IDS.includes(currencyId)) return { success: false, error: '无效货币类型' }
  const n = normalizeWarehouseCurrencyQty(currencyId, amount)
  if (n <= 0) return { success: true }
  await loadWarehouseIntoCache(moduleId)
  const list = [...getWarehouse(moduleId)]
  const mergeIdx = list.findIndex((x) => x?.walletCurrencyId === currencyId)
  const cfg = getCurrencyById(currencyId)
  const label = cfg ? getCurrencyDisplayName(cfg) : currencyId
  const itemId = 'currency_' + currencyId
  if (mergeIdx >= 0) {
    const e = list[mergeIdx]
    const prev = currencyId === 'gem_lb' ? Math.max(0, Number(e.qty) || 0) : Math.max(0, Math.floor(Number(e.qty) || 0))
    const nextQty = currencyId === 'gem_lb' ? Math.round((prev + n) * 10) / 10 : prev + n
    list[mergeIdx] = { ...e, itemId: e.itemId || itemId, qty: nextQty, name: label || e.name }
  } else {
    list.unshift({
      id: 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      walletCurrencyId: currencyId,
      itemId,
      name: label,
      qty: n,
    })
  }
  const saved = saveWarehouse(moduleId, list)
  if (saved && typeof saved.then === 'function') await saved
  window.dispatchEvent(new CustomEvent('dnd-realtime-warehouse'))
  return { success: true }
}

/**
 * 从秘法箱钱币堆扣除，最多扣 `amount`；用于团队扣款与兑换回滚。
 * @returns {{ taken: number }} taken 为实际从仓库扣下的数量
 */
export async function tryConsumeWarehouseCurrencyStacks(moduleId, currencyId, amount) {
  if (!CURRENCY_IDS.includes(currencyId)) return { taken: 0 }
  let need = currencyId === 'gem_lb' ? Number(amount) : Math.floor(Number(amount))
  if (!Number.isFinite(need) || need <= 0) return { taken: 0 }
  await loadWarehouseIntoCache(moduleId)
  const list = [...getWarehouse(moduleId)]
  const startNeed = need
  let guard = 0
  while (need > (currencyId === 'gem_lb' ? 1e-9 : 0) && guard++ < 500) {
    const idx = list.findIndex((x) => x?.walletCurrencyId === currencyId)
    if (idx < 0) break
    const entry = list[idx]
    const cur = currencyId === 'gem_lb' ? Math.max(0, Number(entry.qty) || 0) : Math.max(0, Math.floor(Number(entry.qty) || 0))
    if (cur <= 0) {
      list.splice(idx, 1)
      continue
    }
    const take = currencyId === 'gem_lb' ? Math.min(need, cur) : Math.min(need, Math.floor(cur))
    if (take <= 0) break
    const nextQ = cur - take
    if (nextQ <= (currencyId === 'gem_lb' ? 1e-9 : 0)) list.splice(idx, 1)
    else list[idx] = { ...entry, qty: currencyId === 'gem_lb' ? Math.round(nextQ * 10) / 10 : nextQ }
    need -= take
  }
  const taken = currencyId === 'gem_lb' ? startNeed - need : startNeed - need
  if (taken > 0) {
    await Promise.resolve(saveWarehouse(moduleId, list))
    window.dispatchEvent(new CustomEvent('dnd-realtime-warehouse'))
  }
  return { taken }
}

export function getWarehouse(moduleId) {
  if (isSupabaseEnabled()) {
    const mod = moduleId ?? 'default'
    const raw = warehouseCache[mod]
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) {
      return raw.items
    }
    if (Array.isArray(raw)) {
      warehouseCache[mod] = { items: raw, arcaneChestCount: 1 }
      return raw
    }
    return []
  }
  return readLocalWarehousePack(moduleId).items
}

/** 秘法箱个数（每箱 12 立方尺上限，见 arcaneChestCapacity） */
export function getArcaneChestCount(moduleId) {
  if (isSupabaseEnabled()) {
    const mod = moduleId ?? 'default'
    const raw = warehouseCache[mod]
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return normalizeArcaneChestCount(raw.arcaneChestCount)
    }
    return 1
  }
  return readLocalWarehousePack(moduleId).arcaneChestCount
}

/** 写入秘法箱个数（与物品列表一并持久化） */
export function setArcaneChestCount(moduleId, count) {
  const saved = persistWarehouse(moduleId, {
    items: [...getWarehouse(moduleId)],
    arcaneChestCount: normalizeArcaneChestCount(count),
  })
  window.dispatchEvent(new CustomEvent('dnd-realtime-warehouse'))
  return saved
}

function saveWarehouse(moduleId, list) {
  const result = persistWarehouse(moduleId, {
    items: Array.isArray(list) ? list : [],
    arcaneChestCount: getArcaneChestCount(moduleId),
  })
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: moduleId ?? 'default' } }))
  }, 0)
  return result
}

/** 往仓库添加：完整条目（含 详细介绍、附注、属性上限、效果等）或简写 { name, qty }。同质无自定义时合并数量。 */
export function addToWarehouse(moduleId, entry) {
  const list = getWarehouse(moduleId)
  const itemId = entry?.itemId
  const nameTrim = entry?.name != null ? String(entry.name).trim() : ''
  const qty = Math.max(1, Number(entry?.qty) ?? 1)
  const hasOverrides = entry && (
    (entry.攻击 != null && String(entry.攻击).trim() !== '') ||
    (entry.伤害 != null && String(entry.伤害).trim() !== '') ||
    (entry.攻击距离 != null && String(entry.攻击距离).trim() !== '') ||
    (entry.详细介绍 != null && String(entry.详细介绍).trim() !== '') ||
    (entry.附注 != null && String(entry.附注).trim() !== '') ||
    (entry.magicBonus != null && Number(entry.magicBonus) !== 0) ||
    (entry.charge != null && Number(entry.charge) !== 0) ||
    (Array.isArray(entry.effects) && entry.effects.length > 0)
  )
  if (itemId) {
    const skipMerge = itemId === 'bag_of_holding'
    const existing = skipMerge
      ? null
      : list.find((x) => x.itemId === itemId && (x.name || '').trim() === nameTrim)
    const existingHasOverrides = existing && (
      (existing.攻击 != null && String(existing.攻击).trim() !== '') ||
      (existing.伤害 != null && String(existing.伤害).trim() !== '') ||
      (existing.攻击距离 != null && String(existing.攻击距离).trim() !== '') ||
      (existing.详细介绍 != null && String(existing.详细介绍).trim() !== '') ||
      (existing.附注 != null && String(existing.附注).trim() !== '') ||
      (existing.magicBonus != null && Number(existing.magicBonus) !== 0) ||
      (existing.charge != null && Number(existing.charge) !== 0) ||
      (Array.isArray(existing.effects) && existing.effects.length > 0)
    )
    if (existing && !hasOverrides && !existingHasOverrides) {
      existing.qty = (existing.qty || 0) + qty
    } else {
      const newEntry = {
        id: entry.id ?? 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        itemId,
        name: nameTrim || (entry.name ?? ''),
        qty,
        详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
        附注: entry.附注 != null ? String(entry.附注) : '',
        攻击: entry.攻击 ?? undefined,
        伤害: entry.伤害 ?? undefined,
        攻击距离: entry.攻击距离 ?? undefined,
        攻击范围: entry.攻击范围 ?? undefined,
        精通: entry.精通 ?? undefined,
        重量: entry.重量 ?? undefined,
        rarity: entry.rarity ?? undefined,
        magicBonus: entry.magicBonus != null ? Number(entry.magicBonus) : 0,
        charge: entry.charge != null ? Number(entry.charge) : 0,
        spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
        isAttuned: !!entry.isAttuned,
        effects: Array.isArray(entry.effects) ? entry.effects : undefined,
        爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
        ...(itemId === 'bag_of_holding'
          ? {
              nestedInventory: Array.isArray(entry.nestedInventory) ? entry.nestedInventory : [],
              ...(entry.arcaneBagLink &&
              typeof entry.arcaneBagLink === 'object' &&
              entry.arcaneBagLink.characterId &&
              entry.arcaneBagLink.moduleId
                ? {
                    arcaneBagLink: {
                      characterId: String(entry.arcaneBagLink.characterId),
                      moduleId: String(entry.arcaneBagLink.moduleId),
                    },
                  }
                : {}),
            }
          : {}),
      }
      list.push(newEntry)
    }
  } else if (nameTrim) {
    list.push({ name: nameTrim, qty })
  } else {
    return Promise.resolve(list)
  }
  const saved = saveWarehouse(moduleId, list)
  return saved && typeof saved.then === 'function' ? saved.then(() => list) : Promise.resolve(list)
}

/** 更新仓库中某条物品 */
export function updateWarehouseItem(moduleId, index, updates) {
  const list = getWarehouse(moduleId)
  if (index < 0 || index >= list.length) return Promise.resolve(list)
  const next = [...list]
  next[index] = { ...next[index], ...updates }
  const saved = saveWarehouse(moduleId, next)
  return saved && typeof saved.then === 'function' ? saved.then(() => next) : Promise.resolve(next)
}

/** 从仓库移除或减少数量 */
export function removeFromWarehouse(moduleId, index, amount = null) {
  const prev = getWarehouse(moduleId)
  if (index < 0 || index >= prev.length) return Promise.resolve(prev)
  /** 必须浅拷贝再改：Supabase 下 getWarehouse 与 React state 可能共享同一缓存数组引用，原地 splice 后 setList 同引用不会触发重绘 */
  const list = [...prev]
  const item = list[index]
  if (amount != null) {
    const cur = Number(item.qty) || 0
    const isGem = item.walletCurrencyId === 'gem_lb'
    const take = isGem ? Number(amount) : Math.floor(Number(amount))
    if (!Number.isFinite(take) || take <= 0) {
      list.splice(index, 1)
    } else if (isGem ? cur - take > 1e-9 : cur > take) {
      list[index] = { ...item, qty: isGem ? Math.round((cur - take) * 10) / 10 : cur - take }
    } else {
      list.splice(index, 1)
    }
  } else {
    list.splice(index, 1)
  }
  const saved = saveWarehouse(moduleId, list)
  return saved && typeof saved.then === 'function' ? saved.then(() => list) : Promise.resolve(list)
}

export function setWarehouse(moduleId, list) {
  const next = Array.isArray(list) ? list : []
  const saved = saveWarehouse(moduleId, next)
  return saved && typeof saved.then === 'function' ? saved.then(() => next) : Promise.resolve(next)
}

/**
 * 将秘法箱「次元袋 nested」内嵌的钱币堆提升到顶层实物堆（与列表「钱币」分区一致）。幂等。
 * 钱币实物应在顶层以便拖拽与展示；袋内仅保留非钱币物品。
 */
export async function hoistWarehouseBagNestedCurrencyToTop(moduleId) {
  await loadWarehouseIntoCache(moduleId)
  const list = [...getWarehouse(moduleId)]
  const deltas = {}
  function feedDelta(cid, rawQty) {
    if (!CURRENCY_IDS.includes(cid)) return
    const q = cid === 'gem_lb' ? Math.max(0, Number(rawQty) || 0) : Math.max(0, Math.floor(Number(rawQty) || 0))
    if (q <= 0) return
    deltas[cid] = (deltas[cid] || 0) + q
  }
  function stripCurrency(nodes) {
    if (!Array.isArray(nodes)) return { next: [], touched: false }
    let touched = false
    const next = []
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      if (node.walletCurrencyId) {
        feedDelta(node.walletCurrencyId, node.qty)
        touched = true
        continue
      }
      if (node.itemId === 'bag_of_holding') {
        const inner = stripCurrency(Array.isArray(node.nestedInventory) ? node.nestedInventory : [])
        if (inner.touched) touched = true
        next.push({ ...node, nestedInventory: inner.next })
        continue
      }
      next.push(node)
    }
    return { next, touched }
  }
  let listTouched = false
  const nextList = list.map((e) => {
    if (e?.itemId !== 'bag_of_holding') return e
    const inner = stripCurrency(Array.isArray(e.nestedInventory) ? e.nestedInventory : [])
    if (!inner.touched) return e
    listTouched = true
    return { ...e, nestedInventory: inner.next }
  })
  const hasDeltas = Object.keys(deltas).length > 0
  if (!listTouched && !hasDeltas) return { hoisted: false }
  if (listTouched) {
    await Promise.resolve(setWarehouse(moduleId, nextList))
  }
  for (const cid of Object.keys(deltas)) {
    const amount = deltas[cid]
    const n = cid === 'gem_lb' ? Math.max(0, Number(amount) || 0) : Math.max(0, Math.floor(Number(amount) || 0))
    if (n <= 0) continue
    const r = await addWarehouseCurrencyStack(moduleId, cid, n)
    if (!r.success) return { hoisted: false, error: r.error }
  }
  window.dispatchEvent(new CustomEvent('dnd-realtime-warehouse'))
  return { hoisted: true }
}

/** 重排仓库物品顺序 */
/**
 * 将袋内 nested 列表与待放入条目合并：钱币堆与同币种无 itemId 行合并数量，否则追加。
 */
function mergeOrAppendWarehouseNestedEntry(inner, clone) {
  const arr = Array.isArray(inner) ? [...inner] : []
  if (!clone?.walletCurrencyId) {
    arr.push(clone)
    return arr
  }
  const cid = clone.walletCurrencyId
  const isGem = cid === 'gem_lb'
  const add = isGem ? Math.max(0, Number(clone.qty) || 0) : Math.max(0, Math.floor(Number(clone.qty) || 0))
  if (add <= 0) return arr
  const itemId = 'currency_' + cid
  const mergeIdx = arr.findIndex((x) => x?.walletCurrencyId === cid)
  if (mergeIdx < 0) {
    arr.push({
      ...clone,
      id: clone.id || 'whn_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      itemId: clone.itemId || itemId,
    })
    return arr
  }
  const cur = arr[mergeIdx]
  const prev = isGem ? Math.max(0, Number(cur.qty) || 0) : Math.max(0, Math.floor(Number(cur.qty) || 0))
  const nextQty = isGem ? Math.round((prev + add) * 10) / 10 : prev + add
  const cfg = getCurrencyById(cid)
  const label = cfg ? getCurrencyDisplayName(cfg) : clone.name || cur.name
  return arr.map((x, i) => (i === mergeIdx ? { ...cur, itemId: cur.itemId || itemId, qty: nextQty, name: label || cur.name } : x))
}

/**
 * 将秘法箱顶层物品装入「次元袋」卡的内层（含钱币实物堆，袋内同币种合并）。
 * 仅当装入物为另一件次元袋且目标叠放 qty>1 时拆成两行；普通物品/钱币不拆卡。
 */
export function moveWarehouseTopLevelIntoNestedBag(moduleId, fromIndex, bagIndex) {
  const list = [...getWarehouse(moduleId)]
  if (fromIndex < 0 || fromIndex >= list.length || bagIndex < 0 || bagIndex >= list.length) return Promise.resolve(list)
  if (fromIndex === bagIndex) return Promise.resolve(list)
  const bag = list[bagIndex]
  if (!bag || bag.itemId !== 'bag_of_holding') return Promise.resolve(list)
  const bagQty = Math.max(1, Math.floor(Number(bag.qty) || 1))
  const item = list[fromIndex]
  if (!item) return Promise.resolve(list)
  if (item.walletCurrencyId) {
    const cid = item.walletCurrencyId
    const isGem = cid === 'gem_lb'
    const add = isGem ? Math.max(0, Number(item.qty) || 0) : Math.max(0, Math.floor(Number(item.qty) || 0))
    if (add <= 0) return Promise.resolve(list)
  }
  if (item.itemId === 'bag_of_holding') {
    const sq = Math.max(1, Math.floor(Number(item.qty) || 1))
    if (sq !== 1) return Promise.resolve(list)
  }
  const nested = Array.isArray(bag.nestedInventory) ? [...bag.nestedInventory] : []
  const clone = {
    ...item,
    id: item.id || 'whn_' + Date.now() + '_' + Math.random().toString(36).slice(2),
  }
  if (clone.itemId !== 'bag_of_holding') {
    delete clone.nestedInventory
  } else if (!Array.isArray(clone.nestedInventory)) {
    clone.nestedInventory = []
  }
  const mergedNested = mergeOrAppendWarehouseNestedEntry(nested, clone)
  const filtered = list.filter((_, idx) => idx !== fromIndex)
  const adjustedBagIndex = fromIndex < bagIndex ? bagIndex - 1 : bagIndex
  if (adjustedBagIndex < 0 || adjustedBagIndex >= filtered.length) return Promise.resolve(list)
  const curBag = filtered[adjustedBagIndex]
  /** 仅装入「另一件次元袋」且目标叠放 qty>1 时拆行；普通物品/钱币装入多 qty 袋不拆卡，避免界面瞬间多出一行空袋 */
  if (bagQty === 1 || clone.itemId !== 'bag_of_holding') {
    filtered[adjustedBagIndex] = { ...curBag, nestedInventory: mergedNested }
  } else {
    const keepId = curBag.id || 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const bagOne = {
      ...curBag,
      id: keepId,
      qty: 1,
      nestedInventory: mergedNested,
    }
    const bagRest = {
      ...curBag,
      id: 'wh_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      qty: bagQty - 1,
      nestedInventory: [],
    }
    filtered.splice(adjustedBagIndex, 1, bagOne, bagRest)
  }
  return setWarehouse(moduleId, filtered)
}

/**
 * 将条目装入「顶层次元袋」内 nested 树中 path 指向的次元袋（path 最后一格须为 bag_of_holding）。
 * 仅当 clone 为另一件次元袋且目标 qty>1 时拆成两行；否则只更新该节点的 nestedInventory。
 * @param {object} topBag - list 中的顶层次元袋条目
 * @param {number[]} path - 从 topBag.nestedInventory 起的下标链，如 [0] 或 [1,2]
 * @param {object} clone - 已去重 id、处理 nestedInventory 的待放入副本
 */
function insertItemIntoNestedBagAtPath(topBag, path, clone) {
  if (!topBag || topBag.itemId !== 'bag_of_holding' || !Array.isArray(path) || path.length === 0) return null
  const root = Array.isArray(topBag.nestedInventory) ? [...topBag.nestedInventory] : []

  const recur = (nodes, depth) => {
    const i = path[depth]
    if (i < 0 || i >= nodes.length) return null
    if (depth === path.length - 1) {
      const target = nodes[i]
      if (!target || target.itemId !== 'bag_of_holding') return null
      const tQty = Math.max(1, Math.floor(Number(target.qty) || 1))
      const inner = mergeOrAppendWarehouseNestedEntry(target.nestedInventory, clone)
      /** 与 moveWarehouseTopLevelIntoNestedBag 一致：仅装入另一件次元袋且 tQty>1 时拆成两行 */
      if (tQty === 1 || clone.itemId !== 'bag_of_holding') {
        return nodes.map((n, j) => (j === i ? { ...target, nestedInventory: inner } : n))
      }
      const keepId = target.id || 'whn_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      const bagOne = {
        ...target,
        id: keepId,
        qty: 1,
        nestedInventory: inner,
      }
      const bagRest = {
        ...target,
        id: 'whn_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        qty: tQty - 1,
        nestedInventory: [],
      }
      return nodes.flatMap((n, j) => (j === i ? [bagOne, bagRest] : [n]))
    }
    const node = nodes[i]
    if (!node || node.itemId !== 'bag_of_holding') return null
    const sub = recur([...(node.nestedInventory || [])], depth + 1)
    if (!sub) return null
    return nodes.map((n, j) => (j === i ? { ...node, nestedInventory: sub } : n))
  }

  const newRoot = recur(root, 0)
  if (!newRoot) return null
  return { ...topBag, nestedInventory: newRoot }
}

/**
 * 将秘法箱顶层物品装入顶层次元袋内「任意深度」的子次元袋（拆分规则同 moveWarehouseTopLevelIntoNestedBag）。
 * @param {number} topBagIndex - 仓库 list 中含 nested 树的顶层次元袋下标
 * @param {number[]} pathToTargetBag - 从该袋 nestedInventory 起指向目标子袋的下标链
 */
export function moveWarehouseTopLevelIntoNestedBagAtPath(moduleId, fromIndex, topBagIndex, pathToTargetBag) {
  const list = [...getWarehouse(moduleId)]
  if (fromIndex < 0 || fromIndex >= list.length || topBagIndex < 0 || topBagIndex >= list.length) return Promise.resolve(list)
  if (!Array.isArray(pathToTargetBag) || pathToTargetBag.length === 0) {
    return moveWarehouseTopLevelIntoNestedBag(moduleId, fromIndex, topBagIndex)
  }
  if (fromIndex === topBagIndex) return Promise.resolve(list)
  const topBag = list[topBagIndex]
  if (!topBag || topBag.itemId !== 'bag_of_holding') return Promise.resolve(list)
  const item = list[fromIndex]
  if (!item) return Promise.resolve(list)
  if (item.walletCurrencyId) {
    const cid = item.walletCurrencyId
    const isGem = cid === 'gem_lb'
    const add = isGem ? Math.max(0, Number(item.qty) || 0) : Math.max(0, Math.floor(Number(item.qty) || 0))
    if (add <= 0) return Promise.resolve(list)
  }
  if (item.itemId === 'bag_of_holding') {
    const sq = Math.max(1, Math.floor(Number(item.qty) || 1))
    if (sq !== 1) return Promise.resolve(list)
  }
  const clone = {
    ...item,
    id: item.id || 'whn_' + Date.now() + '_' + Math.random().toString(36).slice(2),
  }
  if (clone.itemId !== 'bag_of_holding') {
    delete clone.nestedInventory
  } else if (!Array.isArray(clone.nestedInventory)) {
    clone.nestedInventory = []
  }
  const newTopBag = insertItemIntoNestedBagAtPath(topBag, pathToTargetBag, clone)
  if (!newTopBag) return Promise.resolve(list)
  const filtered = list.filter((_, idx) => idx !== fromIndex)
  const adjustedTop = fromIndex < topBagIndex ? topBagIndex - 1 : topBagIndex
  if (adjustedTop < 0 || adjustedTop >= filtered.length) return Promise.resolve(list)
  filtered[adjustedTop] = newTopBag
  return setWarehouse(moduleId, filtered)
}

/** 从 nested 树根数组中按 path 摘掉一条，返回 { pulled, replaced } 或 null */
function removeNestedEntryAtPathNodes(nodes, path) {
  if (!Array.isArray(nodes) || !Array.isArray(path) || path.length === 0) return null
  const recur = (arr, depth) => {
    if (depth >= path.length) return null
    const i = path[depth]
    if (i < 0 || i >= arr.length) return null
    if (depth === path.length - 1) {
      const pulled = arr[i]
      const replaced = arr.filter((_, j) => j !== i)
      return { pulled, replaced }
    }
    const node = arr[i]
    if (!node || node.itemId !== 'bag_of_holding') return null
    const inner = Array.isArray(node.nestedInventory) ? [...node.nestedInventory] : []
    const innerRes = recur(inner, depth + 1)
    if (!innerRes) return null
    return {
      pulled: innerRes.pulled,
      replaced: arr.map((n, j) => (j === i ? { ...node, nestedInventory: innerRes.replaced } : n)),
    }
  }
  return recur([...nodes], 0)
}

function warehouseFlatDisplayName(entry) {
  if (!entry) return ''
  if (entry.walletCurrencyId) {
    const cfg = getCurrencyById(entry.walletCurrencyId)
    return getCurrencyDisplayName(cfg) || entry.name || '—'
  }
  if (entry.itemId) {
    const item = getItemById(entry.itemId)
    return entry.name?.trim() || getItemDisplayName(item)
  }
  return entry.name || '?'
}

function warehouseFlatMergeable(a, b) {
  if (!a || !b) return false
  if (a.itemId === 'bag_of_holding' && b.itemId === 'bag_of_holding') return false
  if (a.walletCurrencyId && b.walletCurrencyId) return a.walletCurrencyId === b.walletCurrencyId
  return warehouseFlatDisplayName(a) === warehouseFlatDisplayName(b)
}

function preparePulledWarehouseClone(pulled) {
  const clone = {
    ...pulled,
    id: pulled.id || 'whn_' + Date.now() + '_' + Math.random().toString(36).slice(2),
  }
  if (clone.itemId !== 'bag_of_holding') {
    delete clone.nestedInventory
  } else if (!Array.isArray(clone.nestedInventory)) {
    clone.nestedInventory = []
  }
  return clone
}

/** 将袋内物品移回秘法箱顶层 */
export function moveWarehouseNestedToTopLevel(moduleId, bagIndex, nestedIndex) {
  return moveWarehouseNestedPathToTopLevel(moduleId, bagIndex, [nestedIndex])
}

/**
 * 将「顶层次元袋」内任意深度的嵌套物品移回秘法箱顶层；path 为从该袋 nestedInventory 起的下标链，如 [0] 或 [1,2]。
 */
export function moveWarehouseNestedPathToTopLevel(moduleId, bagTopIndex, path) {
  const list = [...getWarehouse(moduleId)]
  if (bagTopIndex < 0 || bagTopIndex >= list.length) return Promise.resolve(list)
  if (!Array.isArray(path) || path.length === 0) return Promise.resolve(list)
  const topBag = list[bagTopIndex]
  if (!topBag || topBag.itemId !== 'bag_of_holding') return Promise.resolve(list)
  const nested = Array.isArray(topBag.nestedInventory) ? [...topBag.nestedInventory] : []
  const res = removeNestedEntryAtPathNodes(nested, path)
  if (!res?.pulled) return Promise.resolve(list)
  list[bagTopIndex] = { ...topBag, nestedInventory: res.replaced }
  list.push(res.pulled)
  return setWarehouse(moduleId, list)
}

/**
 * 将袋内 path 物品移到秘法箱顶层下标 flatTargetIndex 处；与该行可合并则合并数量与充能，否则插入该行之前。
 */
export function moveWarehouseNestedPathToFlatPosition(moduleId, bagTopIndex, path, flatTargetIndex) {
  const list = [...getWarehouse(moduleId)]
  if (bagTopIndex < 0 || bagTopIndex >= list.length) return Promise.resolve(list)
  if (!Array.isArray(path) || path.length === 0) return Promise.resolve(list)
  const t = Math.max(0, Math.min(flatTargetIndex, list.length))
  const topBag = list[bagTopIndex]
  if (!topBag || topBag.itemId !== 'bag_of_holding') return Promise.resolve(list)
  const nested = Array.isArray(topBag.nestedInventory) ? [...topBag.nestedInventory] : []
  const res = removeNestedEntryAtPathNodes(nested, path)
  if (!res?.pulled) return Promise.resolve(list)
  if (res.pulled.walletCurrencyId) {
    const cid = res.pulled.walletCurrencyId
    const isGem = cid === 'gem_lb'
    const add = isGem ? Math.max(0, Number(res.pulled.qty) || 0) : Math.max(0, Math.floor(Number(res.pulled.qty) || 0))
    if (add <= 0) return Promise.resolve(list)
  }
  list[bagTopIndex] = { ...topBag, nestedInventory: res.replaced }
  const pulled = res.pulled
  if (t >= list.length) {
    list.push(pulled)
    return setWarehouse(moduleId, list)
  }
  const target = list[t]
  if (warehouseFlatMergeable(pulled, target)) {
    const isGem = pulled.walletCurrencyId === 'gem_lb'
    const isCur = Boolean(pulled.walletCurrencyId)
    const qtyT = isCur
      ? (isGem ? Math.max(0, Number(target?.qty) || 0) : Math.max(0, Math.floor(Number(target?.qty) || 0)))
      : Math.max(1, Number(target?.qty) ?? 1)
    const qtyS = isCur
      ? (isGem ? Math.max(0, Number(pulled?.qty) || 0) : Math.max(0, Math.floor(Number(pulled?.qty) || 0)))
      : Math.max(1, Number(pulled?.qty) ?? 1)
    const mergedQty = isCur && isGem ? Math.round((qtyT + qtyS) * 10) / 10 : isCur ? qtyT + qtyS : qtyT + qtyS
    const chargeT = Number(target?.charge) || 0
    const chargeS = Number(pulled?.charge) || 0
    list[t] = { ...target, qty: mergedQty, charge: chargeT + chargeS }
    return setWarehouse(moduleId, list)
  }
  list.splice(t, 0, pulled)
  return setWarehouse(moduleId, list)
}

/**
 * 将袋内物品移到另一顶层次元袋的 nested 内：destPathToTargetBag 非空时装入 path 指向的子次元袋；空数组时装入目标袋根 nested。
 * 禁止装入自身路径后代（同顶袋且 dest 以 src 为前缀且更长）。
 */
export function moveWarehouseNestedPathIntoNestedBagAtPath(moduleId, srcTopIdx, srcPath, destTopIdx, destPathToTargetBag) {
  const list = [...getWarehouse(moduleId)]
  if (!Array.isArray(srcPath) || srcPath.length === 0) return Promise.resolve(list)
  if (srcTopIdx < 0 || srcTopIdx >= list.length || destTopIdx < 0 || destTopIdx >= list.length) return Promise.resolve(list)
  /** 不能把条目再装回「同一树节点」；不能把次元袋装入自己的子袋 */
  if (
    srcTopIdx === destTopIdx &&
    Array.isArray(destPathToTargetBag) &&
    destPathToTargetBag.length > 0 &&
    destPathToTargetBag.length === srcPath.length &&
    srcPath.every((v, i) => v === destPathToTargetBag[i])
  ) {
    return Promise.resolve(list)
  }
  const srcBag = list[srcTopIdx]
  const destBag = list[destTopIdx]
  if (!srcBag || srcBag.itemId !== 'bag_of_holding' || !destBag || destBag.itemId !== 'bag_of_holding') return Promise.resolve(list)
  const nestedSrc = Array.isArray(srcBag.nestedInventory) ? [...srcBag.nestedInventory] : []
  const rm = removeNestedEntryAtPathNodes(nestedSrc, srcPath)
  if (!rm?.pulled) return Promise.resolve(list)
  if (rm.pulled.walletCurrencyId) {
    const cid = rm.pulled.walletCurrencyId
    const isGem = cid === 'gem_lb'
    const add = isGem ? Math.max(0, Number(rm.pulled.qty) || 0) : Math.max(0, Math.floor(Number(rm.pulled.qty) || 0))
    if (add <= 0) return Promise.resolve(list)
  }
  if (
    srcTopIdx === destTopIdx &&
    rm.pulled?.itemId === 'bag_of_holding' &&
    Array.isArray(destPathToTargetBag) &&
    destPathToTargetBag.length > srcPath.length &&
    srcPath.every((v, i) => v === destPathToTargetBag[i])
  ) {
    return Promise.resolve(list)
  }
  list[srcTopIdx] = { ...srcBag, nestedInventory: rm.replaced }
  const clone = preparePulledWarehouseClone(rm.pulled)
  const destAfter = list[destTopIdx]
  if (!Array.isArray(destPathToTargetBag) || destPathToTargetBag.length === 0) {
    const inner = Array.isArray(destAfter.nestedInventory) ? [...destAfter.nestedInventory] : []
    list[destTopIdx] = { ...destAfter, nestedInventory: mergeOrAppendWarehouseNestedEntry(inner, clone) }
    return setWarehouse(moduleId, list)
  }
  const inserted = insertItemIntoNestedBagAtPath(destAfter, destPathToTargetBag, clone)
  if (!inserted) return Promise.resolve(getWarehouse(moduleId))
  list[destTopIdx] = inserted
  return setWarehouse(moduleId, list)
}

function mapWarehouseNestedAtPath(nodes, path, mapFn) {
  if (!Array.isArray(nodes) || !Array.isArray(path) || path.length === 0) return null
  const idx = path[0]
  if (idx < 0 || idx >= nodes.length) return null
  if (path.length === 1) {
    const next = mapFn(nodes[idx])
    if (next === undefined) return null
    return nodes.map((n, j) => (j === idx ? next : n))
  }
  const node = nodes[idx]
  if (!node || node.itemId !== 'bag_of_holding') return null
  const inner = mapWarehouseNestedAtPath(node.nestedInventory || [], path.slice(1), mapFn)
  if (!inner) return null
  return nodes.map((n, j) => (j === idx ? { ...node, nestedInventory: inner } : n))
}

/**
 * 更新秘法箱顶层次元袋 nested 树中 path 指向的一条（充能、数量等）。
 * @param {number} topBagIndex - list 下标
 * @param {number[]} path - 从 nestedInventory 起的下标链，如 [0] 或 [1,2]
 */
export function patchWarehouseNestedItem(moduleId, topBagIndex, path, patch) {
  const list = [...getWarehouse(moduleId)]
  if (topBagIndex < 0 || topBagIndex >= list.length) return Promise.resolve(list)
  const topBag = list[topBagIndex]
  if (!topBag || topBag.itemId !== 'bag_of_holding') return Promise.resolve(list)
  const root = Array.isArray(topBag.nestedInventory) ? [...topBag.nestedInventory] : []
  const newRoot = mapWarehouseNestedAtPath(root, path, (item) => (item && typeof item === 'object' ? { ...item, ...patch } : item))
  if (!newRoot) return Promise.resolve(list)
  list[topBagIndex] = { ...topBag, nestedInventory: newRoot }
  return setWarehouse(moduleId, list)
}

export function reorderWarehouse(moduleId, fromIndex, toIndex) {
  const list = getWarehouse(moduleId)
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return Promise.resolve(list)
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  const saved = saveWarehouse(moduleId, next)
  return saved && typeof saved.then === 'function' ? saved.then(() => next) : Promise.resolve(next)
}
