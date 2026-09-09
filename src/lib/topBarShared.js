/**
 * 固定顶栏：返回按钮与箭头尺寸（角色卡 / 角色法术等共用，保证左缘与点击区域一致）
 */
export const TOPBAR_BACK_LINK_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-dnd-text-muted transition-colors hover:bg-white/10 hover:text-dnd-red sm:h-10 sm:w-10'

export const TOPBAR_BACK_ARROW_CLASS = 'h-5 w-5 sm:h-6 sm:w-6'

/**
 * 固定顶栏版心容器（角色卡 / 角色法术 / 团队仓库共用）。
 *
 * min-h 是三个顶栏的**共用高度**：路由切换时正文 padding-top 跟随 JS 测量的顶栏高度，
 * 三个顶栏高度不一致就会抖动，故用最小高度拉齐。取值 = 三者实际内容的最大自然高度
 * （仓库 66px、角色卡 64px、法术 64px）；调大只会重新造出空白顶栏，调小则失去拉齐作用。
 */
export const TOPBAR_LAYOUT_CORE = 'mx-auto w-[1180px] min-w-[1180px] shrink-0'
export const TOPBAR_LAYOUT_INNER = `${TOPBAR_LAYOUT_CORE} min-h-[4.125rem]`
