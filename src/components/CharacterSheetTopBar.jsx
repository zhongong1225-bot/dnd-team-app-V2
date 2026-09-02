import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, User } from 'lucide-react'
import { hpBarMainFillClass, hpBarMainFillClassFromPct, HP_BAR_TEMP_FILL_CLASS } from '../lib/hpBarShared'
import { TOPBAR_BACK_ARROW_CLASS, TOPBAR_BACK_LINK_CLASS } from '../lib/topBarShared'
import { getTopBarHostElement } from './TopBarHost'

const LAYOUT_INNER = 'mx-auto w-[1180px] min-w-[1180px] shrink-0 min-h-[6rem]'

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

/**
 * 顶栏 fixed + portal 到 body。返回、头像、名称/血条、快捷跳转。
 */
export default function CharacterSheetTopBar({
  char,
  isCreatureTemplate,
  persistMain,
  canEdit,
}) {
  /** 挂在 nav 上：高度含 safe-area-pt，与正文 padding-top 一致 */
  const navRef = useRef(null)

  /** 仅测量第一行顶栏高度，避免展开/收起时推动正文 padding 导致视跳动 */
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
    }
  }, [])

  const jumpItems = JUMP_SECTIONS.filter((s) => !s.hideCreature || !isCreatureTemplate)

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const mainHp = char?.hp ?? { current: 0, max: 0, temp: 0, buffTemp: 0 }
  const mCur = Math.max(0, Number(mainHp.current) || 0)
  const mMax = Math.max(0, Number(mainHp.max) || 0)
  const mTemp = Math.max(0, Number(mainHp.temp) || 0)
  const mBuffTemp = Math.max(0, Number(mainHp.buffTemp) || 0)
  const totalTemp = Math.max(mTemp, mBuffTemp)
  const { curW, tempW } = hpBarWidths(mCur, mMax, totalTemp)
  const curFillClass = hpBarMainFillClass(mCur, mMax)
  const mainPct = mainHpPercent(mCur, mMax, totalTemp)
  const hpLabel = totalTemp > 0 ? `${mCur}+${totalTemp} / ${mMax}` : `${mCur} / ${mMax}`

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

  const navEl = (
    <>
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
      </div>
    </nav>

    </>
  )

  const host = getTopBarHostElement()
  if (typeof document === 'undefined' || !host) return null
  return createPortal(navEl, host)
}
