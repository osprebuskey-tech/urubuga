/**
 * A small Zod 3 -> JSON Schema (OpenAPI 3.0) converter, so the API documentation is built from the same
 * validators the server enforces. Unknown constructs degrade to `{}` (anything) rather than throwing.
 */
function unwrap(schema) {
  return schema?._def;
}

function convert(schema) {
  const def = unwrap(schema);
  if (!def) return {};
  const out = convertInner(schema, def);
  if (def.description && !out.description) out.description = def.description;
  return out;
}

function convertInner(schema, def) {
  switch (def.typeName) {
    case 'ZodString': {
      const out = { type: 'string' };
      for (const c of def.checks) {
        if (c.kind === 'min') out.minLength = c.value;
        else if (c.kind === 'max') out.maxLength = c.value;
        else if (c.kind === 'length') { out.minLength = c.value; out.maxLength = c.value; }
        else if (c.kind === 'email') out.format = 'email';
        else if (c.kind === 'url') out.format = 'uri';
        else if (c.kind === 'uuid') out.format = 'uuid';
        else if (c.kind === 'regex') out.pattern = c.regex.source;
      }
      return out;
    }
    case 'ZodNumber': {
      const out = { type: 'number' };
      for (const c of def.checks) {
        if (c.kind === 'int') out.type = 'integer';
        else if (c.kind === 'min') out.minimum = c.value;
        else if (c.kind === 'max') out.maximum = c.value;
      }
      return out;
    }
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodDate': return { type: 'string', format: 'date-time' };
    case 'ZodLiteral': return { type: typeof def.value, enum: [def.value] };
    case 'ZodEnum': return { type: 'string', enum: [...def.values] };
    case 'ZodNativeEnum': return { enum: Object.values(def.values) };
    case 'ZodArray': {
      const out = { type: 'array', items: convert(def.type) };
      if (def.minLength) out.minItems = def.minLength.value;
      if (def.maxLength) out.maxItems = def.maxLength.value;
      return out;
    }
    case 'ZodObject': {
      const shape = def.shape();
      const properties = {};
      const required = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = convert(value);
        let optional = false;
        try { optional = value.isOptional(); } catch { optional = false; }
        if (!optional) required.push(key);
      }
      const out = { type: 'object', properties };
      if (required.length) out.required = required;
      if (def.unknownKeys === 'strict') out.additionalProperties = false;
      return out;
    }
    case 'ZodRecord': return { type: 'object', additionalProperties: convert(def.valueType) };
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': return { oneOf: [...(def.options?.values?.() ?? def.options)].map(convert) };
    case 'ZodIntersection': return { allOf: [convert(def.left), convert(def.right)] };
    case 'ZodOptional':
    case 'ZodReadonly':
    case 'ZodCatch':
    case 'ZodBranded': return convert(def.innerType ?? def.type);
    case 'ZodNullable': return { ...convert(def.innerType), nullable: true };
    case 'ZodDefault': {
      const out = convert(def.innerType);
      try { out.default = def.defaultValue(); } catch { /* a default that cannot be evaluated is simply not documented */ }
      return out;
    }
    case 'ZodEffects': return convert(def.schema); // refine / superRefine / transform / preprocess: document the underlying shape
    case 'ZodPipeline': return convert(def.in);
    case 'ZodLazy': return {};
    default: return {};
  }
}

/** Query-string schemas become a list of OpenAPI parameters. */
function toQueryParameters(schema) {
  const root = convert(schema);
  if (root.type !== 'object') return [];
  const required = new Set(root.required || []);
  return Object.entries(root.properties).map(([name, s]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: s,
    ...(s.description ? { description: s.description } : {}),
  }));
}

module.exports = { convert, toQueryParameters };
