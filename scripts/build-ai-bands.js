const fs = require('fs');
const { execSync } = require('child_process');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schemaRaw = fs.readFileSync('./artist.schema.json', 'utf8');
delete schemaRaw["$schema"]; // schema seems to have caused github CI to fail

const schema = JSON.parse(schemaRaw);
const validate = ajv.compile(schema);

/**
 * Get all file dates in batch from git history
 * @param {string[]} filePaths - Array of file paths
 * @returns {Object} - Map of filePath -> { dateAdded, dateUpdated }
 */
function getAllFileDates(filePaths) {
  const dateMap = {};
  
  try {
    // Get all commit dates for all files in one command
    // Format: %ci (committer date ISO 8601) %H (commit hash) -- %f (sanitized subject)
    const cmd = `git log --name-only --pretty=format:%ci --follow -- src/*.json`;
    const output = execSync(cmd, { encoding: 'utf8' }).trim();
    
    if (!output) return dateMap;
    
    const lines = output.split('\n');
    let currentDate = null;
    
    for (const line of lines) {
      if (!line) continue;
      
      // If line contains a timestamp, it's a commit date
      if (line.match(/^\d{4}-\d{2}-\d{2}/)) {
        currentDate = line.split(' ')[0]; // Extract YYYY-MM-DD
      } else if (currentDate && line.endsWith('.json')) {
        // This is a filename
        const filePath = line;
        if (!dateMap[filePath]) {
          dateMap[filePath] = { dateAdded: null, dateUpdated: null };
        }
        
        // First time seeing this file = most recent commit (dateUpdated)
        // Last time seeing this file = oldest commit (dateAdded)
        if (!dateMap[filePath].dateUpdated) {
          dateMap[filePath].dateUpdated = currentDate;
        }
        dateMap[filePath].dateAdded = currentDate; // Will be overwritten until we reach the oldest
      }
    }
    
    // If dateAdded == dateUpdated, the file was never updated after creation
    for (const path in dateMap) {
      if (dateMap[path].dateAdded === dateMap[path].dateUpdated) {
        dateMap[path].dateUpdated = null;
      }
    }
    
    return dateMap;
  } catch (err) {
    console.warn('⚠️  Could not get git dates:', err.message);
    return dateMap;
  }
}

const files = fs.readdirSync('src').filter(f => f.endsWith('.json'));

// Get all dates in batch at once
console.log("Fetching git dates for files...");
const dateMap = getAllFileDates(files);
const combined = [];

let hasErrors = false;

for (const file of files) {
  const filePath = `src/${file}`;

  // Status
  console.log("Processing ", filePath, " | File ", files.indexOf(file)+1, " of ", files.length);

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