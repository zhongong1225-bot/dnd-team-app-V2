/**
 * 武技面板（独立组件）
 * 从 CombatStatus 抽出，放在背包下方
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, Trash2, Circle, CircleDot, CheckCircle2 } from 'lucide-react'
import { useModule } from '../contexts/ModuleContext'
import { useRuleTextOverridesMap } from '../hooks/useRuleTextOverridesMap'
import { buildMartialKey, resolveRuleText } from '../lib/ruleTextOverrides'
import { inputClass } from '../lib/inputStyles'
import {
  MARTIAL_TECHNIQUE_STYLES,
  getMartialTechniqueById,
  inferMartialSlotKind,
  listMartialTechniquesForSlot,
} from '../data/martialTechniques'
import MartialStyleIntroBlock from './MartialStyleIntroBlock'
import { NumberStepper } from './BuffForm'
import InfoTooltip from './InfoTooltip'
import { MartialTechTooltipContent } from '../lib/infoTooltipContent'

/* ── 常量 ─ */
const COMBAT_INNER_RIM_ONLY = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
const CM_MEAN_LABEL = 'text-xs'
const COMBAT_LIST_ROW_SHADOW = 'shadow-[0_2px_10px_rgba(0,0,0,0.42)]'
const MARTIAL_MOVE_CARD_CLASS =
  `rounded-lg border border-gray-700/60 bg-[#1a2430]/90 px-3.5 py-3 min-w-0 ${COMBAT_LIST_ROW_SHADOW} transition-all duration-200 hover:border-gray-600 hover:bg-[#1e2a38]/95 hover:shadow-[0_4px_12px_rgba(0,0,0,0.5)]`
const MARTIAL_CARD_SELECTED_CLASS =
  `border-dnd-gold/40 bg-dnd-gold/[0.03] shadow-[0_0_0_1px_rgba(218,165,32,0.15),0_4px_12px_rgba(218,165,32,0.1)]`

/* ── 工具函数 ── */
function serializeCombatMartialForSave(slots) {
  return slots.map((m) => {
    const kind =
      m.kind === 'stance' || m.kind === 'strike' || m.kind === 'other'
        ? m.kind
        : inferMartialSlotKind(getMartialTechniqueById(m.techniqueId))
    return {
      id: m.id,
      techniqueId: m.techniqueId,
      kind,
      prepared: m.prepared === true,
      used: (kind === 'strike' || kind === 'other') && m.used === true,
    }
  })
}

function buildMartialSlotsFromRows(stanceRows, strikeRows, otherSlots) {
  const result = []
  for (const r of stanceRows) {
    if (!r.techniqueId) continue
    result.push({
      id: r.id,
      techniqueId: r.techniqueId,
      kind: 'stance',
      prepared: r.prepared === true,
      used: false,
    })
  }
  for (const r of strikeRows) {
    if (!r.techniqueId) continue
    result.push({
      id: r.id,
      techniqueId: r.techniqueId,
      kind: 'strike',
      prepared: r.prepared === true,
      used: false,
    })
  }
  for (const o of otherSlots) {
    if (!o.techniqueId) continue
    const kind =
      o.kind === 'stance' || o.kind === 'strike' || o.kind === 'other'
        ? o.kind
        : inferMartialSlotKind(getMartialTechniqueById(o.techniqueId))
    result.push({
      id: o.id,
      techniqueId: o.techniqueId,
      kind,
      prepared: o.prepared === true,
      used: (kind === 'strike' || kind === 'other') && o.used === true,
    })
  }
  return result
}

function shortMartialAction(action) {
  if (!action) return '—'
  const s = String(action)
  if (s.includes('动作') || s.toLowerCase().includes('action')) return '动作'
  if (s.includes('附赠') || s.toLowerCase().includes('bonus')) return '附赠'
  if (s.includes('反应') || s.toLowerCase().includes('reaction')) return '反应'
  return s.slice(0, 4)
}

/* ── 解析架势初始化 ── */
function initMartialSlots(char) {
  const arr = Array.isArray(char?.combatMartialTechniques) ? char.combatMartialTechniques : []
  return arr
    .map((m, idx) => {
      const techniqueId = m.techniqueId || ''
      const tech = techniqueId ? getMartialTechniqueById(techniqueId) : null
      const kind =
        m.kind === 'stance' || m.kind === 'strike' || m.kind === 'other' ? m.kind : inferMartialSlotKind(tech)
      return {
        id: m.id ?? `mt_${idx}_${techniqueId || 'none'}`,
        techniqueId,
        prepared: m.prepared === true,
        kind,
        used: (kind === 'strike' || kind === 'other') && m.used === true,
      }
    })
    .filter((m) => m.techniqueId)
}

function initMartialQuota(char) {
  const rawStyle = char?.martialLearnQuota?.style
  const style = Array.isArray(rawStyle) ? rawStyle : rawStyle ? [rawStyle] : []
  return {
    stanceMax: Math.max(0, Math.min(30, Number(char?.martialLearnQuota?.stanceMax) || 0)),
    strikeMax: Math.max(0, Math.min(30, Number(char?.martialLearnQuota?.strikeMax) || 0)),
    style,
  }
}

/* ── 组件 ── */
export default function MartialTechniquesPanel({ char, canEdit, onSave }) {
  const { currentModuleId } = useModule()
  const ruleOverridesMap = useRuleTextOverridesMap(currentModuleId || 'default')

  const [showMartialModule, setShowMartialModule] = useState(() => char?.showMartialModule !== false)
  const [martialActiveStanceId, setMartialActiveStanceId] = useState(() =>
    typeof char?.martialActiveStanceId === 'string' && char.martialActiveStanceId.trim() ? char.martialActiveStanceId : null
  )
  const [expandedMartialIds, setExpandedMartialIds] = useState(new Set())
  const toggleMartialExpand = (slotId) => {
    setExpandedMartialIds((prev) => {
      const next = new Set(prev)
      if (next.has(slotId)) next.delete(slotId)
      else next.add(slotId)
      return next
    })
  }
  const [martialSlots, setMartialSlots] = useState(() => initMartialSlots(char))
  const [martialLearnQuota, setMartialLearnQuota] = useState(() => initMartialQuota(char))
  const [martialModal, setMartialModal] = useState(null)
  const [showAddMartialModal, setShowAddMartialModal] = useState(false)
  const martialSlotsRef = useRef(martialSlots)
  const martialActiveStanceRef = useRef(martialActiveStanceId)

  useEffect(() => { martialSlotsRef.current = martialSlots }, [martialSlots])
  useEffect(() => { martialActiveStanceRef.current = martialActiveStanceId }, [martialActiveStanceId])

  /* 同步 char 变化 */
  useEffect(() => {
    setMartialSlots(initMartialSlots(char))
    setMartialActiveStanceId(
      typeof char?.martialActiveStanceId === 'string' && char.martialActiveStanceId.trim()
        ? char.martialActiveStanceId
        : null
    )
    const q = char?.martialLearnQuota
    if (q && typeof q === 'object') {
      const rawStyle = q.style
      const style = Array.isArray(rawStyle) ? rawStyle : rawStyle ? [rawStyle] : []
      setMartialLearnQuota({
        stanceMax: Math.max(0, Math.min(30, Number(q.stanceMax) || 0)),
        strikeMax: Math.max(0, Math.min(30, Number(q.strikeMax) || 0)),
        style,
      })
    }
  }, [char?.id, char?.combatMartialTechniques, char?.martialLearnQuota, char?.martialActiveStanceId])

  useEffect(() => {
    setShowMartialModule(char?.showMartialModule !== false)
  }, [char?.id, char?.showMartialModule])

  /* ── Handlers ── */
  const saveCombatMartialSlots = (next) => {
    setMartialSlots(next)
    const stanceIds = new Set(next.filter((s) => s.kind === 'stance').map((s) => s.id))
    let act = martialActiveStanceId
    if (act && !stanceIds.has(act)) act = null
    const actSlot = act ? next.find((s) => s.id === act) : null
    if (!actSlot || actSlot.kind !== 'stance') act = null
    setMartialActiveStanceId(act)
    onSave({
      combatMartialTechniques: serializeCombatMartialForSave(next),
      martialLearnQuota: { ...martialLearnQuota },
      martialActiveStanceId: act,
    })
  }

  const pickMartialActiveStance = (slotId) => {
    const prev = martialSlotsRef.current
    const stanceIds = new Set(prev.filter((s) => s.kind === 'stance').map((s) => s.id))
    if (!slotId || !stanceIds.has(slotId)) return
    const nextActive = martialActiveStanceId === slotId ? null : slotId
    setMartialActiveStanceId(nextActive)
    onSave({
      combatMartialTechniques: serializeCombatMartialForSave(prev),
      martialLearnQuota: { ...martialLearnQuota },
      martialActiveStanceId: nextActive,
    })
  }

  const toggleMartialOtherUsed = (slotId) => {
    const prev = martialSlotsRef.current
    const next = prev.map((s) =>
      s.id === slotId && (s.kind === 'strike' || s.kind === 'other') ? { ...s, used: !s.used } : s
    )
    saveCombatMartialSlots(next)
  }

  const commitMartialModal = useCallback(
    (nextModal) => {
      setMartialModal(nextModal)
      const others = martialSlotsRef.current.filter((s) => s.kind === 'other')
      let built = buildMartialSlotsFromRows(nextModal.stanceRows, nextModal.strikeRows, others)
      const prevMap = new Map(martialSlotsRef.current.map((s) => [s.id, s]))
      built = built.map((s) => {
        const p = prevMap.get(s.id)
        if (p && (s.kind === 'strike' || s.kind === 'other') && p.used) return { ...s, used: true }
        return s
      })
      const stanceIds = new Set(built.filter((s) => s.kind === 'stance').map((s) => s.id))
      let act = martialActiveStanceRef.current
      if (act && !stanceIds.has(act)) act = null
      const actSlot = act ? built.find((s) => s.id === act) : null
      if (!actSlot || actSlot.kind !== 'stance') act = null
      setMartialSlots(built)
      setMartialActiveStanceId(act)
      setMartialLearnQuota(nextModal.quota)
      onSave({
        combatMartialTechniques: serializeCombatMartialForSave(built),
        martialLearnQuota: {
          stanceMax: nextModal.quota.stanceMax,
          strikeMax: nextModal.quota.strikeMax,
          style: nextModal.quota.style,
        },
        martialActiveStanceId: act,
      })
    },
    [onSave]
  )

  const openMartialSettingsModal = () => {
    const stanceSlots = martialSlots.filter((s) => s.kind === 'stance')
    const strikeSlots = martialSlots.filter((s) => s.kind === 'strike')
    const sm = martialLearnQuota.stanceMax
    const st = martialLearnQuota.strikeMax
    const stanceRows = Array.from({ length: sm }, (_, i) => ({
      id: stanceSlots[i]?.id ?? `mt_st_${i}_${Date.now()}`,
      techniqueId: stanceSlots[i]?.techniqueId || '',
      prepared: !!stanceSlots[i]?.prepared,
    }))
    const strikeRows = Array.from({ length: st }, (_, i) => ({
      id: strikeSlots[i]?.id ?? `mt_sk_${i}_${Date.now()}`,
      techniqueId: strikeSlots[i]?.techniqueId || '',
      prepared: !!strikeSlots[i]?.prepared,
    }))
    setMartialModal({ quota: { ...martialLearnQuota }, stanceRows, strikeRows })
    setShowAddMartialModal(true)
  }

  /* ── 单招渲染 ── */
  const renderMartialCombatRow = (slot, column) => {
    const tech = getMartialTechniqueById(slot.techniqueId)
    const isStanceCol = column === 'stance'
    const activeStance = isStanceCol && martialActiveStanceId === slot.id
    const usedOther = !isStanceCol && slot.used === true
    const isSelected = activeStance || usedOther
    const tagAction = tech ? shortMartialAction(tech.action) : '—'
    const tagStyle = tech?.style ?? '—'
    const tagRange = tech?.range ?? tech?.target ?? '—'
    const descRaw = tech?.description != null && String(tech.description).trim() ? String(tech.description).trim() : ''
    const descText = tech?.id
      ? String(resolveRuleText(ruleOverridesMap, buildMartialKey(tech.id), descRaw) || '').trim()
      : descRaw
    const styleGraphemes = tagStyle !== '—' ? Array.from(tagStyle) : []
    const styleSubTracking = styleGraphemes.length === 2 ? 'tracking-[0.62em]' : ''
    const isExpanded = expandedMartialIds.has(slot.id)
    const hasDesc = descText.length > 0
    return (
      <div key={slot.id} className={`${MARTIAL_MOVE_CARD_CLASS} ${isSelected ? MARTIAL_CARD_SELECTED_CLASS : ''}`}>
        <div className="flex gap-3 items-start">
          <div className="flex shrink-0 flex-col items-center pt-0.5">
            {isStanceCol ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); pickMartialActiveStance(slot.id) }}
                title={activeStance ? '正在使用' : '设为正在使用'}
                aria-label={activeStance ? '正在使用' : '设为正在使用'}
                className={`rounded-full border-2 p-1.5 transition-all duration-200 ${
                  activeStance
                    ? 'border-dnd-gold bg-dnd-gold/15 text-dnd-gold-light shadow-[0_0_8px_rgba(218,165,32,0.3)]'
                    : 'border-gray-600 bg-gray-900/40 text-gray-500 hover:border-gray-400 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                {activeStance ? <CircleDot className="h-4 w-4" strokeWidth={2.5} /> : <Circle className="h-4 w-4" strokeWidth={2} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleMartialOtherUsed(slot.id) }}
                title={usedOther ? '已使用' : '标记已使用'}
                aria-label={usedOther ? '已使用' : '标记已使用'}
                className={`rounded-full border-2 p-1.5 transition-all duration-200 ${
                  usedOther
                    ? 'border-amber-500 bg-amber-950/30 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                    : 'border-gray-600 bg-gray-900/40 text-gray-500 hover:border-gray-400 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                {usedOther ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} /> : <Circle className="h-4 w-4" strokeWidth={2} />}
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 cursor-pointer select-none"
              onClick={() => toggleMartialExpand(slot.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <InfoTooltip
                    content={<MartialTechTooltipContent tech={tech} />}
                    triggerClassName=""
                    disabled={!tech}
                  >
                    <span
                      className={`break-words font-bold leading-tight transition-colors ${tech ? 'text-[15px] text-white' : 'text-xs text-gray-500'}`}
                    >
                      {tech?.name ?? '未知武技（库中无此条目）'}
                    </span>
                  </InfoTooltip>
                  {tech && tagStyle !== '—' ? (
                    <span className="text-[11px] leading-tight text-gray-400 font-medium">
                      <span className={['inline-block', 'break-words', styleSubTracking].filter(Boolean).join(' ')}>{tagStyle}</span>
                    </span>
                  ) : null}
                  {tech?.tag ? (
                    <span className="text-[11px] leading-tight text-violet-300/90 font-medium">{tech.tag}</span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-[11px] leading-tight font-medium ${isStanceCol ? 'text-dnd-gold-light/90' : 'text-gray-400'}`}>{tagAction}</div>
                <div className={`text-[10px] leading-tight mt-0.5 ${isStanceCol ? 'text-dnd-gold-light/70' : 'text-gray-500'}`}>{tagRange}</div>
              </div>
            </div>
            {isExpanded && hasDesc && (
              <p className="mt-2.5 border-t border-gray-700/40 pt-2.5 text-[12px] leading-relaxed break-words text-gray-300">
                {descText}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── 渲染 ── */
  return (
    <>
      {showMartialModule ? (
        <div
          className={`mt-2 w-full min-w-0 rounded-lg border border-gray-600 bg-gray-800/50 p-2 ${COMBAT_INNER_RIM_ONLY}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className={`text-dnd-gold-light ${CM_MEAN_LABEL} font-semibold uppercase tracking-wider`}>武技</h3>
            {canEdit ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={openMartialSettingsModal}
                  className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-dnd-gold-light hover:bg-gray-700/40"
                  title="编辑武技（添加招式、可学数量与准备状态）"
                  aria-label="编辑武技"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMartialModule(false)
                    onSave({ showMartialModule: false })
                  }}
                  className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-dnd-red hover:bg-red-900/35"
                  title="折叠武技模块"
                  aria-label="折叠武技模块"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            {martialSlots.length === 0 ? (
              <p className="text-dnd-text-muted text-xs">暂无武技，点击右上角「编辑」在弹窗中设置可学数量并分配招式</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {martialSlots.map((slot) => renderMartialCombatRow(slot, slot.kind === 'stance' ? 'stance' : 'other'))}
              </div>
            )}
          </div>
        </div>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => {
            setShowMartialModule(true)
            onSave({ showMartialModule: true })
          }}
          className="w-full mt-2 py-1.5 rounded-lg border border-dashed border-gray-500 text-gray-400 hover:bg-gray-800/50 text-sm font-bold uppercase tracking-wider"
        >
          + 武技模块
        </button>
      ) : null}

      {/* 武技设置弹窗 */}
      {showAddMartialModal && martialModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2"
          onClick={() => {
            setShowAddMartialModal(false)
            setMartialModal(null)
          }}
        >
          <div
            className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col min-h-0 gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-dnd-gold-light text-sm font-bold shrink-0">武技设置</h3>

            <section className="rounded border border-gray-600/80 bg-gray-900/30 p-2.5 space-y-2 shrink-0">
              <h4 className="text-dnd-text-muted text-[11px] font-semibold uppercase tracking-wider">可学习武技数量</h4>
              <div className="flex flex-nowrap items-center gap-x-2 gap-y-2 sm:gap-x-3 overflow-x-auto pb-0.5">
                <span className="text-dnd-text-body text-xs shrink-0">架势槽位</span>
                <NumberStepper
                  value={martialModal.quota.stanceMax}
                  onChange={(v) => {
                    const clamped = Math.max(0, Math.min(30, v))
                    const { quota, stanceRows, strikeRows } = martialModal
                    const nextQuota = { ...quota, stanceMax: clamped }
                    let nextStance = [...stanceRows]
                    if (clamped > nextStance.length) {
                      for (let i = nextStance.length; i < clamped; i += 1) {
                        nextStance.push({
                          id: `mt_st_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                          techniqueId: '',
                          prepared: false,
                        })
                      }
                    } else {
                      nextStance = nextStance.slice(0, clamped)
                    }
                    commitMartialModal({ quota: nextQuota, stanceRows: nextStance, strikeRows })
                  }}
                  min={0}
                  max={30}
                  compact
                  narrow
                />
                <span className="text-dnd-text-muted/80 shrink-0 select-none" aria-hidden>|</span>
                <span className="text-dnd-text-body text-xs shrink-0">攻击技槽位</span>
                <NumberStepper
                  value={martialModal.quota.strikeMax}
                  onChange={(v) => {
                    const clamped = Math.max(0, Math.min(30, v))
                    const { quota, stanceRows, strikeRows } = martialModal
                    const nextQuota = { ...quota, strikeMax: clamped }
                    let nextStrike = [...strikeRows]
                    if (clamped > nextStrike.length) {
                      for (let i = nextStrike.length; i < clamped; i += 1) {
                        nextStrike.push({
                          id: `mt_sk_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                          techniqueId: '',
                          prepared: false,
                        })
                      }
                    } else {
                      nextStrike = nextStrike.slice(0, clamped)
                    }
                    commitMartialModal({ quota: nextQuota, stanceRows, strikeRows: nextStrike })
                  }}
                  min={0}
                  max={30}
                  compact
                  narrow
                />
              </div>
              <div>
                <label className="block text-dnd-text-muted text-[11px] mb-1">可学习流派</label>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {MARTIAL_TECHNIQUE_STYLES.map((s) => {
                    const checked = martialModal.quota.style.includes(s)
                    return (
                      <label key={s} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextStyle = checked
                              ? martialModal.quota.style.filter((x) => x !== s)
                              : [...martialModal.quota.style, s]
                            const sanitize = (rows) =>
                              rows.map((r) => {
                                if (!r.techniqueId) return r
                                const t = getMartialTechniqueById(r.techniqueId)
                                if (!t || (nextStyle.length > 0 && !nextStyle.includes(t.style))) {
                                  return { ...r, techniqueId: '', prepared: false }
                                }
                                return r
                              })
                            const nextQuota = { ...martialModal.quota, style: nextStyle }
                            commitMartialModal({
                              ...martialModal,
                              quota: nextQuota,
                              stanceRows: sanitize(martialModal.stanceRows),
                              strikeRows: sanitize(martialModal.strikeRows),
                            })
                          }}
                          className="h-3.5 w-3.5 accent-dnd-gold cursor-pointer"
                        />
                        <span className="text-dnd-text-body text-xs">{s}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              {martialModal.quota.style.length > 0 ? (
                <div className="max-h-[22vh] overflow-y-auto pr-0.5 rounded border border-gray-700/80 bg-black/20 p-1.5 space-y-1.5">
                  {martialModal.quota.style.map((s) => (
                    <MartialStyleIntroBlock key={s} styleName={s} compact />
                  ))}
                </div>
              ) : null}
            </section>

            <section className="min-h-0 flex-1 flex flex-col gap-2 overflow-hidden">
              <h4 className="text-dnd-text-muted text-[11px] font-semibold uppercase tracking-wider shrink-0">
                已分配招式（自下拉选择；每条可点「准备」）
              </h4>
              <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-0.5">
                <div>
                  <p className="text-dnd-gold-light/90 text-xs font-medium mb-1.5">架势</p>
                  {martialModal.stanceRows.length === 0 ? (
                    <p className="text-dnd-text-muted text-xs py-1">请先将「架势槽位」设为大于 0。</p>
                  ) : (
                    <div className="space-y-1.5">
                      {martialModal.stanceRows.map((row, idx) => {
                        const selectedIds = new Set(
                          martialModal.stanceRows
                            .filter((_, i) => i !== idx)
                            .map((r) => r.techniqueId)
                            .filter(Boolean)
                        )
                        const options = listMartialTechniquesForSlot(
                          'stance',
                          martialModal.quota.style
                        ).filter((t) => !selectedIds.has(t.id) || t.id === row.techniqueId)
                        return (
                          <div
                            key={row.id}
                            className="flex flex-wrap items-center gap-2 rounded border border-gray-600/80 bg-gray-900/40 px-2 py-1.5"
                          >
                            <span className="text-dnd-text-muted text-[10px] shrink-0 w-8">{idx + 1}</span>
                            <select
                              value={row.techniqueId}
                              onChange={(e) => {
                                const v = e.target.value
                                const next = martialModal.stanceRows.map((r, i) =>
                                  i === idx ? { ...r, techniqueId: v, prepared: v ? r.prepared : false } : r
                                )
                                commitMartialModal({ ...martialModal, stanceRows: next })
                              }}
                              className={inputClass + ' flex-1 min-w-[12rem] h-8 text-xs'}
                            >
                              <option value="">— 选择架势 —</option>
                              {options.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}（{t.type}）
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!row.techniqueId}
                              onClick={() => {
                                const next = martialModal.stanceRows.map((r, i) =>
                                  i === idx && r.techniqueId ? { ...r, prepared: !r.prepared } : r
                                )
                                commitMartialModal({ ...martialModal, stanceRows: next })
                              }}
                              className={`shrink-0 rounded px-2 py-1 text-xs border transition-colors ${
                                row.prepared
                                  ? 'border-dnd-gold/50 bg-dnd-gold/15 text-dnd-gold-light'
                                  : 'border-gray-600 text-gray-400 hover:bg-gray-700'
                              } disabled:opacity-40 disabled:pointer-events-none`}
                            >
                              {row.prepared ? '已准备' : '准备'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-dnd-gold-light/90 text-xs font-medium mb-1.5">攻击技</p>
                  {martialModal.strikeRows.length === 0 ? (
                    <p className="text-dnd-text-muted text-xs py-1">请先将「攻击技槽位」设为大于 0。</p>
                  ) : (
                    <div className="space-y-1.5">
                      {martialModal.strikeRows.map((row, idx) => {
                        const selectedIds = new Set(
                          martialModal.strikeRows
                            .filter((_, i) => i !== idx)
                            .map((r) => r.techniqueId)
                            .filter(Boolean)
                        )
                        const options = listMartialTechniquesForSlot(
                          'strike',
                          martialModal.quota.style
                        ).filter((t) => !selectedIds.has(t.id) || t.id === row.techniqueId)
                        return (
                          <div
                            key={row.id}
                            className="flex flex-wrap items-center gap-2 rounded border border-gray-600/80 bg-gray-900/40 px-2 py-1.5"
                          >
                            <span className="text-dnd-text-muted text-[10px] shrink-0 w-8">{idx + 1}</span>
                            <select
                              value={row.techniqueId}
                              onChange={(e) => {
                                const v = e.target.value
                                const next = martialModal.strikeRows.map((r, i) =>
                                  i === idx ? { ...r, techniqueId: v, prepared: v ? r.prepared : false } : r
                                )
                                commitMartialModal({ ...martialModal, strikeRows: next })
                              }}
                              className={inputClass + ' flex-1 min-w-[12rem] h-8 text-xs'}
                            >
                              <option value="">— 选择攻击技 —</option>
                              {options.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}（Lv.{t.level ?? '—'}）
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!row.techniqueId}
                              onClick={() => {
                                const next = martialModal.strikeRows.map((r, i) =>
                                  i === idx && r.techniqueId ? { ...r, prepared: !r.prepared } : r
                                )
                                commitMartialModal({ ...martialModal, strikeRows: next })
                              }}
                              className={`shrink-0 rounded px-2 py-1 text-xs border transition-colors ${
                                row.prepared
                                  ? 'border-dnd-gold/50 bg-dnd-gold/15 text-dnd-gold-light'
                                  : 'border-gray-600 text-gray-400 hover:bg-gray-700'
                              } disabled:opacity-40 disabled:pointer-events-none`}
                            >
                              {row.prepared ? '已准备' : '准备'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <button
              type="button"
              onClick={() => {
                setShowAddMartialModal(false)
                setMartialModal(null)
              }}
              className="w-full py-2 rounded border border-gray-500 text-gray-400 hover:bg-gray-700 text-sm shrink-0"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </>
  )
}
