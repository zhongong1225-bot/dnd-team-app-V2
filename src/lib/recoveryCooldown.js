/**
 * 充能恢复方式 → 主动技能卡二元冷却的共用推导。
 *
 * recovery.method 已从字符串迁移为数组（每种方式各自一份恢复量），但旧读取方
 * 仍按 `=== 'long_rest'` 字符串严格比较，对数组恒为 false，导致冷却静默落到 'none'。
 * 本函数是唯一推导入口：归一为数组后取「最短冷却」——含短休即短休（长休本就覆盖短休），
 * 否则含长休即长休。黎明/吸能等非休息方式不参与二元冷却（used 标记只在休息事件重置，
 * 它们的充能恢复走 chargeRecovery.restoreChargesForEvent）。
 */
export function deriveCooldownFromRecovery(recovery) {
  const raw = recovery && typeof recovery === 'object' ? recovery.method : undefined
  const methods = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  if (methods.includes('short_rest')) return 'short_rest'
  if (methods.includes('long_rest')) return 'long_rest'
  return 'none'
}
