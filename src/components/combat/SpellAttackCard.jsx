/**
 * 法术攻击卡片
 * 接收原始数据 + 共享上下文，内部计算并渲染法术攻击的命中/DC、伤害、射程等
 */
import React from 'react'
import { Pencil, Trash2, Dices } from 'lucide-react'
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
const CM_DICE_IC_GOLD = 'w-[2.246rem] h-[2.246rem] opacity-95'
function QuickRollIcon({ className = CM_DICE_IC_GOLD }) {
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

const HIT_RESOLUTION_LABELS = {
  dex_save: '敏捷豁免', str_save: '力量豁免', con_save: '体质豁免',
  wis_save: '感知豁免', int_save: '智力豁免', cha_save: '魅力豁免',
  spell_attack: '法术攻击',
}

function compactDiceExpression(expr) {
  return String(expr || '').trim().replace(/\s+/g, ' ')
}

function formatSignedModifier(n) {
  if (!n || n === 0) return ''
  return n > 0 ? `+${n}` : String(n)
}

export default function SpellAttackCard({ displayMean, comboSuffix = '', ctx }) {
  const {
    canEdit, isCombo, gains,
    spellAttackBonus, spellDC, buffStats, gainAttackBonus, gainDamageBonus,
    gainPerDieBonus, gainExtraDice, gainAdvantage, gainDiceFloor2,
    itemFormulaContext,
    openEditSpellAttack, openEditComboMean, removeCombatMean,
    openForCheck, rollDamageDice, consumeSpellSlotForMean,
    renderAutoGainBadges, getMergedSpells,
  } = ctx

  /* ── 查找法术 ── */
  const mergedSpells = getMergedSpells()
  const matchedSpell = mergedSpells.find((s) => s.id === displayMean.spellId || (s.name && s.name.trim() === (displayMean.spellName || '').trim()))

  /* ── 命中解析 ── */
  const hitRes = displayMean.hitResolution && HIT_RESOLUTION_LABELS[displayMean.hitResolution] ? displayMean.hitResolution : 'spell_attack'
  const hitLabel = HIT_RESOLUTION_LABELS[hitRes]
  const rangeDisplay = computeSpellRangeDisplay(matchedSpell?.range, buffStats?.spellRangeMultiplier, buffStats?.spellRangeBonus)
  const spellAttackForMean = spellAttackBonus != null ? spellAttackBonus + gainAttackBonus : null
  const hitValue = hitRes === 'spell_attack'
    ? (spellAttackForMean != null ? (spellAttackForMean >= 0 ? '+' : '') + spellAttackForMean : null)
    : (spellDC != null ? spellDC : null)
  const hitLabelShort = hitRes === 'spell_attack' ? '法攻' : hitLabel
  const hitText = hitRes === 'spell_attack'
    ? (hitValue != null ? `${hitLabelShort} ${hitValue}` : '—')
    : (hitValue != null ? `${hitLabel} DC ${hitValue}` : '—')

  /* ── 伤害计算 ── */
  const spellDiceCount = (() => { const p = parseCombatDiceExpression((displayMean.damageDice || '').trim()); return p ? p.count : 0 })()
  const spellDamageExtras = getSpellDamageBonusExtras(displayMean.damageTypeSpell, buffStats?.spellDamageBonuses, itemFormulaContext)
  const spellDamageMod = gainDamageBonus + gainPerDieBonus * spellDiceCount + spellDamageExtras.flatBonus
  const allSpellExtraDice = [...gainExtraDice, ...spellDamageExtras.extraDice]
  const compactedSpellExtraDice = allSpellExtraDice.map(compactDiceExpression)
  const baseDamageText = (displayMean.damageDice || '').trim()
    ? compactDiceExpression((displayMean.damageDice || '').toUpperCase() + (displayMean.damageTypeSpell ? ' ' + getDamageTypeLabel(displayMean.damageTypeSpell) : ''))
    : ''
  const extraDamageText = compactedSpellExtraDice.length ? (' + ' + compactedSpellExtraDice.join(' + ')) : ''
  const modDamageText = (spellDamageMod !== 0 && baseDamageText) ? ` ${formatSignedModifier(spellDamageMod)}` : ''
  const damageText = baseDamageText ? `${baseDamageText}${extraDamageText}${modDamageText}` : (compactedSpellExtraDice.length ? compactedSpellExtraDice.join(' + ') : '—')
  const spellDamageFloor2 = gainDiceFloor2
  const hasDamage = !!((displayMean.damageDice || '').trim())

  const fullName = (displayMean.spellName || '法术攻击') + comboSuffix
  const onEdit = isCombo ? () => openEditComboMean(displayMean) : () => openEditSpellAttack(displayMean)
  const editBadgeClick = () => (isCombo ? openEditComboMean(displayMean) : openEditSpellAttack(displayMean))

  return (
    <div className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}>
      <div className={COMBAT_MEAN_ROW_GRID}>
        {/* 名称列 */}
        <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
          <ActionLabelBadge source={matchedSpell?.castingTime || ''} />
          <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{fullName}</span>
          {canEdit && (
            <button type="button" onClick={onEdit} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title={isCombo ? '编辑组合技' : '编辑法术'}>
              <Pencil size={12} />
            </button>
          )}
        </div>

        {/* 距离列 */}
        <div className="col-span-4 pl-2 border-l border-gray-600 min-w-0 overflow-hidden">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>距离</span>
          <span className={`text-white ${CM_MEAN_HI} truncate`}>{rangeDisplay}</span>
        </div>

        {/* 命中列 */}
        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1.5 min-w-0 overflow-hidden col-span-4">
          <span className={`text-white ${CM_MEAN_HI} truncate min-w-0`}>{hitText}</span>
          {hitRes === 'spell_attack' && spellAttackForMean != null && (
            <button type="button" onClick={() => { if (!consumeSpellSlotForMean(displayMean, displayMean.spellName || '法术')) return; openForCheck((displayMean.spellName || '法术攻击') + ' 法术攻击', spellAttackForMean, { quickRoll: true, advantage: gainAdvantage }) }} className={CM_BTN_RED} title={quickRollTitle('法术攻击')} aria-label={quickRollTitle('法术攻击')}>
              <QuickRollIcon />
            </button>
          )}
        </div>

        {/* 伤害列 */}
        <div className="col-span-10 pl-2 border-l border-gray-600 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
          <span className={`min-w-0 flex-1 font-mono ${CM_MEAN_HI} tabular-nums text-white whitespace-nowrap sm:truncate`}>{damageText}</span>
          {renderAutoGainBadges(gains, editBadgeClick)}
          {hasDamage && (
            <>
              <button
                type="button"
                onClick={() => { if (!consumeSpellSlotForMean(displayMean, displayMean.spellName || '法术')) return; rollDamageDice((displayMean.damageDice || '').trim(), (displayMean.spellName || '法术') + ' ' + (getDamageTypeLabel(displayMean.damageTypeSpell) || ''), 'spell_attack-' + displayMean.id, spellDamageMod, false, getDamageTypeLabel(displayMean.damageTypeSpell) || '', { extraDice: allSpellExtraDice, floor2: spellDamageFloor2 }) }}
                className={CM_BTN_GOLD}
                title={quickRollTitle('伤害')}
                aria-label={quickRollTitle('伤害')}
              >
                <QuickRollIcon />
              </button>
              {hitRes === 'spell_attack' && (
                <button
                  type="button"
                  onClick={() => { if (!consumeSpellSlotForMean(displayMean, displayMean.spellName || '法术')) return; rollDamageDice((displayMean.damageDice || '').trim(), (displayMean.spellName || '法术') + ' ' + (getDamageTypeLabel(displayMean.damageTypeSpell) || ''), 'spell_attack-' + displayMean.id, spellDamageMod, true, getDamageTypeLabel(displayMean.damageTypeSpell) || '', { extraDice: allSpellExtraDice, floor2: spellDamageFloor2 }) }}
                  className={CM_BTN_CRIT}
                  title={quickRollTitle('伤害（重击×2伤害骰）')}
                  aria-label={quickRollTitle('伤害（重击×2伤害骰）')}
                >
                  <QuickRollIcon />
                </button>
              )}
            </>
          )}
        </div>

        {/* 删除列 */}
        <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
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

/* ── 内部工具函数 ── */

function computeSpellRangeDisplay(rawRange, multiplier = 1, bonus = 0) {
  if (!rawRange) return '—'
  const raw = String(rawRange).trim()
  if (!raw || raw === '—') return '—'
  const numMatch = raw.match(/(\d+)/)
  if (!numMatch) return raw
  const base = Number(numMatch[1])
  const adjusted = Math.max(0, Math.round(base * (multiplier || 1)) + (bonus || 0))
  return raw.replace(/\d+/, String(adjusted))
}

function getSpellDamageBonusExtras(damageType, spellDamageBonuses, formulaContext = {}) {
  if (!spellDamageBonuses?.length) return { flatBonus: 0, extraDice: [] }
  let flatBonus = 0
  const extraDice = []
  for (const b of spellDamageBonuses) {
    if (b.type && b.type !== damageType) continue
    if (b.flatBonus) flatBonus += Number(b.flatBonus) || 0
    if (b.extraDice) extraDice.push(b.extraDice)
  }
  return { flatBonus, extraDice }
}
