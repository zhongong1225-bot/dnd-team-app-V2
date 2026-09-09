import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TOPBAR_LAYOUT_CORE, TOPBAR_LAYOUT_INNER } from '../lib/topBarShared'
import { getTopBarHostElement } from './TopBarHost'

/**
 * 团队仓库固定顶栏：与角色卡/法术页同款 fixed + portal 外壳。
 * 通过写入 --character-sheet-topbar-h 让正文自动避让顶栏高度。
 */
export default function TeamWarehouseTopBar({ children, overlay = null }) {
  const navRef = useRef(null)

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

  const navEl = (
    <nav ref={navRef} className="fixed inset-x-0 top-0 z-40 w-full safe-area-pt" aria-label="团队仓库顶栏">
      <div className="relative">
        <div className="relative z-10 border-b border-white/10 bg-[#2D3748]/78 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <div className={`${TOPBAR_LAYOUT_INNER} flex min-w-0 flex-col px-4 pb-1`}>{children}</div>
        </div>
        {overlay ? (
          <div className="pointer-events-auto absolute inset-x-0 top-full z-[1] border-b border-white/10 bg-[#2D3748]/72 shadow-[0_10px_24px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <div className={`${TOPBAR_LAYOUT_CORE} px-4 py-2`}>{overlay}</div>
          </div>
        ) : null}
      </div>
    </nav>
  )

  const host = getTopBarHostElement()
  if (typeof document === 'undefined' || !host) return null
  return createPortal(navEl, host)
}
