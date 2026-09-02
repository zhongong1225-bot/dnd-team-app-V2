/**
 * 护盾机制引擎
 *
 * 护盾 = 有限次/有限时间的防御效果追踪系统。
 * 与 BUFF 的区别：BUFF 是静态被动，护盾有充能/单次/持续三种类型，可主动激活或被动常驻。
 *
 * shield 数据结构：
 * {
 *   id: string,
 *   name: string,
 *   shieldType: 'charged' | 'single_use' | 'duration',
 *   activationMode: 'active' | 'passive',
 *   charges: number,          // 当前充能（charged 类型）
 *   maxCharges: number,       // 最大充能（charged 类型）
 *   duration: number,         // 剩余回合（duration 类型）
 *   maxDuration: number,      // 最大回合（duration 类型）
 *   active: boolean,          // 是否激活（active 类型手动切换；passive 始终 true）
 *   effects: [{ effectType, value }],  // 激活时提供的效果
 *   recovery: 'short' | 'long' | 'none',
 *   description: string,
 * }
 */

export const SHIELD_TYPE_OPTIONS = [
  { value: 'charged', label: '充能' },
  { value: 'single_use', label: '单次' },
  { value: 'duration', label: '持续' },
]

export const SHIELD_ACTIVATION_OPTIONS = [
  { value: 'active', label: '主动' },
  { value: 'passive', label: '被动' },
]

export const SHIELD_RECOVERY_OPTIONS = [
  { value: 'short', label: '短休恢复' },
  { value: 'long', label: '长休恢复' },
  { value: 'none', label: '不恢复' },
  { value: 'unrecoverable', label: '无法恢复' },
]

/** 创建新护盾 */
export function createShield(data = {}) {
  const shieldType = data.shieldType || 'charged'
  return {
    id: data.id || 'shield_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: data.name?.trim() || '新护盾',
    shieldType,
    activationMode: data.activationMode || 'active',
    charges: shieldType === 'charged' ? (data.maxCharges ?? data.charges ?? 1) : shieldType === 'single_use' ? 1 : 0,
    maxCharges: shieldType === 'charged' ? (data.maxCharges ?? 1) : 0,
    duration: shieldType === 'duration' ? (data.maxDuration ?? data.duration ?? 10) : 0,
    maxDuration: shieldType === 'duration' ? (data.maxDuration ?? 10) : 0,
    active: data.activationMode === 'passive',
    effects: Array.isArray(data.effects) ? data.effects : [],
    recovery: data.recovery || 'long',
    description: data.description || '',
  }
}

/** 护盾是否当前生效：被动常驻 = 始终；主动 = active 为 true 且有充能/时间 */
export function isShieldEffective(shield) {
  if (!shield) return false
  if (shield.activationMode === 'passive') return hasShieldResource(shield)
  if (!shield.active) return false
  return hasShieldResource(shield)
}

/** 护盾是否还有资源（充能 > 0 或持续 > 0 或单次未用） */
export function hasShieldResource(shield) {
  if (!shield) return false
  if (shield.shieldType === 'charged') return (shield.charges ?? 0) > 0
  if (shield.shieldType === 'single_use') return (shield.charges ?? 0) > 0
  if (shield.shieldType === 'duration') return (shield.duration ?? 0) > 0
  return false
}

/** 消耗一次护盾（反应型：单次 -1 充能，持续 -1 回合） */
export function consumeShieldOnce(shields, shieldId) {
  return shields.map((s) => {
    if (s.id !== shieldId) return s
    if (s.shieldType === 'single_use') return { ...s, charges: Math.max(0, (s.charges ?? 0) - 1), active: false }
    if (s.shieldType === 'duration') return { ...s, duration: Math.max(0, (s.duration ?? 0) - 1) }
    return s
  })
}

/** 手动调整充能型护盾的充能数 */
export function adjustShieldCharges(shields, shieldId, delta) {
  return shields.map((s) => {
    if (s.id !== shieldId || s.shieldType !== 'charged') return s
    const next = Math.max(0, Math.min(s.maxCharges, (s.charges ?? 0) + delta))
    return { ...s, charges: next }
  })
}

/** 切换主动护盾的激活状态 */
export function toggleShieldActive(shields, shieldId) {
  return shields.map((s) => {
    if (s.id !== shieldId || s.activationMode !== 'active') return s
    // 无资源时不允许激活
    if (s.active || hasShieldResource(s)) return { ...s, active: !s.active }
    return s
  })
}

/** 休息时恢复护盾充能 */
export function recoverShieldsOnRest(shields, restType) {
  return shields.map((s) => {
    const next = { ...s }
    // 无法恢复类型：跳过
    if (next.recovery === 'unrecoverable') return next
    // 充能型：按恢复类型回满
    if (next.shieldType === 'charged') {
      const shouldRecover =
        (next.recovery === 'short' && (restType === 'short' || restType === 'long')) ||
        (next.recovery === 'long' && restType === 'long')
      if (shouldRecover) {
        next.charges = next.maxCharges
        next.active = next.activationMode === 'passive' ? true : next.active
      }
    }
    // 单次型：长休恢复
    if (next.shieldType === 'single_use' && restType === 'long') {
      next.charges = 1
      next.active = next.activationMode === 'passive' ? true : next.active
    }
    // 持续型：短休重置到最大
    if (next.shieldType === 'duration' && (restType === 'short' || restType === 'long')) {
      next.duration = next.maxDuration
    }
    return next
  })
}

/** 获取所有生效护盾的效果列表（注入 BUFF 计算管线） */
export function getActiveShieldEffects(shields) {
  if (!Array.isArray(shields)) return []
  const out = []
  for (const s of shields) {
    if (!isShieldEffective(s)) continue
    for (const e of s.effects) {
      if (e?.effectType) {
        out.push({ effectType: e.effectType, value: e.value, scope: e.scope, source: `shield:${s.id}` })
      }
    }
  }
  return out
}

/** 护盾类型标签 */
export function getShieldTypeLabel(shieldType) {
  return SHIELD_TYPE_OPTIONS.find((o) => o.value === shieldType)?.label || shieldType
}

/** 激活模式标签 */
export function getShieldActivationLabel(mode) {
  return SHIELD_ACTIVATION_OPTIONS.find((o) => o.value === mode)?.label || mode
}
