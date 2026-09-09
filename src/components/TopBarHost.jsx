import { useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { TOPBAR_LAYOUT_CORE } from '../lib/topBarShared'

/** 与三个顶栏的共用最小高度（4.125rem）一致：首帧 padding-top 不应与实测高度脱节 */
const DEFAULT_TOPBAR_H_CSS = 'calc(env(safe-area-inset-top, 0px) + 4.125rem)'
const TOPBAR_HOST_ID = 'topbar-host'

/**
 * 常驻顶栏宿主：在 Layout 中渲染一次，路由切换时不卸载。
 * 各页面的 TopBar 通过 TopBarPortal 把内容 portal 进来，避免切换时整段 nav 闪一下。
 *
 * 关键点：
 * - host div 始终存在 → 不会出现"顶栏消失再出现"的瞬间
 * - 在挂载时设置默认 --character-sheet-topbar-h（与 CSS fallback 一致），让 padding-top 在路由切换时稳定
 * - 不在卸载时 removeProperty（host 不卸载；TopBar 内部也不再 remove）
 */

let hostElement = null

/** 取得常驻 host 元素（仅在浏览器端调用），不存在则创建并 appendChild 到 body */
export function getTopBarHostElement() {
  if (typeof document === 'undefined') return null
  if (!hostElement) {
    let el = document.getElementById(TOPBAR_HOST_ID)
    if (!el) {
      el = document.createElement('div')
      el.id = TOPBAR_HOST_ID
      el.className = 'fixed inset-x-0 top-0 z-40 w-full safe-area-pt'
      el.setAttribute('aria-label', '页面顶栏')
      document.body.appendChild(el)
    }
    hostElement = el
  }
  return hostElement
}

/**
 * 在 Layout 挂载时调用：
 * - 预先创建常驻 host div（路由切换时不卸载）
 * - 设置默认 --character-sheet-topbar-h，让 padding-top 在切换时保持稳定
 *
 * Layout 常驻不卸载，所以不需要 cleanup。
 */
export function useEnsureTopBarHost() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    getTopBarHostElement()
    // 子组件的 layout effect 先于本处执行，可能已写入实测高度；覆盖它会造成一帧跳变，
    // 且修正只能等 ResizeObserver 的异步回调（隐藏标签页下该回调不触发）。
    if (document.documentElement.style.getPropertyValue('--character-sheet-topbar-h')) return
    document.documentElement.style.setProperty('--character-sheet-topbar-h', DEFAULT_TOPBAR_H_CSS)
  }, [])
}

/**
 * 把 TopBar 内容 portal 到常驻 host。
 * 与原来 portal 到 document.body 等效，但 host 常驻不卸载，路由切换时不闪。
 *
 * 注意：各 TopBar 组件应仍内部 useLayoutEffect 测量自己实际高度并 setProperty
 * 更新 --character-sheet-topbar-h；但 cleanup 不要 removeProperty（让 CSS 变量保持上一个值）。
 */
export default function TopBarPortal({ children, ariaLabel = '页面顶栏' }) {
  const target = getTopBarHostElement()
  if (!target) return null
  return createPortal(
    <nav aria-label={ariaLabel} className="w-full">
      <div className="relative">
        <div className="relative z-10 border-b border-white/10 bg-[#2D3748]/78 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <div className={`${TOPBAR_LAYOUT_CORE} flex min-w-0 flex-col px-4 pb-1`}>{children}</div>
        </div>
      </div>
    </nav>,
    target,
  )
}
