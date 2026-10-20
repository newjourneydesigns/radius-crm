// A deliberately small JSON-Schema subset validator. Tool inputs are checked against
// the very schema published in tools/list, so what we advertise is what we enforce.

export type JsonSchema = {
  type?: 'object' | 'string' | 'integer' | 'boolean' | 'array' | 'null';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  enum?: readonly (string | number | boolean | null)[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  items?: JsonSchema;
  maxItems?: number;
  default?: unknown;
  anyOf?: readonly JsonSchema[];
};

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
    // Under an ES5 compile target a subclass of Error loses its prototype, which would turn
    // every validation message into a generic server error. Restore it explicitly.
    Object.setPrototypeOf(this, InputError.prototype);
  }
}

/** Returns the arguments with defaults applied, or throws InputError naming the first problem. */
export function parseArguments(schema: JsonSchema, args: unknown): Record<string, unknown> {
  const input = args === undefined || args === null ? {} : args;
  if (typeof input !== 'object' || Array.isArray(input)) throw new InputError('Arguments must be an object.');
  const out: Record<string, unknown> = {};
  const props = schema.properties || {};

  for (const key of Object.keys(input)) {
    if (!(key in props)) {
      if (schema.additionalProperties === false) throw new InputError(`Unknown argument "${key}".`);
    }
  }
  for (const key of schema.required || []) {
    if ((input as Record<string, unknown>)[key] === undefined) throw new InputError(`"${key}" is required.`);
  }
  for (const [key, propSchema] of Object.entries(props)) {
    const raw = (input as Record<string, unknown>)[key];
    if (raw === undefined) {
      if (propSchema.default !== undefined) out[key] = propSchema.default;
      continue;
    }
    out[key] = checkValue(propSchema, raw, key);
  }
  return out;
}

function checkValue(schema: JsonSchema, value: unknown, path: string): unknown {
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') throw new InputError(`"${path}" must be a string.`);
      if (schema.minLength !== undefined && value.length < schema.minLength) throw new InputError(`"${path}" is too short.`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) throw new InputError(`"${path}" is too long.`);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new InputError(`"${path}" has the wrong format.`);
      if (schema.enum && !schema.enum.includes(value)) throw new InputError(`"${path}" must be one of: ${schema.enum.join(', ')}.`);
      return value;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) throw new InputError(`"${path}" must be an integer.`);
      if (schema.minimum !== undefined && value < schema.minimum) throw new InputError(`"${path}" must be at least ${schema.minimum}.`);
      if (schema.maximum !== undefined && value > schema.maximum) throw new InputError(`"${path}" must be at most ${schema.maximum}.`);
      return value;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') throw new InputError(`"${path}" must be true or false.`);
      return value;
    }
    case 'array': {
      if (!Array.isArray(value)) throw new InputError(`"${path}" must be a list.`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new InputError(`"${path}" has too many entries.`);
      return value.map((item, i) => checkValue(schema.items || {}, item, `${path}[${i}]`));
    }
    default:
      return value;
  }
}
