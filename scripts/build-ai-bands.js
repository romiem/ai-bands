const fs = require('fs');
const { execSync, spawnSync } = require('child_process');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schemaRaw = fs.readFileSync('./artist.schema.json', 'utf8');
const schema = JSON.parse(schemaRaw);

// Remove schema props AJV can't process
delete schema["$schema"];
for (const key in schema.properties) {
  if (schema.properties.hasOwnProperty(key)) {
    delete schema.properties[key]['updatable'];
  }
}

const validate = ajv.compile(schema);

/**
 * Get the list of updatable field names from the schema
 * @returns {string[]} - Array of field names marked as updatable
 */
function getUpdatableFields() {
  const updatableFields = [];
  const properties = schema.properties || {};

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (fieldSchema.updatable === true) {
      updatableFields.push(fieldName);
    }
  }

  return updatableFields;
}

/**
 * Get the last date when updatable fields were modified for each file
 * @param {string[]} filePaths - Array of file paths
 * @param {string[]} updatableFields - Array of field names to track
 * @returns {Object} - Map of filePath -> { dateAdded, dateUpdated }
 */
function getAllFileDates(filePaths, updatableFields) {
  const dateMap = {};

  try {
    // Get all commits with hash and date for JSON files
    const result = spawnSync('git', [
      'log',
      '--name-only',
      '--pretty=format:%H|%ci',
      '--follow',
      '--',
      'src/*.json'
    ], { encoding: 'utf8' });

    if (result.error) {
      throw result.error;
    }

    const output = result.stdout.trim();
    if (!output) return dateMap;

    const lines = output.split('\n');
    let currentCommit = null;
    let currentDate = null;

    for (const line of lines) {
      if (!line) continue;

      // If line contains a pipe, it's a commit hash|date
      if (line.includes('|')) {
        const [hash, timestamp] = line.split('|');
        currentCommit = hash;
        currentDate = timestamp.split(' ')[0]; // Extract YYYY-MM-DD
      } else if (currentCommit && currentDate && line.endsWith('.json')) {
        // This is a filename
        const filePath = line;
        if (!dateMap[filePath]) {
          dateMap[filePath] = { dateAdded: null, dateUpdated: null, commits: [] };
        }

        // Track all commits for this file
        dateMap[filePath].commits.push({ hash: currentCommit, date: currentDate });
        dateMap[filePath].dateAdded = currentDate; // Will be overwritten until we reach the oldest
      }
    }

    // Now check each file's commits to find when updatable fields were last changed
    for (const [filePath, data] of Object.entries(dateMap)) {
      const commits = data.commits;

      // Skip if only one commit (never updated)
      if (commits.length <= 1) {
        continue;
      }

      // Start from the second commit (index 1) and compare with previous
      for (let i = 1; i < commits.length; i++) {
        const currentCommit = commits[i];
        const prevCommit = commits[i - 1];

        // Get the diff for these specific commits
        try {
          const currentContent = execSync(`git show ${currentCommit.hash}:${filePath}`, { encoding: 'utf8' });
          const prevContent = execSync(`git show ${prevCommit.hash}:${filePath}`, { encoding: 'utf8' });

          const currentObj = JSON.parse(currentContent);
          const prevObj = JSON.parse(prevContent);

          // Check if any updatable field changed
          let hasUpdatableChange = false;
          for (const field of updatableFields) {
            const currentVal = JSON.stringify(currentObj[field]);
            const prevVal = JSON.stringify(prevObj[field]);

            if (currentVal !== prevVal) {
              hasUpdatableChange = true;
              break;
            }
          }

          if (hasUpdatableChange) {
            // The previous commit (more recent) is when updatable field was last changed
            data.dateUpdated = prevCommit.date;
            break;
          }
        } catch (err) {
          continue;
        }
      }
    }

    // Clean up the commits array from the result
    for (const path in dateMap) {
      delete dateMap[path].commits;
    }

    return dateMap;
  } catch (err) {
    console.warn('⚠️  Could not get git dates:', err.message);
    return dateMap;
  }
}

const files = fs.readdirSync('src').filter(f => f.endsWith('.json'));

// Get updatable fields from schema
const updatableFields = getUpdatableFields();
console.log(`Tracking updates for fields: ${updatableFields.join(', ')}`);

// Get all dates in batch at once
console.log('Fetching git history dates...');
const dateMap = getAllFileDates(files, updatableFields);
const combined = [];

let hasErrors = false;

for (const file of files) {
  const filePath = `src/${file}`;

  // Status
  console.log("Processing ", filePath, " | File ", files.indexOf(file) + 1, " of ", files.length);

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

  // Inject git-based dates
  const dates = dateMap[filePath] || { dateAdded: null, dateUpdated: null };

  if (dates.dateAdded) {
    obj.dateAdded = dates.dateAdded;
  }
  obj.dateUpdated = dates.dateUpdated;

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