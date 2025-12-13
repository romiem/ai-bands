import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(__dirname, "../artist.schema.json"), "utf-8"));

// Map of default handlers for specific fields.
// Subfields can be added like "parent.field"
const fieldPathHandlers = {
  // 'dateAdded': () => new Date().toISOString().split('T')[0],
};

export function getTemplate(schemaObj = schema, path = []) {
  const template = {};

  for (const [key, prop] of Object.entries(schemaObj.properties || {})) {
    const types = Array.isArray(prop.type) ? prop.type : [prop.type];
    const primaryType = types.find(t => t !== 'null') || types[0];
    const isNullable = types.includes('null');
    const fieldPath = [...path, key].join('.');

    // Check for a handler for this field path
    const handler = fieldPathHandlers[fieldPath];
    if (handler) {
      template[key] = handler();
      continue;
    }

    // Arrays
    if (primaryType === 'array') {
      template[key] = [];
    }
    // Objects
    else if (primaryType === 'object') {
      template[key] = prop.properties ? getTemplate(prop, [...path, key]) : {};
    }
    // Nullable types
    else if (isNullable) {
      template[key] = null;
    }
    // Strings
    else if (primaryType === 'string') {
      template[key] = prop.format === 'date' ? new Date().toISOString().split('T')[0] : '';
    }
    // Numbers
    else if (primaryType === 'number' || primaryType === 'integer') {
      template[key] = 0;
    }
    // Booleans
    else if (primaryType === 'boolean') {
      template[key] = false;
    }
    // Fallback
    else {
      template[key] = null;
    }
  }

  return template;
}