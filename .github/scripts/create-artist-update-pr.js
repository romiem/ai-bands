import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const SCHEMA_PATH = path.join(ROOT_DIR, 'artist.schema.json');

const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
const schema = JSON.parse(schemaRaw);

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const { GITHUB_TOKEN, REPO, ISSUE_NUMBER, ISSUE_BODY, COMMENT_ID, GITHUB_OUTPUT } = process.env;
const [owner, repo] = REPO?.split('/') || [];

const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * Extract JSON from a text containing a code block
 */
const extractJSON = (text) => {
  const match = text.match(/```json\s*\n([\s\S]*?)\n```/);
  return match ? match[1] : null;
};

/**
 * Get content to parse from issue body or most recent comment
 */
const getContentToParse = async () => {
  const comments = await octokit.issues.listComments({ owner, repo, issue_number: ISSUE_NUMBER });
  const sortedComments = comments.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  for (const comment of sortedComments) {
    const json = extractJSON(comment.body);
    if (json) {
      console.log('Using comment from', comment.created_at);
      return json;
    }
  }

  const json = extractJSON(ISSUE_BODY);
  if (json) {
    console.log('Using issue body');
    return json;
  }

  throw new Error('No JSON code block found in issue body or comments');
};

/**
 * Set GitHub Actions output
 */
const setOutput = (key, value) => {
  if (GITHUB_OUTPUT) {
    fs.appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
  }
};

/**
 * Main execution
 */
const main = async () => {
  try {
    // Get and parse content (this contains only the diff: id + changed fields)
    const content = await getContentToParse();
    console.log('Received content:', content, '\n---');

    const updateData = JSON.parse(content);
    if (!updateData.id) {
      throw new Error('Artist id is required');
    }

    // Load existing artist data
    const artistFilePath = path.join(SRC_DIR, `${updateData.id}.json`);
    if (!fs.existsSync(artistFilePath)) {
      throw new Error(`Artist file not found: ${updateData.id}.json`);
    }

    const existingArtist = JSON.parse(fs.readFileSync(artistFilePath, 'utf8'));

    // Merge the update data into the existing artist data
    const mergedData = { ...existingArtist };

    for (const [key, value] of Object.entries(updateData)) {
      if (key === 'id') continue; // Don't overwrite id
      mergedData[key] = value;
    }

    // Update dateUpdated
    mergedData.dateUpdated = new Date().toISOString();

    // Validate merged data against schema
    if (!validate(mergedData)) {
      console.error('Validation errors:', validate.errors);
      throw new Error('Merged artist data does not match schema');
    }

    // Order properties to match schema
    const orderedKeys = schema.required;
    const orderedData = {};
    for (const key of orderedKeys) {
      if (key in mergedData) orderedData[key] = mergedData[key];
    }
    for (const key in mergedData) {
      if (!(key in orderedData)) orderedData[key] = mergedData[key];
    }

    const branchName = `artist-update/${orderedData.id}`;

    // Write updated artist file
    fs.writeFileSync(artistFilePath, JSON.stringify(orderedData, null, 2) + '\n');
    console.log(`Artist file updated: src/${updateData.id}.json`);

    // Set outputs for subsequent workflow steps
    setOutput('filename', `${updateData.id}.json`);
    setOutput('artist_id', updateData.id);
    setOutput('branch_name', branchName);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

main();
