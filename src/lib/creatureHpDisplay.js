/**
 * 生物卡 HP：正文写在 creatureStatBlock.hpText，结构化 char.hp 常未同步（0/0 或占位 1/1）。
 * 与块首数字合并显示，供角色卡正文与顶栏召唤槽简略条共用。
 */
export function resolveCreatureHpDisplay(char) {
  const block = char?.creatureStatBlock ?? {}
  const m = String(block.hpText ?? '').match(/-?\d+/)
  let hpFromText = m != null ? Number(m[0]) : null
  if (!Number.isFinite(hpFromText) || hpFromText <= 0) hpFromText = null

  const h = char?.hp ?? { current: 0, max: 0, temp: 0, buffTemp: 0 }
  let rawCur = Number(h.current)
  let rawMax = Number(h.max)
  if (!Number.isFinite(rawCur)) rawCur = 0
  if (!Number.isFinite(rawMax)) rawMax = 0
  rawCur = Math.max(0, rawCur)

  let max = Math.max(1, rawMax)
  if (hpFromText != null) {
    const structuredMaxUntrusted = rawMax <= 1 || (rawMax === 0 && rawCur === 0)
    if (structuredMaxUntrusted) {
      max = Math.max(max, hpFromText)
    }
  }

  let cur = rawCur
  if (hpFromText != null) {
    const bothTiny = rawMax <= 1 && rawCur <= 1 && rawCur === rawMax
    if (bothTiny && hpFromText > 1) {
      cur = hpFromText
    } else if (rawMax === 0 && rawCur === 0) {
      cur = hpFromText
    }
  }

  const temp = Math.max(Math.max(0, Number(h.temp) || 0), Math.max(0, Number(h.buffTemp) || 0))
  return { cur, max, temp }
}
