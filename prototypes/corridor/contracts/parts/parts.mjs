// Pure G5 parts-graph reader. No I/O, no network, no mutation of the caller's
// graph. The data file is the single source of truth; this module only indexes
// it and validates relation claims.
const VIEWS = new Set(['course', 'parts-search', 'world']);
const KINDS = new Set(['component', 'radical', 'phonetic', 'semantic']);
const PROVENANCE_FIELDS = ['dataset', 'version', 'licence'];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function clone(value) {
  return structuredClone(value);
}

function requireProvenance(value, label) {
  if (!object(value)) throw new TypeError(`${label}: provenance object required`);
  for (const field of PROVENANCE_FIELDS) {
    if (!nonempty(value[field])) {
      throw new TypeError(`${label}: provenance.${field} must be a nonempty string`);
    }
  }
}

function requireRelation(relation, byId, label) {
  if (!object(relation)) throw new TypeError(`${label}: relation object required`);
  if (!KINDS.has(relation.kind)) throw new TypeError(`${label}: unsupported relation kind`);
  if (!nonempty(relation.from) || !byId.has(relation.from)) {
    throw new TypeError(`${label}: relation.from must be a known part id`);
  }
  if (!nonempty(relation.to) || !byId.has(relation.to)) {
    throw new TypeError(`${label}: relation.to must be a known part id`);
  }
  requireProvenance(relation.provenance, label);
}

export function createPartsGraph(input) {
  if (!object(input)) throw new TypeError('parts graph input object required');
  const { graph, unmapped } = input;
  if (!object(graph)) throw new TypeError('parts graph: graph object required');
  if (!Array.isArray(graph.parts)) throw new TypeError('parts graph: graph.parts array required');
  if (!Array.isArray(graph.relations)) throw new TypeError('parts graph: graph.relations array required');
  if (!object(graph.aliases)) throw new TypeError('parts graph: graph.aliases object required');
  if (unmapped !== undefined && !Array.isArray(unmapped)) {
    throw new TypeError('parts graph: unmapped array required');
  }

  // Copy the records once so callers cannot reach the factory input through a
  // query result, while every view still returns the same canonical record.
  const byId = new Map();
  const byLiteral = new Map();
  for (const part of graph.parts) {
    if (!object(part)) throw new TypeError('parts graph: part object required');
    if (!nonempty(part.id)) throw new TypeError('parts graph: part.id must be a nonempty string');
    if (!nonempty(part.literal) || [...part.literal].length !== 1) {
      throw new TypeError(`parts graph: ${part.id} literal must be one Unicode scalar`);
    }
    if (byId.has(part.id)) throw new TypeError(`parts graph: duplicate part id ${part.id}`);
    if (byLiteral.has(part.literal)) {
      throw new TypeError(`parts graph: duplicate part literal ${part.literal}`);
    }
    const stored = clone(part);
    byId.set(part.id, stored);
    byLiteral.set(part.literal, stored);
  }

  const aliases = new Map();
  for (const [alias, target] of Object.entries(graph.aliases)) {
    if (!nonempty(alias) || [...alias].length !== 1) {
      throw new TypeError('parts graph: alias keys must be one Unicode scalar');
    }
    if (typeof target !== 'string' || !byId.has(target)) {
      throw new TypeError(`parts graph: alias ${alias} must target a known part id`);
    }
    aliases.set(alias, target);
  }

  for (const [index, relation] of graph.relations.entries()) {
    requireRelation(relation, byId, `parts graph: stored relation ${index}`);
  }

  return {
    queryPart(view, query) {
      if (!VIEWS.has(view)) throw new TypeError(`parts graph: unknown view ${String(view)}`);
      if (typeof query !== 'string' || query.length === 0) return null;
      if (byId.has(query)) return byId.get(query);
      const aliasTarget = aliases.get(query);
      if (aliasTarget !== undefined) return byId.get(aliasTarget);
      if (byLiteral.has(query)) return byLiteral.get(query);
      return null;
    },
    relate(relation) {
      requireRelation(relation, byId, 'parts graph: relate');
      return {
        kind: relation.kind,
        from: relation.from,
        to: relation.to,
        provenance: clone(relation.provenance),
      };
    },
  };
}
