/**
 * 添加战斗手段 — 道具攻击表单
 */
import React from 'react'
import { inputClass } from '../../lib/inputStyles'
import GainEditor from './GainEditor'

export default function AddItemStep({
  itemIndex, setItemIndex, itemMeansFromInv,
  addGains, setAddGains, draftItemCm, draftItemIsSpell,
  buffStats, mergedBuffs, char, itemFormulaContext,
  editingCombatMeanId, onBack, onSave,
}) {
  return (
    <>
      <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑道具攻击' : '道具攻击'}</h3>
      <p className="text-dnd-text-muted text-xs mb-2">从背包中的消耗品（爆炸品）、法器（法杖/魔杖/权杖）或卷轴选择一项。</p>
      <div className="space-y-2.5 text-sm">
        <label className="block text-dnd-text-muted text-xs mb-0.5">道具</label>
        <select value={itemIndex ?? ''} onChange={(e) => setItemIndex(e.target.value === '' ? null : parseInt(e.target.value, 10))} className={inputClass + ' w-full h-8 text-xs'}>
          <option value="">—</option>
          {itemMeansFromInv.map((it) => <option key={it.index} value={it.index}>{it.label}</option>)}
        </select>
      </div>
      <GainEditor gains={addGains} onChange={setAddGains} cm={draftItemCm} buffStats={buffStats} mergedBuffs={mergedBuffs} character={char} formulaContext={itemFormulaContext} isSpellMean={draftItemIsSpell} />
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onBack} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
        <button type="button" onClick={onSave} disabled={itemIndex == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">{editingCombatMeanId ? '保存' : '确认'}</button>
      </div>
    </>
  )
}
