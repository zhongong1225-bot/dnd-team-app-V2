import { describe, it, expect } from 'vitest'
import {
  normalizeRace,
  normalizeAbilityScoreBonuses,
  inferAsiAssignmentsFromLegacy,
  isRaceDefinitionIncomplete,
  migrateOldRace,
  DEFAULT_RACE,
} from './raceModel'

describe('normalizeAbilityScoreBonuses', () => {
  it('returns fallback copy when raw is not an array', () => {
    const fb = [{ amount: 2 }, { amount: 1 }]
    const result = normalizeAbilityScoreBonuses(null, fb)
    expect(result).toEqual([{ amount: 2 }, { amount: 1 }])
    expect(result).not.toBe(fb)
  })

  it('filters invalid entries and coerces amounts to numbers', () => {
    const raw = [{ amount: 2 }, null, { amount: '1' }, { amount: NaN }, 'bad']
    expect(normalizeAbilityScoreBonuses(raw, [])).toEqual([{ amount: 2 }, { amount: 1 }])
  })

  it('returns empty array when all entries are invalid and fallback is empty', () => {
    expect(normalizeAbilityScoreBonuses([null, undefined], [])).toEqual([])
  })
})

describe('normalizeRace', () => {
  it('applies default abilityScoreBonuses when missing', () => {
    const result = normalizeRace({})
    expect(result.abilityScoreBonuses).toEqual([{ amount: 2 }, { amount: 1 }])
  })

  it('preserves explicit abilityScoreBonuses', () => {
    const result = normalizeRace({ abilityScoreBonuses: [{ amount: 3 }] })
    expect(result.abilityScoreBonuses).toEqual([{ amount: 3 }])
  })

  it('normalizes subrace abilityScoreBonuses to empty by default', () => {
    const result = normalizeRace({ subraces: [{ id: 's1', name: 'Sub' }] })
    expect(result.subraces[0].abilityScoreBonuses).toEqual([])
  })

  it('normalizes subrace with explicit bonuses', () => {
    const result = normalizeRace({
      subraces: [{ id: 's1', name: 'Sub', abilityScoreBonuses: [{ amount: 1 }] }],
    })
    expect(result.subraces[0].abilityScoreBonuses).toEqual([{ amount: 1 }])
  })
})

describe('migrateOldRace', () => {
  it('adds default abilityScoreBonuses to migrated race', () => {
    const old = { id: 'elf', name: 'Elf', traits: 'Elf traits text' }
    const result = migrateOldRace(old)
    expect(result.abilityScoreBonuses).toEqual([{ amount: 2 }, { amount: 1 }])
  })

  it('adds empty abilityScoreBonuses to migrated subraces', () => {
    const old = { id: 'elf', name: 'Elf', traits: 'text', subraces: [{ id: 'h', name: 'High' }] }
    const result = migrateOldRace(old)
    expect(result.subraces[0].abilityScoreBonuses).toEqual([])
  })

  it('returns default race for null input', () => {
    const result = migrateOldRace(null)
    expect(result.abilityScoreBonuses).toEqual([{ amount: 2 }, { amount: 1 }])
  })
})

describe('inferAsiAssignmentsFromLegacy', () => {
  const raceDef = { abilityScoreBonuses: [{ amount: 2 }, { amount: 1 }] }

  it('matches when legacy values align with bonus slots', () => {
    const oldASI = { str: 0, dex: 2, con: 0, int: 0, wis: 1, cha: 0 }
    const result = inferAsiAssignmentsFromLegacy(raceDef, null, oldASI)
    expect(result).toEqual([
      { source: 'race', ability: 'dex' },
      { source: 'race', ability: 'wis' },
    ])
  })

  it('returns null when count mismatches', () => {
    const oldASI = { str: 0, dex: 2, con: 0, int: 0, wis: 0, cha: 0 }
    const result = inferAsiAssignmentsFromLegacy(raceDef, null, oldASI)
    expect(result).toBeNull()
  })

  it('returns null when values dont match slot amounts', () => {
    const oldASI = { str: 0, dex: 3, con: 0, int: 0, wis: 1, cha: 0 }
    const result = inferAsiAssignmentsFromLegacy(raceDef, null, oldASI)
    expect(result).toBeNull()
  })

  it('returns empty array when all values are zero', () => {
    const oldASI = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
    const result = inferAsiAssignmentsFromLegacy(raceDef, null, oldASI)
    expect(result).toEqual([])
  })

  it('returns null for null oldASI', () => {
    expect(inferAsiAssignmentsFromLegacy(raceDef, null, null)).toBeNull()
  })

  it('handles subrace bonuses', () => {
    const raceWithSub = { abilityScoreBonuses: [{ amount: 2 }] }
    const sub = { abilityScoreBonuses: [{ amount: 1 }] }
    const oldASI = { str: 0, dex: 2, con: 0, int: 1, wis: 0, cha: 0 }
    const result = inferAsiAssignmentsFromLegacy(raceWithSub, sub, oldASI)
    expect(result).toEqual([
      { source: 'race', ability: 'dex' },
      { source: 'subrace', ability: 'int' },
    ])
  })
})

describe('isRaceDefinitionIncomplete', () => {
  it('returns true for null', () => {
    expect(isRaceDefinitionIncomplete(null)).toBe(true)
  })

  it('returns true when all fields are default/empty', () => {
    expect(isRaceDefinitionIncomplete({ speed: { walk: 30 }, darkvision: null, abilityScoreBonuses: [] })).toBe(true)
  })

  it('returns false when speed differs from default', () => {
    expect(isRaceDefinitionIncomplete({ speed: { walk: 25 }, darkvision: null, abilityScoreBonuses: [] })).toBe(false)
  })

  it('returns false when darkvision is set', () => {
    expect(isRaceDefinitionIncomplete({ speed: { walk: 30 }, darkvision: 60, abilityScoreBonuses: [] })).toBe(false)
  })

  it('returns false when bonuses exist', () => {
    expect(isRaceDefinitionIncomplete({ speed: { walk: 30 }, darkvision: null, abilityScoreBonuses: [{ amount: 2 }] })).toBe(false)
  })
})
