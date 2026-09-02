/**
 * 添加战斗手段 — 武器攻击表单（含额外伤害骰编辑器）
 */
import React from 'react'
import { Plus } from 'lucide-react'
import { inputClass } from '../../lib/inputStyles'
import { NumberStepper } from '../BuffForm'
import GainEditor from './GainEditor'
import {
  DAMAGE_TYPE_OPTIONS,
  getWeaponModeOptions, getAbilityOptions, inferPhysicalWeaponAbilityFromProto,
  parseWeaponAttack, getDefaultWeaponMode, getWeaponAttackStringForParsing,
  formatWeaponAttackDiceDisplay, formatSignedModifier, filterExtraDiceAgainstMain,
} from './combatMeanUtils'

export default function AddWeaponStep({
  weaponIndex, setWeaponIndex, weaponNameSuffix, setWeaponNameSuffix,
  ability, setAbility, damageType, setDamageType, weaponMode, setWeaponMode,
  weaponProficient, setWeaponProficient, targetCreatureType, setTargetCreatureType,
  weaponsFromInv, char, canEdit,
  addWeaponExtraDice, setAddWeaponExtraDice,
  showExtraDiceEditor, setShowExtraDiceEditor,
  extraCount, setExtraCount, extraSides, setExtraSides,
  extraFlatMod, setExtraFlatMod, extraType, setExtraType,
  previewWeaponStats, prof,
  addGains, setAddGains, draftWeaponCm, buffStats, mergedBuffs, itemFormulaContext,
  editingCombatMeanId, onBack, onSave,
}) {
  const currentWeapon = weaponIndex != null ? weaponsFromInv.find((x) => x.index === weaponIndex) : null

  const handleWeaponChange = (v) => {
    setWeaponIndex(v)
    const w = v != null ? weaponsFromInv.find((x) => x.index === v) : null
    if (w?.proto) {
      setAbility(inferPhysicalWeaponAbilityFromProto(w.proto))
      const parsed = parseWeaponAttack(w.攻击)
      const autoType = parsed.type && parsed.type !== '—' ? parsed.type : ''
      setDamageType(autoType)
      setWeaponMode(getDefaultWeaponMode(w))
    } else {
      setDamageType('')
      setWeaponMode('one_hand')
    }
  }

  return (
    <>
      <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑武器' : '武器攻击'}</h3>
      <div className="space-y-2.5 text-sm">
        <div>
          <label className="block text-dnd-text-muted text-xs mb-0.5">武器</label>
          <div className="flex items-center gap-1.5 w-full min-w-0 flex-nowrap">
            <select
              value={weaponIndex ?? ''}
              onChange={(e) => handleWeaponChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className={inputClass + ' h-8 text-xs shrink-0 max-w-[10rem]'}
              disabled={!canEdit}
              style={{ width: 'auto', minWidth: '6rem' }}
            >
              <option value="">—</option>
              {weaponsFromInv.map((w) => <option key={w.index} value={w.index}>{w.name}</option>)}
            </select>
            <input type="text" value={weaponNameSuffix} onChange={(e) => setWeaponNameSuffix(e.target.value)} placeholder="追加名称" className={inputClass + ' h-8 text-xs flex-1 min-w-0'} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0">
            <label className="block text-dnd-text-muted text-xs mb-0.5">战斗模式</label>
            {(() => {
              const modeOptions = getWeaponModeOptions(currentWeapon, char)
              const currentLabel = modeOptions.find((o) => o.value === weaponMode)?.label ?? modeOptions[0]?.label ?? ''
              if (modeOptions.length <= 1) return <div className={inputClass + ' w-full h-8 text-xs flex items-center text-white'}>{currentLabel || '—'}</div>
              return (
                <select value={weaponMode} onChange={(e) => setWeaponMode(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                  {modeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )
            })()}
          </div>
          <div className="min-w-0">
            <label className="block text-dnd-text-muted text-xs mb-0.5">属性</label>
            {(() => {
              const abilityOptions = getAbilityOptions(currentWeapon, ability)
              const currentLabel = abilityOptions.find((o) => o.value === ability)?.label ?? abilityOptions[0]?.label ?? ''
              if (abilityOptions.length <= 1) return <div className={inputClass + ' w-full h-8 text-xs flex items-center text-white'}>{currentLabel || '—'}</div>
              return (
                <select value={ability} onChange={(e) => setAbility(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                  {abilityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )
            })()}
          </div>
          <div className="min-w-0">
            <label className="block text-dnd-text-muted text-xs mb-0.5">伤害类型</label>
            <select value={damageType} onChange={(e) => setDamageType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
              <option value="">—</option>
              {DAMAGE_TYPE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={weaponProficient} onChange={(e) => setWeaponProficient(e.target.checked)} className="rounded border-gray-500" />
          <span className="text-dnd-text-body text-xs">武器熟练</span>
        </label>
        {previewWeaponStats && (
          <div className="rounded border border-gray-600/80 bg-gray-900/40 p-2 space-y-1.5">
            <div className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">实时预览</div>
            <div className="text-xs">
              <span className="text-dnd-text-muted">命中</span>{' '}
              <span className="text-white font-mono tabular-nums">{previewWeaponStats.physicalAttackBonus >= 0 ? '+' : ''}{previewWeaponStats.physicalAttackBonus}</span>
              <span className="text-dnd-text-muted text-[10px] ml-1">
                = 属性{previewWeaponStats.abilityMod >= 0 ? '+' : ''}{previewWeaponStats.abilityMod}
                {' '}· 熟练{previewWeaponStats.weaponProficient ? `+${prof}` : '+0'}
                {previewWeaponStats.buffAttackBonus !== 0 && ` · Buff${previewWeaponStats.buffAttackBonus >= 0 ? '+' : ''}${previewWeaponStats.buffAttackBonus}`}
                {previewWeaponStats.gainAttackBonus !== 0 && ` · 增益${previewWeaponStats.gainAttackBonus >= 0 ? '+' : ''}${previewWeaponStats.gainAttackBonus}`}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-dnd-text-muted">伤害</span>{' '}
              <span className="text-white font-mono tabular-nums">
                {formatWeaponAttackDiceDisplay(previewWeaponStats.attackParsed)}
                {formatSignedModifier(previewWeaponStats.totalDamageMod)} {previewWeaponStats.displayDamageType}
                {filterExtraDiceAgainstMain(previewWeaponStats.attackParsed, previewWeaponStats.rawDamageType, previewWeaponStats.weaponExtraDiceStrings).map((d) => ` + ${d}`).join('')}
              </span>
              <span className="text-dnd-text-muted text-[10px] ml-1">
                = 主骰 {formatWeaponAttackDiceDisplay(previewWeaponStats.attackParsed)}
                {previewWeaponStats.weaponExtraDiceStrings.length > 0 && ` · 额外 ${previewWeaponStats.weaponExtraDiceStrings.join(' ')}`}
                {previewWeaponStats.totalDamageMod !== 0 && ` · 加值${previewWeaponStats.totalDamageMod >= 0 ? '+' : ''}${previewWeaponStats.totalDamageMod}`}
              </span>
            </div>
          </div>
        )}
        {/* 额外伤害骰 */}
        <div className="w-full border-t border-gray-600/80 pt-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">额外伤害骰（可选）</label>
            {!showExtraDiceEditor && (
              <button type="button" onClick={() => setShowExtraDiceEditor(true)} className="flex shrink-0 items-center gap-0.5 rounded border border-dashed border-dnd-gold/50 px-2 py-0.5 text-[10px] font-medium text-dnd-gold-light hover:bg-dnd-gold/15">
                <Plus className="h-3 w-3" />
                添加
              </button>
            )}
          </div>
          {addWeaponExtraDice.length > 0 && (
            <ul className="mb-1.5 space-y-1">
              {addWeaponExtraDice.map((d, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="font-mono text-white">{d}</span>
                  <button type="button" onClick={() => setAddWeaponExtraDice((arr) => arr.filter((_, j) => j !== i))} className="shrink-0 rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-600">移除</button>
                </li>
              ))}
            </ul>
          )}
          {showExtraDiceEditor && (
            <div className="space-y-2 rounded border border-gray-600 bg-gray-700/30 p-2">
              <p className="text-[10px] leading-snug text-dnd-text-muted">设置数量、骰面、加值与伤害类型后，点击「加入列表」；可多次添加。</p>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
                <div className="flex min-w-0 flex-nowrap items-center gap-1">
                  <NumberStepper className="!w-[4.5rem] !min-w-0 !px-3" value={extraCount} onChange={(v) => setExtraCount(Math.max(1, v))} min={1} max={99} compact narrow />
                  <select value={extraSides} onChange={(e) => setExtraSides(Number(e.target.value))} className={inputClass + ' h-8 w-[3.5rem] shrink-0 px-1 text-xs text-center'} title="骰面">
                    <option value={4}>d4</option>
                    <option value={6}>d6</option>
                    <option value={8}>d8</option>
                    <option value={10}>d10</option>
                    <option value={12}>d12</option>
                  </select>
                  <span className="shrink-0 px-0.5 text-xs text-dnd-text-muted">+</span>
                  <NumberStepper className="!w-[4.5rem] !min-w-0 !px-3" value={extraFlatMod} onChange={setExtraFlatMod} min={-99} max={99} compact narrow />
                </div>
                <select value={extraType} onChange={(e) => setExtraType(e.target.value)} className={inputClass + ' h-8 min-w-0 flex-1 text-xs'} title="伤害类型">
                  {DAMAGE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setShowExtraDiceEditor(false)} className="rounded border border-gray-500 px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-700">取消</button>
                <button
                  type="button"
                  onClick={() => {
                    const c = Math.max(1, Number(extraCount) || 1)
                    const s = Number(extraSides) || 6
                    const fm = Number(extraFlatMod) || 0
                    let body = `${c}d${s}`
                    if (fm !== 0) body += fm > 0 ? `+${fm}` : `${fm}`
                    setAddWeaponExtraDice((arr) => [...arr, `${body} ${extraType}`])
                    setExtraFlatMod(0)
                    setShowExtraDiceEditor(false)
                  }}
                  className="rounded bg-dnd-red px-2 py-1 text-[10px] font-medium text-white hover:bg-dnd-red-hover"
                >
                  加入列表
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <GainEditor gains={addGains} onChange={setAddGains} cm={draftWeaponCm} buffStats={buffStats} mergedBuffs={mergedBuffs} character={char} formulaContext={itemFormulaContext} isSpellMean={false} />
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onBack} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
        <button type="button" onClick={onSave} disabled={weaponIndex == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">{editingCombatMeanId ? '保存' : '确认'}</button>
      </div>
    </>
  )
}
