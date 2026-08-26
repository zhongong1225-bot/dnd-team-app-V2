/**
 * 道具攻击卡片（爆炸品 / 卷轴 / 法器）
 * 接收原始数据 + 共享上下文，内部计算并渲染三种道具的使用信息
 */
import React from 'react'
import { Pencil, Trash2, Dices } from 'lucide-react'
import { getDamageTypeLabel } from '../../data/buffTypes'
import { parseCombatDiceExpression } from '../../data/weaponDatabase'
import { getItemById } from '../../data/itemDatabase'
import { getWandScrollSpellPower } from '../../data/spellDatabase'
import { extractContainedSpellValueFromEntry, normalizeContainedSpellValue } from '../../lib/containedSpellModel'

const COMBAT_MEAN_ROW_GRID =
  'grid grid-cols-[repeat(24,minmax(0,1fr))] items-center gap-x-1 w-full min-w-0 overflow-hidden'
const COMBAT_LIST_ROW_SHADOW = 'shadow-[0_2px_10px_rgba(0,0,0,0.42)]'
const CM_MEAN_LABEL = 'text-xs'
const CM_MEAN_HI = 'text-sm'
const CM_BTN_GOLD =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-dnd-gold-light transition-colors hover:text-dnd-gold'
const CM_BTN_RED =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-dnd-red/90 transition-colors hover:text-dnd-red'
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
  spell_attack: '法术攻击', none: '无',
}

const inputClass = 'rounded border border-gray-600 bg-gray-700 text-white focus:outline-none focus:border-dnd-gold-light'

function compactDiceExpression(expr) {
  return String(expr || '').trim().replace(/\s+/g, ' ')
}
function formatSignedModifier(n) {
  if (!n || n === 0) return ''
  return n > 0 ? `+${n}` : String(n)
}

/* ── 法器法术伤害加成计算 ── */
function getSpellDamageBonusExtras(damageType, spellDamageBonuses, formulaContext = {}) {
  if (!spellDamageBonuses?.length) return { flatBonus: 0, extraDice: [] }
  let flatBonus = 0
  const extraDice = []
  for (const b of spellDamageBonuses) {
    if (b.damageType && b.damageType !== damageType) continue
    if (b.flat) flatBonus += Number(b.flat) || 0
    if (b.extraDice) extraDice.push(b.extraDice)
  }
  return { flatBonus, extraDice }
}

function getEntrySpellPowerBonus(entry, char, context) {
  if (!entry) return { atk: 0, dc: 0 }
  let atk = 0, dc = 0
  const buffs = entry.附魔效果 || entry.buffs || []
  for (const e of buffs) {
    if (e.type !== 'spell_attack_bonus' && e.type !== 'spell_dc_bonus') continue
    const raw = e.value && typeof e.value === 'object' && 'val' in e.value ? e.value.val : e.value
    const val = context.abilities ? (typeof raw === 'number' ? raw : 0) : 0
    if (e.type === 'spell_attack_bonus') atk += val
    else dc += val
  }
  return { atk, dc }
}

/* ══════════════════════════════════════════════════
   爆炸品子组件
   ══════════════════════════════════════════════════ */
function ExplosiveItemCard({ itemMeanOpt, currentQty, damageText, rangeDisplay, explosionRadius, canEdit, removeCombatMean, meanId, setExplosiveUsePending, gainDamageBonus, gainPerDieBonus, gainExtraDice, gains, renderAutoGainBadges, openEditItemMean, cm }) {
  return (
    <>
      <div className="col-span-4 pl-2 border-l border-gray-600 flex min-w-0 flex-col gap-0.5 overflow-hidden sm:flex-row sm:items-center sm:gap-x-3">
        <span className="flex min-w-0 items-center gap-x-1">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>抛距</span>
          <span className={`text-white ${CM_MEAN_HI} truncate`}>{rangeDisplay || '—'}{rangeDisplay && /^\d+$/.test(String(rangeDisplay).trim()) ? '尺' : ''}</span>
        </span>
        <span className="flex min-w-0 items-center gap-x-1">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>爆炸半径</span>
          <span className={`text-white ${CM_MEAN_HI} truncate`}>{explosionRadius != null ? `${explosionRadius}尺` : '—'}</span>
        </span>
      </div>
      <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden col-span-4">
        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>命中</span>
        <span className={`text-white ${CM_MEAN_HI} truncate`}>—</span>
      </div>
      <div className="col-span-10 pl-2 border-l border-gray-600 flex flex-wrap items-center gap-x-1 gap-y-1">
        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
        <span className={`text-white font-mono ${CM_MEAN_HI} truncate whitespace-nowrap min-w-0`}>{damageText}</span>
        {renderAutoGainBadges(gains, () => openEditItemMean(cm))}
        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>数量</span>
        <span className={`text-white ${CM_MEAN_HI} tabular-nums`}>{currentQty}</span>
        {itemMeanOpt.dice && currentQty > 0 && (
          <button type="button" onClick={() => setExplosiveUsePending({ inventoryIndex: itemMeanOpt.index, name: itemMeanOpt.name, diceExpr: itemMeanOpt.dice, damageType: itemMeanOpt.damageType, gains: getEnabledGainsFromMean(cm) })} className={CM_BTN_GOLD} title={quickRollTitle('投掷伤害（使用后扣 1 数量）')} aria-label={quickRollTitle('投掷伤害（使用后扣 1 数量）')}>
            <QuickRollIcon />
          </button>
        )}
      </div>
      <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
        {canEdit && (
          <button type="button" onClick={() => removeCombatMean(meanId)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════
   卷子组件
   ══════════════════════════════════════════════════ */
function ScrollItemCard({ currentQty, canEdit, useScroll, itemIndex, removeCombatMean, meanId }) {
  return (
    <>
      <div className="col-span-[16] pl-2 border-l border-gray-600 min-h-7 min-w-0" aria-hidden />
      <div className="col-span-2 pl-2 border-l border-gray-600 flex items-center gap-x-1 justify-center">
        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>数量</span>
        <span className={`text-white ${CM_MEAN_HI} tabular-nums`}>{currentQty}张</span>
      </div>
      <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
        {currentQty > 0 && (
          <button type="button" onClick={() => useScroll(itemIndex)} className={CM_BTN_RED} title={quickRollTitle('使用卷轴（消耗 1 张）')} aria-label={quickRollTitle('使用卷轴（消耗 1 张）')}>
            <QuickRollIcon />
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={() => removeCombatMean(meanId)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════
   法器/魔杖子组件
   ══════════════════════════════════════════════════ */
function FocusItemCard({ itemMeanOpt, currentCharge, chargeMax, spellRange, hitText, damageText, hasSpells, spells, selectedIdx, canCast, canEdit, focusSpellMap, setFocusSpellMap, setFocusUsePending, removeCombatMean, meanId, openEditItemMean, cm, gains, renderAutoGainBadges, selectedSub }) {
  const cell = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'

  return (
    <>
      <div className={`${cell} col-span-4`}>
        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>距离</span>
        <span className={`text-white ${CM_MEAN_HI} truncate`}>{spellRange}</span>
      </div>
      <div className={`${cell} col-span-4`}>
        <span className={`text-white ${CM_MEAN_HI} truncate`}>{hitText || '—'}</span>
      </div>
      <div className={`${cell} col-span-10 flex flex-wrap items-center gap-x-1 gap-y-1`}>
        {hasSpells && spells.length > 1 && (
          <>
            <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>法术</span>
            <select
              value={selectedIdx >= 0 ? selectedIdx : 0}
              onChange={(e) => {
                const idx = Number(e.target.value)
                const sub = spells[idx]
                if (sub) {
                  setFocusSpellMap((prev) => ({ ...prev, [itemMeanOpt.index]: sub }))
                }
              }}
              className={inputClass + ' !text-xs h-6 py-0 px-1 min-w-0 flex-1 max-w-[140px] bg-gray-800'}
              title="选择要使用的内含法术"
            >
              {spells.map((s, idx) => (
                <option key={idx} value={idx}>
                  {s.spellName?.trim() || '未命名'} · {s.level || 0}环
                </option>
              ))}
            </select>
          </>
        )}
        {hasSpells && spells.length === 1 && (
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>
            {spells[0].spellName?.trim() || '内含法术'} · {spells[0].level || 0}环
          </span>
        )}
        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
        <span className={`text-white font-mono ${CM_MEAN_HI} truncate whitespace-nowrap min-w-0`}>{damageText}</span>
        {renderAutoGainBadges(gains, () => openEditItemMean(cm))}
        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>充能</span>
        <span className={`text-white font-mono ${CM_MEAN_HI} tabular-nums`}>{currentCharge}/{chargeMax}</span>
        {canCast && (
          <button type="button" onClick={() => setFocusUsePending({ inventoryIndex: itemMeanOpt.index, name: itemMeanOpt.name, combatMeanId: meanId, spellSub: selectedSub, gains: getEnabledGainsFromMean(cm), spellDamageExtras: selectedSub?._damageExtras || { flatBonus: 0, extraDice: [] }, damageFloor2: selectedSub?._diceFloor2 || false })} className={CM_BTN_RED} title={quickRollTitle(`法器投掷（确认后扣 ${selectedSub?.cost || 1} 充能）`)} aria-label={quickRollTitle(`法器投掷（确认后扣 ${selectedSub?.cost || 1} 充能）`)}>
            <QuickRollIcon />
          </button>
        )}
      </div>
      <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
        {canEdit && (
          <button type="button" onClick={() => removeCombatMean(meanId)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </>
  )
}

/* ── 辅助：从 cm 获取启用的增益 ── */
function getEnabledGainsFromMean(cm) {
  return Array.isArray(cm?.gains) ? cm.gains.filter((g) => g && g.enabled !== false) : []
}

/* ══════════════════════════════════════════════════
   主组件
   ══════════════════════════════════════════════════ */
export default function ItemUseCard({ displayMean, itemMeanOpt, ctx }) {
  if (!itemMeanOpt) return null

  const {
    char, canEdit, gains,
    gainAttackBonus, gainDamageBonus, gainPerDieBonus, gainExtraDice, gainDiceFloor2,
    spellAttackBonus, spellDC, buffStats, effectiveAbilities, prof,
    itemFormulaContext, focusSpellMap,
    openEditItemMean, removeCombatMean,
    setExplosiveUsePending, useScroll, setFocusUsePending, setFocusSpellMap,
    renderAutoGainBadges,
  } = ctx

  const cm = displayMean
  const currentEntry = char?.inventory?.[cm.itemInventoryIndex]
  const currentQty = currentEntry != null ? Math.max(0, Number(currentEntry.qty) ?? 1) : 0
  const currentCharge = currentEntry != null ? Math.max(0, Number(currentEntry.charge) ?? 0) : 0

  if (itemMeanOpt.kind === 'explosive') {
    /* ── 爆炸品计算 ── */
    const explosiveDiceCount = (() => { const p = parseCombatDiceExpression((itemMeanOpt.dice || '').trim()); return p ? p.count : 0 })()
    const explosiveDamageMod = gainDamageBonus + gainPerDieBonus * explosiveDiceCount
    const compactedGainExtraDice = gainExtraDice.map(compactDiceExpression)
    const explosiveExtraText = compactedGainExtraDice.length ? (' + ' + compactedGainExtraDice.join(' + ')) : ''
    const explosiveModText = (explosiveDamageMod !== 0 && itemMeanOpt.dice) ? ` ${formatSignedModifier(explosiveDamageMod)}` : ''
    const damageText = itemMeanOpt.dice
      ? compactDiceExpression(`${(itemMeanOpt.dice || '').toUpperCase()} ${itemMeanOpt.damageType || ''}`.trim()) + explosiveExtraText + explosiveModText
      : (compactedGainExtraDice.length ? compactedGainExtraDice.join(' + ') : '—')
    const rangeDisplay = itemMeanOpt.攻击距离 || '—'
    const explosionRadius = itemMeanOpt.爆炸半径

    return (
      <div className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}>
        <div className={COMBAT_MEAN_ROW_GRID}>
          <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
            <ActionLabelBadge source="1 动作" />
            <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{itemMeanOpt.name}</span>
          </div>
          <ExplosiveItemCard
            itemMeanOpt={itemMeanOpt}
            currentQty={currentQty}
            damageText={damageText}
            rangeDisplay={rangeDisplay}
            explosionRadius={explosionRadius}
            canEdit={canEdit}
            removeCombatMean={removeCombatMean}
            meanId={cm.id}
            setExplosiveUsePending={setExplosiveUsePending}
            gainDamageBonus={gainDamageBonus}
            gainPerDieBonus={gainPerDieBonus}
            gainExtraDice={gainExtraDice}
            gains={gains}
            renderAutoGainBadges={renderAutoGainBadges}
            openEditItemMean={openEditItemMean}
            cm={cm}
          />
        </div>
      </div>
    )
  }

  if (itemMeanOpt.kind === 'scroll') {
    return (
      <div className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}>
        <div className={COMBAT_MEAN_ROW_GRID}>
          <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
            <ActionLabelBadge source="1 动作" />
            <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{itemMeanOpt.name}</span>
          </div>
          <ScrollItemCard
            currentQty={currentQty}
            canEdit={canEdit}
            useScroll={useScroll}
            itemIndex={itemMeanOpt.index}
            removeCombatMean={removeCombatMean}
            meanId={cm.id}
          />
        </div>
      </div>
    )
  }

  /* ── 法器/魔杖计算 ── */
  const containedSpellRaw = extractContainedSpellValueFromEntry(currentEntry)
  const cs = normalizeContainedSpellValue(containedSpellRaw, currentEntry?.charge)
  const chargeMaxRaw = itemMeanOpt.chargeMax || currentEntry?.chargeMax || cs?.totalCharges || 0
  const chargeMax = chargeMaxRaw > 0 ? chargeMaxRaw : (currentCharge > 0 ? currentCharge : 0)
  const hasSpells = cs.spells.length > 0
  const selectedSub = hasSpells
    ? (cs.spells.find((s) => {
        const sel = focusSpellMap[cm.itemInventoryIndex]
        if (!sel) return false
        return (sel.spellId && sel.spellId === s.spellId && sel.spellName === s.spellName) ||
          (!sel.spellId && sel.spellName === s.spellName)
      }) || cs.spells.find((s) => (s.cost || 1) <= currentCharge) || cs.spells[0])
    : null
  const level = Math.max(0, Math.min(9, Number(selectedSub?.level) ?? 0))
  const itemProto = currentEntry?.itemId ? getItemById(currentEntry.itemId) : null
  const useWandScrollTable = !!(itemProto && (/魔杖|卷轴/.test(itemProto.类别 || '') || itemProto.子类型 === '卷轴'))
  const basePower = useWandScrollTable ? getWandScrollSpellPower(level) : null
  const evalContext = { abilities: effectiveAbilities, level, prof, spellDC, spellAttack: spellAttackBonus }
  const entrySpellBonus = getEntrySpellPowerBonus(currentEntry, char, evalContext)
  const focusSpellAttackForMean = basePower
    ? basePower.attackBonus + entrySpellBonus.atk + gainAttackBonus
    : (spellAttackBonus != null ? spellAttackBonus + entrySpellBonus.atk + gainAttackBonus : null)
  const focusDcForMean = basePower
    ? basePower.dc + entrySpellBonus.dc
    : (spellDC != null ? spellDC + entrySpellBonus.dc : null)
  const hitRes = selectedSub?.hitResolution && (HIT_RESOLUTION_LABELS[selectedSub.hitResolution] || selectedSub.hitResolution === 'none') ? selectedSub.hitResolution : 'dex_save'
  const hitLabel = HIT_RESOLUTION_LABELS[hitRes]
  const hitText = hitRes === 'none'
    ? ((selectedSub?.range || '').trim() || '—')
    : hitRes === 'spell_attack'
      ? `${hitLabel} ${focusSpellAttackForMean != null ? (focusSpellAttackForMean >= 0 ? '+' : '') + focusSpellAttackForMean : '—'}`
      : `${hitLabel} DC ${focusDcForMean != null ? focusDcForMean : '—'}`
  const dCount = Math.max(0, Number(selectedSub?.damageDiceCount) ?? 0)
  const dSides = Math.max(1, Number(selectedSub?.damageDiceSides) ?? 6)
  const damageDiceText = dCount > 0 ? `${dCount}d${dSides}` : ''
  const damageTypeLabel = selectedSub?.damageType ? getDamageTypeLabel(selectedSub.damageType) : ''
  const focusSpellDamageExtras = getSpellDamageBonusExtras(selectedSub?.damageType, buffStats?.spellDamageBonuses, itemFormulaContext)
  const focusDamageMod = gainDamageBonus + gainPerDieBonus * dCount + focusSpellDamageExtras.flatBonus
  const focusAllExtraDice = [...gainExtraDice, ...focusSpellDamageExtras.extraDice]
  const compactedFocusExtraDice = focusAllExtraDice.map(compactDiceExpression)
  const focusExtraText = compactedFocusExtraDice.length ? (' + ' + compactedFocusExtraDice.join(' + ')) : ''
  const focusModText = (focusDamageMod !== 0 && damageDiceText) ? ` ${formatSignedModifier(focusDamageMod)}` : ''
  const damageText = damageDiceText
    ? compactDiceExpression((damageTypeLabel ? `${damageDiceText} ${damageTypeLabel}` : damageDiceText).trim()) + focusExtraText + focusModText
    : (compactedFocusExtraDice.length ? compactedFocusExtraDice.join(' + ') : '—')
  const spellRange = (selectedSub?.range != null && String(selectedSub.range).trim() !== '') ? (String(selectedSub.range).trim() + (/^\d+$/.test(String(selectedSub.range).trim()) ? '尺' : '')) : '—'
  const selectedIdx = selectedSub ? cs.spells.indexOf(selectedSub) : -1
  const canCast = currentCharge > 0 && selectedSub && (selectedSub.cost || 1) <= currentCharge

  // 将计算结果附加到 selectedSub 以便 FocusItemCard 回调使用
  const selectedSubWithExtras = selectedSub ? { ...selectedSub, _damageExtras: focusSpellDamageExtras, _diceFloor2: gainDiceFloor2 } : null

  return (
    <div className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}>
      <div className={COMBAT_MEAN_ROW_GRID}>
        <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
          <ActionLabelBadge source="1 动作" />
          <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{itemMeanOpt.name}</span>
          {canEdit && (
            <button type="button" onClick={() => openEditItemMean(cm)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title="编辑道具攻击">
              <Pencil size={12} />
            </button>
          )}
        </div>
        <FocusItemCard
          itemMeanOpt={itemMeanOpt}
          currentCharge={currentCharge}
          chargeMax={chargeMax}
          spellRange={spellRange}
          hitText={hitText}
          damageText={damageText}
          hasSpells={hasSpells}
          spells={cs.spells}
          selectedIdx={selectedIdx}
          canCast={canCast}
          canEdit={canEdit}
          focusSpellMap={focusSpellMap}
          setFocusSpellMap={setFocusSpellMap}
          setFocusUsePending={setFocusUsePending}
          removeCombatMean={removeCombatMean}
          meanId={cm.id}
          openEditItemMean={openEditItemMean}
          cm={cm}
          gains={gains}
          renderAutoGainBadges={renderAutoGainBadges}
          selectedSub={selectedSubWithExtras}
        />
      </div>
    </div>
  )
}
