import { CURRENCY_CONFIG } from '../data/currencyConfig'

/** 次元袋内（inBagOfHolding）钱币堆按币种汇总 */
export function sumBagWalletBalances(inventory) {
  const out = {}
  for (const cfg of CURRENCY_CONFIG) out[cfg.id] = 0
  if (!Array.isArray(inventory)) return out
  for (const e of inventory) {
    if (!e?.inBagOfHolding || !e.walletCurrencyId) continue
    const cid = e.walletCurrencyId
    if (!(cid in out)) continue
    const q = Number(e.qty) || 0
    out[cid] += cid === 'gem_lb' ? q : Math.floor(q)
  }
  if ('gem_lb' in out) out.gem_lb = Math.round(out.gem_lb * 10) / 10
  return out
}

/** 身上钱包字段 + 次元袋内钱币 = 角色卡「个人持有」展示用合计 */
export function mergeWalletWithBagWallet(wallet, inventory) {
  const bag = sumBagWalletBalances(inventory)
  const w = wallet && typeof wallet === 'object' ? wallet : {}
  const merged = {}
  for (const cfg of CURRENCY_CONFIG) {
    const id = cfg.id
    merged[id] = (Number(w[id]) || 0) + (Number(bag[id]) || 0)
  }
  return merged
}

/**
 * 用户在「个人持有」输入的总额为 desiredTotal 时，应写入 character.wallet 的该币种数量（次元袋内钱币条不变）
 */
export function walletPartForCommittedTotal(currencyId, desiredTotal, wallet, inventory) {
  const bag = sumBagWalletBalances(inventory)
  const b = Number(bag[currencyId]) || 0
  const t = Math.max(0, desiredTotal)
  if (currencyId === 'gem_lb') {
    return Math.max(0, t - b)
  }
  return Math.max(0, Math.floor(t) - Math.floor(b))
}

/** 生成物品栏展示的「货币行」（余额>0） */
export function buildCurrencyRowsForInventory(wallet) {
  if (!wallet || typeof wallet !== 'object') return []
  const out = []
  for (const cfg of CURRENCY_CONFIG) {
    const raw = wallet[cfg.id]
    const amt = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0
    if (amt <= 0) continue
    out.push({
      currencyId: cfg.id,
      label: cfg.unit ? `${cfg.name}（${cfg.unit}）` : cfg.name,
      qty: amt,
      order: cfg.order ?? 0,
    })
  }
  return out.sort((a, b) => a.order - b.order)
}
