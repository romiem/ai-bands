import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { pathToFileURL } from 'node:url';


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
    return json;
  } catch {
    // Nothing should fail here, but if it does just skip the file
    return null;
  }
}).filter(Boolean);

// Import external lists
const SRC_EXTERNAL_DIR = path.join(ROOT_DIR, 'srcExternal');
const externalFileNames = fs.readdirSync(SRC_EXTERNAL_DIR).filter(f => f.endsWith('.js'));
let externalArtists = [];

for (const filename of externalFileNames) {
  console.log("Importing external artist list: ", filename);

  const filePath = path.join(SRC_EXTERNAL_DIR, filename);
  const fileUrl = pathToFileURL(filePath).href;

  try {
    const getArtists = (await import(fileUrl)).default;
    if (!(typeof getArtists === 'function')) {
      console.error(`❌ No function exported in ${filePath}.`);
      continue;
    };

    const artists = await getArtists().catch(error => {
      console.error(`❌ Error importing external artists from ${filePath}:`, error.message);
      return null;
    });

    if (!artists || !Array.isArray(artists)) {
      console.error(`❌ No valid artist array returned from ${filePath}.`);
      continue;
    }

    externalArtists.push(...artists);

  } catch (err) {
    console.error(`❌ Failed to import ${filePath}:`, err.message);
  }
}

console.log("Parsing external artists");

// Compile a list of all known URLs
const knownURIs = new Set(
  artistFiles.flatMap(fileData => {
    return Object.entries(fileData)
      .filter(([key, value]) => schema.properties[key]?.format === 'uri' && typeof value === 'string')
      .map(([_, value]) => value)
      .filter(Boolean);
  }).filter(Boolean)
);

// Use this to filter any artists we already have
externalArtists = externalArtists.filter(artist => {
  const artistURIs = Object.entries(artist)
    .filter(([key, value]) => schema.properties[key]?.format === 'uri' && typeof value === 'string')
    .map(([_, value]) => value)
    .filter(Boolean);

  return !artistURIs.some(uri => knownURIs.has(uri));
});

// Merge duplicate external artists based on shared URI fields
const isEmpty = (value) => value === null || value === undefined || value === '';
const mergeArtists = (artist1, artist2) => {
  const merged = { ...artist1 };
  for (const [key, value] of Object.entries(artist2)) {
    if (key === 'tags') {
      // Special handling for tags: merge arrays and keep unique values
      const tags1 = Array.isArray(merged.tags) ? merged.tags : [];
      const tags2 = Array.isArray(value) ? value : [];
      merged.tags = [...new Set([...tags1, ...tags2])];
    } else if (isEmpty(merged[key]) && !isEmpty(value)) {
      merged[key] = value;
    }
  }
  return merged;
};
const uriFields = Object.keys(schema.properties).filter(
  key => schema.properties[key]?.format === 'uri'
);
const mergedExternalArtists = [];
const processedIndices = new Set();
for (let i = 0; i < externalArtists.length; i++) {
  if (processedIndices.has(i)) continue;

  let mergedArtist = { ...externalArtists[i] };
  const currentURIs = uriFields
    .map(field => externalArtists[i][field])
    .filter(uri => !isEmpty(uri));

  // Find all other artists that share at least one URI
  for (let j = i + 1; j < externalArtists.length; j++) {
    if (processedIndices.has(j)) continue;

    const otherURIs = uriFields
      .map(field => externalArtists[j][field])
      .filter(uri => !isEmpty(uri));

    // Check if they share any URI
    const hasSharedURI = currentURIs.some(uri => otherURIs.includes(uri));

    if (hasSharedURI) {
      mergedArtist = mergeArtists(mergedArtist, externalArtists[j]);
      processedIndices.add(j);

      // Update current URIs to include newly merged URIs
      uriFields.forEach(field => {
        const uri = mergedArtist[field];
        if (!isEmpty(uri) && !currentURIs.includes(uri)) {
          currentURIs.push(uri);
        }
      });
    }
  }
  mergedExternalArtists.push(mergedArtist);
  processedIndices.add(i);
}
externalArtists = mergedExternalArtists;

// Add any fields needed that external data might not have - in particular, names.
externalArtists.forEach(artist => artist.name = artist.name || "[Unknown Name]");

// Validate external artists (since the data is less likely to be right) and add to main list.
var invalidArtists = 0;
externalArtists.filter(artist => {
  const valid = validate(artist);
  if (!valid) {
    invalidArtists++;
    return null;
  }
  return artist;
}).filter(Boolean);

if (invalidArtists > 0) {
  console.log(`⚠️  Skipped ${invalidArtists} invalid external artists.`);
}

artistFiles.push(...externalArtists);

// Finally, validate all artists
console.log("Validating all artists");
let hasErrors = false;

for (const obj of artistFiles) {
  const valid = validate(obj);
  if (!valid) {
    console.error(`❌ Schema validation failed for ${filePath}:`);
    for (const e of validate.errors) {
      console.error(`  ${e.instancePath} ${e.message}`);
    }
    hasErrors = true;
    continue;
  }

  // If any tag is not in the enum, 'external' must be present (this is a tag for where the data come from)
  if (Array.isArray(obj.tags)) {
    const hasExternal = obj.tags.includes("external");
    const TAG_ENUM = schema.properties.tags.items.anyOf.map(i => i.enum).filter(Boolean)[0];
    const invalidTags = obj.tags.filter(tag => !TAG_ENUM.includes(tag));
    if (invalidTags.length > 0 && !hasExternal) {
      console.error(`❌ Tag validation failed for ${filePath}:`);
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