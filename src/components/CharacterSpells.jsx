/**
 * 角色法术：从法术大全添加法术，支持「已准备」切换
 * 以卡片形式展示，从低环到高环垂直排布
 */
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Trash2, Search, BookOpen, Plus, ChevronDown, ChevronRight, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getSpellById, getSpellsByClass, searchSpells } from '../data/spellDatabase'
import { getCharacterClasses, getMaxSpellSlotsByRing } from '../data/classDatabase'
import { useModule } from '../contexts/ModuleContext'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { getMergedBuffsForCalculator } from '../lib/effects/effectMapping'
import { getSpellcastingCombatStats } from '../lib/spellcastingStats'
import { levelFromXP } from '../lib/xp5e'
import { ABILITY_NAMES_ZH } from '../data/buffTypes'
import { inputClassToolbarH8 } from '../lib/inputStyles'
import { rollPsychicCollapseCastSave, characterHasPsychicCollapse } from '../lib/psychicCollapse'
import CharacterSpellsTopBar from './CharacterSpellsTopBar'
import { TOPBAR_BACK_ARROW_CLASS, TOPBAR_BACK_LINK_CLASS } from '../lib/topBarShared'

const PREPARE_ALL_CLASSES = ['牧师', '德鲁伊', '游侠', '圣武士']

const LEVEL_LABELS = {
  0: '戏法',
  1: '一环',
  2: '二环',
  3: '三环',
  4: '四环',
  5: '五环',
  6: '六环',
  7: '七环',
  8: '八环',
  9: '九环',
}

const SCHOOL_TAG_STYLES = {
  防护: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  咒法: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  预言: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
  惑控: 'bg-pink-500/20 text-pink-200 border-pink-500/40',
  塑能: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  幻术: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  死灵: 'bg-purple-600/25 text-purple-200 border-purple-500/40',
  变化: 'bg-teal-500/20 text-teal-200 border-teal-500/40',
  灵能: 'bg-indigo-500/25 text-indigo-200 border-indigo-500/50',
}
function getSchoolTagStyle(school) {
  return SCHOOL_TAG_STYLES[school] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/40'
}

/** 单张法术卡：网格行内等高时用 h-full；勿对正文区用 min-h-0，否则易被父级 overflow 裁切 */
const SPELL_ENTRY_CARD_CLASS =
  'flex h-full min-w-0 flex-col overflow-visible rounded-xl border border-white/[0.11] !p-3 bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] shadow-dnd-card'
/** 环位折叠外壳：与上方施法顶卡 module-panel 同底纹与内高光 + 左侧金条（勿 overflow-hidden，否则会裁掉法术卡下半） */
const SPELL_RING_CARD_CLASS =
  'module-panel !p-0 border-l-[3px] border-l-[var(--accent)]'
/** 合并顶卡内紧凑工具按钮（与搜索框 h-8 同高） */
const SPELL_TOOLBAR_BTN_COMPACT =
  'inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-0 text-xs font-semibold leading-none text-[var(--text-main)] transition-colors hover:border-[var(--input-focus)] focus:outline-none focus:ring-2 focus:ring-[rgba(199,154,66,0.2)]'

/** 五格统计：独立小卡（与法术列表卡同系） */
const SPELL_STAT_MINI_CARD =
  'flex min-h-0 min-w-0 flex-col justify-center rounded-lg border border-white/[0.09] bg-gradient-to-b from-[#2a3547] to-[#1c2534] px-1.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-2 sm:py-2'
/** 顶栏施法数据：五格等宽；h-10（40px）与角色卡 panel-class-control-h 一致 */
const SPELL_STAT_CHIP =
  'box-border flex h-10 max-h-10 min-h-10 w-full min-w-0 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-white/[0.12] bg-gradient-to-b from-[#2f3d52]/95 to-[#1c2534]/90 px-1.5 shadow-[0_1px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-2'
/** 施法属性：仅强调色与 ring，不改变高度/间距 */
const SPELL_STAT_CHIP_ABILITY =
  'border-[var(--accent)]/50 bg-gradient-to-b from-[#2e3c52]/98 to-[#1e2838]/95 ring-1 ring-inset ring-[var(--accent)]/20'
const SPELL_STAT_CHIP_LABEL = 'w-full truncate text-center text-[8px] leading-none text-dnd-text-muted/90 sm:text-[9px]'
const SPELL_STAT_CHIP_LABEL_ABILITY =
  'w-full truncate text-center text-[8px] font-medium leading-none tracking-wide text-dnd-text-muted/95 sm:text-[9px]'
const SPELL_STAT_CHIP_VALUE =
  'w-full truncate text-center font-mono text-[10px] font-bold tabular-nums leading-none text-[var(--text-main)] sm:text-xs'
const SPELL_STAT_CHIP_VALUE_ACCENT =
  'w-full truncate text-center text-[11px] font-bold tabular-nums leading-none text-[var(--accent)] sm:text-xs'

/**
 * @param {{ id: string, name?: string }} characterPicker.options
 * 传入时：选择角色与五格统计同处一张 module-panel 顶卡（角色法术页）
 */
export default function CharacterSpells({
  char,
  canEdit,
  onSave,
  buffStats: buffStatsProp,
  level: levelProp,
  characterPicker,
  /** 角色法术页：顶栏 + 左侧目录固定，仅右侧法术列表滚动 */
  spellPagePinnedLayout = false,
}) {
  const { currentModuleId } = useModule()
  const spellsModuleId = currentModuleId || 'default'

  /** 乐观更新：本地维护 spells 状态，点击后立即反映到 UI，再异步持久化 */
  const [optimisticSpells, setOptimisticSpells] = useState(() => {
    const raw = char?.spells ?? []
    return raw.map((s) => ({
      spellId: s.spellId ?? s.id ?? '',
      prepared: !!s.prepared,
    }))
  })

  useEffect(() => {
    const raw = char?.spells ?? []
    setOptimisticSpells(
      raw.map((s) => ({
        spellId: s.spellId ?? s.id ?? '',
        prepared: !!s.prepared,
      }))
    )
  }, [char?.id])

  const spells = optimisticSpells
  const spellIds = new Set(spells.map((s) => s.spellId).filter(Boolean))

  /** 乐观更新：本地维护 spellSlots 状态，环位点击/施法后立即反映到 UI */
  const [optimisticSpellSlots, setOptimisticSpellSlots] = useState(() => ({ ...(char?.spellSlots ?? {}) }))

  useEffect(() => {
    setOptimisticSpellSlots({ ...(char?.spellSlots ?? {}) })
  }, [char?.id])

  const spellSlotsCurrent = optimisticSpellSlots

  /** 按环阶分组（0→9），同环内按名称排序 */
  const spellsByLevel = useMemo(() => {
    const grouped = {}
    for (let i = 0; i <= 9; i++) grouped[i] = []
    ;[...spells]
      .map((item) => {
        const spell = getSpellById(item.spellId)
        return spell ? { ...item, spell } : null
      })
      .filter(Boolean)
      .sort((a, b) => (a.spell.name ?? '').localeCompare(b.spell.name ?? ''))
      .forEach((item) => {
        const lv = item.spell.level ?? 0
        if (grouped[lv]) grouped[lv].push(item)
      })
    return grouped
  }, [spells])

  /** 目录：第一层级环位、第二层级该环下的法术名（顺序与右侧卡片一致） */
  const spellTocGroups = useMemo(() => {
    const groups = []
    for (let level = 0; level <= 9; level++) {
      const levelSpells = spellsByLevel[level] ?? []
      if (levelSpells.length === 0) continue
      groups.push({
        level,
        levelLabel: LEVEL_LABELS[level] ?? `${level}环`,
        spells: levelSpells,
      })
    }
    return groups
  }, [spellsByLevel])

  const addSpell = (spellId) => {
    if (!spellId) return
    const spell = getSpellById(spellId)
    const isCantrip = spell && (spell.level ?? 0) === 0
    const next = [...spells, { spellId, prepared: isCantrip }]
    setOptimisticSpells(next)
    onSave({ spells: next })
  }

  const togglePrepared = (spellId) => {
    const next = spells.map((item) =>
      item.spellId === spellId ? { ...item, prepared: !item.prepared } : item
    )
    setOptimisticSpells(next)
    onSave({ spells: next })
  }

  const removeSpell = (spellId) => {
    const next = spells.filter((item) => item.spellId !== spellId)
    setOptimisticSpells(next)
    onSave({ spells: next })
  }

  /** 与角色卡 Buff 栏、战斗状态一致：专长 + 手动 Buff + 装备 → 法术攻击 / DC 等 */
  const mergedBuffs = useMemo(
    () => getMergedBuffsForCalculator(char, spellsModuleId),
    [
      char?.buffs,
      char?.selectedFeats,
      char?.inventory,
      char?.equippedHeld,
      char?.equippedWorn,
      spellsModuleId,
    ],
  )
  const buffStatsComputed = useBuffCalculator(char, mergedBuffs)
  const buffStats = buffStatsProp ?? buffStatsComputed
  const sheetLevel =
    levelProp != null ? Math.max(1, Math.min(20, Math.floor(Number(levelProp) || 1))) : Math.max(1, levelFromXP(char?.xp ?? 0))

  const { spellAbility, spellAttackBonus, spellDC, spellcastingLevel: spellLevel } = getSpellcastingCombatStats(
    char,
    buffStats,
    sheetLevel,
  )

  /** 施法等级与环位数量（与 CombatStatus 一致：含 spellSlotsMaxOverride） */
  const maxSlotsByRing = useMemo(() => getMaxSpellSlotsByRing(char), [char])
  const spellSlotsMaxOverride = char?.spellSlotsMax && typeof char.spellSlotsMax === 'object' ? char.spellSlotsMax : {}
  const effectiveMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) {
      out[ring] = spellSlotsMaxOverride[ring] != null
        ? Math.max(0, Number(spellSlotsMaxOverride[ring]) || 0)
        : (maxSlotsByRing[ring] ?? 0)
    }
    return out
  }, [maxSlotsByRing, spellSlotsMaxOverride])

  const setSpellSlotCurrent = (ring, remaining) => {
    const max = effectiveMaxByRing[ring] ?? maxSlotsByRing[ring] ?? 0
    const next = { ...spellSlotsCurrent, [ring]: Math.max(0, Math.min(max, remaining)) }
    setOptimisticSpellSlots(next)
    onSave({ spellSlots: next })
  }

  const preparedCount = useMemo(() => {
    return spells.filter((s) => {
      const spell = getSpellById(s.spellId)
      const level = spell?.level ?? 0
      return level >= 1 && s.prepared
    }).length
  }, [spells])

  const classes = getCharacterClasses(char) ?? []
  const prepareAllClass = classes.find((c) => PREPARE_ALL_CLASSES.includes(c.name))?.name

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [castModal, setCastModal] = useState({ open: false, spell: null, spellId: '', spellLevel: 0 })
  const [castRing, setCastRing] = useState(1)
  /** 灵崩：先投体质豁免再确认消耗环位 */
  const [castModalStep, setCastModalStep] = useState('form')
  const [psychicRollResult, setPsychicRollResult] = useState(null)
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)
  /** 法术目录：各环位是否展开（默认全部折叠） */
  const [tocExpandedLevels, setTocExpandedLevels] = useState(() => new Set())
  /** 已添加区：各环位法术卡是否展开（默认全展开） */
  const [openSpellLevelCards, setOpenSpellLevelCards] = useState(() => new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))

  const hasPsychicCollapse = characterHasPsychicCollapse(char)

  useEffect(() => {
    if (castModal.open) {
      setCastModalStep('form')
      setPsychicRollResult(null)
    }
  }, [castModal.open, castModal.spellId])

  const applyCastConsumption = useCallback(
    ({ psychicEchoSuccess = false } = {}) => {
      const ring = castRing
      const spell = castModal.spell
      const spellId = castModal.spellId
      const maxR = effectiveMaxByRing[ring] ?? 0
      const cur = Math.max(0, (spellSlotsCurrent[ring] ?? maxR) - 1)
      const nextSlots = { ...spellSlotsCurrent, [ring]: cur }
      setOptimisticSpellSlots(nextSlots)
      const patch = { spellSlots: nextSlots }
      if (psychicEchoSuccess && hasPsychicCollapse && spell) {
        patch.psychicCollapseEcho = {
          spellId,
          spellName: spell.name ?? spellId,
          ring,
          source: 'normal',
          at: Date.now(),
        }
      }
      onSave(patch)
    },
    [
      castRing,
      castModal.spell,
      castModal.spellId,
      effectiveMaxByRing,
      spellSlotsCurrent,
      hasPsychicCollapse,
      onSave,
    ],
  )

  /** 角色职业可学的法术，按环位分组，排除已添加 */
  const spellsByLevelForDropdown = useMemo(() => {
    const seen = new Set()
    const byLevel = {}
    for (let i = 0; i <= 9; i++) byLevel[i] = []
    for (const c of classes) {
      for (const s of getSpellsByClass(c.name) ?? []) {
        if (spellIds.has(s.id) || seen.has(s.id)) continue
        seen.add(s.id)
        const lv = s.level ?? 0
        if (byLevel[lv]) byLevel[lv].push(s)
      }
    }
    for (const k of Object.keys(byLevel)) {
      byLevel[k].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    }
    return byLevel
  }, [classes, spellIds])

  /** 「添加法术」下拉：一键加入列表中全部尚未持有的职业法术 */
  const addAllSpellsFromDropdown = () => {
    const seen = new Set(spells.map((item) => item.spellId).filter(Boolean))
    const next = [...spells]
    let added = 0
    for (let level = 0; level <= 9; level++) {
      const list = spellsByLevelForDropdown[level] ?? []
      for (const s of list) {
        const id = s?.id
        if (!id || seen.has(id)) continue
        seen.add(id)
        const spell = getSpellById(id)
        const isCantrip = spell && (spell.level ?? 0) === 0
        next.push({ spellId: id, prepared: isCantrip })
        added += 1
      }
    }
    if (added === 0) return
    onSave({ spells: next })
    setDropdownOpen(false)
  }

  const searchResults = useMemo(() => {
    if (!searchQuery?.trim()) return []
    return searchSpells(searchQuery).filter((s) => !spellIds.has(s.id)).slice(0, 20)
  }, [searchQuery, spellIds])

  useEffect(() => {
    const onOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchQuery('')
    }
    document.addEventListener('click', onOutside)
    return () => document.removeEventListener('click', onOutside)
  }, [])

  const addAllClassSpells = () => {
    if (!prepareAllClass) return
    const classSpells = getSpellsByClass(prepareAllClass)
    // 戏法不参与“全部学会”，需通过法术大全手动添加
    const toAdd = classSpells.filter((s) => !spellIds.has(s.id) && (s.level ?? 0) >= 1)
    const next = [...spells, ...toAdd.map((s) => ({ spellId: s.id, prepared: (s.level ?? 0) === 0 }))]
    onSave({ spells: next })
  }

  const toggleSpellLevelCard = useCallback((level) => {
    setOpenSpellLevelCards((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }, [])

  const statsGridClass =
    'grid grid-cols-2 gap-1.5 p-1.5 sm:grid-cols-3 sm:gap-1.5 sm:p-2 lg:grid-cols-5 lg:gap-2'
  const attrDisplay =
    spellAbility != null ? (ABILITY_NAMES_ZH[spellAbility] ?? spellAbility) : '—'
  const atkDisplay =
    typeof spellAttackBonus === 'number'
      ? `${spellAttackBonus >= 0 ? '+' : ''}${spellAttackBonus}`
      : '—'
  const dcDisplay = typeof spellDC === 'number' ? String(spellDC) : '—'
  const casterDisplay = char ? String(spellLevel ?? 0) : '—'
  const preparedDisplay = char ? String(preparedCount) : '—'

  const statCellLabel = 'panel-label mb-0 block text-center text-[10px] leading-tight'
  const statCellValueBase =
    'text-center font-mono text-sm font-bold tabular-nums leading-tight text-[var(--text-main)] sm:text-base'

  const statsGrid = (
    <div className={statsGridClass}>
      <div className={SPELL_STAT_MINI_CARD}>
        <span className={statCellLabel}>施法属性</span>
        <p className="truncate text-center text-sm font-bold leading-tight text-[var(--accent)] sm:text-base">{attrDisplay}</p>
      </div>
      <div className={SPELL_STAT_MINI_CARD}>
        <span className={statCellLabel}>法术攻击加值</span>
        <p className={statCellValueBase}>{atkDisplay}</p>
      </div>
      <div className={SPELL_STAT_MINI_CARD}>
        <span className={statCellLabel}>DC</span>
        <p className={statCellValueBase}>{dcDisplay}</p>
      </div>
      <div className={SPELL_STAT_MINI_CARD}>
        <span className={statCellLabel}>施法者等级</span>
        <p className={statCellValueBase}>{casterDisplay}</p>
      </div>
      <div className={`${SPELL_STAT_MINI_CARD} col-span-2 sm:col-span-1`}>
        <span className={statCellLabel}>已准备法术</span>
        <p className={statCellValueBase}>{preparedDisplay}</p>
      </div>
    </div>
  )

  const spellToolbarLeftColumn = (primaryBtnClass, layout = 'horizontal') => {
    const sidebar = layout === 'sidebar'
    const outerClass = sidebar
      ? 'flex w-full min-w-0 flex-col items-center gap-2 text-center'
      : 'flex min-h-8 min-w-0 flex-wrap items-center gap-1.5'
    const dropdownWrapClass = sidebar ? 'relative z-[2] w-full min-w-0' : 'relative shrink-0'
    const primaryWide = sidebar ? `${primaryBtnClass} w-full justify-center` : primaryBtnClass
    const linkWide = sidebar ? `${primaryBtnClass} w-full shrink-0 justify-center no-underline` : `${primaryBtnClass} shrink-0 no-underline`
    const searchWrapClass = sidebar
      ? 'relative h-8 min-h-[2rem] w-full min-w-0'
      : 'relative h-8 min-h-[2rem] min-w-[120px] flex-1 basis-[min(100%,12rem)] max-w-full shrink-0'
    const prepareWide =
      'inline-flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded-md border border-[var(--accent)]/45 bg-[rgba(199,154,66,0.12)] px-2.5 py-0 text-xs font-semibold leading-none text-[var(--accent)] transition-colors hover:bg-[rgba(199,154,66,0.2)]'

    return (
    <div className={outerClass}>
      <div ref={dropdownRef} className={dropdownWrapClass}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setDropdownOpen((v) => !v)
          }}
          className={primaryWide}
          title="仅列出当前角色职业法表中可学、且尚未加入的法术"
        >
          <Plus className="h-3.5 w-3.5 shrink-0 opacity-90" />
          添加法术
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        {dropdownOpen && (
          <div
            className={`absolute top-full z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-[var(--panel-radius)] border border-[var(--card-border)] bg-[var(--card-bg)] py-1 shadow-xl ${sidebar ? 'right-0 left-auto' : 'left-0'}`}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].some((l) => (spellsByLevelForDropdown[l] ?? []).length > 0) && (
              <div className="sticky top-0 z-[1] border-b border-[var(--card-border)] bg-[var(--card-bg)] px-2 pb-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    addAllSpellsFromDropdown()
                  }}
                  className="w-full rounded-md border border-[var(--accent)]/40 bg-[rgba(199,154,66,0.14)] py-1.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[rgba(199,154,66,0.24)]"
                >
                  全部加入
                </button>
              </div>
            )}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
              const list = spellsByLevelForDropdown[level] ?? []
              if (list.length === 0) return null
              return (
                <div key={level} className="py-1">
                  <div className="border-b border-[var(--card-border)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                    {LEVEL_LABELS[level] ?? `${level}环`}
                  </div>
                  {list.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        addSpell(s.id)
                        setDropdownOpen(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm text-[var(--text-main)] hover:bg-white/[0.06]"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )
            })}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((l) => (spellsByLevelForDropdown[l] ?? []).length === 0) && (
              <p className="px-3 py-4 text-sm leading-snug text-[var(--text-muted)]">
                暂无可添加的<strong className="text-[var(--text-main)]/90">职业法术</strong>
                ：此列表随角色职业而定。请先在角色卡设置职业，或本职业可学法术已全部加入。
              </p>
            )}
          </div>
        )}
      </div>
      <Link
        to={char?.id ? `/spells?char=${char.id}` : '/spells'}
        className={linkWide}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-90" />
        从法术大全添加
      </Link>
        <div
          ref={searchRef}
          className={searchWrapClass}
        >
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="搜索法术加入..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${inputClassToolbarH8} pl-8 text-xs`}
          />
          {searchQuery.trim() && (
            <div
              className={`absolute top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-[var(--panel-radius)] border border-[var(--card-border)] bg-[var(--card-bg)] py-1 shadow-xl ${sidebar ? 'right-0 left-0' : 'left-0 right-0'}`}
            >
              {searchResults.length > 0 ? (
                searchResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      addSpell(s.id)
                      setSearchQuery('')
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.06]"
                  >
                    <span className="text-sm text-[var(--text-main)]">{s.name}</span>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{LEVEL_LABELS[s.level] ?? `${s.level}环`}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-[var(--text-muted)]">未找到匹配的法术</p>
              )}
            </div>
          )}
        </div>
      {prepareAllClass && (
        <button
          type="button"
          onClick={addAllClassSpells}
          className={sidebar ? prepareWide : 'inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[var(--accent)]/45 bg-[rgba(199,154,66,0.12)] px-2.5 py-0 text-xs font-semibold leading-none text-[var(--accent)] transition-colors hover:bg-[rgba(199,154,66,0.2)]'}
        >
          全部学会{prepareAllClass}法术
        </button>
      )}
    </div>
    )
  }

  const makeAddSpellsToolbarInner = (primaryBtnClass, trailingAfterSearch = null) => {
    const left = spellToolbarLeftColumn(primaryBtnClass)
    if (trailingAfterSearch == null) {
      return left
    }
    return (
      <div className="grid min-w-0 grid-cols-2 items-stretch gap-x-3">
        {left}
        <div className="flex min-h-8 min-w-0 items-stretch overflow-x-auto [scrollbar-width:thin]">
          {trailingAfterSearch}
        </div>
      </div>
    )
  }

  const addSpellsToolbarInner = makeAddSpellsToolbarInner(SPELL_TOOLBAR_BTN_COMPACT)

  const addSpellsInCard = <div className="px-3 py-1.5">{addSpellsToolbarInner}</div>

  const spellcastingPanel = characterPicker ? (
    <div id="character-spellcasting-data" className="module-panel panel-highlight-top overflow-hidden p-0">
      <div className="flex flex-nowrap items-center gap-2 border-b border-[var(--card-border)] px-3 py-1.5">
        <label className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
          选择角色
        </label>
        <select
          value={characterPicker.value}
          onChange={(e) => characterPicker.onChange(e.target.value)}
          className="panel-select panel-class-control-h-compact min-w-0 max-w-full flex-1 text-xs sm:text-sm"
        >
          <option value="">— 选择角色 —</option>
          {characterPicker.options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || '未命名'}
            </option>
          ))}
        </select>
      </div>
      <div className="border-b border-[var(--card-border)]">{statsGrid}</div>
      {canEdit && addSpellsInCard}
    </div>
  ) : spellAbility != null ? (
    <div id="character-spellcasting-data" className="module-panel panel-highlight-top overflow-hidden p-0">
      <div className="border-b border-[var(--card-border)]">{statsGrid}</div>
      {canEdit && addSpellsInCard}
    </div>
  ) : canEdit ? (
    <div id="character-spellcasting-data" className="module-panel panel-highlight-top overflow-hidden p-0">
      <div className="px-3 py-1.5">{addSpellsToolbarInner}</div>
    </div>
  ) : null

  const spellcastingDataSection =
    spellcastingPanel != null ? (
      <section className="character-sheet-section-anchor">{spellcastingPanel}</section>
    ) : null

  const spellSheetTopBarAvatarEl = char?.avatar ? (
    <img
      src={char.avatar}
      alt=""
      className="h-10 w-10 shrink-0 rounded-full border border-white/20 object-cover"
    />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
      <User className="h-5 w-5 text-dnd-text-muted" strokeWidth={1.8} />
    </div>
  )

  const spellStatMiniCardsRow =
    char && (spellAbility != null || typeof spellAttackBonus === 'number' || typeof spellDC === 'number') ? (
      <div
        className="grid min-h-10 w-full min-w-[280px] flex-1 grid-cols-5 items-stretch gap-1.5 sm:gap-2"
        role="group"
        aria-label="施法数据"
      >
        <div
          className={`${SPELL_STAT_CHIP} ${SPELL_STAT_CHIP_ABILITY}`}
          title={`施法属性：${attrDisplay}`}
        >
          <span className={SPELL_STAT_CHIP_LABEL_ABILITY}>施法属性</span>
          <span className={SPELL_STAT_CHIP_VALUE_ACCENT}>{attrDisplay}</span>
        </div>
        <div className={SPELL_STAT_CHIP} title={`法术攻击：${atkDisplay}`}>
          <span className={SPELL_STAT_CHIP_LABEL}>法术攻击</span>
          <span className={SPELL_STAT_CHIP_VALUE}>{atkDisplay}</span>
        </div>
        <div className={SPELL_STAT_CHIP} title={`法术豁免 DC：${dcDisplay}`}>
          <span className={SPELL_STAT_CHIP_LABEL}>DC</span>
          <span className={SPELL_STAT_CHIP_VALUE}>{dcDisplay}</span>
        </div>
        <div className={SPELL_STAT_CHIP} title={`施法者等级：${casterDisplay}`}>
          <span className={SPELL_STAT_CHIP_LABEL}>施法者等级</span>
          <span className={SPELL_STAT_CHIP_VALUE}>{casterDisplay}</span>
        </div>
        <div className={SPELL_STAT_CHIP} title={`已准备法术：${preparedDisplay}`}>
          <span className={SPELL_STAT_CHIP_LABEL}>已准备</span>
          <span className={SPELL_STAT_CHIP_VALUE}>{preparedDisplay}</span>
        </div>
      </div>
    ) : null

  const spellcastingStatsSummaryCards = spellStatMiniCardsRow && canEdit ? spellStatMiniCardsRow : null

  const spellSheetTopBarIdentityLeft = (
    <div className="flex min-h-10 min-w-0 items-center gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/characters"
          className={TOPBAR_BACK_LINK_CLASS}
          title="返回我的角色"
          aria-label="返回我的角色"
        >
          <ArrowLeft className={TOPBAR_BACK_ARROW_CLASS} strokeWidth={2} />
        </Link>
        {spellSheetTopBarAvatarEl}
      </div>
      <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-center overflow-hidden leading-none">
        {characterPicker ? (
          <div className="flex min-h-10 min-w-0 flex-row items-center gap-2">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-dnd-text-muted/90">
              选择角色
            </span>
            <select
              value={characterPicker.value}
              onChange={(e) => characterPicker.onChange(e.target.value)}
              title="选择角色后显示施法数据"
              className="panel-select panel-class-control-h min-w-0 flex-1 text-xs sm:text-sm"
            >
              <option value="">— 选择角色 —</option>
              {characterPicker.options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || '未命名'}
                </option>
              ))}
            </select>
          </div>
        ) : char?.id ? (
          <Link
            to={`/characters/${encodeURIComponent(char.id)}`}
            className="flex min-h-10 min-w-0 items-center truncate text-left text-xs font-medium text-[var(--text-main)] sm:text-sm hover:text-sky-200/95 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/40 rounded"
            title="打开角色卡"
          >
            {char?.name?.trim() || '未命名'}
          </Link>
        ) : (
          <span className="flex min-h-10 min-w-0 items-center truncate text-xs font-medium text-[var(--text-main)] sm:text-sm">
            角色法术
          </span>
        )}
      </div>
    </div>
  )

  const spellSheetTopBarContent = (
    <div id="character-spellcasting-data" className="min-w-0">
      {canEdit ? (
        <div className="grid min-w-0 grid-cols-2 items-center gap-x-3 py-2 sm:py-2.5">
          {spellSheetTopBarIdentityLeft}
          <div className="flex min-h-10 min-w-0 flex-col overflow-x-auto [scrollbar-width:thin]">
            {spellcastingStatsSummaryCards ? (
              <div className="flex min-h-10 w-full min-w-0 flex-1 flex-col justify-stretch">{spellcastingStatsSummaryCards}</div>
            ) : (
              <div className="min-h-10 w-full shrink-0" aria-hidden />
            )}
          </div>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-2 items-center gap-x-3 py-2 sm:py-2.5">
          {spellSheetTopBarIdentityLeft}
          <div className="flex min-h-10 min-w-0 items-center overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
            {spellStatMiniCardsRow ? spellStatMiniCardsRow : null}
          </div>
        </div>
      )}
    </div>
  )

  const spellRingsList = () =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
      const levelSpells = spellsByLevel[level] ?? []
      if (levelSpells.length === 0) return null
      const levelLabel = LEVEL_LABELS[level] ?? `${level}环`
      const maxSlots = level >= 1 ? (maxSlotsByRing[level] ?? 0) : 0
      const currentSlots = level >= 1 ? (spellSlotsCurrent[level] ?? maxSlots) : 0
      const clampedCurrent = Math.min(maxSlots, Math.max(0, currentSlots))
      const ringCardOpen = openSpellLevelCards.has(level)

      const slotRow =
        level >= 1 && maxSlots > 0 ? (
          <div
            className="flex min-w-0 flex-nowrap items-center justify-end gap-x-0.5"
            title={`环位数量：${clampedCurrent}/${maxSlots}`}
          >
            {Array.from({ length: maxSlots }, (_, i) => {
              const filled = i < clampedCurrent
              const label = i === 0 && clampedCurrent === 1 ? '点击后剩余 0 个法术位' : `点击后剩余 ${i + 1} 个法术位`
              return canEdit ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const next = i + 1
                    if (next === 1 && clampedCurrent === 1) setSpellSlotCurrent(level, 0)
                    else setSpellSlotCurrent(level, next)
                  }}
                  className="touch-manipulation flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent hover:bg-white/[0.07] active:bg-white/10"
                  title={label}
                  aria-label={label}
                >
                  <span
                    className={`pointer-events-none h-6 w-6 rounded-full border-2 transition-colors ${
                      filled
                        ? 'border-[var(--accent)] bg-[var(--accent)] shadow-[0_0_6px_rgba(199,154,66,0.35)]'
                        : 'border-[var(--accent)]/55 bg-transparent'
                    }`}
                    aria-hidden
                  />
                </button>
              ) : (
                <span key={i} className="inline-flex h-9 w-9 items-center justify-center shrink-0" aria-hidden>
                  <span
                    className={`inline-block h-6 w-6 rounded-full border-2 ${
                      filled ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--accent)]/55 bg-transparent'
                    }`}
                  />
                </span>
              )
            })}
          </div>
        ) : (
          <span className="text-xs tabular-nums text-[var(--text-muted)]">—</span>
        )

      const focusSpellAfterOpen = (spellId) => {
        setOpenSpellLevelCards((prev) => {
          const next = new Set(prev)
          next.add(level)
          return next
        })
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.getElementById(`character-spell-${spellId}`)?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          })
        })
      }

      return (
        <section
          key={level}
          id={`character-spell-level-${level}`}
          className={`${SPELL_RING_CARD_CLASS} character-sheet-section-anchor`}
        >
          <div className="flex gap-0 border-b border-[var(--card-border)]">
            <div className="flex min-w-0 flex-1 flex-col">
              <button
                type="button"
                onClick={() => toggleSpellLevelCard(level)}
                aria-expanded={ringCardOpen}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
              >
                {ringCardOpen ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                )}
                <span className="min-w-0 flex-1 text-base font-bold tracking-wide text-[var(--accent)]">{levelLabel}</span>
              </button>
              {!ringCardOpen && levelSpells.length > 0 && (
                <div className="border-t border-[var(--card-border)] px-3 pb-2 pt-1">
                  <div
                    className="grid grid-cols-4 gap-x-1 gap-y-0.5"
                    role="group"
                    aria-label={`${levelLabel} · 点击名称展开并跳转`}
                  >
                    {levelSpells.map(({ spellId, spell }) => (
                      <button
                        key={spellId}
                        type="button"
                        title={spell?.name ?? spellId}
                        onClick={() => focusSpellAfterOpen(spellId)}
                        className="min-w-0 rounded-sm px-0.5 py-0.5 text-center text-[10px] leading-tight text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-main)] sm:text-[11px]"
                      >
                        <span className="line-clamp-2 break-words">{spell?.name ?? spellId}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-row flex-nowrap items-center justify-end gap-2 border-l border-[var(--card-border)] px-3 py-2.5">
              <span className="panel-label shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide">
                剩余环位
              </span>
              {slotRow}
            </div>
          </div>
          {ringCardOpen && (
            <div className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-4">
              {levelSpells.map(({ spellId, prepared, spell }) => {
                const metaItems = [
                  { label: '施法时间', value: spell.castingTime },
                  { label: '施法距离', value: spell.range },
                  { label: '法术成分', value: spell.components },
                  { label: '持续时间', value: spell.duration },
                ].filter((m) => m.value)
                return (
                  <div
                    id={`character-spell-${spellId}`}
                    key={spellId}
                    className={`${SPELL_ENTRY_CARD_CLASS} character-sheet-section-anchor overflow-visible`}
                  >
                    <div className="flex h-full flex-col">
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-h-[2rem] items-center justify-between gap-2">
                          <span className="block min-w-0 flex-1 truncate text-base font-semibold leading-tight text-[var(--text-main)]">
                            {spell.name}
                          </span>
                          {canEdit && (
                            <div className="ml-2 flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => togglePrepared(spellId)}
                                className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                                  prepared
                                    ? 'border-emerald-500/45 bg-emerald-600/35 text-white'
                                    : 'border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-muted)] hover:border-[var(--input-focus)] hover:text-[var(--text-main)]'
                                }`}
                              >
                                {prepared ? '已准备' : '未准备'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSpell(spellId)}
                                className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-red-950/40 hover:text-dnd-red"
                                title="移除"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        {spell.school && (
                          <div>
                            <span
                              className={`inline-flex rounded border px-1.5 py-px text-[10px] font-medium leading-tight ${getSchoolTagStyle(spell.school)}`}
                            >
                              {spell.school}
                            </span>
                          </div>
                        )}
                        {metaItems.length > 0 && (
                          <div className="space-y-0 text-[11px] leading-tight">
                            {metaItems.map(({ label, value }) => (
                              <div key={label} className="flex min-w-0 items-baseline gap-1">
                                <span className="w-14 shrink-0 font-medium text-[var(--accent)]">{label}：</span>
                                <span className="min-w-0 flex-1 break-words leading-tight text-[var(--text-main)]">
                                  {value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {spell.description && (
                          <div className="mt-1 min-w-0 border-t border-[var(--card-border)] pt-1">
                            <span className="mb-0 block text-[10px] font-medium leading-none text-[var(--accent)]">法术描述</span>
                            <p className="mt-1 whitespace-pre-line text-justify text-[11px] leading-snug text-[var(--text-main)]">
                              {spell.description}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="mt-auto shrink-0 border-t border-[var(--card-border)] pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if ((spell.level ?? 0) === 0) {
                              return
                            }
                            setCastModal({ open: true, spell, spellId, spellLevel: spell.level })
                            setCastRing(spell.level)
                          }}
                          className="btn-panel-add w-full"
                        >
                          释放魔法
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )
    })

  const spellTocNav = (
    <nav className="flex w-full min-w-0 flex-col items-center gap-1 text-center" aria-label="按环位与名称快速跳转">
      {spellTocGroups.map((g) => {
        const open = tocExpandedLevels.has(g.level)
        return (
          <div key={g.level} className="w-full min-w-0 overflow-hidden rounded-md">
            <button
              type="button"
              onClick={() => {
                setTocExpandedLevels((prev) => {
                  const next = new Set(prev)
                  if (next.has(g.level)) next.delete(g.level)
                  else next.add(g.level)
                  return next
                })
              }}
              aria-expanded={open}
              aria-label={`${g.levelLabel}，${g.spells.length} 个法术${open ? '，已展开' : '，已折叠'}`}
              title={open ? '点击折叠' : '点击展开法术列表'}
              className={`flex w-full min-w-0 items-center justify-center gap-0.5 rounded-md px-1 py-1 text-center transition-colors ${open ? 'bg-[rgba(199,154,66,0.18)]' : 'bg-[rgba(199,154,66,0.1)] hover:bg-[rgba(199,154,66,0.14)]'}`}
            >
              <span className="min-w-0 flex-1 truncate text-center text-[11px] font-bold leading-tight tracking-wide text-[var(--accent)]">
                {g.levelLabel}
              </span>
              <span
                className="shrink-0 tabular-nums text-[10px] font-normal text-[var(--text-muted)]"
                title={`本环 ${g.spells.length} 个法术`}
              >
                {g.spells.length}
              </span>
              {open ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden />
              )}
            </button>
            {open && (
              <ul
                className="m-0 grid list-none grid-cols-4 gap-x-px gap-y-0.5 py-0.5 pl-0"
                role="group"
                aria-label={`${g.levelLabel} · 点击名称跳转至法术卡`}
              >
                {g.spells.map(({ spellId, spell }) => (
                  <li key={spellId} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById(`character-spell-${spellId}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }}
                      title={spell?.name ?? spellId}
                      className="w-full min-w-0 rounded-sm px-px py-0.5 text-center text-[9px] leading-tight text-[var(--text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--text-main)]"
                    >
                      <span className="line-clamp-2 break-words">{spell?.name ?? spellId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )

  const addedSpellsAlerts = (
    <>
      {char?.psychicCollapseEcho && (
        <div className="panel-card-compact rounded-[var(--panel-radius)] border-[var(--accent)]/40 bg-[rgba(199,154,66,0.07)] px-3 py-2.5 text-sm">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--accent)]">灵崩回响 · 下回合</p>
          <p className="leading-snug text-[var(--text-main)]">
            请在<strong className="text-[var(--accent)]">原目标、原地点</strong>再结算一次「{char.psychicCollapseEcho.spellName}」（{char.psychicCollapseEcho.ring}环）。不自动再扣环位，由你或 DM 手动处理效果后清除提醒。
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => onSave({ psychicCollapseEcho: null })}
              className="btn-panel-clear mt-2 touch-manipulation px-3 py-1.5 text-xs"
            >
              已执行回响 / 清除提醒
            </button>
          )}
        </div>
      )}
      {hasPsychicCollapse && (
        <p className="rounded-[var(--panel-radius)] border border-[var(--accent)]/35 bg-[rgba(199,154,66,0.08)] px-2.5 py-1.5 text-xs leading-snug text-[var(--text-main)]">
          <strong className="text-[var(--accent)]">灵崩：</strong>
          释放消耗环位的法术时，须先通过 DC16 体质豁免；失败则法术失败且环位仍消耗；成功则下回合同一法术须在原目标原地点再结算一次（见上方「灵崩回响」）。
        </p>
      )}
    </>
  )

  const castModalLayer =
    castModal.open &&
    castModal.spell && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={() => setCastModal((m) => ({ ...m, open: false }))}
      >
        <div className="module-panel w-full max-w-sm space-y-4 !p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
            释放魔法 · {castModal.spell.name}
          </h3>
          {castModalStep === 'psychic' && psychicRollResult ? (
            <div className="space-y-3 border-t border-white/10 pt-3">
              <p className="text-xs font-medium text-dnd-text-muted">灵崩 · 体质豁免（等同专注检定）</p>
              <p className="text-sm leading-relaxed text-gray-300">
                {psychicRollResult.rollMode !== 'normal' && (
                  <span className="mr-1 text-xs text-dnd-gold-light">
                    [{psychicRollResult.rollMode === 'advantage' ? '优势' : '劣势'}]
                  </span>
                )}
                d20
                {psychicRollResult.rolls.length > 1
                  ? `（${psychicRollResult.rolls.join('、')} 取 ${psychicRollResult.d20Result}）`
                  : `（${psychicRollResult.d20Result}）`}
                {psychicRollResult.modifier >= 0 ? '+' : ''}
                {psychicRollResult.modifier} ={' '}
                <span className="font-mono font-bold text-white">{psychicRollResult.total}</span>
                <span className="text-gray-500"> vs DC {psychicRollResult.dc}</span>
              </p>
              {psychicRollResult.success ? (
                <p className="text-sm leading-snug text-emerald-400/95">
                  成功：法术生效；环位将消耗，并记录「下回合在原目标原地点再结算一次」。
                </p>
              ) : (
                <p className="text-sm leading-snug text-red-400/95">失败：法术失败；环位仍将消耗（灵崩）。</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCastModalStep('form')
                    setPsychicRollResult(null)
                  }}
                  className="flex-1 rounded-lg border border-gray-500 py-2 text-sm text-gray-400 hover:bg-gray-700"
                >
                  返回
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyCastConsumption({ psychicEchoSuccess: psychicRollResult.success })
                    setCastModal((m) => ({ ...m, open: false }))
                    setCastModalStep('form')
                    setPsychicRollResult(null)
                  }}
                  className="flex-1 rounded-lg bg-dnd-red py-2 text-sm font-medium text-white hover:bg-dnd-red-hover"
                >
                  确认结果
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-dnd-text-muted">用几环施法（升环施法）</label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 10 - castModal.spellLevel }, (_, i) => castModal.spellLevel + i).map((r) => {
                    const maxR = effectiveMaxByRing[r] ?? 0
                    const rawRem = spellSlotsCurrent[r] ?? maxR
                    const rem = Math.min(maxR, Math.max(0, rawRem))
                    const ok = rem > 0
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCastRing(r)}
                        className={`flex min-h-11 min-w-[3.25rem] touch-manipulation flex-col items-center justify-center rounded-lg border px-2 py-2 text-center transition-colors ${
                          castRing === r
                            ? 'border-dnd-gold bg-dnd-gold/40 text-white'
                            : ok
                              ? 'border-gray-500 bg-gray-700/80 text-gray-200 hover:border-dnd-gold/60'
                              : 'cursor-not-allowed border-gray-600 bg-gray-800/50 text-gray-500'
                        }`}
                        disabled={!ok}
                        title={`${r}环 剩余 ${rem}/${maxR}（与法术环位条一致）`}
                      >
                        <span className="text-sm font-medium">{r}环</span>
                        <span className={`mt-0.5 text-[10px] ${rem > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                          剩余{rem}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {hasPsychicCollapse && (
                <p className="rounded-md border border-amber-500/20 bg-amber-950/25 px-2 py-1.5 text-xs text-amber-200/90">
                  将先自动投掷体质豁免 DC16；也可返回后用角色卡万能骰手动核对。
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCastModal((m) => ({ ...m, open: false }))}
                  className="flex-1 rounded-lg border border-gray-500 py-2 text-sm text-gray-400 hover:bg-gray-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (hasPsychicCollapse && castRing >= 1) {
                      const r = rollPsychicCollapseCastSave(char, buffStats, sheetLevel)
                      setPsychicRollResult(r)
                      setCastModalStep('psychic')
                      return
                    }
                    applyCastConsumption({})
                    setCastModal((m) => ({ ...m, open: false }))
                  }}
                  disabled={
                    (() => {
                      const maxR = effectiveMaxByRing[castRing] ?? 0
                      const raw = spellSlotsCurrent[castRing] ?? maxR
                      return Math.min(maxR, Math.max(0, raw)) <= 0
                    })()
                  }
                  className="flex-1 rounded-lg bg-dnd-red py-2 text-sm font-medium text-white hover:bg-dnd-red-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {hasPsychicCollapse && castRing >= 1 ? '投掷并继续' : '确认释放'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )

  if (spellPagePinnedLayout) {
    const addedBody =
      !char && characterPicker ? (
        <p className="panel-card-compact py-3 text-center text-sm text-[var(--text-muted)]">请先选择角色。</p>
      ) : spells.length > 0 ? (
        <div className="space-y-6">{spellRingsList()}</div>
      ) : (
        <p className="py-2 text-xs text-[var(--text-muted)]">从上方选择法术添加后，将显示在此处。</p>
      )

    /** 无灵崩提示时勿给法术列表强加 mt-3，否则右侧「戏法」整体低于左侧工具栏，与戏法卡顶不齐 */
    const showPinnedSpellsAlerts = Boolean(char?.psychicCollapseEcho) || hasPsychicCollapse

    return (
      <>
        <CharacterSpellsTopBar>{spellSheetTopBarContent}</CharacterSpellsTopBar>
        {/* 固定顶栏页：随文档向下铺开展开，避免视口锁高 + main 内滚动在部分环境下裁切法术卡 */}
        <div className="w-full min-w-0" style={{ backgroundColor: 'var(--page-bg)' }}>
          <div className="flex flex-col px-0 pb-8 pt-2 lg:flex-row lg:items-stretch lg:gap-2">
            <aside className="character-spells-pinned-sidebar flex min-h-0 w-full shrink-0 flex-col items-center self-start border-b border-[var(--card-border)] pb-3 text-center max-lg:max-w-full lg:min-w-0 lg:self-start lg:border-b-0 lg:border-r lg:pb-0 lg:pr-2">
              {canEdit ? (
                <div className="mb-3 w-full min-w-0 shrink-0 border-b border-[var(--card-border)]/45 pb-2">
                  {spellToolbarLeftColumn(SPELL_TOOLBAR_BTN_COMPACT, 'sidebar')}
                </div>
              ) : null}
              {spells.length > 0 ? (
                <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center">
                  <p className="mb-1.5 w-full shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    法术目录
                  </p>
                  <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-width:thin]">
                    {spellTocNav}
                  </div>
                </div>
              ) : (
                <p className="w-full text-[11px] text-[var(--text-muted)]">—</p>
              )}
            </aside>
            <main className="character-spells-pinned-main flex min-w-0 flex-1 flex-col gap-3 pt-3 lg:pt-0">
              {showPinnedSpellsAlerts ? (
                <div className="shrink-0 space-y-3">{addedSpellsAlerts}</div>
              ) : null}
              <div className="min-w-0">{addedBody}</div>
            </main>
          </div>
        </div>
        {castModalLayer}
      </>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {spellcastingDataSection}
        {addedSpellsAlerts}
        <section className="character-sheet-section-anchor">
          <h3 className="section-title">已添加法术</h3>
          <div>
            {!char && characterPicker ? (
              <p className="panel-card-compact py-3 text-center text-sm text-[var(--text-muted)]">请先选择角色。</p>
            ) : spells.length > 0 ? (
              <div className="flex flex-col items-start gap-3 lg:flex-row lg:gap-2">
                <aside className="z-[1] w-full shrink-0 lg:sticky lg:top-3 lg:w-44 lg:min-w-0 lg:max-w-[11rem] lg:border-r lg:border-[var(--card-border)] lg:pr-2 xl:w-48 xl:max-w-[12rem]">
                  <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    法术目录
                  </p>
                  {spellTocNav}
                </aside>
                <div className="min-w-0 flex-1 space-y-6">{spellRingsList()}</div>
              </div>
            ) : (
              <p className="py-2 text-xs text-[var(--text-muted)]">从上方选择法术添加后，将显示在此处。</p>
            )}
          </div>
        </section>
      </div>
      {castModalLayer}
    </>
  )
}
