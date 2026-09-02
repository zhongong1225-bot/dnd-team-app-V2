import { useState } from 'react'
import {
  RACE_SIZES,
  CREATURE_TYPE_OPTIONS,
  ABILITY_KEYS,
  createEmptyTrait,
  createEmptyTable,
  createEmptySubrace,
  createEmptyChoiceOption,
  createEmptyRaceSpell,
  normalizeAbilityScoreBonuses,
} from '../data/raceModel'
import BuffForm from './BuffForm'

const inputCls = 'w-full bg-[#0d1520] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-dnd-gold/50'
const labelCls = 'text-[10px] text-dnd-text-muted block mb-0.5'
const sectionCls = 'rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2'
const ABILITY_SHORT = { str: '力', dex: '敏', con: '体', int: '智', wis: '感', cha: '魅' }

const SPEED_LABELS = { walk: '行走', climb: '攀爬', swim: '游泳', fly: '飞行', burrow: '掘地' }
const DICE_OPTIONS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

/**
 * RaceEditorForm — 可复用种族编辑表单
 * 
 * Props:
 * - race: 当前编辑的种族对象（含 id/name/description/source/creatureType/sizeOptions/sizeDefault/speed/darkvision/traits/tables/subraces）
 * - onChange(race): 每次字段变更时回调，父组件负责更新 state
 * - onSave(): 点击保存按钮时回调
 * - onCancel(): 点击取消按钮时回调
 * - showSaveButtons: boolean，是否显示底部保存/取消按钮（默认 true）
 */
export default function RaceEditorForm({ race, onChange, onSave, onCancel, showSaveButtons = true }) {
  const [editingTraitBuffId, setEditingTraitBuffId] = useState(null) // { type:'race'|'subrace', subraceId?, traitId, optionId? }

  const patch = (key, val) => onChange({ ...race, [key]: val })
  const patchSpeed = (key, val) => onChange({
    ...race,
    speed: { ...race.speed, [key]: val ? Number(val) : null },
  })

  const toggleSize = (size) => {
    const opts = race.sizeOptions || []
    const has = opts.includes(size)
    const next = has ? opts.filter(s => s !== size) : [...opts, size]
    const def = next.includes(race.sizeDefault) ? race.sizeDefault : (next[0] || 'Medium')
    onChange({ ...race, sizeOptions: next.length ? next : ['Medium'], sizeDefault: def })
  }

  // ── 特性更新辅助 ────────────────────────────────────────────
  const updateTraitInRace = (traitId, updater) => {
    onChange({ ...race, traits: (race.traits || []).map(t => t.id === traitId ? updater(t) : t) })
  }
  const updateSubraceTraitInRace = (subraceId, traitId, updater) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id !== subraceId ? s : { ...s, traits: (s.traits || []).map(t => t.id === traitId ? updater(t) : t) }
      ),
    })
  }
  const getCtxUpdater = (ctx) => ctx.type === 'race' ? updateTraitInRace : (sid, tid, fn) => updateSubraceTraitInRace(ctx.subraceId, tid, fn)

  // ── 特性编辑 ──────────────────────────────────────────────
  const addTrait = () => {
    const t = createEmptyTrait()
    onChange({ ...race, traits: [...(race.traits || []), t] })
  }
  const removeTrait = (id) => {
    onChange({ ...race, traits: (race.traits || []).filter(t => t.id !== id) })
  }
  const patchTrait = (id, key, val) => updateTraitInRace(id, t => ({ ...t, [key]: val }))
  const saveTraitBuff = (traitId, buffPayload) => {
    updateTraitInRace(traitId, t => ({ ...t, cards: buffPayload?.effects || [] }))
    setEditingTraitBuffId(null)
  }


  // ── 选择型特性编辑 ─────────────────────────────────────────
  const toggleChoiceMode = (ctx, traitId) => {
    const updater = getCtxUpdater(ctx)
    updater(ctx.type === 'race' ? null : ctx.subraceId, traitId, t => ({
      ...t, choiceOptions: Array.isArray(t.choiceOptions) ? undefined : [],
    }))
  }
  const addChoiceOption = (ctx, traitId) => {
    const updater = getCtxUpdater(ctx)
    updater(ctx.type === 'race' ? null : ctx.subraceId, traitId, t => ({
      ...t, choiceOptions: [...(t.choiceOptions || []), createEmptyChoiceOption()],
    }))
  }
  const removeChoiceOption = (ctx, traitId, optId) => {
    const updater = getCtxUpdater(ctx)
    updater(ctx.type === 'race' ? null : ctx.subraceId, traitId, t => ({
      ...t, choiceOptions: (t.choiceOptions || []).filter(o => o.id !== optId),
    }))
  }
  const patchChoiceOption = (ctx, traitId, optId, key, val) => {
    const updater = getCtxUpdater(ctx)
    updater(ctx.type === 'race' ? null : ctx.subraceId, traitId, t => ({
      ...t, choiceOptions: (t.choiceOptions || []).map(o => o.id === optId ? { ...o, [key]: val } : o),
    }))
  }
  const addChoiceOptionSpell = (ctx, traitId, optId) => {
    const updater = getCtxUpdater(ctx)
    updater(ctx.type === 'race' ? null : ctx.subraceId, traitId, t => ({
      ...t, choiceOptions: (t.choiceOptions || []).map(o =>
        o.id === optId ? { ...o, spells: [...(o.spells || []), createEmptyRaceSpell()] } : o
      ),
    }))
  }
  const removeChoiceOptionSpell = (ctx, traitId, optId, spellIdx) => {
    const updater = getCtxUpdater(ctx)
    updater(ctx.type === 'race' ? null : ctx.subraceId, traitId, t => ({
      ...t, choiceOptions: (t.choiceOptions || []).map(o =>
        o.id === optId ? { ...o, spells: (o.spells || []).filter((_, i) => i !== spellIdx) } : o
      ),
    }))
  }
  const patchChoiceOptionSpell = (ctx, traitId, optId, spellIdx, key, val) => {
    const updater = getCtxUpdater(ctx)
    updater(ctx.type === 'race' ? null : ctx.subraceId, traitId, t => ({
      ...t, choiceOptions: (t.choiceOptions || []).map(o =>
        o.id === optId
          ? { ...o, spells: (o.spells || []).map((s, i) => i === spellIdx ? { ...s, [key]: val } : s) }
          : o
      ),
    }))
  }

  // ── 表格编辑 ──────────────────────────────────────────────
  const addTable = () => {
    const t = createEmptyTable()
    onChange({ ...race, tables: [...(race.tables || []), t] })
  }
  const removeTable = (id) => {
    onChange({ ...race, tables: (race.tables || []).filter(t => t.id !== id) })
  }
  const patchTable = (id, key, val) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t => t.id === id ? { ...t, [key]: val } : t),
    })
  }
  const addTableRow = (tableId) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t =>
        t.id === tableId ? { ...t, rows: [...t.rows, { roll: String(t.rows.length + 1), text: '' }] } : t
      ),
    })
  }
  const removeTableRow = (tableId, rowIdx) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t =>
        t.id === tableId ? { ...t, rows: t.rows.filter((_, i) => i !== rowIdx) } : t
      ),
    })
  }
  const patchTableRow = (tableId, rowIdx, key, val) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t =>
        t.id === tableId
          ? { ...t, rows: t.rows.map((r, i) => i === rowIdx ? { ...r, [key]: val } : r) }
          : t
      ),
    })
  }

  // ─ 亚种编辑 ──────────────────────────────────────────────
  const addSubrace = () => {
    const s = createEmptySubrace()
    onChange({ ...race, subraces: [...(race.subraces || []), s] })
  }
  const removeSubrace = (id) => {
    onChange({ ...race, subraces: (race.subraces || []).filter(s => s.id !== id) })
  }
  const patchSubrace = (id, key, val) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s => s.id === id ? { ...s, [key]: val } : s),
    })
  }
  const addSubraceTrait = (subraceId) => {
    const t = createEmptyTrait()
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId ? { ...s, traits: [...(s.traits || []), t] } : s
      ),
    })
  }
  const removeSubraceTrait = (subraceId, traitId) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId ? { ...s, traits: (s.traits || []).filter(t => t.id !== traitId) } : s
      ),
    })
  }
  const patchSubraceTrait = (subraceId, traitId, key, val) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId
          ? { ...s, traits: (s.traits || []).map(t => t.id === traitId ? { ...t, [key]: val } : t) }
          : s
      ),
    })
  }
  const saveSubraceTraitBuff = (subraceId, traitId, buffPayload) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId
          ? {
              ...s,
              traits: (s.traits || []).map(t =>
                t.id === traitId ? { ...t, cards: buffPayload?.effects || [] } : t
              ),
            }
          : s
      ),
    })
    setEditingTraitBuffId(null)
  }

  const addRaceSpell = () => {
    onChange({ ...race, spells: [...(race.spells || []), createEmptyRaceSpell()] })
  }
  const removeRaceSpell = (idx) => {
    onChange({ ...race, spells: (race.spells || []).filter((_, i) => i !== idx) })
  }
  const patchRaceSpell = (idx, key, val) => {
    onChange({ ...race, spells: (race.spells || []).map((s, i) => i === idx ? { ...s, [key]: val } : s) })
  }

  // ── 属性加值槽编辑 ────────────────────────────────────────
  const raceBonuses = normalizeAbilityScoreBonuses(race.abilityScoreBonuses, [])
  const patchBonusAmount = (idx, val) => {
    const next = raceBonuses.map((b, i) => i === idx ? { ...b, amount: Number(val) || 0 } : b)
    onChange({ ...race, abilityScoreBonuses: next })
  }
  const addBonusSlot = () => {
    onChange({ ...race, abilityScoreBonuses: [...raceBonuses, { amount: 1 }] })
  }
  const removeBonusSlot = (idx) => {
    onChange({ ...race, abilityScoreBonuses: raceBonuses.filter((_, i) => i !== idx) })
  }
  const toggleBonusAbility = (idx, abilityKey) => {
    const next = raceBonuses.map((b, i) => {
      if (i !== idx) return b
      const current = Array.isArray(b.allowedAbilities) ? [...b.allowedAbilities] : []
      const has = current.includes(abilityKey)
      const updated = has ? current.filter(k => k !== abilityKey) : [...current, abilityKey]
      const slot = { ...b, amount: b.amount }
      if (updated.length > 0) slot.allowedAbilities = updated
      else delete slot.allowedAbilities
      return slot
    })
    onChange({ ...race, abilityScoreBonuses: next })
  }

  const patchSubraceBonusAmount = (subraceId, idx, val) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s => {
        if (s.id !== subraceId) return s
        const bonuses = normalizeAbilityScoreBonuses(s.abilityScoreBonuses, [])
        const next = bonuses.map((b, i) => i === idx ? { ...b, amount: Number(val) || 0 } : b)
        return { ...s, abilityScoreBonuses: next }
      }),
    })
  }
  const addSubraceBonusSlot = (subraceId) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId
          ? { ...s, abilityScoreBonuses: [...normalizeAbilityScoreBonuses(s.abilityScoreBonuses, []), { amount: 1 }] }
          : s
      ),
    })
  }
  const removeSubraceBonusSlot = (subraceId, idx) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s => {
        if (s.id !== subraceId) return s
        const bonuses = normalizeAbilityScoreBonuses(s.abilityScoreBonuses, [])
        return { ...s, abilityScoreBonuses: bonuses.filter((_, i) => i !== idx) }
      }),
    })
  }
  const toggleSubraceBonusAbility = (subraceId, idx, abilityKey) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s => {
        if (s.id !== subraceId) return s
        const bonuses = normalizeAbilityScoreBonuses(s.abilityScoreBonuses, [])
        const next = bonuses.map((b, i) => {
          if (i !== idx) return b
          const current = Array.isArray(b.allowedAbilities) ? [...b.allowedAbilities] : []
          const has = current.includes(abilityKey)
          const updated = has ? current.filter(k => k !== abilityKey) : [...current, abilityKey]
          const slot = { ...b, amount: b.amount }
          if (updated.length > 0) slot.allowedAbilities = updated
          else delete slot.allowedAbilities
          return slot
        })
        return { ...s, abilityScoreBonuses: next }
      }),
    })
  }

  // ── BuffForm 保存分发 ────────────────────────────────────
  const handleBuffSave = (buffPayload) => {
    if (!editingTraitBuffId) return
    const { type, subraceId, traitId, optionId } = editingTraitBuffId
    const effects = buffPayload?.effects || []
    if (optionId) {
      const updater = type === 'race' ? updateTraitInRace : (sid, tid, fn) => updateSubraceTraitInRace(subraceId, tid, fn)
      updater(
        type === 'race' ? null : subraceId,
        traitId,
        t => ({
          ...t,
          choiceOptions: (t.choiceOptions || []).map(o =>
            o.id === optionId ? { ...o, cards: effects } : o
          ),
        }),
      )
    } else if (type === 'race') {
      saveTraitBuff(traitId, buffPayload)
    } else {
      saveSubraceTraitBuff(subraceId, traitId, buffPayload)
    }
    setEditingTraitBuffId(null)
  }

  // ── 查找当前正在编辑 BUFF 的特性/选项 ──────────────────────
  const findBuffTrait = () => {
    if (!editingTraitBuffId) return null
    if (editingTraitBuffId.type === 'race') {
      return (race.traits || []).find(t => t.id === editingTraitBuffId.traitId)
    }
    const sub = (race.subraces || []).find(s => s.id === editingTraitBuffId.subraceId)
    return sub ? (sub.traits || []).find(t => t.id === editingTraitBuffId.traitId) : null
  }

  const findBuffCards = () => {
    if (!editingTraitBuffId) return []
    const trait = findBuffTrait()
    if (!trait) return []
    if (editingTraitBuffId.optionId) {
      const opt = (trait.choiceOptions || []).find(o => o.id === editingTraitBuffId.optionId)
      return opt?.cards || []
    }
    return trait.cards || []
  }

  const buffTrait = findBuffTrait()
  const buffOption = editingTraitBuffId?.optionId
    ? (buffTrait?.choiceOptions || []).find(o => o.id === editingTraitBuffId.optionId)
    : null
  const buffLabel = editingTraitBuffId?.type === 'subrace'
    ? (race.subraces || []).find(s => s.id === editingTraitBuffId?.subraceId)?.name
    : race.name
  const buffTitleSuffix = buffOption
    ? `${buffTrait?.name} · ${buffOption.label || '选项'}`
    : buffTrait?.name || ''

  return (
    <>
      <div className="space-y-3">
        {/* 名称 */}
        <div className={sectionCls}>
          <div>
            <label className={labelCls}>名称 *</label>
            <input className={inputCls} value={race.name} onChange={e => patch('name', e.target.value)} placeholder="例如：半血裔" />
          </div>
        </div>

        {/* 2×3 网格布局 */}
        <div className="grid grid-cols-3 gap-3">
          {/* Row1 Col1: 生物类型 + 来源 */}
          <div className={sectionCls}>
            <div>
              <label className={labelCls}>生物类型</label>
              <select className={inputCls} value={race.creatureType} onChange={e => patch('creatureType', e.target.value)}>
                {CREATURE_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="mt-2">
              <label className={labelCls}>来源</label>
              <input className={inputCls} value={race.source} onChange={e => patch('source', e.target.value)} placeholder="例如：Van Richten's Guide" />
            </div>
          </div>

          {/* Row1 Col2: 可选体型 */}
          <div className={sectionCls}>
            <div className="text-[10px] text-dnd-text-muted">可选体型（可多选）</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-1">
              {RACE_SIZES.map(s => (
                <label key={s.value} className="flex items-center gap-1.5 text-xs text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(race.sizeOptions || []).includes(s.value)}
                    onChange={() => toggleSize(s.value)}
                    className="accent-[#c79a42]"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Row1 Col3: 速度 */}
          <div className={sectionCls}>
            <div className="text-[10px] text-dnd-text-muted mb-1">速度（尺）</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(SPEED_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted shrink-0">{label}</span>
                  <input
                    className="w-10 bg-transparent border-b border-white/20 text-white text-xs text-center focus:outline-none focus:border-dnd-gold/50 py-0.5"
                    type="number"
                    value={race.speed?.[key] ?? ''}
                    onChange={e => patchSpeed(key, e.target.value)}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Row2 Col1: 黑暗视觉 + 天生施法属性 */}
          <div className={sectionCls}>
            <div>
              <label className={labelCls}>黑暗视觉（尺）</label>
              <input
                className={inputCls}
                type="number"
                value={race.darkvision ?? ''}
                onChange={e => patch('darkvision', e.target.value ? Number(e.target.value) : null)}
                placeholder="例如：60"
              />
            </div>
            <div className="mt-2">
              <label className={labelCls}>天生施法属性</label>
              <select
                className={inputCls}
                value={race.spellcastingAbility || ''}
                onChange={e => patch('spellcastingAbility', e.target.value || null)}
              >
                <option value="">无</option>
                <option value="int">智力</option>
                <option value="wis">感知</option>
                <option value="cha">魅力</option>
              </select>
            </div>
          </div>

          {/* Row2 Col2: 属性加值槽 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">属性加值槽</span>
              <button onClick={addBonusSlot} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
            </div>
            {raceBonuses.length === 0 && <div className="text-[10px] text-gray-600">无加值槽</div>}
            {raceBonuses.map((b, idx) => {
              const allowed = Array.isArray(b.allowedAbilities) ? b.allowedAbilities : null
              return (
                <div key={idx} className="mt-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-dnd-text-muted w-8 shrink-0">槽 {idx + 1}</span>
                    <input
                      className={`${inputCls} w-20`}
                      type="number"
                      value={b.amount}
                      onChange={e => patchBonusAmount(idx, e.target.value)}
                    />
                    <button
                      onClick={() => removeBonusSlot(idx)}
                      className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center gap-1 pl-10">
                    {ABILITY_KEYS.map(k => {
                      const active = allowed === null || allowed.includes(k)
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => toggleBonusAbility(idx, k)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                            allowed === null
                              ? 'border-dnd-gold/30 text-dnd-gold/60 bg-dnd-gold/5'
                              : active
                                ? 'border-dnd-gold/60 text-dnd-gold bg-dnd-gold/10'
                                : 'border-white/10 text-gray-600 bg-transparent hover:border-white/20'
                          }`}
                        >
                          {ABILITY_SHORT[k]}
                        </button>
                      )
                    })}
                    {allowed === null && <span className="text-[9px] text-gray-600 ml-1">任意</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Row2 Col3: 天生法术 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-purple-300/70">天生法术</span>
              <button onClick={addRaceSpell} className="text-purple-400/70 text-[10px] hover:text-purple-300">+ 添加</button>
            </div>
            {(race.spells || []).length === 0 && <div className="text-[10px] text-gray-600">无</div>}
            {(race.spells || []).map((sp, si) => (
              <div key={si} className="flex items-center gap-1 flex-wrap mt-1">
                <input className={`${inputCls} w-20`} placeholder="法术名" value={sp.name} onChange={e => patchRaceSpell(si, 'name', e.target.value)} />
                <select className={`${inputCls} w-14`} value={sp.castMode} onChange={e => patchRaceSpell(si, 'castMode', e.target.value)}>
                  <option value="at-will">随意</option>
                  <option value="per-day">每天</option>
                  <option value="slot">环位</option>
                </select>
                {sp.castMode === 'per-day' && (
                  <input className={`${inputCls} w-10`} type="number" min="1" value={sp.timesPerDay || 1} onChange={e => patchRaceSpell(si, 'timesPerDay', Number(e.target.value))} placeholder="次" />
                )}
                {sp.castMode === 'slot' && (
                  <input className={`${inputCls} w-10`} type="number" min="1" max="9" value={sp.slotLevel || 1} onChange={e => patchRaceSpell(si, 'slotLevel', Number(e.target.value))} placeholder="环" />
                )}
                <button onClick={() => removeRaceSpell(si)} className="text-dnd-red/60 hover:text-dnd-red text-xs px-1">×</button>
              </div>
            ))}
          </div>
        </div>

        {/* 背景描述 */}
        <div className={sectionCls}>
          <div>
            <label className={labelCls}>背景描述</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="种族背景故事 / 风味文字"
              value={race.description}
              onChange={e => patch('description', e.target.value)}
            />
          </div>
        </div>

        {/* 特性 */}
        {(() => {
          const ctx = { type: 'race' }
          return (
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-dnd-text-muted">特性</span>
            <button onClick={addTrait} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
          </div>
          {(race.traits || []).length === 0 && <div className="text-[10px] text-gray-600">无特性</div>}
          {(race.traits || []).map((t, idx) => {
            const isChoice = Array.isArray(t.choiceOptions)
            return (
            <div key={t.id} className="space-y-1.5 border-t border-white/5 pt-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                <input
                  className={`${inputCls} flex-1`}
                  placeholder="特性名称"
                  value={t.name}
                  onChange={e => patchTrait(t.id, 'name', e.target.value)}
                />
                <button onClick={() => removeTrait(t.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
              </div>
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                placeholder="特性描述"
                value={t.description}
                onChange={e => patchTrait(t.id, 'description', e.target.value)}
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setEditingTraitBuffId({ type: 'race', traitId: t.id })}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/15 border border-indigo-400/20"
                  title="编辑效果"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  效果 {(t.cards || []).length > 0 && `(${t.cards.length})`}
                </button>
                <label className="inline-flex items-center gap-1 text-[10px] text-amber-300/80 cursor-pointer">
                  <input type="checkbox" checked={isChoice} onChange={() => toggleChoiceMode(ctx, t.id)} className="accent-[#c79a42] w-3 h-3" />
                  选择型
                </label>
              </div>

              {/* 选择型选项 */}
              {isChoice && (
                <div className="pl-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-300/70">可选效果（玩家从中选一个）</span>
                    <button onClick={() => addChoiceOption(ctx, t.id)} className="text-amber-400/70 text-[10px] hover:text-amber-300">+ 添加选项</button>
                  </div>
                  {(t.choiceOptions || []).map((opt) => (
                    <div key={opt.id} className="space-y-1 border-l-2 border-amber-500/20 pl-2">
                      <div className="flex items-center gap-1">
                        <input className={`${inputCls} flex-1`} placeholder="选项名称" value={opt.label} onChange={e => patchChoiceOption(ctx, t.id, opt.id, 'label', e.target.value)} />
                        <button onClick={() => removeChoiceOption(ctx, t.id, opt.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs px-1">×</button>
                      </div>
                      <input className={inputCls} placeholder="选项描述" value={opt.description || ''} onChange={e => patchChoiceOption(ctx, t.id, opt.id, 'description', e.target.value)} />
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditingTraitBuffId({ type: 'race', traitId: t.id, optionId: opt.id })}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/15 border border-indigo-400/20"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          效果 {(opt.cards || []).length > 0 && `(${opt.cards.length})`}
                        </button>
                      </div>
                      {/* 选项天生法术 */}
                      <div className="pl-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-purple-300/50">法术</span>
                          <button onClick={() => addChoiceOptionSpell(ctx, t.id, opt.id)} className="text-purple-400/50 text-[10px] hover:text-purple-300">+</button>
                        </div>
                        {(opt.spells || []).map((sp, spi) => (
                          <div key={spi} className="flex items-center gap-1 flex-wrap">
                            <input className={`${inputCls} w-20`} placeholder="法术名" value={sp.name} onChange={e => patchChoiceOptionSpell(ctx, t.id, opt.id, spi, 'name', e.target.value)} />
                            <select className={`${inputCls} w-14`} value={sp.castMode} onChange={e => patchChoiceOptionSpell(ctx, t.id, opt.id, spi, 'castMode', e.target.value)}>
                              <option value="at-will">随意</option>
                              <option value="per-day">每天</option>
                              <option value="slot">环位</option>
                            </select>
                            {sp.castMode === 'per-day' && (
                              <input className={`${inputCls} w-10`} type="number" min="1" value={sp.timesPerDay || 1} onChange={e => patchChoiceOptionSpell(ctx, t.id, opt.id, spi, 'timesPerDay', Number(e.target.value))} />
                            )}
                            {sp.castMode === 'slot' && (
                              <input className={`${inputCls} w-10`} type="number" min="1" max="9" value={sp.slotLevel || 1} onChange={e => patchChoiceOptionSpell(ctx, t.id, opt.id, spi, 'slotLevel', Number(e.target.value))} />
                            )}
                            <button onClick={() => removeChoiceOptionSpell(ctx, t.id, opt.id, spi)} className="text-dnd-red/60 hover:text-dnd-red text-xs px-1">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )
          })}
        </div>
          )
        })()}

        {/* 参考表格 */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-dnd-text-muted">参考表格</span>
            <button onClick={addTable} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
          </div>
          {(race.tables || []).length === 0 && <div className="text-[10px] text-gray-600">无参考表格</div>}
          {(race.tables || []).map((table) => (
            <div key={table.id} className="space-y-1.5 border-t border-white/5 pt-2">
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} flex-1`}
                  placeholder="表格名称"
                  value={table.name}
                  onChange={e => patchTable(table.id, 'name', e.target.value)}
                />
                <select
                  className={`${inputCls} w-20`}
                  value={table.dice}
                  onChange={e => patchTable(table.id, 'dice', e.target.value)}
                >
                  {DICE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={() => removeTable(table.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
              </div>
              {table.rows.map((row, rIdx) => (
                <div key={rIdx} className="flex items-center gap-1.5 pl-2">
                  <input
                    className={`${inputCls} w-16 shrink-0`}
                    placeholder="掷骰"
                    value={row.roll}
                    onChange={e => patchTableRow(table.id, rIdx, 'roll', e.target.value)}
                  />
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="结果"
                    value={row.text}
                    onChange={e => patchTableRow(table.id, rIdx, 'text', e.target.value)}
                  />
                  <button
                    onClick={() => removeTableRow(table.id, rIdx)}
                    className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => addTableRow(table.id)}
                className="text-[10px] text-dnd-gold/70 hover:text-dnd-gold pl-2"
              >
                + 添加行
              </button>
            </div>
          ))}
        </div>

        {/* 亚种 */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-dnd-text-muted">亚种</span>
            <button onClick={addSubrace} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
          </div>
          {(race.subraces || []).length === 0 && <div className="text-[10px] text-gray-600">无亚种</div>}
          {(race.subraces || []).map((sub) => (
            <div key={sub.id} className="space-y-1.5 border-t border-white/5 pt-2">
              <div className="flex items-center gap-1">
                <input
                  className={`${inputCls} flex-1`}
                  placeholder="亚种名称"
                  value={sub.name}
                  onChange={e => patchSubrace(sub.id, 'name', e.target.value)}
                />
                <button onClick={() => removeSubrace(sub.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
              </div>
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                placeholder="亚种描述"
                value={sub.description}
                onChange={e => patchSubrace(sub.id, 'description', e.target.value)}
              />
              {/* 亚种属性加值槽 */}
              <div className="pl-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dnd-text-muted">属性加值槽</span>
                  <button
                    onClick={() => addSubraceBonusSlot(sub.id)}
                    className="text-dnd-gold/70 text-[10px] hover:text-dnd-gold"
                  >
                    + 添加加值槽
                  </button>
                </div>
                {(() => {
                  const subBonuses = normalizeAbilityScoreBonuses(sub.abilityScoreBonuses, [])
                  return subBonuses.length === 0
                    ? <div className="text-[10px] text-gray-600">无加值槽</div>
                    : subBonuses.map((b, idx) => {
                        const allowed = Array.isArray(b.allowedAbilities) ? b.allowedAbilities : null
                        return (
                          <div key={idx} className="mt-0.5 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-dnd-text-muted w-8 shrink-0">槽 {idx + 1}</span>
                              <input
                                className={`${inputCls} w-20`}
                                type="number"
                                value={b.amount}
                                onChange={e => patchSubraceBonusAmount(sub.id, idx, e.target.value)}
                              />
                              <button
                                onClick={() => removeSubraceBonusSlot(sub.id, idx)}
                                className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1"
                              >
                                ×
                              </button>
                            </div>
                            <div className="flex items-center gap-1 pl-10">
                              {ABILITY_KEYS.map(k => {
                                const active = allowed === null || allowed.includes(k)
                                return (
                                  <button
                                    key={k}
                                    type="button"
                                    onClick={() => toggleSubraceBonusAbility(sub.id, idx, k)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                      allowed === null
                                        ? 'border-dnd-gold/30 text-dnd-gold/60 bg-dnd-gold/5'
                                        : active
                                          ? 'border-dnd-gold/60 text-dnd-gold bg-dnd-gold/10'
                                          : 'border-white/10 text-gray-600 bg-transparent hover:border-white/20'
                                    }`}
                                  >
                                    {ABILITY_SHORT[k]}
                                  </button>
                                )
                              })}
                              {allowed === null && <span className="text-[9px] text-gray-600 ml-1">任意</span>}
                            </div>
                          </div>
                        )
                      })
                })()}
              </div>
              {/* 亚种特性 */}
              <div className="pl-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dnd-text-muted">亚种特性</span>
                  <button
                    onClick={() => addSubraceTrait(sub.id)}
                    className="text-dnd-gold/70 text-[10px] hover:text-dnd-gold"
                  >
                    + 添加
                  </button>
                </div>
                {(sub.traits || []).map((st, stIdx) => {
                  const sCtx = { type: 'subrace', subraceId: sub.id }
                  const stIsChoice = Array.isArray(st.choiceOptions)
                  return (
                  <div key={st.id} className="space-y-1 border-l-2 border-white/5 pl-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-dnd-text-muted w-4 shrink-0">{stIdx + 1}.</span>
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder="特性名称"
                        value={st.name}
                        onChange={e => patchSubraceTrait(sub.id, st.id, 'name', e.target.value)}
                      />
                      <button
                        onClick={() => removeSubraceTrait(sub.id, st.id)}
                        className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      className={`${inputCls} resize-none`}
                      rows={3}
                      placeholder="特性描述"
                      value={st.description}
                      onChange={e => patchSubraceTrait(sub.id, st.id, 'description', e.target.value)}
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setEditingTraitBuffId({ type: 'subrace', subraceId: sub.id, traitId: st.id })}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/15 border border-indigo-400/20"
                        title="编辑效果"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        效果 {(st.cards || []).length > 0 && `(${st.cards.length})`}
                      </button>
                      <label className="inline-flex items-center gap-1 text-[10px] text-amber-300/80 cursor-pointer">
                        <input type="checkbox" checked={stIsChoice} onChange={() => toggleChoiceMode(sCtx, st.id)} className="accent-[#c79a42] w-3 h-3" />
                        选择型
                      </label>
                    </div>

                    {/* 选择型选项 */}
                    {stIsChoice && (
                      <div className="pl-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-amber-300/70">可选效果（玩家从中选一个）</span>
                          <button onClick={() => addChoiceOption(sCtx, st.id)} className="text-amber-400/70 text-[10px] hover:text-amber-300">+ 添加选项</button>
                        </div>
                        {(st.choiceOptions || []).map((opt) => (
                          <div key={opt.id} className="space-y-1 border-l-2 border-amber-500/20 pl-2">
                            <div className="flex items-center gap-1">
                              <input className={`${inputCls} flex-1`} placeholder="选项名称" value={opt.label} onChange={e => patchChoiceOption(sCtx, st.id, opt.id, 'label', e.target.value)} />
                              <button onClick={() => removeChoiceOption(sCtx, st.id, opt.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs px-1">×</button>
                            </div>
                            <input className={inputCls} placeholder="选项描述" value={opt.description || ''} onChange={e => patchChoiceOption(sCtx, st.id, opt.id, 'description', e.target.value)} />
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setEditingTraitBuffId({ type: 'subrace', subraceId: sub.id, traitId: st.id, optionId: opt.id })}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/15 border border-indigo-400/20"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                效果 {(opt.cards || []).length > 0 && `(${opt.cards.length})`}
                              </button>
                            </div>
                            {/* 选项天生法术 */}
                            <div className="pl-1 space-y-0.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-purple-300/50">法术</span>
                                <button onClick={() => addChoiceOptionSpell(sCtx, st.id, opt.id)} className="text-purple-400/50 text-[10px] hover:text-purple-300">+</button>
                              </div>
                              {(opt.spells || []).map((sp, spi) => (
                                <div key={spi} className="flex items-center gap-1 flex-wrap">
                                  <input className={`${inputCls} w-20`} placeholder="法术名" value={sp.name} onChange={e => patchChoiceOptionSpell(sCtx, st.id, opt.id, spi, 'name', e.target.value)} />
                                  <select className={`${inputCls} w-14`} value={sp.castMode} onChange={e => patchChoiceOptionSpell(sCtx, st.id, opt.id, spi, 'castMode', e.target.value)}>
                                    <option value="at-will">随意</option>
                                    <option value="per-day">每天</option>
                                    <option value="slot">环位</option>
                                  </select>
                                  {sp.castMode === 'per-day' && (
                                    <input className={`${inputCls} w-10`} type="number" min="1" value={sp.timesPerDay || 1} onChange={e => patchChoiceOptionSpell(sCtx, st.id, opt.id, spi, 'timesPerDay', Number(e.target.value))} />
                                  )}
                                  {sp.castMode === 'slot' && (
                                    <input className={`${inputCls} w-10`} type="number" min="1" max="9" value={sp.slotLevel || 1} onChange={e => patchChoiceOptionSpell(sCtx, st.id, opt.id, spi, 'slotLevel', Number(e.target.value))} />
                                  )}
                                  <button onClick={() => removeChoiceOptionSpell(sCtx, st.id, opt.id, spi)} className="text-dnd-red/60 hover:text-dnd-red text-xs px-1">×</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        {showSaveButtons && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={onSave}
              disabled={!race.name.trim()}
              className="flex-1 py-2 rounded-lg bg-dnd-gold text-black font-medium text-sm disabled:opacity-40"
            >
              保存
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-white/20 text-dnd-text-muted text-sm"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* BUFF 编辑器嵌套弹窗 */}
      {buffTrait && editingTraitBuffId && (
        <>
          <div className="fixed inset-0 bg-black/50" style={{ zIndex: 400 }} onClick={() => setEditingTraitBuffId(null)} aria-hidden />
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 401 }}>
            <div className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-white/10 bg-[#1a2332] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h2 className="text-sm font-semibold text-dnd-gold-light/90">
                  编辑效果 — {buffLabel} · {buffTitleSuffix}
                </h2>
                <button
                  onClick={() => setEditingTraitBuffId(null)}
                  className="p-1 rounded text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <BuffForm
                  compact
                  initial={{ effects: findBuffCards(), source: buffOption?.label || buffTrait?.name }}
                  onSave={handleBuffSave}
                  onCancel={() => setEditingTraitBuffId(null)}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
