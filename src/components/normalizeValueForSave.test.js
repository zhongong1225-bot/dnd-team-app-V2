import { describe, it, expect } from 'vitest'
import { normalizeValueForSave } from './BuffForm.jsx'

const FORMULA = { ref: 'level', mult: 2, add: 0 }

describe('normalizeValueForSave 保留公式值（不被 Number() 压成 0）', () => {
  it('spellPower.value 公式应原样保留', () => {
    const out = normalizeValueForSave(
      { value: { mode: 'both', value: FORMULA } },
      { key: 'spell_attack_bonus', subSelect: 'spellPower' },
    )
    expect(out.value).toEqual(FORMULA)
  })

  it('deathSaveBonus.bonus 公式应原样保留', () => {
    const out = normalizeValueForSave(
      { value: { bonus: FORMULA, advantage: '' } },
      { key: 'death_save_bonus', subSelect: 'deathSaveBonus' },
    )
    expect(out.bonus).toEqual(FORMULA)
  })

  it('healingBonus.perRoll 公式应原样保留，perSlotLevel 仍按数字', () => {
    const out = normalizeValueForSave(
      { value: { perRoll: FORMULA, perSlotLevel: 3 } },
      { key: 'healing_bonus', subSelect: 'healingBonus' },
    )
    expect(out.perRoll).toEqual(FORMULA)
    expect(out.perSlotLevel).toBe(3)
  })

  it('attackDistanceRange.distance 公式应原样保留，area.size 仍按数字', () => {
    const out = normalizeValueForSave(
      { value: { distance: FORMULA, area: { kind: 'cone', size: 15 } } },
      { key: 'attack_distance_range', subSelect: 'attackDistanceRange' },
    )
    expect(out.distance).toEqual(FORMULA)
    expect(out.area).toEqual({ kind: 'cone', size: 15 })
  })
})
