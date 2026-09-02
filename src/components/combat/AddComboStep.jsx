/**
 * 添加战斗手段 — 组合技表单
 */
import React from 'react'
import { Plus } from 'lucide-react'
import { inputClass } from '../../lib/inputStyles'
import { MARTIAL_TECHNIQUES, getMartialTechniqueById } from '../../data/martialTechniques'
import GainEditor from './GainEditor'
import {
  DAMAGE_TYPE_OPTIONS, COMBO_ATTACHMENT_SOURCE_TYPES, COMBO_CLASS_FEATURE_OPTIONS,
  getCombatMeanLabel, inferDamageDiceFromText, parseWeaponAttack, getWeaponAttackStringForParsing,
} from './combatMeanUtils'

export default function AddComboStep({
  primaryId, setPrimaryId, attachments, setAttachments,
  nonComboCombatMeans, weaponsFromInv, itemMeansFromInv, combatMeans,
  addGains, setAddGains, buffStats, mergedBuffs, char, itemFormulaContext,
  editingCombatMeanId, onBack, onSave,
}) {
  const updateAttachment = (idx, patch) => setAttachments((arr) => arr.map((x, i) => i === idx ? { ...x, ...patch } : x))
  const removeAttachment = (idx) => setAttachments((arr) => arr.filter((_, i) => i !== idx))
  const addAttachment = () => setAttachments((arr) => [...arr, {
    id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: '', damageDice: '', damageType: '', sourceType: 'custom', sourceId: '',
  }])

  const resolveSource = (a, nextType, nextId) => {
    const base = { ...a, sourceType: nextType, sourceId: nextId || '' }
    if (nextType === 'combatMean') {
      const mean = nonComboCombatMeans.find((m) => m.id === nextId)
      if (mean) {
        if (mean.type === 'physical') {
          const w = weaponsFromInv.find((x) => x.index === mean.weaponInventoryIndex)
          const suffix = mean.weaponNameSuffix ? String(mean.weaponNameSuffix).trim() : ''
          const parsed = w ? parseWeaponAttack(getWeaponAttackStringForParsing(w, mean.weaponVersatileMode)) : null
          base.name = (w ? w.name : '武器') + (suffix ? ` ${suffix}` : '')
          base.damageDice = parsed?.dice || ''
          base.damageType = mean.damageType || parsed?.type || ''
        } else if (mean.type === 'spell_attack') {
          base.name = mean.spellName || '法术'
          base.damageDice = mean.damageDice || ''
          base.damageType = mean.damageTypeSpell || ''
        } else if (mean.type === 'item') {
          const it = itemMeansFromInv.find((x) => x.index === mean.itemInventoryIndex)
          base.name = it ? it.name : '道具'
          base.damageDice = it?.dice || ''
          base.damageType = it?.damageType || ''
        }
      }
    } else if (nextType === 'martialTechnique') {
      const tech = getMartialTechniqueById(nextId)
      if (tech) { base.name = tech.name; base.damageDice = inferDamageDiceFromText(tech.description); base.damageType = '' }
    } else if (nextType === 'classFeature') {
      const feat = COMBO_CLASS_FEATURE_OPTIONS.find((f) => f.id === nextId)
      if (feat) { base.name = feat.name; base.damageDice = feat.defaultDamageDice; base.damageType = '' }
    }
    return base
  }

  const primaryMean = combatMeans.find((m) => m.id === primaryId)
  const isSpellPrimary = primaryMean && primaryMean.type === 'spell_attack'

  return (
    <>
      <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑组合技' : '组合技'}</h3>
      <p className="text-dnd-text-muted text-xs mb-2">选择一个主战斗手段，并为其添加多个附加伤害组件。</p>
      <div className="space-y-2.5 text-sm">
        <div>
          <label className="block text-dnd-text-muted text-xs mb-0.5">主手段</label>
          <select value={primaryId ?? ''} onChange={(e) => setPrimaryId(e.target.value === '' ? null : e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
            <option value="">—</option>
            {nonComboCombatMeans.map((m) => <option key={m.id} value={m.id}>{getCombatMeanLabel(m, { weaponsFromInv, itemMeansFromInv })}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-dnd-text-muted text-xs">附加伤害</label>
            <button type="button" onClick={addAttachment} className="flex shrink-0 items-center gap-0.5 rounded border border-dashed border-dnd-gold/50 px-2 py-0.5 text-[10px] font-medium text-dnd-gold-light hover:bg-dnd-gold/15">
              <Plus className="h-3 w-3" />
              添加
            </button>
          </div>
          {attachments.length === 0 && <p className="text-dnd-text-muted text-[10px]">暂无附加伤害。</p>}
          <div className="space-y-1.5">
            {attachments.map((a, idx) => {
              const sourceType = a.sourceType || 'custom'
              return (
                <div key={a.id || idx} className="rounded border border-gray-600 bg-gray-700/30 p-1.5 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={sourceType}
                      onChange={(e) => updateAttachment(idx, resolveSource(a, e.target.value, ''))}
                      className={inputClass + ' h-7 text-xs shrink-0'}
                    >
                      {COMBO_ATTACHMENT_SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {sourceType === 'combatMean' && (
                      <select
                        value={a.sourceId || ''}
                        onChange={(e) => updateAttachment(idx, resolveSource(a, 'combatMean', e.target.value))}
                        className={inputClass + ' flex-1 min-w-0 h-7 text-xs'}
                      >
                        <option value="">—</option>
                        {nonComboCombatMeans.filter((m) => m.id !== editingCombatMeanId).map((m) => <option key={m.id} value={m.id}>{getCombatMeanLabel(m, { weaponsFromInv, itemMeansFromInv })}</option>)}
                      </select>
                    )}
                    {sourceType === 'martialTechnique' && (
                      <select
                        value={a.sourceId || ''}
                        onChange={(e) => updateAttachment(idx, resolveSource(a, 'martialTechnique', e.target.value))}
                        className={inputClass + ' flex-1 min-w-0 h-7 text-xs'}
                      >
                        <option value="">—</option>
                        {MARTIAL_TECHNIQUES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                    {sourceType === 'classFeature' && (
                      <select
                        value={a.sourceId || ''}
                        onChange={(e) => updateAttachment(idx, resolveSource(a, 'classFeature', e.target.value))}
                        className={inputClass + ' flex-1 min-w-0 h-7 text-xs'}
                      >
                        <option value="">—</option>
                        {COMBO_CLASS_FEATURE_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => removeAttachment(idx)} className="shrink-0 rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-600">移除</button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="text" value={a.name || ''} onChange={(e) => updateAttachment(idx, { name: e.target.value })} placeholder="名称" className={inputClass + ' flex-1 min-w-0 h-7 text-xs'} />
                    <input type="text" value={a.damageDice || ''} onChange={(e) => updateAttachment(idx, { damageDice: e.target.value })} placeholder="如 1d6" className={inputClass + ' w-16 h-7 text-xs font-mono'} />
                    <select value={a.damageType || ''} onChange={(e) => updateAttachment(idx, { damageType: e.target.value })} className={inputClass + ' w-20 h-7 text-xs'}>
                      <option value="">类型</option>
                      {DAMAGE_TYPE_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <GainEditor gains={addGains} onChange={setAddGains} cm={primaryMean || {}} buffStats={buffStats} mergedBuffs={mergedBuffs} character={char} formulaContext={itemFormulaContext} isSpellMean={!!isSpellPrimary} />
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onBack} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
        <button type="button" onClick={onSave} disabled={primaryId == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">{editingCombatMeanId ? '保存' : '确认'}</button>
      </div>
    </>
  )
}
