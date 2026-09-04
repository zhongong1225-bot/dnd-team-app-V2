// src/lib/abilityFlowUtils.js

function hasAttackRoll(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'spell' && eff.value?.hitResolution === 'spell_attack') return true
    if (eff.type === 'attack_buff' && (eff.value?.hitBonus > 0 || eff.value?.damageBonus > 0)) return false
  }
  return false
}

function hasSavingThrow(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'spell') {
      const hr = eff.value?.hitResolution
      if (hr && hr !== 'none' && hr !== 'spell_attack' && hr.endsWith('_save')) return true
    }
  }
  return false
}

function hasDiceEffects(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'damage' || eff.type === 'heal') return true
    if (eff.type === 'ability' && (eff.value?.diceCount > 0)) return true
    if (eff.type === 'spell') {
      if ((eff.value?.damageDiceCount || 0) > 0) return true
      const subs = eff.value?.subEffects || []
      for (const se of subs) {
        if (se.type === 'damage' || se.type === 'heal') return true
        if (se.type === 'ability' && (se.value?.diceCount > 0)) return true
      }
    }
  }
  return false
}

export function classifyFlowType(effects) {
  if (hasAttackRoll(effects)) return 'attack'
  if (hasSavingThrow(effects)) return 'save'
  return 'general'
}

export function getTotalSteps(flowType) {
  return flowType === 'attack' ? 4 : 3
}

export function getStepLabels(flowType, hasDice) {
  if (flowType === 'attack') {
    return ['准备', '确认', '攻击', '结果']
  }
  return hasDice ? ['准备', '确认', '掷骰', '结果'] : ['准备', '确认', '执行', '结果']
}

export function extractDamageFormulas(effects, amt, isFreeSlot) {
  const formulas = []
  for (const eff of (effects || [])) {
    const ev = eff.value || {}
    if (eff.type === 'spell') {
      const diceCount = ev.damageDiceCount || 0
      if (diceCount > 0) {
        formulas.push({
          label: ev.spellName || '法术',
          formula: `${diceCount}d${ev.damageDiceSides || 6}`,
          damageType: ev.damageType || '',
        })
      }
      const subs = ev.subEffects || []
      for (const se of subs) {
        const sv = se.value || {}
        if (se.type === 'damage' && (sv.diceCount || 1) > 0) {
          formulas.push({
            label: sv.title || '伤害',
            formula: `${sv.diceCount || 1}d${sv.diceSides || 6}${sv.diceBonus ? `+${sv.diceBonus}` : ''}`,
            damageType: sv.damageType || '',
          })
        }
        if (se.type === 'ability' && se.value?.diceCount > 0 && se.value?.resultType === 'damage') {
          formulas.push({
            label: sv.title || '伤害',
            formula: `${sv.diceCount}d${sv.diceSides || 10}`,
            damageType: '',
          })
        }
      }
    }
    if (eff.type === 'damage') {
      const dc = ev.diceCount || 1
      formulas.push({
        label: ev.title || '伤害',
        formula: `${dc}d${ev.diceSides || 6}${ev.diceBonus ? `+${ev.diceBonus}` : ''}`,
        damageType: ev.damageType || '',
      })
    }
    if (eff.type === 'ability' && ev.resultType === 'damage' && ev.diceCount > 0) {
      formulas.push({
        label: ev.title || '伤害',
        formula: `${ev.diceCount}d${ev.diceSides || 10}`,
        damageType: '',
      })
    }
  }
  return formulas
}

export function extractSaveInfo(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'spell') {
      const hr = eff.value?.hitResolution
      if (hr && hr.endsWith('_save')) {
        return { saveType: hr.replace('_save', ''), spellName: eff.value?.spellName }
      }
    }
  }
  return null
}

export function generatePreviewLines(effects, featureName) {
  const lines = []
  for (const eff of (effects || [])) {
    const ev = eff.value || {}
    switch (eff.type) {
      case 'spell':
        lines.push(`📜 ${ev.spellName || '(未命名法术)'}`)
        break
      case 'damage':
        lines.push(`⚔️ ${ev.title || '伤害'}`)
        break
      case 'heal':
        lines.push(`💚 ${ev.title || '治疗'}`)
        break
      case 'temp_buff':
        lines.push(`✨ ${ev.buffName || '临时BUFF'}`)
        break
      case 'creature_transform':
        lines.push(`🐾 变身`)
        break
      case 'summon':
        lines.push(`📦 ${ev.preset === 'stellar_double' ? '星辰替身' : '召唤'}`)
        break
      case 'shield':
        lines.push(`🛡️ ${ev.title || '护盾'}`)
        break
      case 'restore_spell_slots':
        lines.push(`🔮 恢复法术位`)
        break
      case 'attack_buff':
        lines.push(`🎯 ${ev.title || '攻击加成'}`)
        break
      case 'custom_logic':
        lines.push(`✨ ${ev.description || ev.title || '自定义效果'}`)
        break
      case 'ability':
        lines.push(`${ev.resultType === 'damage' ? '⚔️' : '💚'} ${ev.title || '效果'}`)
        break
      default:
        lines.push(`✨ ${ev.title || eff.type}`)
    }
  }
  return lines
}
