import { describe, it, expect } from 'vitest'
import { buildRaceDefinitionEffects } from './cardAdapter'

describe('buildRaceDefinitionEffects', () => {
  const raceWithDefaults = {
    speed: { walk: 30, climb: null, swim: null, fly: null },
    darkvision: 60,
    abilityScoreBonuses: [{ amount: 2 }, { amount: 1 }],
  }

  it('returns empty array when raceDef is null', () => {
    expect(buildRaceDefinitionEffects(null, null, {})).toEqual([])
  })

  it('generates speed + darkvision + ASI effects for a fully configured race', () => {
    const raceDef = {
      speed: { walk: 35, climb: null, swim: null, fly: null },
      darkvision: 60,
      abilityScoreBonuses: [{ amount: 2 }, { amount: 1 }],
    }
    const raceCard = {
      asiAssignments: [
        { source: 'race', ability: 'dex' },
        { source: 'race', ability: 'wis' },
      ],
    }
    const effects = buildRaceDefinitionEffects(raceDef, null, raceCard)

    expect(effects).toContainEqual({
      effectType: 'base_speed_increment',
      value: { walk: 5, climb: 0, swim: 0, fly: 0 },
    })
    expect(effects).toContainEqual({
      effectType: 'special_senses',
      value: { senses: ['darkvision'], range: 60 },
    })
    expect(effects).toContainEqual({
      effectType: 'ability_score_uncapped',
      value: { dex: 2 },
    })
    expect(effects).toContainEqual({
      effectType: 'ability_score_uncapped',
      value: { wis: 1 },
    })
    expect(effects).toHaveLength(4)
  })

  it('does not generate speed effect when walk=30 and no other speeds', () => {
    const raceDef = {
      speed: { walk: 30, climb: null, swim: null, fly: null },
      darkvision: null,
      abilityScoreBonuses: [],
    }
    const effects = buildRaceDefinitionEffects(raceDef, null, { asiAssignments: [] })
    expect(effects.find(e => e.effectType === 'base_speed_increment')).toBeUndefined()
  })

  it('generates speed effect for non-walk speeds even when walk=30', () => {
    const raceDef = {
      speed: { walk: 30, climb: 20, swim: null, fly: null },
      darkvision: null,
      abilityScoreBonuses: [],
    }
    const effects = buildRaceDefinitionEffects(raceDef, null, { asiAssignments: [] })
    expect(effects).toContainEqual({
      effectType: 'base_speed_increment',
      value: { walk: 0, climb: 20, swim: 0, fly: 0 },
    })
  })

  it('does not generate ASI effects when no assignments and no legacy data', () => {
    const raceDef = {
      speed: { walk: 30 },
      darkvision: null,
      abilityScoreBonuses: [{ amount: 2 }, { amount: 1 }],
    }
    const raceCard = { asiAssignments: [] }
    const effects = buildRaceDefinitionEffects(raceDef, null, raceCard)
    expect(effects.filter(e => e.effectType === 'ability_score_uncapped')).toHaveLength(0)
  })

  it('falls back to legacy inference when asiAssignments key is missing', () => {
    const raceDef = {
      speed: { walk: 30 },
      darkvision: null,
      abilityScoreBonuses: [{ amount: 2 }, { amount: 1 }],
    }
    const raceCard = {
      raceBaseInfo: { abilityScoreIncrease: { str: 0, dex: 2, con: 0, int: 0, wis: 1, cha: 0 } },
    }
    const effects = buildRaceDefinitionEffects(raceDef, null, raceCard)
    expect(effects).toContainEqual({
      effectType: 'ability_score_uncapped',
      value: { dex: 2 },
    })
    expect(effects).toContainEqual({
      effectType: 'ability_score_uncapped',
      value: { wis: 1 },
    })
  })

  it('does not generate ASI effects when legacy inference fails', () => {
    const raceDef = {
      speed: { walk: 30 },
      darkvision: null,
      abilityScoreBonuses: [{ amount: 2 }, { amount: 1 }],
    }
    const raceCard = {
      raceBaseInfo: { abilityScoreIncrease: { str: 0, dex: 3, con: 0, int: 0, wis: 0, cha: 0 } },
    }
    const effects = buildRaceDefinitionEffects(raceDef, null, raceCard)
    expect(effects.filter(e => e.effectType === 'ability_score_uncapped')).toHaveLength(0)
  })

  it('subrace speed overrides race speed', () => {
    const raceDef = {
      speed: { walk: 30, climb: null, swim: null, fly: null },
      darkvision: null,
      abilityScoreBonuses: [],
    }
    const subrace = {
      speed: { walk: 25, climb: null, swim: null, fly: null },
      darkvision: null,
      abilityScoreBonuses: [],
    }
    const effects = buildRaceDefinitionEffects(raceDef, subrace, { asiAssignments: [] })
    expect(effects).toContainEqual({
      effectType: 'base_speed_increment',
      value: { walk: -5, climb: 0, swim: 0, fly: 0 },
    })
  })

  it('subrace darkvision overrides race darkvision', () => {
    const raceDef = {
      speed: { walk: 30 },
      darkvision: 60,
      abilityScoreBonuses: [],
    }
    const subrace = {
      darkvision: 120,
      abilityScoreBonuses: [],
    }
    const effects = buildRaceDefinitionEffects(raceDef, subrace, { asiAssignments: [] })
    expect(effects).toContainEqual({
      effectType: 'special_senses',
      value: { senses: ['darkvision'], range: 120 },
    })
  })

  it('handles mixed race + subrace ASI assignments', () => {
    const raceDef = {
      speed: { walk: 30 },
      darkvision: null,
      abilityScoreBonuses: [{ amount: 2 }],
    }
    const subrace = {
      abilityScoreBonuses: [{ amount: 1 }],
    }
    const raceCard = {
      asiAssignments: [
        { source: 'race', ability: 'dex' },
        { source: 'subrace', ability: 'con' },
      ],
    }
    const effects = buildRaceDefinitionEffects(raceDef, subrace, raceCard)
    expect(effects).toContainEqual({
      effectType: 'ability_score_uncapped',
      value: { dex: 2 },
    })
    expect(effects).toContainEqual({
      effectType: 'ability_score_uncapped',
      value: { con: 1 },
    })
  })

  it('skips assignments with no ability set', () => {
    const raceDef = {
      speed: { walk: 30 },
      darkvision: null,
      abilityScoreBonuses: [{ amount: 2 }],
    }
    const raceCard = {
      asiAssignments: [{ source: 'race', ability: '' }],
    }
    const effects = buildRaceDefinitionEffects(raceDef, null, raceCard)
    expect(effects.filter(e => e.effectType === 'ability_score_uncapped')).toHaveLength(0)
  })
})
