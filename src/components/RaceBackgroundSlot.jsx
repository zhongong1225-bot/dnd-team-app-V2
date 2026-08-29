/**
 * RaceBackgroundSlot — 种族背景槽组件
 *
 * 在武技和职业特性之间显示种族卡和背景卡，两者都支持 BUFF 编辑器。
 * 种族卡：选择种族 + 亚种，显示种族特性，可编辑 BUFF 效果。
 * 背景卡：选择背景，显示背景描述，可编辑 BUFF 效果。
 */

import { useState, useMemo } from 'react'
import { Settings, X, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { RACES, getRaceById } from '../data/races'
import { BACKGROUNDS, getBackgroundById } from '../data/backgrounds'
import { SPECIAL_SENSES_OPTIONS } from '../data/buffTypes'
import { CREATURE_SIZES } from '../data/creatureLibrary'
import BuffForm from './BuffForm'

export default function RaceBackgroundSlot({ char, canEdit, onSave }) {
  const raceCard = char?.raceCard || {}
  const backgroundCard = char?.backgroundCard || {}

  const [raceBuffEditor, setRaceBuffEditor] = useState(false)
  const [backgroundBuffEditor, setBackgroundBuffEditor] = useState(false)
  const [raceBaseInfoOpen, setRaceBaseInfoOpen] = useState(false)

  // 种族基础信息
  const raceBaseInfo = raceCard.raceBaseInfo || {}

  const updateRaceBaseInfo = (patch) => {
    const next = { ...raceCard, raceBaseInfo: { ...raceBaseInfo, ...patch } }
    onSave({ raceCard: next })
  }

  const clearRaceBaseInfo = () => {
    const next = { ...raceCard }
    delete next.raceBaseInfo
    onSave({ raceCard: next })
  }

  // 默认属性提高对象
  const defaultASI = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
  const asi = raceBaseInfo.abilityScoreIncrease || defaultASI

  // 种族数据
  const selectedRace = useMemo(() => getRaceById(raceCard.raceId), [raceCard.raceId])
  const selectedSubrace = useMemo(() => {
    if (!selectedRace || !raceCard.subraceId) return null
    return selectedRace.subraces.find((s) => s.id === raceCard.subraceId) || null
  }, [selectedRace, raceCard.subraceId])

  // 背景数据
  const selectedBackground = useMemo(() => getBackgroundById(backgroundCard.backgroundId), [backgroundCard.backgroundId])

  // 保存种族选择
  const handleRaceChange = (raceId) => {
    const race = getRaceById(raceId)
    const next = {
      ...raceCard,
      raceId,
      subraceId: race?.subraces?.[0]?.id || '',
    }
    onSave({ raceCard: next })
  }

  const handleSubraceChange = (subraceId) => {
    onSave({ raceCard: { ...raceCard, subraceId } })
  }

  // 保存背景选择
  const handleBackgroundChange = (backgroundId) => {
    onSave({ backgroundCard: { ...backgroundCard, backgroundId } })
  }

  // 保存种族 BUFF
  const handleRaceBuffSave = (buff) => {
    const next = { ...raceCard }
    if (buff.effects.length > 0) {
      next.raceBuffPatch = { effects: buff.effects, enabled: buff.enabled }
    } else {
      delete next.raceBuffPatch
    }
    onSave({ raceCard: next })
    setRaceBuffEditor(false)
  }

  const handleRaceBuffClear = () => {
    const next = { ...raceCard }
    delete next.raceBuffPatch
    onSave({ raceCard: next })
    setRaceBuffEditor(false)
  }

  // 保存背景 BUFF
  const handleBackgroundBuffSave = (buff) => {
    const next = { ...backgroundCard }
    if (buff.effects.length > 0) {
      next.backgroundBuffPatch = { effects: buff.effects, enabled: buff.enabled }
    } else {
      delete next.backgroundBuffPatch
    }
    onSave({ backgroundCard: next })
    setBackgroundBuffEditor(false)
  }

  const handleBackgroundBuffClear = () => {
    const next = { ...backgroundCard }
    delete next.backgroundBuffPatch
    onSave({ backgroundCard: next })
    setBackgroundBuffEditor(false)
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 种族卡 */}
        <div className="panel-card-compact">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-bold text-white">种族</span>
              {raceCard.raceId === 'custom' && raceCard.customName && (
                <span className="text-xs text-gray-400">{raceCard.customName}</span>
              )}
              {raceCard.raceId !== 'custom' && selectedRace && (
                <span className="text-xs text-gray-400">{selectedRace.name}</span>
              )}
              {selectedSubrace && (
                <span className="text-xs text-gray-500">({selectedSubrace.name})</span>
              )}
            </div>
            {canEdit && raceCard.raceId && (
              <button
                type="button"
                onClick={() => setRaceBuffEditor(true)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all active:scale-95"
                title="编辑种族效果"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canEdit ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <select
                  value={raceCard.raceId || ''}
                  onChange={(e) => handleRaceChange(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                >
                  <option value="">— 选择种族 —</option>
                  {RACES.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                  <option value="custom">自定义...</option>
                </select>

                {raceCard.raceId === 'custom' && (
                  <input
                    type="text"
                    value={raceCard.customName || ''}
                    onChange={(e) => onSave({ raceCard: { ...raceCard, customName: e.target.value } })}
                    placeholder="种族名称"
                    className="flex-1 min-w-0 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                  />
                )}

                {selectedRace && selectedRace.subraces.length > 0 && (
                  <select
                    value={raceCard.subraceId || ''}
                    onChange={(e) => handleSubraceChange(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                  >
                    <option value="">— 亚种 —</option>
                    {selectedRace.subraces.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {selectedRace && (
                <div className="text-xs text-gray-500 leading-relaxed">
                  {selectedRace.traits}
                </div>
              )}
            </div>
          ) : (
            <div>
              {selectedRace ? (
                <div className="text-xs text-gray-500 leading-relaxed">
                  {selectedRace.traits}
                </div>
              ) : (
                <p className="text-xs text-gray-600">未选择种族</p>
              )}
            </div>
          )}
        </div>

        {/* 种族基础信息面板 */}
        {raceCard.raceId && (
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => setRaceBaseInfoOpen((p) => !p)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-dnd-gold-light transition-colors mb-2"
            >
              {raceBaseInfoOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              种族基础信息
              {hasRaceBaseInfo(raceBaseInfo) && <span className="w-1.5 h-1.5 rounded-full bg-dnd-gold/60" />}
            </button>

            {raceBaseInfoOpen && (
              <div className="panel-card-compact">
                {/* 第一行：移速 / 体型 / 视觉 */}
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-gray-400">
                    移速
                    <input
                      type="number"
                      value={raceBaseInfo.speed ?? 30}
                      onChange={(e) => updateRaceBaseInfo({ speed: Number(e.target.value) || 0 })}
                      className="w-14 px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 text-center focus:outline-none focus:border-dnd-gold/50"
                      min={0}
                      max={120}
                      step={5}
                    />
                    <span className="text-gray-500">尺</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs text-gray-400">
                    体型
                    <select
                      value={raceBaseInfo.size || 'medium'}
                      onChange={(e) => updateRaceBaseInfo({ size: e.target.value })}
                      className="px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                    >
                      {CREATURE_SIZES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </label>

                  <span className="text-xs text-gray-400">视觉</span>
                  <select
                    value={raceBaseInfo.vision?.type || ''}
                    onChange={(e) => updateRaceBaseInfo({
                      vision: e.target.value ? { type: e.target.value, range: raceBaseInfo.vision?.range || 60 } : null,
                    })}
                    className="px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                  >
                    <option value="">无</option>
                    {SPECIAL_SENSES_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {raceBaseInfo.vision?.type && (
                    <label className="flex items-center gap-1 text-xs text-gray-400">
                      <input
                        type="number"
                        value={raceBaseInfo.vision.range ?? 60}
                        onChange={(e) => updateRaceBaseInfo({
                          vision: { ...raceBaseInfo.vision, range: Number(e.target.value) || 0 },
                        })}
                        className="w-12 px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 text-center focus:outline-none focus:border-dnd-gold/50"
                        min={0}
                        max={300}
                        step={10}
                      />
                      <span className="text-gray-500">尺</span>
                    </label>
                  )}
                </div>

                {/* 第二行：属性提高 */}
                <div className="flex items-center gap-3 flex-wrap mt-1.5">
                  <span className="text-xs text-gray-400">属性提高</span>
                  {Object.entries(asi).map(([key, val]) => (
                    <label key={key} className="flex items-center gap-1 text-xs text-gray-400">
                      <span className="uppercase w-7 text-center font-mono text-[11px]">{key}</span>
                      <input
                        type="number"
                        value={val || 0}
                        onChange={(e) => updateRaceBaseInfo({
                          abilityScoreIncrease: { ...asi, [key]: Number(e.target.value) || 0 },
                        })}
                        className="w-14 px-1 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 text-center focus:outline-none focus:border-dnd-gold/50"
                        min={0}
                        max={4}
                      />
                    </label>
                  ))}
                </div>

                {/* 第三行：添加效果 + 清除 */}
                <div className="flex items-center justify-end gap-3 mt-1.5 pt-1.5 border-t border-gray-700/30">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setRaceBuffEditor(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-dnd-gold/30 text-[11px] text-dnd-gold-light hover:bg-dnd-gold/10 transition-colors flex-shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      添加效果
                    </button>
                  )}
                  {hasRaceBaseInfo(raceBaseInfo) && (
                    <button
                      type="button"
                      onClick={clearRaceBaseInfo}
                      className="text-[11px] text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      清除基础信息
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 背景卡 */}
        <div className="panel-card-compact">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-bold text-white">背景</span>
              {backgroundCard.backgroundId === 'custom' && backgroundCard.customName && (
                <span className="text-xs text-gray-400">{backgroundCard.customName}</span>
              )}
              {backgroundCard.backgroundId !== 'custom' && selectedBackground && (
                <span className="text-xs text-gray-400">{selectedBackground.name}</span>
              )}
            </div>
            {canEdit && backgroundCard.backgroundId && (
              <button
                type="button"
                onClick={() => setBackgroundBuffEditor(true)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all active:scale-95"
                title="编辑背景效果"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canEdit ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <select
                  value={backgroundCard.backgroundId || ''}
                  onChange={(e) => handleBackgroundChange(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                >
                  <option value="">— 选择背景 —</option>
                  {BACKGROUNDS.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                  <option value="custom">自定义...</option>
                </select>

                {backgroundCard.backgroundId === 'custom' && (
                  <input
                    type="text"
                    value={backgroundCard.customName || ''}
                    onChange={(e) => onSave({ backgroundCard: { ...backgroundCard, customName: e.target.value } })}
                    placeholder="背景名称"
                    className="flex-1 min-w-0 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                  />
                )}
              </div>

              {selectedBackground && (
                <div className="text-xs text-gray-500 leading-relaxed">
                  {selectedBackground.description}
                </div>
              )}
            </div>
          ) : (
            <div>
              {selectedBackground ? (
                <div className="text-xs text-gray-500 leading-relaxed">
                  {selectedBackground.description}
                </div>
              ) : (
                <p className="text-xs text-gray-600">未选择背景</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 种族 BUFF 编辑器弹窗 */}
      {raceBuffEditor && (() => {
        const raceName = raceCard.raceId === 'custom' && raceCard.customName
          ? raceCard.customName
          : selectedRace?.name || '种族'
        const initialEffects = Array.isArray(raceCard.raceBuffPatch?.effects) && raceCard.raceBuffPatch.effects.length
          ? raceCard.raceBuffPatch.effects
          : []
        return (
          <>
            <div
              className="fixed inset-0 z-[300] bg-black/60"
              onClick={() => setRaceBuffEditor(false)}
              aria-hidden
            />
            <div
              className="fixed inset-0 z-[301] flex items-center justify-center p-4 sm:p-8 overflow-auto"
              onClick={() => setRaceBuffEditor(false)}
            >
              <div
                className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-dnd-gold-light/90">
                      编辑种族效果：{raceName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setRaceBuffEditor(false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-dnd-text-muted mt-1">
                    自定义该种族的 BUFF 效果，保存后立即生效。
                  </p>
                </div>
                <div className="p-4">
                  <BuffForm
                    key={`race-buff-${raceCard.raceId}`}
                    compact
                    hideDuration
                    charResources={char?.classResources}
                    spellSlots={char?.spellSlots}
                    initial={{
                      source: raceCard.raceId === 'custom' ? (raceCard.customName || 'custom-race') : `race-${raceCard.raceId}`,
                      effects: initialEffects,
                      enabled: raceCard.raceBuffPatch?.enabled !== false,
                    }}
                    onSave={handleRaceBuffSave}
                    onClear={handleRaceBuffClear}
                    onCancel={() => setRaceBuffEditor(false)}
                  />
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* 背景 BUFF 编辑器弹窗 */}
      {backgroundBuffEditor && (() => {
        const backgroundName = backgroundCard.backgroundId === 'custom' && backgroundCard.customName
          ? backgroundCard.customName
          : selectedBackground?.name || '背景'
        const initialEffects = Array.isArray(backgroundCard.backgroundBuffPatch?.effects) && backgroundCard.backgroundBuffPatch.effects.length
          ? backgroundCard.backgroundBuffPatch.effects
          : []
        return (
          <>
            <div
              className="fixed inset-0 z-[300] bg-black/60"
              onClick={() => setBackgroundBuffEditor(false)}
              aria-hidden
            />
            <div
              className="fixed inset-0 z-[301] flex items-center justify-center p-4 sm:p-8 overflow-auto"
              onClick={() => setBackgroundBuffEditor(false)}
            >
              <div
                className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-dnd-gold-light/90">
                      编辑背景效果：{backgroundName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setBackgroundBuffEditor(false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-dnd-text-muted mt-1">
                    自定义该背景的 BUFF 效果，保存后立即生效。
                  </p>
                </div>
                <div className="p-4">
                  <BuffForm
                    key={`background-buff-${backgroundCard.backgroundId}`}
                    compact
                    hideDuration
                    charResources={char?.classResources}
                    spellSlots={char?.spellSlots}
                    initial={{
                      source: backgroundCard.backgroundId === 'custom' ? (backgroundCard.customName || 'custom-background') : `background-${backgroundCard.backgroundId}`,
                      effects: initialEffects,
                      enabled: backgroundCard.backgroundBuffPatch?.enabled !== false,
                    }}
                    onSave={handleBackgroundBuffSave}
                    onClear={handleBackgroundBuffClear}
                    onCancel={() => setBackgroundBuffEditor(false)}
                  />
                </div>
              </div>
            </div>
          </>
        )
      })()}
    </>
  )
}

/** 判断 raceBaseInfo 是否有有效数据 */
function hasRaceBaseInfo(info) {
  if (!info) return false
  if (info.speed && info.speed !== 30) return true
  if (info.size && info.size !== 'medium') return true
  if (info.vision?.type) return true
  const asi = info.abilityScoreIncrease
  if (asi && Object.values(asi).some((v) => Number(v) > 0)) return true
  return false
}
