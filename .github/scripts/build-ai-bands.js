import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SCHEMA_PATH = path.join(ROOT_DIR, 'artist.schema.json');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
const schema = JSON.parse(schemaRaw);
const validate = ajv.compile(schema);

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json'));
const combined = [];

let hasErrors = false;

for (const file of files) {
  const filePath = path.join(SRC_DIR, file);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`❌ Failed to read ${filePath}:`, err.message);
    hasErrors = true;
    continue;
  }

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Invalid JSON in ${filePath}:`, err.message);
    hasErrors = true;
    continue;
  }

  const valid = validate(obj);
  if (!valid) {
    console.error(`❌ Schema validation failed for ${filePath}:`);
    for (const e of validate.errors) {
      console.error(`  ${e.instancePath} ${e.message}`);
    }
    hasErrors = true;
    continue;
  }

  combined.push(obj);
}

if (hasErrors) {
  console.error('❌ Validation errors detected. Aborting build.');
  process.exit(1);
}

combined.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'ai-bands.json'), JSON.stringify(combined, null, 2));
console.log('✅ All JSON files validated, sorted, and combined successfully.');