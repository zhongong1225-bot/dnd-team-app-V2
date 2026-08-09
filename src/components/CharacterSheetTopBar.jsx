import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, User, Trash2 } from 'lucide-react'
import { getCharacter } from '../lib/characterStore'
import { resolveCreatureHpDisplay } from '../lib/creatureHpDisplay'
import { hpBarMainFillClass, hpBarMainFillClassFromPct, HP_BAR_TEMP_FILL_CLASS } from '../lib/hpBarShared'
import { inputClass } from '../lib/inputStyles'
import { TOPBAR_BACK_ARROW_CLASS, TOPBAR_BACK_LINK_CLASS } from '../lib/topBarShared'
import { getTopBarHostElement } from './TopBarHost'

const LAYOUT_INNER = 'mx-auto w-[1180px] min-w-[1180px] shrink-0 min-h-[6rem]'

/** 顶栏召唤槽位数（等分一行） */
const SUMMON_SLOT_COUNT = 4

/** 空槽 / 选择中 / 已填 同一高度（紧凑，少占顶栏） */
const SUMMON_SLOT_HEIGHT_CLASS = 'h-[3.875rem] min-h-[3.875rem] max-h-[3.875rem]'

/** 读取并校验 4 槽引用（星辰分身 / 附属） */
function readSummonSlots(char, stellar, subordinates) {
  const raw = char?.summonSlots
  const slots = Array.isArray(raw) ? raw.slice(0, SUMMON_SLOT_COUNT) : []
  while (slots.length < SUMMON_SLOT_COUNT) slots.push(null)
  for (let i = 0; i < SUMMON_SLOT_COUNT; i++) {
    const c = slots[i]
    if (c == null || typeof c !== 'object') {
      slots[i] = null
      continue
    }
    if (c.type === 'stellar' && !stellar.some((r) => r.id === c.id)) slots[i] = null
    if (c.type === 'sub' && !subordinates.some((s) => s.id === c.id)) slots[i] = null
  }
  return slots
}

/** 顶栏快捷跳转各区块；hideCreature 时生物卡隐藏部分入口 */
const JUMP_SECTIONS = [
  { id: 'sheet-profile', label: '档案 / 外观', short: '档案' },
  { id: 'sheet-xp', label: '经验与等级', short: '经验', hideCreature: true },
  { id: 'sheet-class', label: '职业', short: '职业', hideCreature: true },
  { id: 'sheet-abilities', label: '属性与熟练', short: '属性', hideCreature: true },
  { id: 'sheet-buffs', label: 'Buff / 状态', short: 'Buff', hideCreature: true },
  { id: 'sheet-combat', label: '战斗状态', short: '战斗', hideCreature: true },
  { id: 'sheet-inventory', label: '装备与背包', short: '背包', hideCreature: true },
  { id: 'sheet-features', label: '职业特性 / 专长', short: '特性', hideCreature: true },
]

function hpBarWidths(cur, max, temp) {
  const denom = Math.max(Number(max) || 0, Number(cur) + Number(temp), 1)
  const curW = (Math.max(0, Number(cur) || 0) / denom) * 100
  const tempW = (Math.max(0, Number(temp) || 0) / denom) * 100
  return { curW, tempW }
}

function mainHpPercent(cur, max, temp) {
  const m = Math.max(0, Number(max) || 0)
  const pool = Math.max(0, Number(cur) || 0) + Math.max(0, Number(temp) || 0)
  if (m <= 0) return pool > 0 ? 100 : 0
  return Math.min(999, Math.round((pool / m) * 100))
}

function simplePct(c, m) {
  const max = Math.max(0, Number(m) || 0)
  const cur = Math.max(0, Number(c) || 0)
  if (max <= 0) return cur > 0 ? 100 : 0
  return Math.round((cur / max) * 100)
}

function simpleBarTone(p) {
  return hpBarMainFillClassFromPct(p)
}

/** 附属槽位简略条：与 CreatureSimpleBlock 共用生物 HP 解析（hpText + 结构化 hp） */
function subordinateHpPool(sub) {
  return resolveCreatureHpDisplay(sub)
}

/** 解析生命增减量，如 -50、+10、8；空或非整数返回 null */
function parseHpDelta(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return null
  const n = Number.parseInt(s, 10)
  if (!Number.isFinite(n)) return null
  return n
}

function slotEntityMeta(ref, stellar, subordinates) {
  if (!ref) return null
  if (ref.type === 'stellar') {
    const row = stellar.find((r) => r.id === ref.id)
    if (!row) return null
    const h = row.hp ?? { current: 0, max: 1 }
    const c = Math.max(0, Number(h.current) || 0)
    const mx = Math.max(1, Number(h.max) || 1)
    const pool = c
    const pct = simplePct(Math.min(pool, mx), mx)
    return {
      kind: 'stellar',
      id: ref.id,
      name: row.name || '星辰分身',
      cur: c,
      max: mx,
      temp: 0,
      pct,
      barClass: simpleBarTone(pct),
    }
  }
  if (ref.type === 'sub') {
    const sub = subordinates.find((s) => s.id === ref.id) || getCharacter(ref.id)
    if (!sub) return null
    const { cur: c, max: mx, temp: t } = subordinateHpPool(sub)
    const pool = c + t
    const pct = simplePct(Math.min(pool, mx), mx)
    return {
      kind: 'sub',
      id: ref.id,
      name: (sub.codename || sub.name || '附属').trim(),
      cur: c,
      max: mx,
      temp: t,
      pct,
      barClass: simpleBarTone(pct),
    }
  }
  return null
}

/**
 * 顶栏 fixed + portal 到 body。第一行：返回、头像、名称/血条/召唤按钮、快捷跳转；
 * 召唤槽位为叠层（absolute），不写入 --character-sheet-topbar-h，避免展开时推动正文。
 */
export default function CharacterSheetTopBar({
  char,
  isCreatureTemplate,
  persistMain,
  persistSubordinate,
  canEdit,
  subordinates,
}) {
  const [targetKey, setTargetKey] = useState('main')
  const [summonPanelOpen, setSummonPanelOpen] = useState(false)
  /** 正在选择分身类型的空槽索引（点击虚框后展开下拉，类似兼职添加行） */
  const [activeSlotPicker, setActiveSlotPicker] = useState(null)
  /** 挂在 nav 上：高度含 safe-area-pt，与正文 padding-top 一致 */
  const navRef = useRef(null)

  const stellar = Array.isArray(char?.stellarClones) ? char.stellarClones : []

  /** 仅测量第一行顶栏高度（不含召唤叠层），避免展开/收起时推动正文 padding 导致视跳动 */
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav || typeof document === 'undefined') return undefined
    const apply = () => {
      const h = Math.ceil(nav.getBoundingClientRect().height)
      if (h > 0) document.documentElement.style.setProperty('--character-sheet-topbar-h', `${h}px`)
    }
    apply()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    ro?.observe(nav)
    window.addEventListener('resize', apply)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', apply)
      // 不再 removeProperty('--character-sheet-topbar-h')：路由切换时让变量保持上一个值，
      // 避免新旧顶栏交接瞬间 padding-top 跳变、页面闪烁。新顶栏挂载后会测量并覆盖。
    }
  }, [])

  const summonSlots = useMemo(
    () => readSummonSlots(char, stellar, subordinates),
    [char?.summonSlots, stellar, subordinates],
  )

  useEffect(() => {
    if (!summonPanelOpen) setActiveSlotPicker(null)
  }, [summonPanelOpen])

  /** 首次展开或旧存档无 summonSlots 时，写入 4 槽并从现有星辰分身回填 */
  useEffect(() => {
    if (!summonPanelOpen || !canEdit) return
    if (Array.isArray(char?.summonSlots) && char.summonSlots.length === SUMMON_SLOT_COUNT) return
    const packed = Array(SUMMON_SLOT_COUNT).fill(null)
    for (let i = 0; i < Math.min(SUMMON_SLOT_COUNT, stellar.length); i++) {
      packed[i] = { type: 'stellar', id: stellar[i].id }
    }
    persistMain({ summonSlots: packed })
  }, [summonPanelOpen, canEdit, char?.summonSlots, stellar, persistMain, char?.id])

  useEffect(() => {
    if (targetKey === 'main') return
    if (targetKey.startsWith('stellar:')) {
      const id = targetKey.slice(9)
      if (!stellar.some((r) => r.id === id)) setTargetKey('main')
    } else if (targetKey.startsWith('sub:')) {
      const id = targetKey.slice(4)
      if (!subordinates.some((s) => s.id === id)) setTargetKey('main')
    }
  }, [targetKey, stellar, subordinates])

  const toggleSummonPanel = () => {
    setSummonPanelOpen((v) => {
      if (v) setTargetKey('main')
      return !v
    })
  }

  const jumpItems = JUMP_SECTIONS.filter((s) => !s.hideCreature || !isCreatureTemplate)

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openCharacterCard = (id) => {
    if (!id || typeof window === 'undefined') return
    window.location.assign(`/characters/${encodeURIComponent(id)}`)
  }

  const openSlotCard = (meta) => {
    if (!meta) return
    if (meta.kind === 'sub') {
      openCharacterCard(meta.id)
      return
    }
    setTargetKey(`stellar:${meta.id}`)
  }

  const mainHp = char?.hp ?? { current: 0, max: 0, temp: 0, buffTemp: 0 }
  const mCur = Math.max(0, Number(mainHp.current) || 0)
  const mMax = Math.max(0, Number(mainHp.max) || 0)
  const mTemp = Math.max(0, Number(mainHp.temp) || 0)
  const mBuffTemp = Math.max(0, Number(mainHp.buffTemp) || 0)
  const totalTemp = mTemp + mBuffTemp
  const { curW, tempW } = hpBarWidths(mCur, mMax, totalTemp)
  const curFillClass = hpBarMainFillClass(mCur, mMax)
  const mainPct = mainHpPercent(mCur, mMax, totalTemp)
  const hpLabel = totalTemp > 0 ? `${mCur}+${totalTemp} / ${mMax}` : `${mCur} / ${mMax}`

  const addStellarToSlot = (slotIndex) => {
    if (!canEdit) return
    const slots = readSummonSlots(char, stellar, subordinates)
    if (slots[slotIndex] != null) return
    const hp = char?.hp ?? { current: 0, max: 0, temp: 0 }
    const cur = Math.max(0, Number(hp.current) || 0)
    if (cur < 2) return
    const half = Math.floor(cur / 2)
    const id = `stellar_${Date.now()}`
    const nextSlots = [...slots]
    nextSlots[slotIndex] = { type: 'stellar', id }
    persistMain({
      hp: { ...hp, current: cur - half },
      stellarClones: [
        ...stellar,
        {
          id,
          name: stellar.length ? `分身${stellar.length + 1}` : '星辰分身',
          hp: { current: half, max: Math.max(half, 1) },
        },
      ],
      summonSlots: nextSlots,
    })
    setTargetKey(`stellar:${id}`)
    setActiveSlotPicker(null)
  }

  const assignSubToSlot = (slotIndex, subId) => {
    if (!canEdit) return
    const slots = readSummonSlots(char, stellar, subordinates)
    const nextSlots = [...slots]
    nextSlots[slotIndex] = { type: 'sub', id: subId }
    persistMain({ summonSlots: nextSlots })
    setTargetKey(`sub:${subId}`)
    setActiveSlotPicker(null)
  }

  /** 删除指定星辰分身并清空对应槽位 */
  const removeStellarCloneById = (id) => {
    if (!canEdit) return
    const slots = readSummonSlots(char, stellar, subordinates).map((s) =>
      s?.type === 'stellar' && s.id === id ? null : s,
    )
    persistMain({
      stellarClones: stellar.filter((r) => r.id !== id),
      summonSlots: slots,
    })
    if (targetKey === `stellar:${id}`) setTargetKey('main')
  }

  /** 清空槽位：附属仅解绑；星辰分身会删除该分身数据 */
  const clearSlotAt = (slotIndex) => {
    if (!canEdit) return
    const ref = summonSlots[slotIndex]
    if (!ref) return
    if (ref.type === 'stellar') {
      removeStellarCloneById(ref.id)
      return
    }
    const next = [...summonSlots]
    next[slotIndex] = null
    persistMain({ summonSlots: next })
    if (targetKey === `sub:${ref.id}`) setTargetKey('main')
  }

  const onSlotPickSelect = (slotIndex, value) => {
    if (value === '_stellar') addStellarToSlot(slotIndex)
    else if (value.startsWith('sub:')) assignSubToSlot(slotIndex, value.slice(4))
  }

  /** 槽位内输入为「增减量」：在现有生命池上加减（星辰 / 附属） */
  const applySlotHpDelta = (meta, raw, inputEl) => {
    const clear = () => {
      if (inputEl) inputEl.value = ''
    }
    if (!canEdit || !meta) {
      clear()
      return
    }
    const delta = parseHpDelta(raw)
    if (delta === null) {
      clear()
      return
    }
    if (delta === 0) {
      clear()
      return
    }
    const pool = meta.kind === 'sub' ? meta.cur + meta.temp : meta.cur
    const cap = Math.max(1, Number(meta.max) || 1)
    let next = pool + delta
    next = Math.max(0, Math.min(next, cap))
    if (next === pool) {
      clear()
      return
    }
    if (meta.kind === 'stellar') {
      const row = stellar.find((r) => r.id === meta.id)
      if (!row) {
        clear()
        return
      }
      const mx = Math.max(1, Number(row.hp?.max) || 1)
      persistMain({
        stellarClones: stellar.map((r) =>
          r.id === meta.id
            ? { ...r, hp: { ...(r.hp ?? {}), current: next, max: mx } }
            : r,
        ),
      })
      clear()
      return
    }
    if (meta.kind === 'sub' && typeof persistSubordinate === 'function') {
      const sub = getCharacter(meta.id)
      if (!sub) {
        clear()
        return
      }
      const { max: mx } = subordinateHpPool(sub)
      persistSubordinate(meta.id, {
        hp: { ...(sub.hp ?? {}), current: next, temp: 0, max: mx },
      })
      clear()
    }
  }

  const avatarEl = char?.avatar ? (
    <img
      src={char.avatar}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full border border-white/20 object-cover sm:h-10 sm:w-10"
    />
  ) : (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 sm:h-10 sm:w-10">
      <User className="h-4 w-4 text-dnd-text-muted sm:h-5 sm:w-5" strokeWidth={1.8} />
    </div>
  )

  /** 槽位内下拉：不超出父级，宽度随 flex 收缩 */
  const summonPickSelectClass =
    inputClass +
    ' !max-w-full min-w-0 !w-full !h-5 !min-h-[1.25rem] !py-0 !px-1.5 !text-[11px] !leading-none cursor-pointer appearance-auto'

  /** 召唤槽位：叠在第一行下方，不占文档流，不推高 --character-sheet-topbar-h */
  const summonExpanded = summonPanelOpen && canEdit && (
    <div
      className="pointer-events-auto absolute left-0 right-0 top-full z-[1] border-t border-white/10 border-b border-white/10 bg-[#2D3748]/72 backdrop-blur-md shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
      role="region"
      aria-label="召唤物槽位（顶栏第二层）"
    >
      <div className={`${LAYOUT_INNER} mx-auto px-4 pb-1.5 pt-1.5`}>
      <div className="grid w-full min-w-0 grid-cols-4 items-stretch gap-1.5">
        {summonSlots.map((slotRef, i) => {
          const meta = slotEntityMeta(slotRef, stellar, subordinates)
          const picking = activeSlotPicker === i

          if (!meta) {
            if (picking) {
              return (
                <div
                  key={i}
                  className={`${SUMMON_SLOT_HEIGHT_CLASS} box-border flex min-w-0 flex-col justify-between gap-0.5 overflow-hidden rounded-md border border-dashed border-sky-500/40 bg-[rgba(30,38,50,0.5)] p-1 shadow-sm`}
                >
                  <div className="flex min-w-0 max-w-full shrink-0 items-center gap-0.5 overflow-hidden">
                    <select
                      className={`${summonPickSelectClass} min-w-0 flex-1`}
                      aria-label={`槽位 ${i + 1} 选择分身`}
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value
                        if (v) onSlotPickSelect(i, v)
                        e.target.value = ''
                      }}
                    >
                      <option value="">选择分身类型</option>
                      {stellar.length === 0 ? (
                        <option value="_stellar" disabled={mCur < 2}>
                          星辰分身（主角生命减半）
                        </option>
                      ) : null}
                      {subordinates.length > 0 ? (
                        <optgroup label="附属卡">
                          {subordinates.map((s) => (
                            <option key={s.id} value={`sub:${s.id}`}>
                              {(s.codename || s.name || '未命名').trim()}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                    <button
                      type="button"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-dnd-text-muted hover:bg-red-900/30 hover:text-red-300"
                      title="关闭"
                      aria-label="关闭选择"
                      onClick={() => setActiveSlotPicker(null)}
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={2.25} />
                    </button>
                  </div>
                  <div className="min-w-0 max-w-full shrink-0">
                    <div
                      className="flex h-1 min-w-0 w-full overflow-hidden rounded-full bg-white/15"
                      aria-hidden
                    />
                    <div
                      className="mt-px text-right font-mono text-[10px] tabular-nums leading-none text-transparent select-none"
                      aria-hidden
                    >
                      0%
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActiveSlotPicker((prev) => (prev === i ? null : i))}
                className={`${SUMMON_SLOT_HEIGHT_CLASS} box-border flex min-w-0 w-full flex-col items-center justify-center gap-px rounded-md border border-dashed border-white/30 bg-transparent px-1 py-1 text-center transition-colors hover:border-white/45 hover:bg-white/[0.04]`}
              >
                {stellar.length === 0 ? (
                  <>
                    <span className="text-[11px] leading-tight text-dnd-text-muted/95">
                      点击召唤星辰分身
                    </span>
                    <span className="text-[10px] text-dnd-text-muted/70">或关联附属卡</span>
                  </>
                ) : (
                  <span className="text-[11px] leading-tight text-dnd-text-muted/95">
                    点击关联附属卡
                  </span>
                )}
              </button>
            )
          }

          const slotFocused =
            (meta.kind === 'stellar' && targetKey === `stellar:${meta.id}`) ||
            (meta.kind === 'sub' && targetKey === `sub:${meta.id}`)
          const subCard =
            meta.kind === 'sub'
              ? (subordinates.find((s) => s.id === meta.id) || getCharacter(meta.id))
              : null
          const hoverTitle =
            meta.kind === 'sub'
              ? [
                  `附属卡：${meta.name}`,
                  `类型：${subCard?.creatureStatBlock?.typeLine ?? '—'}`,
                  `HP ${meta.cur}/${meta.max}${meta.temp > 0 ? ` (+${meta.temp})` : ''}`,
                  `AC ${subCard?.creatureStatBlock?.acText ?? subCard?.ac ?? '—'} · 速度 ${subCard?.creatureStatBlock?.speedText ?? '—'} · 先攻 ${subCard?.creatureStatBlock?.initText ?? '—'}`,
                  `CR ${subCard?.creatureStatBlock?.crText ?? '—'}`,
                  `感官 ${subCard?.creatureStatBlock?.sensesText ?? '—'}`,
                  `语言 ${subCard?.creatureStatBlock?.languagesText ?? '—'}`,
                  '点击进入角色卡',
                ].join('\n')
              : '点击切换查看此单位生命'

          return (
            <div
              key={i}
              className={`${SUMMON_SLOT_HEIGHT_CLASS} box-border flex min-w-0 flex-col justify-between gap-0.5 rounded-md border border-[var(--card-border)] bg-[rgba(30,38,50,0.5)] p-1 shadow-sm transition-shadow ${
                slotFocused ? 'ring-1 ring-sky-500/40 ring-offset-1 ring-offset-[#2D3748]' : ''
              } ${meta.kind === 'sub' ? 'cursor-pointer' : ''}`}
              onClick={() => openSlotCard(meta)}
              title={hoverTitle}
            >
              <div className="flex min-w-0 max-w-full shrink-0 items-start justify-between gap-0.5 overflow-hidden">
                <button
                  type="button"
                  title={meta.kind === 'sub' ? '进入附属卡' : '切换查看此单位生命（与战斗等联动）'}
                  className="min-w-0 flex-1 truncate text-left text-[11px] font-medium leading-tight text-[var(--text-main)] hover:text-sky-200/95"
                  onClick={(e) => {
                    e.stopPropagation()
                    openSlotCard(meta)
                  }}
                >
                  {meta.name}
                </button>
                <button
                  type="button"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-dnd-text-muted hover:bg-red-900/35 hover:text-red-300"
                  title={meta.kind === 'stellar' ? '删除星辰分身并清空槽位' : '移除此槽位的附属关联'}
                  aria-label="移除槽位"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearSlotAt(i)
                  }}
                >
                  <Trash2 className="h-3 w-3" strokeWidth={2.25} />
                </button>
              </div>
              <div className="min-w-0 max-w-full shrink-0">
                <div
                  className="flex h-1 min-w-0 w-full overflow-hidden rounded-full bg-white/15"
                  role="progressbar"
                  aria-valuenow={meta.cur}
                  aria-valuemax={meta.max}
                >
                  <div
                    className={`h-full rounded-full transition-all ${meta.barClass}`}
                    style={{ width: `${Math.min(100, meta.pct)}%` }}
                  />
                </div>
                <div className="mt-px flex min-w-0 items-center justify-between gap-1">
                  {canEdit ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      title="输入整数增减生命：正数为回复，负数为伤害（失焦或回车生效）"
                      placeholder="±"
                      aria-label={`${meta.name} 生命增减`}
                      defaultValue=""
                      key={`hp-delta-${meta.kind}-${meta.id}`}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => applySlotHpDelta(meta, e.target.value, e.target)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          applySlotHpDelta(meta, e.currentTarget.value, e.currentTarget)
                          e.currentTarget.blur()
                        }
                      }}
                      className="w-[2.75rem] min-w-0 rounded border border-white/15 bg-white/[0.06] px-0.5 py-0 text-left font-mono text-[10px] tabular-nums text-[var(--text-main)] placeholder:text-dnd-text-muted/50 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  ) : (
                    <span className="font-mono text-[10px] tabular-nums text-dnd-text-muted">
                      {meta.kind === 'sub' ? meta.cur + meta.temp : meta.cur}
                    </span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    {meta.kind === 'sub' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openCharacterCard(meta.id)
                        }}
                        className="rounded border border-white/15 px-1.5 py-0 text-[10px] leading-none text-sky-200/90 hover:border-sky-300/60 hover:bg-sky-500/10"
                        title="快速进入附属卡"
                      >
                        进入
                      </button>
                    )}
                    <span className="font-mono text-[10px] leading-none tabular-nums text-dnd-text-muted">
                      {meta.pct}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )

  const navEl = (
    <nav
      ref={navRef}
      className="fixed inset-x-0 top-0 z-40 w-full safe-area-pt"
      aria-label="角色卡顶栏"
    >
      <div className="relative">
        <div
          className="relative z-10 bg-[#2D3748]/78 backdrop-blur-md border-b border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        >
          <div className={`${LAYOUT_INNER} flex min-w-0 flex-col px-4`}>
        {/* 第一层（顶栏主条）：返回、头像、名称/血条/召唤按钮、快捷跳转 */}
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-2 gap-y-0 py-2 sm:gap-3 sm:py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[12rem]">
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/characters"
                className={TOPBAR_BACK_LINK_CLASS}
                title="返回角色列表"
                aria-label="返回角色列表"
              >
                <ArrowLeft className={TOPBAR_BACK_ARROW_CLASS} strokeWidth={2} />
              </Link>
              {avatarEl}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 leading-none">
              {char?.id ? (
                <Link
                  to={`/characters/${encodeURIComponent(char.id)}`}
                  className="min-w-0 truncate text-left text-xs font-medium text-[var(--text-main)] sm:text-sm hover:text-sky-200/95 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/40 rounded"
                  title="打开主卡"
                  aria-label={`打开主卡：${char?.name?.trim() || '未命名'}`}
                >
                  {char?.name?.trim() || '未命名'}
                </Link>
              ) : (
                <span
                  className="min-w-0 truncate text-xs font-medium text-[var(--text-main)] sm:text-sm"
                  title={char?.name?.trim() || '未命名'}
                >
                  {char?.name?.trim() || '未命名'}
                </span>
              )}

              <div
                className="flex min-w-0 items-center gap-1.5 sm:gap-2"
                role="group"
                aria-label={`${char?.name?.trim() || '主角'} 生命 ${mainPct}%（${hpLabel}）`}
              >
                <div
                  className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15"
                  role="progressbar"
                  aria-valuenow={mCur}
                  aria-valuemax={mMax || 1}
                >
                  {curW > 0 ? (
                    <div
                      className={`absolute left-0 top-0 h-full transition-[width] duration-300 ${curFillClass} ${tempW > 0 ? 'rounded-l-full' : 'rounded-full'}`}
                      style={{ width: `${curW}%` }}
                    />
                  ) : null}
                  {tempW > 0 ? (
                    <div
                      className={`absolute top-0 h-full ${HP_BAR_TEMP_FILL_CLASS} ${curW > 0 ? 'rounded-none rounded-r-full' : 'rounded-full'}`}
                      style={{ left: `${curW}%`, width: `${tempW}%` }}
                    />
                  ) : null}
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-main)] sm:text-sm">
                  {mainPct}%
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="shrink-0 rounded border border-sky-600/45 px-1.5 py-0.5 text-[9px] font-medium text-sky-300/95 hover:bg-sky-900/25 sm:text-[10px]"
                    title={summonPanelOpen ? '收起召唤面板' : '展开后选择召唤物'}
                    onClick={toggleSummonPanel}
                  >
                    {summonPanelOpen ? '收起' : '召唤'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="character-sheet-top-jump-scroll flex min-h-0 min-w-0 flex-1 justify-end overflow-x-auto py-0.5 sm:py-0">
            <div
              className="flex shrink-0 flex-nowrap items-center justify-end gap-0.5 sm:gap-1"
              role="toolbar"
              aria-label="区块快捷跳转"
            >
              {jumpItems.map(({ id, label, short }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  className="shrink-0 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-sm font-medium text-dnd-text-muted/90 transition-colors hover:bg-white/[0.07] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2D3748] active:bg-white/[0.09] sm:px-3"
                  onClick={() => scrollToSection(id)}
                >
                  {short}
                </button>
              ))}
            </div>
          </div>
        </div>
          </div>
        </div>
        {/* 第二层：召唤槽位，叠在顶栏主条正下方，z 低于主条 */}
        {summonExpanded}
      </div>
    </nav>
  )

  const host = getTopBarHostElement()
  if (typeof document === 'undefined' || !host) return null
  return createPortal(navEl, host)
}
