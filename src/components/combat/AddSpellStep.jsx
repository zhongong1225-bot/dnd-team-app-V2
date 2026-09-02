/**
 * 添加战斗手段 — 法术攻击表单
 */
import React from 'react'
import { inputClass } from '../../lib/inputStyles'
import { getMergedSpells } from '../../data/spellDatabase'
import GainEditor from './GainEditor'
import {
  DAMAGE_TYPE_OPTIONS, HIT_RESOLUTION_LABELS,
  spellUsesAttack, inferSaveFromSpellDescription, parseSpellDamageFromDescription,
} from './combatMeanUtils'

export default function AddSpellStep({
  spellName, setSpellName, spellId, setSpellId,
  hitResolution, setHitResolution, dice, setDice,
  damageType, setDamageType, spellLevel, setSpellLevel,
  addGains, setAddGains, draftSpellCm, buffStats, mergedBuffs, char, itemFormulaContext,
  editingCombatMeanId, onBack, onSave,
}) {
  const handleNameChange = (name) => {
    setSpellName(name)
    if (!name.trim()) { setSpellId(''); return }
    const spell = getMergedSpells().find((s) => s.name && s.name.trim() === name.trim())
    if (spell) {
      setSpellId(spell.id)
      const lvl = Number(spell.level)
      setSpellLevel(lvl >= 0 && lvl <= 9 ? String(lvl) : '')
      if (spell.description) {
        if (spellUsesAttack(spell.description)) {
          setHitResolution('spell_attack')
        } else {
          const inferredSave = inferSaveFromSpellDescription(spell.description)
          if (inferredSave !== 'spell_attack') setHitResolution(inferredSave)
        }
      }
      const damages = parseSpellDamageFromDescription(spell.description ?? '')
      const first = damages[0]
      if (first) { setDice(first.dice || ''); setDamageType(first.type || '') }
    } else {
      setSpellId('')
    }
  }

  return (
    <>
      <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑法术' : '法术攻击'}</h3>
      <p className="text-dnd-text-muted text-xs mb-2">输入法术名查找并选择，设置命中判定与伤害。</p>
      <div className="space-y-2.5 text-sm">
        <div>
          <label className="block text-dnd-text-muted text-xs mb-0.5">法术名</label>
          <input
            type="text" value={spellName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="输入以查找"
            className={inputClass + ' w-full h-8 text-xs'}
            list="spell-attack-spell-list"
          />
          <datalist id="spell-attack-spell-list">
            {getMergedSpells()
              .filter((s) => !spellName.trim() || (s.name && s.name.toLowerCase().includes(spellName.trim().toLowerCase())))
              .slice(0, 80)
              .map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-0.5">命中判定</label>
          <select value={hitResolution} onChange={(e) => setHitResolution(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
            {Object.entries(HIT_RESOLUTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-0.5">伤害骰</label>
          <input type="text" value={dice} onChange={(e) => setDice(e.target.value)} placeholder="如 2d6" className={inputClass + ' w-full h-8 text-xs font-mono'} />
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-0.5">伤害类型</label>
          <select value={damageType} onChange={(e) => setDamageType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
            <option value="">—</option>
            {DAMAGE_TYPE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-dnd-text-muted text-xs mb-0.5">法术位环阶（自动扣减）</label>
          <select value={spellLevel} onChange={(e) => setSpellLevel(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
            <option value="">不扣法术位</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => <option key={lvl} value={String(lvl)}>{lvl} 环</option>)}
          </select>
        </div>
      </div>
      <GainEditor gains={addGains} onChange={setAddGains} cm={draftSpellCm} buffStats={buffStats} mergedBuffs={mergedBuffs} character={char} formulaContext={itemFormulaContext} isSpellMean />
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onBack} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
        <button type="button" onClick={onSave} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-xs">保存</button>
      </div>
    </>
  )
}
