// The JSON Schema subset the forms render: the launcher's rule schemas and gnome-pipelines' Pydantic parameter models.

export interface JsonSchemaProperty {
  type?: string;
  format?: string;
  enum?: string[];
  // Pydantic writes an optional field as anyOf [the field, {type: null}].
  anyOf?: JsonSchemaProperty[];
  items?: { type: string };
  additionalProperties?: { type: string } | boolean;
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}
