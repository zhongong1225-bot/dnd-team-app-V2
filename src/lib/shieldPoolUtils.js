/**
 * 护盾池（shield_pool）工具函数
 * 
 * 护盾池是一种可消耗的护盾/护甲层数追踪机制。
 * 当 current ≤ threshold 时，同卡上其他效果全部禁用。
 * 
 * 状态存储在 char.shieldPoolStates 中，按卡来源键隔离：
 * char.shieldPoolStates = {
 *   "equipment:item_abc123": { current: 15 },
 *   "classFeature:法师||防护法师护罩": { current: 3 }
 * }
 */

/**
 * 构建护盾池状态键
 * @param {string} sourceType - 来源类型（equipment/feat/classFeature/invocation/fightingStyle/manual）
 * @param {string} sourceKey - 来源键（inventoryId/featId/classFeatureKey等）
 * @returns {string} 状态键
 */
export function buildShieldPoolKey(sourceType, sourceKey) {
  return `${sourceType}:${sourceKey}`
}

/**
 * 从角色数据读取护盾池当前值
 * @param {object} char - 角色对象
 * @param {string} sourceType - 来源类型
 * @param {string} sourceKey - 来源键
 * @param {number} defaultValue - 默认值（通常是 max）
 * @returns {number} 当前值
 */
export function getShieldPoolCurrent(char, sourceType, sourceKey, defaultValue) {
  const key = buildShieldPoolKey(sourceType, sourceKey)
  const states = char?.shieldPoolStates
  if (!states || !(key in states)) {
    return defaultValue
  }
  return typeof states[key].current === 'number' ? states[key].current : defaultValue
}

/**
 * 写入护盾池当前值
 * @param {object} char - 角色对象
 * @param {string} sourceType - 来源类型
 * @param {string} sourceKey - 来源键
 * @param {number} current - 新值
 * @returns {object} 更新后的 shieldPoolStates 对象（用于 persist）
 */
export function setShieldPoolCurrent(char, sourceType, sourceKey, current) {
  const key = buildShieldPoolKey(sourceType, sourceKey)
  const states = { ...(char?.shieldPoolStates || {}) }
  states[key] = { current }
  return states
}

/**
 * 递减护盾池当前值
 * @param {object} char - 角色对象
 * @param {string} sourceType - 来源类型
 * @param {string} sourceKey - 来源键
 * @param {number} min - 最小值（默认 0）
 * @returns {object|null} 更新后的 shieldPoolStates 对象，或 null（已达最小值）
 */
export function decrementShieldPool(char, sourceType, sourceKey, min = 0) {
  const current = getShieldPoolCurrent(char, sourceType, sourceKey, min)
  if (current <= min) return null
  return setShieldPoolCurrent(char, sourceType, sourceKey, current - 1)
}

/**
 * 重置护盾池到最大值
 * @param {object} char - 角色对象
 * @param {string} sourceType - 来源类型
 * @param {string} sourceKey - 来源键
 * @param {number} max - 最大值
 * @returns {object} 更新后的 shieldPoolStates 对象
 */
export function resetShieldPool(char, sourceType, sourceKey, max) {
  return setShieldPoolCurrent(char, sourceType, sourceKey, max)
}

/**
 * 休息时恢复护盾池
 * @param {object} char - 角色对象
 * @param {string} restType - 'short' | 'long'
 * @param {Array} mergedBuffs - 合并后的 BUFF 列表（用于读取 recoverOn 配置）
 * @returns {object|null} 更新后的 shieldPoolStates 对象，或 null（无需恢复）
 */
export function recoverShieldPoolsOnRest(char, restType, mergedBuffs) {
  if (!char?.shieldPoolStates) return null
  
  // 构建 shield_pool 效果配置映射
  const shieldPoolConfigs = new Map()
  for (const buff of mergedBuffs || []) {
    const spEffect = (buff.effects || []).find(e => e.effectType === 'shield_pool')
    if (!spEffect) continue
    
    const sourceType = buff.fromItem ? 'equipment' 
      : buff.fromFeat ? 'feat'
      : buff.fromClassFeature ? 'classFeature'
      : buff.fromInvocation ? 'invocation'
      : buff.fromFightingStyle ? 'fightingStyle'
      : 'manual'
    
    const sourceKey = buff.fromItem ? buff.itemInventoryId
      : buff.fromFeat ? buff.featId
      : buff.fromClassFeature ? `${buff.sourceClass || ''}|${buff.sourceSubclass || ''}|${buff.featureId || ''}`
      : buff.fromInvocation ? buff.invocationId
      : buff.fromFightingStyle ? buff.styleId
      : buff.source || 'unknown'
    
    const key = buildShieldPoolKey(sourceType, sourceKey)
    shieldPoolConfigs.set(key, spEffect.value)
  }
  
  // 检查哪些护盾池需要恢复
  let changed = false
  const newStates = { ...char.shieldPoolStates }
  
  for (const [key, config] of shieldPoolConfigs) {
    if (!(key in newStates)) continue
    
    const state = newStates[key]
    const max = config.max || 0
    const recoverOn = config.recoverOn || 'manual'
    
    // 判断是否应该恢复
    let shouldRecover = false
    if (recoverOn === 'short' && (restType === 'short' || restType === 'long')) {
      shouldRecover = true
    } else if (recoverOn === 'long' && restType === 'long') {
      shouldRecover = true
    }
    // 'dawn' 需要单独处理（在黎明时恢复，这里先不支持）
    // 'manual' 和 'none' 不自动恢复
    
    if (shouldRecover && state.current < max) {
      newStates[key] = { current: max }
      changed = true
    }
  }
  
  return changed ? newStates : null
}

/**
 * 检查护盾池是否已耗尽（current ≤ threshold）
 * @param {object} char - 角色对象
 * @param {string} sourceType - 来源类型
 * @param {string} sourceKey - 来源键
 * @param {object} shieldPoolValue - shield_pool 效果的 value 对象
 * @returns {boolean} 是否已耗尽
 */
export function isShieldPoolDepleted(char, sourceType, sourceKey, shieldPoolValue) {
  if (!shieldPoolValue) return false
  const current = getShieldPoolCurrent(char, sourceType, sourceKey, shieldPoolValue.max || 0)
  const threshold = shieldPoolValue.threshold || 0
  return current <= threshold
}
