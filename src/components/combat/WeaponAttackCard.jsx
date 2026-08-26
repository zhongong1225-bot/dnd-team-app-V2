/**
 * 武器攻击卡片
 * 接收原始数据 + 共享上下文，内部计算并渲染物理武器攻击的命中、伤害、射程等
 */
import React from 'react'
import { Pencil, Trash2, Dices } from 'lucide-react'
import {
  getCritDamageDiceMultiplierFromItemEntry,
  getCritThreatMinNaturalFromItemEntry,
} from '../../hooks/useBuffCalculator'
import { parseWeaponNoteToTraits } from '../../data/itemDatabase'
import { getDamageTypeLabel } from '../../data/buffTypes'
import { parseCombatDiceExpression } from '../../data/weaponDatabase'

const COMBAT_MEAN_ROW_GRID =
  'grid grid-cols-[repeat(24,minmax(0,1fr))] items-center gap-x-1 w-full min-w-0 overflow-hidden'
const COMBAT_LIST_ROW_SHADOW = 'shadow-[0_2px_10px_rgba(0,0,0,0.42)]'
const CM_MEAN_LABEL = 'text-xs'
const CM_MEAN_HI = 'text-sm'
const CM_BTN_GOLD =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-dnd-gold-light transition-colors hover:text-dnd-gold'
const CM_BTN_RED =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-dnd-red/90 transition-colors hover:text-dnd-red'
const CM_BTN_CRIT =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-red-300 transition-colors hover:text-red-200'
const CM_DICE_IC = 'w-[1.872rem] h-[1.872rem] opacity-95'
function QuickRollIcon({ className = CM_DICE_IC }) {
  return <Dices className={className} aria-hidden />
}
function quickRollTitle(detail) {
  return detail ? `快捷投掷按钮：${detail}` : '快捷投掷按钮'
}
function ActionLabelBadge({ source, className = '' }) {
  const label = source || '动作'
  return (
    <span className={`shrink-0 text-[10px] leading-none px-1 py-[1px] rounded border bg-gray-700 text-gray-300 border-gray-600 ${className}`} title={`动作类型：${label}`}>
      {label}
    </span>
  )
}

function formatSignedModifier(n) {
  if (!n || n === 0) return ''
  return n > 0 ? `+${n}` : String(n)
}

function formatWeaponAttackDiceDisplay(attackParsed) {
  if (!attackParsed) return '—'
  const { dice, diceList, type } = attackParsed
  if (!dice && (!diceList || diceList.length === 0)) return '—'
  const parts = diceList?.length ? diceList.join(' + ') : (dice || '')
  return parts.toUpperCase()
}

function filterExtraDiceAgainstMain(attackParsed, rawDamageType, lines) {
  if (!lines?.length) return []
  const mainType = rawDamageType || ''
  const mainDice = new Set()
  if (attackParsed?.diceList) attackParsed.diceList.forEach((d) => mainDice.add(String(d).trim().toLowerCase()))
  else if (attackParsed?.dice) mainDice.add(String(attackParsed.dice).trim().toLowerCase())
  return lines.filter((l) => {
    const s = String(l).trim()
    const [dicePart, ...rest] = s.split(/\s+/)
    const extraType = rest.join(' ').trim()
    if (extraType && extraType === mainType && mainDice.has(dicePart.toLowerCase())) return false
    return true
  })
}

export default function WeaponAttackCard({ displayMean, weaponOpt, ctx, comboSuffix = '' }) {
  if (!weaponOpt) return null

  const {
    canEdit, isCombo, gains,
    openEditWeaponMean, openEditComboMean, removeCombatMean,
    openForCheck, rollAllWeaponDamage, renderAutoGainBadges,
  } = ctx

  /* ── 计算 ── */
  const weaponCritDiceMult = getCritDamageDiceMultiplierFromItemEntry(weaponOpt.entry, ctx.itemFormulaContext)
  const weaponCritThreatMin = getCritThreatMinNaturalFromItemEntry(weaponOpt.entry)
  const isRanged = weaponOpt.proto?.子类型 === '远程'
  const entryAttackDist = (weaponOpt.entry?.攻击距离 ?? '').toString().trim()
  const protoAttackDist = (weaponOpt.proto?.攻击距离 ?? '').toString().trim()
  const entryNote = (weaponOpt.entry?.附注 ?? '').trim()
  const protoNote = (weaponOpt.proto?.附注 ?? '').trim()
  const entryRangeMatch = entryNote.match(/(\d+\s*\/\s*\d+)/)
  const manualRangeFromNote = entryRangeMatch ? entryRangeMatch[1].replace(/\s+/g, '') : ''
  const { range: entryNoteRange } = parseWeaponNoteToTraits(entryNote)
  const { range: protoNoteRange } = parseWeaponNoteToTraits(protoNote)
  const mergedNote = (entryNote || protoNote || '').trim()
  const explicitRange = entryAttackDist || manualRangeFromNote || entryNoteRange || protoAttackDist || protoNoteRange
  const reachBonus = ctx.buffStats?.reachbonus ?? ctx.buffStats?.reachBonus ?? 0
  const addReachToRange = (rangeStr) => {
    if (!reachBonus || isRanged) return rangeStr
    if (/^\d+(\s*\/\s*\d+)?$/.test(String(rangeStr || '').trim())) {
      return String(rangeStr).split('/').map((p) => Number(p.trim()) + reachBonus).join('/')
    }
    const touchMatch = String(rangeStr || '').match(/触及\s*(\d*)\s*尺?/)
    if (touchMatch) {
      const base = touchMatch[1] ? Number(touchMatch[1]) : 0
      return `触及${base + reachBonus}尺`
    }
    return rangeStr
  }
  const rawMeleeReachLabel = /触及/.test(mergedNote) ? '触及10尺' : '触及'
  const rangeDisplay = explicitRange
    ? addReachToRange(explicitRange)
    : (isRanged ? '—' : addReachToRange(rawMeleeReachLabel))

  const { physStats } = ctx
  const attackParsed = physStats?.attackParsed ?? { dice: null, diceList: [], type: '—' }
  const rawDamageType = physStats?.rawDamageType ?? (displayMean.damageType || attackParsed.type)
  const abilityMod = physStats?.abilityMod ?? 0
  const buffDamageBonus = physStats?.buffDamageBonus ?? 0
  const gainDamageBonus = physStats?.gainDamageBonus ?? 0
  const weaponPerDieMod = physStats?.weaponPerDieMod ?? 0
  const totalDamageMod = physStats?.totalDamageMod ?? 0
  const displayDamageType = physStats?.displayDamageType ?? '—'
  const physicalAttackBonus = physStats?.physicalAttackBonus ?? 0
  const gainAdvantage = physStats?.gainAdvantage ?? null
  const weaponExtraDiceStrings = physStats?.weaponExtraDiceStrings ?? []

  const weaponName = weaponOpt?.name ?? '—'
  const suffix = displayMean.weaponNameSuffix ? String(displayMean.weaponNameSuffix).trim() : ''
  const fullName = weaponName + suffix + comboSuffix

  const damageTooltip = `伤害加值明细：属性调整值 ${abilityMod >= 0 ? '+' : ''}${abilityMod}，Buff 伤害加值 ${buffDamageBonus >= 0 ? '+' : ''}${buffDamageBonus}，增益伤害加值 ${gainDamageBonus >= 0 ? '+' : ''}${gainDamageBonus}${weaponPerDieMod !== 0 ? `，每骰加成 ${weaponPerDieMod >= 0 ? '+' : ''}${weaponPerDieMod}` : ''}`
  const extraFiltered = filterExtraDiceAgainstMain(attackParsed, rawDamageType, weaponExtraDiceStrings)
  const hasDamage = ((attackParsed.diceList?.length || attackParsed.dice) || extraFiltered.length > 0)

  const onEdit = isCombo ? () => openEditComboMean(displayMean) : () => openEditWeaponMean(displayMean)
  const editBadgeClick = () => openEditWeaponMean(displayMean)

  return (
    <div className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}>
      <div className={COMBAT_MEAN_ROW_GRID}>
        {/* 名称列 */}
        <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
          <ActionLabelBadge source="1 动作" />
          <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{fullName}</span>
          {canEdit && (
            <button type="button" onClick={onEdit} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title={isCombo ? '编辑组合技' : '编辑武器'}>
              <Pencil size={12} />
            </button>
          )}
        </div>

        {/* 射程列 */}
        <div className="col-span-4 pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>射程</span>
          <span className={`text-white ${CM_MEAN_HI} truncate`}>{rangeDisplay}</span>
        </div>

        {/* 攻击列 */}
        <div className="col-span-4 pl-2 border-l border-gray-600 flex items-center gap-x-1.5 min-w-0 overflow-hidden">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>攻击</span>
          <span className={`text-white font-mono ${CM_MEAN_HI} tabular-nums truncate`}>{physicalAttackBonus >= 0 ? '+' : ''}{physicalAttackBonus}</span>
          <button type="button" onClick={() => openForCheck(weaponOpt.name + ' 攻击' + comboSuffix, physicalAttackBonus, { quickRoll: true, critThreatMinNatural: weaponCritThreatMin, advantage: gainAdvantage })} className={CM_BTN_RED} title={quickRollTitle('攻击')} aria-label={quickRollTitle('攻击')}>
            <QuickRollIcon />
          </button>
        </div>

        {/* 伤害列 */}
        <div className="col-span-10 pl-2 border-l border-gray-600 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
          <span
            className={`min-w-0 flex-1 font-mono ${CM_MEAN_HI} tabular-nums text-white whitespace-nowrap [overflow-wrap:anywhere] sm:truncate`}
            title={damageTooltip}
          >
            {formatWeaponAttackDiceDisplay(attackParsed)}
            <span title={damageTooltip} className="cursor-help">
              {formatSignedModifier(totalDamageMod)}
            </span>{' '}
            {displayDamageType}
            {extraFiltered.map((d) => ` + ${d}`).join('')}
          </span>
          {renderAutoGainBadges(gains, editBadgeClick)}
          {hasDamage && (
            <>
              <button type="button" onClick={() => rollAllWeaponDamage(displayMean, weaponOpt, attackParsed, totalDamageMod, displayDamageType, false)} className={CM_BTN_GOLD} title={quickRollTitle('伤害')} aria-label={quickRollTitle('伤害')}>
                <QuickRollIcon />
              </button>
              <button type="button" onClick={() => rollAllWeaponDamage(displayMean, weaponOpt, attackParsed, totalDamageMod, displayDamageType, true)} className={CM_BTN_CRIT} title={quickRollTitle(`伤害（重击×${weaponCritDiceMult}伤害骰）`)} aria-label={quickRollTitle(`伤害（重击×${weaponCritDiceMult}伤害骰）`)}>
                <QuickRollIcon />
              </button>
            </>
          )}
        </div>

        {/* 删除列 */}
        <div className="col-span-1 flex min-w-0 items-center justify-end gap-0.5 pl-1 border-l border-gray-600 shrink-0">
          {canEdit && (
            <button type="button" onClick={() => removeCombatMean(displayMean.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
