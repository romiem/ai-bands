import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SRC_DIR = path.join(process.cwd(), 'src');

// Helper: run git log and return a normalised ISO date string (UTC, Z notation)
function getGitDate(filePath, args) {
  try {
    const raw = execSync(`git log ${args} --format=%cI -- '${filePath}'`)
      .toString()
      .trim();
    // Normalise to UTC Z notation
    return raw ? new Date(raw).toISOString() : null;
  } catch {
    return null;
  }
}

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json'));

for (const file of files) {
  const fullPath = path.join(SRC_DIR, file);

  const dateAdded = getGitDate(fullPath, '--diff-filter=A');
  const dateUpdated = getGitDate(fullPath, '-1');

  if (!dateAdded || !dateUpdated) {
    console.warn(`Skipping ${file} — no git history found`);
    continue;
  }

  // Calculate new values (already normalised to Z notation)
  const newDateAdded = dateAdded;
  const newDateUpdated = dateUpdated === dateAdded ? null : dateUpdated;

  // Read existing JSON
  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

  const oldDateAdded = json.dateAdded || null;
  const oldDateUpdated = json.dateUpdated || null;

  // Check if anything changed
  const changed = (oldDateAdded !== newDateAdded) || (oldDateUpdated !== newDateUpdated);

  if (!changed) {
    // No console.log → stays silent
    continue;
  }

  // Apply updates
  json.dateAdded = newDateAdded;
  json.dateUpdated = newDateUpdated;

  // Write file
  fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n');

  console.log(`Updated ${file}: dateAdded ${oldDateAdded} → ${newDateAdded}, dateUpdated ${oldDateUpdated} → ${newDateUpdated}`);
}
