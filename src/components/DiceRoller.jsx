import { useState, useCallback, useRef, useEffect } from 'react'
import { Dices } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'

const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100]

const D20_MODE = [
  { value: 'normal', label: '普通' },
  { value: 'advantage', label: '优势' },
  { value: 'disadvantage', label: '劣势' },
]

function roll(sides) {
  return Math.floor(Math.random() * sides) + 1
}

function rollD20WithMode(mode) {
  if (mode === 'normal') {
    const r = roll(20)
    return { result: r, rolls: [r] }
  }
  const a = roll(20)
  const b = roll(20)
  if (mode === 'advantage') return { result: Math.max(a, b), rolls: [a, b] }
  return { result: Math.min(a, b), rolls: [a, b] }
}

export default function DiceRoller() {
  const { open, close, openModal, pendingCheck } = useRoll()
  const [d20Mode, setD20Mode] = useState('normal')
  const [lastRoll, setLastRoll] = useState(null) // { sides, result, rolls?, key }
  const [checkResult, setCheckResult] = useState(null) // { label, modifier, d20Result, rolls, total, key }
  const [rollHistory, setRollHistory] = useState([])
  const [rollingPreview, setRollingPreview] = useState(null) // { kind, sides, result, rolls?, mode? }
  const [isRolling, setIsRolling] = useState(false)
  const rollingTimerRef = useRef(null)
  const rollingStopRef = useRef(null)

  const total = rollHistory.reduce((s, n) => s + n, 0)

  useEffect(() => {
    return () => {
      if (rollingTimerRef.current) clearInterval(rollingTimerRef.current)
      if (rollingStopRef.current) clearTimeout(rollingStopRef.current)
    }
  }, [])

  const animateRolling = useCallback((kind, sides, mode = 'normal') => {
    if (rollingTimerRef.current) clearInterval(rollingTimerRef.current)
    if (rollingStopRef.current) clearTimeout(rollingStopRef.current)
    setIsRolling(true)
    setRollingPreview({ kind, sides, result: roll(sides), mode, rolls: mode === 'normal' ? undefined : [roll(sides), roll(sides)] })
    return new Promise((resolve) => {
      rollingTimerRef.current = setInterval(() => {
        setRollingPreview({
          kind,
          sides,
          result: roll(sides),
          mode,
          rolls: mode === 'normal' ? undefined : [roll(sides), roll(sides)],
        })
      }, 60)
      rollingStopRef.current = setTimeout(() => {
        if (rollingTimerRef.current) clearInterval(rollingTimerRef.current)
        rollingTimerRef.current = null
        rollingStopRef.current = null
        setIsRolling(false)
        setRollingPreview(null)
        resolve()
      }, 700)
    })
  }, [])

  const rollDice = useCallback((sides) => {
    if (isRolling) return
    if (sides === 20) {
      void animateRolling('dice', 20, d20Mode).then(() => {
        const { result, rolls } = rollD20WithMode(d20Mode)
        setLastRoll({ sides: 20, result, rolls, key: Date.now() })
        setRollHistory((prev) => [...prev, result])
      })
      return
    }
    void animateRolling('dice', sides).then(() => {
      const result = roll(sides)
      setLastRoll({ sides, result, key: Date.now() })
      setRollHistory((prev) => [...prev, result])
    })
  }, [d20Mode, animateRolling, isRolling])

  const rollCheck = useCallback(() => {
    if (!pendingCheck || isRolling) return
    const mode = pendingCheck.advantage ?? d20Mode
    void animateRolling('check', 20, mode).then(() => {
      const { result, rolls } = rollD20WithMode(mode)
      const total = result + pendingCheck.modifier
      setCheckResult({
        label: pendingCheck.label,
        modifier: pendingCheck.modifier,
        d20Result: result,
        rolls,
        total,
        key: Date.now(),
      })
      setRollHistory((prev) => [...prev, result])
      // 调用回调，传递原始骰值和总计
      if (pendingCheck.onResult) {
        pendingCheck.onResult(total, result)
      }
    })
  }, [pendingCheck, d20Mode, animateRolling, isRolling])
  const effectiveCheckMode = pendingCheck?.advantage ?? d20Mode

  const clearHistory = () => {
    setRollHistory([])
    setLastRoll(null)
    setCheckResult(null)
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/40"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed right-4 z-[201] flex flex-col items-end transition-all duration-200 ${
          open ? 'bottom-24 sm:bottom-1/2 sm:translate-y-1/2' : 'bottom-24 sm:bottom-10'
        }`}
      >
        {open && (
          <div
            className="bg-[#2D3748] rounded-xl shadow-dnd-card border-l-4 border-dnd-red p-4 w-[min(18rem,calc(100vw-2rem))] mb-3 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white text-sm font-medium mb-3 uppercase tracking-label">万能骰子</p>

            {/* 统一 d20 模式：检定与通用 d20 共用 */}
            <div className="mb-3">
              <p className="text-dnd-text-muted text-[10px] mb-1.5">d20 模式</p>
              <div className="flex gap-1">
                {D20_MODE.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setD20Mode(m.value)}
                    className={`py-1.5 px-2.5 rounded text-xs font-medium border transition-colors ${
                      d20Mode === m.value
                        ? 'bg-dnd-red border-dnd-red text-white'
                        : 'border-white/20 bg-[#1E293B] text-white hover:bg-white/10'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 检定区域：从技能/豁免打开时显示 */}
            {pendingCheck && (
              <div className="mb-3 pb-3 border-b border-white/10">
                <p className="text-dnd-gold-light text-xs font-bold mb-1">检定：{pendingCheck.label}</p>
                <p className="text-dnd-text-muted text-xs mb-1">
                  调整值 {pendingCheck.modifier >= 0 ? '+' : ''}{pendingCheck.modifier}
                </p>
                {effectiveCheckMode !== 'normal' && (
                  <p className="text-dnd-gold-light text-[10px] mb-2">
                    {effectiveCheckMode === 'advantage' ? '优势' : '劣势'}
                    {pendingCheck.advantage ? ' (来自 BUFF)' : ''}
                  </p>
                )}
                <button
                  type="button"
                  onClick={rollCheck}
                  disabled={isRolling}
                  className="w-full py-2 rounded-lg border border-dnd-red bg-dnd-red/20 text-dnd-red hover:bg-dnd-red hover:text-white font-medium text-sm transition-colors"
                >
                  {isRolling ? '骰子滚动中…' : '投掷检定 d20'}
                </button>
                {isRolling && rollingPreview?.kind === 'check' ? (
                  <div className="mt-2 pt-2 border-t border-white/10 text-center animate-pulse">
                    <p className="text-dnd-text-muted text-xs">
                      d20
                      {rollingPreview.rolls?.length > 1
                        ? `(${rollingPreview.rolls.join(', ')})`
                        : `(${rollingPreview.result})`}
                      {pendingCheck.modifier >= 0 ? '+' : ''}{pendingCheck.modifier}
                    </p>
                    <p className="text-xl font-mono font-bold text-dnd-gold-light">{rollingPreview.result}</p>
                  </div>
                ) : null}
                {checkResult && (
                  <div key={checkResult.key} className="mt-2 pt-2 border-t border-white/10 text-center">
                    <p className="text-dnd-text-muted text-xs">
                      d20{checkResult.rolls.length > 1 ? `(${checkResult.rolls.join(', ')}) 取 ${checkResult.d20Result}` : `(${checkResult.d20Result})`}
                      {checkResult.modifier >= 0 ? '+' : ''}{checkResult.modifier}
                    </p>
                    <p className="text-xl font-mono font-bold text-dnd-red">{checkResult.total}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {DICE_SIDES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => rollDice(s)}
                  disabled={isRolling}
                  className="py-2.5 rounded-lg border border-white/20 bg-[#1E293B] hover:bg-dnd-red hover:text-white hover:border-dnd-red text-white font-mono font-semibold transition-colors"
                >
                  d{s}
                </button>
              ))}
            </div>
            {isRolling && rollingPreview?.kind === 'dice' ? (
              <div className="mt-3 pt-3 border-t border-white/10 text-center animate-pulse">
                <p className="text-dnd-text-muted text-xs">d{rollingPreview.sides}</p>
                <p className="text-2xl font-mono font-bold text-dnd-gold-light mt-0.5">
                  {rollingPreview.result}
                </p>
              </div>
            ) : null}
            {lastRoll && (
              <div
                key={lastRoll.key}
                className="mt-3 pt-3 border-t border-white/10 text-center"
              >
                <p className="text-dnd-text-muted text-xs">
                  d{lastRoll.sides}
                  {lastRoll.rolls?.length > 1
                    ? ` (${lastRoll.rolls.join(', ')} 取 ${lastRoll.result})`
                    : ''}
                </p>
                <p className="text-2xl font-mono font-bold text-dnd-red mt-0.5">
                  {lastRoll.result}
                </p>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-dnd-text-muted text-xs mb-1">
                投掷次数：<span className="font-medium text-white">{rollHistory.length}</span> 次
              </p>
              <p className="text-dnd-text-muted text-xs mb-1">
                记录：{rollHistory.length > 0 ? rollHistory.join(' + ') : '—'}
              </p>
              <p className="text-white font-medium">
                合计：<span className="font-mono font-bold text-dnd-red">{total}</span>
              </p>
              <button
                type="button"
                onClick={clearHistory}
                className="mt-2 w-full py-1.5 rounded-lg text-xs bg-[#1A202C] text-[#A0AEC0] border border-white/20 hover:bg-[#1E293B] hover:text-white transition-colors"
              >
                清空
              </button>
            </div>
          </div>
        )}

        {!open && (
          <div
            className="fab-float flex items-center justify-center rounded-full z-[201]"
            style={{
              padding: '6px',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.2) 100%)',
              borderRadius: '9999px',
              boxShadow: '0 0 20px rgba(224, 28, 47, 0.5), 0 0 40px rgba(224, 28, 47, 0.25), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <button
              type="button"
              onClick={openModal}
              className="fab-btn flex h-24 w-24 items-center justify-center rounded-full active:scale-95 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A202C]"
              style={{
                background: 'linear-gradient(165deg, #E01C2F 0%, #9E2A2B 50%, #7A1F20 100%)',
                boxShadow: '0 0 18px rgba(224, 28, 47, 0.6), 0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.2)',
              }}
              aria-label="打开万能骰子"
            >
              <Dices
                className="w-10 h-10 text-white shrink-0"
                strokeWidth={2.5}
              />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
