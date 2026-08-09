import React, { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { normalizeContainedSpellValue } from '../lib/containedSpellModel'
import { inputClass } from '../lib/inputStyles'

const HIT_RESOLUTION_LABELS = {
  dex_save: '敏捷豁免',
  str_save: '力量豁免',
  con_save: '体质豁免',
  wis_save: '感知豁免',
  int_save: '智力豁免',
  cha_save: '魅力豁免',
  spell_attack: '法术攻击',
  none: '效应目标',
}

/**
 * 背包/仓库等物品卡中的「使用内含法术」入口。
 * 点击后弹出选择法术并确认，确认后通过 onChargeChange 回传新的 charge 值。
 */
export default function ContainedSpellUseButton({ entry, onChargeChange, className = '', buttonClassName = '' }) {
  const [pending, setPending] = useState(false)
  const [selected, setSelected] = useState(null)

  const cs = useMemo(() => {
    const raw = entry?.effects?.find((e) => e.effectType === 'contained_spell')?.value
    return normalizeContainedSpellValue(raw, entry?.charge)
  }, [entry])

  const spells = cs.spells
  if (spells.length === 0) return null

  const currentCharge = Math.max(0, Number(entry?.charge) || 0)
  const selectedSub = selected && spells.some((s) =>
    (s.spellId && s.spellId === selected.spellId && s.spellName === selected.spellName) ||
    (!s.spellId && s.spellName === selected.spellName)
  )
    ? selected
    : (spells.find((s) => (s.cost || 1) <= currentCharge) || spells[0])

  const handleOpen = () => {
    setSelected(selectedSub)
    setPending(true)
  }

  const handleUse = () => {
    if (!selectedSub) return
    const cost = Math.max(1, Number(selectedSub.cost) || 1)
    const next = Math.max(0, currentCharge - cost)
    onChargeChange(next)
    setPending(false)
  }

  const canUseAny = currentCharge > 0 && spells.some((s) => (s.cost || 1) <= currentCharge)

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!canUseAny}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dnd-gold/60 text-dnd-gold-light hover:bg-dnd-gold/20 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] whitespace-nowrap shrink-0 ${buttonClassName}`}
        title="使用内含法术"
      >
        <Sparkles className="w-3 h-3" />
        施法
      </button>
      {pending && (
        <div className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/50 ${className}`} onClick={() => setPending(false)}>
          <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-dnd-gold-light text-sm font-bold mb-2">使用内含法术</h3>
            <div className="space-y-2 mb-3">
              {spells.length > 1 ? (
                <select
                  value={spells.indexOf(selectedSub)}
                  onChange={(e) => setSelected(spells[Number(e.target.value)])}
                  className={inputClass + ' w-full h-8 text-xs'}
                >
                  {spells.map((s, idx) => (
                    <option key={idx} value={idx}>
                      {s.spellName?.trim() || '未命名'} · {s.level || 0}环 · 耗{s.cost || 1}充能 · {s.hitResolution === 'none' ? (s.range?.trim() || '效应目标') : (HIT_RESOLUTION_LABELS[s.hitResolution] || '敏捷豁免')}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-white text-sm">
                  {selectedSub?.spellName?.trim() || '未命名'} · {selectedSub?.level || 0}环 · 耗{selectedSub?.cost || 1}充能 · {selectedSub?.hitResolution === 'none' ? (selectedSub?.range?.trim() || '效应目标') : (HIT_RESOLUTION_LABELS[selectedSub?.hitResolution] || '敏捷豁免')}
                </p>
              )}
              <p className="text-gray-400 text-xs">
                当前充能 {currentCharge}，使用后剩余 {Math.max(0, currentCharge - (selectedSub?.cost || 1))}。
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPending(false)} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">取消</button>
              <button
                type="button"
                onClick={handleUse}
                disabled={(selectedSub?.cost || 1) > currentCharge}
                className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm"
              >
                使用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
