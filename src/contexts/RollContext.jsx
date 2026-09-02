import { createContext, useContext, useState, useCallback } from 'react'

const RollContext = createContext(null)

/**
 * pendingCheck: { label: string, modifier: number, quickRoll?, advantage?, critThreatMinNatural? } | null
 * When set, the dice roller modal opens with this check (e.g. "力量豁免 +2");
 * user can roll d20 (with advantage/disadvantage) and modifier is applied.
 */
export function RollProvider({ children }) {
  const [open, setOpen] = useState(false)
  const [pendingCheck, setPendingCheck] = useState(null)

  const openForCheck = useCallback((label, modifier, options = {}) => {
    const ctm = options.critThreatMinNatural
    setPendingCheck({
      label,
      modifier: Number(modifier) ?? 0,
      advantage: options.advantage ?? null, // 'advantage' | 'disadvantage' | 'normal' from buffs
      quickRoll: !!options.quickRoll,
      critThreatMinNatural: ctm != null && Number.isFinite(Number(ctm)) ? Math.max(1, Math.min(20, Math.floor(Number(ctm)))) : undefined,
      onResult: options.onResult || null, // 攻击检定完成后的回调函数
    })
    setOpen(true)
  }, [])

  const openModal = useCallback(() => {
    setPendingCheck(null)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setPendingCheck(null)
  }, [])

  const value = {
    open,
    setOpen,
    pendingCheck,
    setPendingCheck,
    openForCheck,
    openModal,
    close,
  }

  return <RollContext.Provider value={value}>{children}</RollContext.Provider>
}

export function useRoll() {
  const ctx = useContext(RollContext)
  if (!ctx) throw new Error('useRoll must be used within RollProvider')
  return ctx
}
