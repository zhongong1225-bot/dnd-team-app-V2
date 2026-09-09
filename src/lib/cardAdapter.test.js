import { describe, it, expect } from 'vitest'
import { buildRaceDefinitionEffects, buildCardsFromCharacter, getMergedBuffsViaCards } from './cardAdapter'

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

describe('buildCardsFromCharacter 始终从源数据生成', () => {
  const manualBuff = {
    id: 'b1',
    source: '冒险测试',
    sourceKind: 'adventure',
    duration: { type: 'until_long_rest' },
    enabled: true,
    effects: [{ effectType: 'ac_bonus', value: 1, category: 'defense', scope: 'global' }],
  }

  it('忽略 char.cards 中的非法条目（原始 BUFF 对象形状），仍从源数据生成', () => {
    const character = {
      buffs: [manualBuff],
      // 历史缺陷曾把合并后的虚拟 BUFF 原样写进 cards，形状不是卡模型
      cards: [
        { id: 'x1', source: '装备附魔', effects: manualBuff.effects, enabled: true, fromItem: 'inv_1' },
      ],
    }
    const cards = buildCardsFromCharacter(character)
    expect(cards.map(c => c.name)).toContain('冒险测试')
    expect(cards.some(c => c.name === '')).toBe(false)
  })

  it('手动 BUFF 的 sourceKind / duration / cardScope 经卡管线往返后保留', () => {
    const character = {
      buffs: [{ ...manualBuff, cardScope: { scopeType: 'custom', scopeDetail: ['仅对亡灵'] } }],
    }
    const [entry] = getMergedBuffsViaCards(character)
    expect(entry.sourceKind).toBe('adventure')
    expect(entry.duration).toEqual({ type: 'until_long_rest' })
    expect(entry.cardScope).toEqual({ scopeType: 'custom', scopeDetail: ['仅对亡灵'] })
  })

  it('带 charge_item 的手动 BUFF 推导出 activeAbility', () => {
    const character = {
      buffs: [{
        id: 'b2',
        source: '主动测试',
        sourceKind: 'temporary',
        enabled: true,
        effects: [{
          effectType: 'charge_item',
          category: 'active_release',
          value: {
            actionCost: 'action',
            resourceType: 'charges',
            charges: 1,
            recovery: { method: 'long_rest' },
            effects: [{ type: 'damage', value: { formula: '2d6' } }],
          },
        }],
      }],
    }
    const [card] = buildCardsFromCharacter(character)
    expect(card.activeAbility).toBeTruthy()
    expect(card.activeAbility.name).toBe('主动测试')
    expect(card.activeAbility.cooldown).toBe('long_rest')
  })
})
