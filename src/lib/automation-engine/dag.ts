/**
 * DAG utilities for automation execution order
 */

interface GraphNode {
  id: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

/**
 * Topological sort using Kahn's algorithm
 * Returns ordered list of node IDs, respecting dependencies
 */
export function topologicalSort(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  // Initialize
  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  }

  // Build graph
  for (const edge of edges) {
    if (adjacency[edge.source] && inDegree[edge.target] !== undefined) {
      adjacency[edge.source].push(edge.target);
      inDegree[edge.target]++;
    }
  }

  // Start with nodes that have no incoming edges
  const queue: string[] = [];
  for (const nodeId of Object.keys(inDegree)) {
    if (inDegree[nodeId] === 0) queue.push(nodeId);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency[current] || []) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  // If sorted has fewer nodes than input, there's a cycle
  if (sorted.length !== nodes.length) {
    throw new Error("Cycle détecté dans le graphe d'automatisation");
  }

  return sorted;
}

/**
 * Get execution layers (groups of nodes that can run in parallel)
 * Each layer contains nodes whose all dependencies are in previous layers
 */
export function getExecutionLayers(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  }

  for (const edge of edges) {
    if (adjacency[edge.source] && inDegree[edge.target] !== undefined) {
      adjacency[edge.source].push(edge.target);
      inDegree[edge.target]++;
    }
  }

  const layers: string[][] = [];
  let remaining = new Set(Object.keys(inDegree));

  while (remaining.size > 0) {
    // Find all nodes with in-degree 0 among remaining
    const layer: string[] = [];
    for (const nodeId of remaining) {
      if (inDegree[nodeId] === 0) layer.push(nodeId);
    }

    if (layer.length === 0) {
      throw new Error("Cycle détecté dans le graphe d'automatisation");
    }

    layers.push(layer);

    // Remove this layer's nodes and update in-degrees
    for (const nodeId of layer) {
      remaining.delete(nodeId);
      for (const neighbor of adjacency[nodeId] || []) {
        inDegree[neighbor]--;
      }
    }
  }

  return layers;
}

/**
 * Get all parent node IDs for a given node
 */
export function getParents(nodeId: string, edges: GraphEdge[]): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

/**
 * Get all child node IDs for a given node
 */
export function getChildren(nodeId: string, edges: GraphEdge[]): string[] {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

/**
 * Get all downstream nodes (transitive children) from a given node
 */
export function getDownstreamNodes(nodeId: string, edges: GraphEdge[]): string[] {
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = getChildren(current, edges);
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }

  return Array.from(visited);
}
