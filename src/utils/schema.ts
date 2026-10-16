import { JsonSchema, JsonSchemaProperty } from '../types/jsonSchema';

// An optional field (anyOf [field, null]) renders as the field itself, keeping the outer description and default.
export function resolve(prop: JsonSchemaProperty): JsonSchemaProperty {
  const option = prop.anyOf?.find(o => o.type !== 'null');
  return option ? { ...option, description: prop.description, default: prop.default } : prop;
}

// What a new form starts with: every property's declared default.
export function schemaDefaults(schema: JsonSchema | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schema?.properties ?? {})
    .map(([key, prop]) => [key, resolve(prop).default])
    .filter(([, value]) => value !== undefined && value !== null));
}
