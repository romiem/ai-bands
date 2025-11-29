import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SRC_DIR = path.join(process.cwd(), 'src');

// Helper: run git log and return a date in YYYY-MM-DD format
function getGitDate(filePath, args) {
  try {
    return execSync(`git log ${args} --format=%cs -- '${filePath}'`)
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// Get all .json files in /src
const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json'));

for (const file of files) {
  const fullPath = path.join(SRC_DIR, file);

  const dateAdded = getGitDate(fullPath, '--diff-filter=A'); // first added commit
  const dateUpdated = getGitDate(fullPath, '-1'); // latest commit

  if (!dateAdded || !dateUpdated) {
    console.warn(`Skipping ${file} — no git history found`);
    continue;
  }

  const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  json.dateAdded = dateAdded;

  // If the file was never updated (only added), set dateUpdated to null
  json.dateUpdated = dateUpdated === dateAdded ? null : dateUpdated;

  fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n');

  console.log(`Updated ${file}: dateAdded=${dateAdded}, dateUpdated=${json.dateUpdated}`);
}
