export type TopicRow = {
  id: string
  parent_id: string | null
  name: string
  sort: number
}

export type TopicNode = TopicRow & { children: TopicNode[] }

/**
 * Flat topic rows to a two-level tree. A sub-topic whose parent is not in the
 * input is dropped rather than promoted to the root: a tutor sub-topic
 * floating beside a national standard would read as though it were one.
 */
export function buildTopicTree(rows: TopicRow[]): TopicNode[] {
  const byId = new Map<string, TopicNode>()
  for (const row of rows) byId.set(row.id, { ...row, children: [] })

  const roots: TopicNode[] = []
  for (const node of byId.values()) {
    if (node.parent_id === null) {
      roots.push(node)
      continue
    }
    byId.get(node.parent_id)?.children.push(node)
  }

  const order = (a: TopicNode, b: TopicNode) =>
    a.sort - b.sort || a.name.localeCompare(b.name)

  roots.sort(order)
  for (const root of roots) root.children.sort(order)
  return roots
}
