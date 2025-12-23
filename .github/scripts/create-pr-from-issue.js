import fs from 'fs';
import path from 'path';
// import { Octokit } from '@octokit/rest';
import slugify from '@sindresorhus/slugify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const SCHEMA_PATH = path.join(ROOT_DIR, 'artist.schema.json');
const ARTISTS_PATH = path.join(ROOT_DIR, 'dist', 'ai-bands.json');

const artistsRaw = fs.readFileSync(ARTISTS_PATH, 'utf8');
const artists = JSON.parse(artistsRaw);
const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
const schema = JSON.parse(schemaRaw);

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const { GITHUB_TOKEN, REPO, ISSUE_NUMBER, ISSUE_BODY, COMMENT_ID, GITHUB_OUTPUT } = process.env;
const [owner, repo] = REPO?.split('/') || [];

// const octokit = new Octokit({ auth: GITHUB_TOKEN });


/**
 * Parse key-value format: {key}: value
 */
const parseKeyValueFormat = (text) => {
  const data = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^\{([^}]+)\}:\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      data[key] = value.trim() || null;
    }
  }

  return data;
};

/**
 * Order and transform properties to match schema
 */
const transformAndOrder = (input) => {
  const data = { ...input };

  // Use the artist schema's required keys for ordering
  const orderedKeys = schema.required;

  const ordered = {};
  for (const key of orderedKeys) {
    if (key in data) ordered[key] = data[key];
  }
  for (const key in data) {
    if (!(key in ordered)) ordered[key] = data[key];
  }

  return ordered;
};

/**
 * Get content to parse from issue body
 */
const getContentToParse = () => {
  if (!ISSUE_BODY) throw new Error('No content found in issue body');
  console.log('Using issue body');
  return ISSUE_BODY;
};

/**
 * Create unique filename for artist
 */
const createUniqueFilePath = (artistName) => {
  const baseName = slugify(artistName, { decamelize: false });
  let fileName = `${baseName}.json`;
  let filePath = path.join(SRC_DIR, fileName);

  let counter = 2;
  while (fs.existsSync(filePath)) {
    fileName = `${baseName}-${counter}.json`;
    filePath = path.join(SRC_DIR, fileName);
    counter++;
  }

  return { fileName, filePath };
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
    // Get and parse content
    const content = getContentToParse();
    console.log('Received content:', content, '\n---');

    const artistData = parseKeyValueFormat(content);
    if (!artistData.name) {
      throw new Error('Artist name is required');
    }

    // Check for duplicate entries
    if (artistData.spotify && artists.find(a => a.spotify === artistData.spotify))
      throw new Error('Spotify url already exists in database.');
    if (artistData.apple && artists.find(a => a.apple === artistData.apple))
      throw new Error('Apple url already exists in database.');
    if (artistData.amazon && artists.find(a => a.amazon === artistData.amazon))
      throw new Error('Amazon url already exists in database.');
    if (artistData.youtube && artists.find(a => a.youtube === artistData.youtube))
      throw new Error('YouTube url already exists in database.');

    const { fileName, filePath } = createUniqueFilePath(artistData.name);
    artistData.id = fileName.replace(/\.json$/, '');
    artistData.dateAdded = new Date().toISOString();
    artistData.dateUpdated = null;
    artistData.tags = artistData.tags
      ? artistData.tags.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    artistData.urls = artistData.urls
      ? artistData.urls.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    if (!validate(artistData)) {
      console.error('Validation errors:', validate.errors);
      throw new Error('Artist data does not match schema');
    }

    const orderedData = transformAndOrder(artistData);
    const branchName = `artist/${orderedData.id}`;

    // Write artist file
    fs.writeFileSync(filePath, JSON.stringify(orderedData, null, 2) + '\n');
    console.log(`Artist file created: src/${fileName}`);

    // Set outputs for subsequent workflow steps
    setOutput('filename', fileName);
    setOutput('artist_name', orderedData.name);
    setOutput('branch_name', branchName);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

main();
