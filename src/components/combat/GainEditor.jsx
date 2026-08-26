/**
 * 战斗手段增益编辑器 — 从 CombatStatus.jsx 抽出
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { inputClass } from '../../lib/inputStyles'
import { NumberStepper } from '../BuffForm'
import { GAIN_TYPES, buildDefaultGainsFromBuffs, mergeAutoGains, gainsContentEqual } from './combatMeanUtils'

export default function GainEditor({ gains, onChange, cm, buffStats, mergedBuffs, character, formulaContext, isSpellMean = false }) {
  const [addingType, setAddingType] = useState(null)
  const items = Array.isArray(gains) ? gains : []
  const makeId = () => 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)

  const autoGains = useMemo(
    () => buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, isSpellMean, character, formulaContext),
    [cm, buffStats, mergedBuffs, isSpellMean, character, formulaContext]
  )

  useEffect(() => {
    const next = mergeAutoGains(items, autoGains)
    if (!gainsContentEqual(items, next)) {
      onChange(next)
    }
  }, [autoGains])

  const updateItem = (id, patch) => onChange(items.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  const removeItem = (id) => onChange(items.filter((g) => g.id !== id))
  const addItem = (type) => {
    const base = { id: makeId(), type, enabled: true }
    let payload = base
    switch (type) {
      case 'extraDice': payload = { ...base, dice: '1d6' }; break
      case 'damageBonus': case 'attackBonus': case 'perDieBonus': payload = { ...base, value: 1 }; break
      case 'advantage': payload = { ...base, advantage: 'advantage' }; break
      default: break
    }
    onChange([...items, payload])
    setAddingType(null)
  }

  return (
    <div className="w-full border-t border-gray-600/80 pt-2 space-y-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">增益</label>
        <div className="flex items-center gap-1.5">
          {addingType !== null ? (
            <select
              value={addingType}
              onChange={(e) => { const t = e.target.value; if (t) addItem(t) }}
              className={`${inputClass} h-7 text-[10px] py-0 px-1 min-w-[6rem]`}
              autoFocus
            >
              <option value="">选择增益类型</option>
              {GAIN_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setAddingType('')}
              className="flex shrink-0 items-center gap-0.5 rounded border border-dashed border-dnd-gold/50 px-2 py-0.5 text-[10px] font-medium text-dnd-gold-light hover:bg-dnd-gold/15"
            >
              <Plus className="h-3 w-3" />
              增加增益
            </button>
          )}
        </div>
      </div>
      {items.length === 0 && <p className="text-dnd-text-muted text-[10px]">暂无增益，点击「增加增益」添加。</p>}
      <div className="space-y-1.5">
        {items.map((g) => {
          const typeLabel = GAIN_TYPES.find((t) => t.key === g.type)?.label || g.type
          return (
            <div key={g.id} className={`flex items-center gap-1.5 rounded border border-gray-600 bg-gray-700/30 p-1.5 text-xs ${g.enabled === false ? 'opacity-60' : ''}`}>
              <input
                type="checkbox"
                checked={g.enabled !== false}
                onChange={(e) => updateItem(g.id, { enabled: e.target.checked })}
                className="rounded border-gray-500 shrink-0"
                title={g.enabled === false ? '已禁用' : '已启用'}
              />
              <span className="shrink-0 text-dnd-text-muted w-20 truncate" title={typeLabel}>{typeLabel}</span>
              <div className="flex-1 min-w-0">
                {g.auto ? (
                  <span className="inline-flex h-7 items-center text-xs text-dnd-text-muted">
                    {g.type === 'extraDice' && (g.dice || '—')}
                    {(g.type === 'damageBonus' || g.type === 'attackBonus' || g.type === 'perDieBonus') && <>{Number(g.value) > 0 ? `+${g.value}` : g.value}</>}
                    {g.type === 'advantage' && (g.advantage === 'disadvantage' ? '劣势' : '优势')}
                    {g.type === 'diceFloor2' && '伤害骰不能低于 2'}
                  </span>
                ) : (
                  <>
                    {g.type === 'extraDice' && (
                      <input type="text" value={g.dice || ''} onChange={(e) => updateItem(g.id, { dice: e.target.value })} placeholder="如 1d6 火焰" className={`${inputClass} w-full h-7 text-xs font-mono`} />
                    )}
                    {(g.type === 'damageBonus' || g.type === 'attackBonus' || g.type === 'perDieBonus') && (
                      <NumberStepper className="!w-[5.5rem] !min-w-0 !px-2" value={Number(g.value) || 0} onChange={(v) => updateItem(g.id, { value: v })} min={-99} max={99} compact narrow />
                    )}
                    {g.type === 'advantage' && (
                      <select value={g.advantage || 'advantage'} onChange={(e) => updateItem(g.id, { advantage: e.target.value })} className={`${inputClass} h-7 text-xs py-0 px-1 w-full`}>
                        <option value="advantage">优势</option>
                        <option value="disadvantage">劣势</option>
                      </select>
                    )}
                  </>
                )}
              </div>
              {g.auto ? (
                <span className="shrink-0 rounded border border-transparent px-1.5 py-0.5 text-[10px] text-dnd-text-muted" title="由 BUFF 自动提供">自动</span>
              ) : (
                <button type="button" onClick={() => removeItem(g.id)} className="shrink-0 rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-600">移除</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
