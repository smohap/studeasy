import { describe, it, expect } from 'vitest'
import { buildTopicTree } from './taxonomy-tree'

describe('buildTopicTree', () => {
  it('nests sub-topics under their parent standard', () => {
    const tree = buildTopicTree([
      { id: 'a', parent_id: null, name: 'AS91027', sort: 10 },
      { id: 'b', parent_id: 'a', name: 'Factorising', sort: 20 },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.name)).toEqual(['Factorising'])
  })

  it('drops a sub-topic whose parent is absent rather than losing it silently', () => {
    const tree = buildTopicTree([
      { id: 'b', parent_id: 'missing', name: 'Orphan', sort: 20 },
    ])
    expect(tree).toEqual([])
  })

  it('orders siblings by sort, then name', () => {
    const tree = buildTopicTree([
      { id: 'a', parent_id: null, name: 'Second', sort: 20 },
      { id: 'b', parent_id: null, name: 'First', sort: 10 },
    ])
    expect(tree.map((t) => t.name)).toEqual(['First', 'Second'])
  })
})
