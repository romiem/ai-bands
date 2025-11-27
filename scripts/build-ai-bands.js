const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schemaRaw = fs.readFileSync('./artist.schema.json', 'utf8');
const schema = JSON.parse(schemaRaw);

// Cleanup fields ajv doesn't support
delete schemaRaw["$schema"];
for (const key in schema.properties) {
  if (schema.properties[key].githubTag) {
    delete schema.properties[key].githubTag;
  }
}
const validate = ajv.compile(schema);

const files = fs.readdirSync('src').filter(f => f.endsWith('.json'));
const combined = [];

let hasErrors = false;

for (const file of files) {
  const filePath = `src/${file}`;
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

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/ai-bands.json', JSON.stringify(combined, null, 2));
console.log('✅ All JSON files validated, sorted, and combined successfully.');