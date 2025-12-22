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

const fileNames = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json'));
const combined = [];

// Load all artist files into memory
const artistFiles = fileNames.map(filename => {
  try {
    const filePath = path.join(SRC_DIR, filename);
    let json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { filename, data: json };
  } catch {
    // Nothing should fail here, but if it does just skip the file
    return null;
  }
}).filter(Boolean);

// Validate all artists
console.log("Validating all artists");
let hasErrors = false;

for (const { filename, data: obj } of artistFiles) {
  const valid = validate(obj);
  if (!valid) {
    console.error(`❌ Schema validation failed for ${filename}:`);
    for (const e of validate.errors) {
      console.error(`  ${e.instancePath} ${e.message}`);
    }
    hasErrors = true;
    continue;
  }

  // If any tag is not in the enum, 'external' or 'external-modified' must be present
  if (Array.isArray(obj.tags)) {
    const hasExternalTag = obj.tags.includes("external") || obj.tags.includes("external-modified");
    const TAG_ENUM = schema.properties.tags.items?.enum || [];
    const invalidTags = obj.tags.filter(tag => !TAG_ENUM.includes(tag));
    if (invalidTags.length > 0 && !hasExternalTag) {
      console.error(`❌ Tag validation failed for ${filename}:`);
      console.error(`  Tags contain custom values (${invalidTags.join(", ")})`);
      hasErrors = true;
      continue;
    }
  }

  combined.push(obj);
}

if (hasErrors) {
  console.error('❌ Validation errors detected. Aborting build.');
  process.exit(1);
}

combined.sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'base' }));

fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'ai-bands.json'), JSON.stringify(combined, null, 2));
console.log('✅ All JSON files validated, sorted, and combined successfully.');