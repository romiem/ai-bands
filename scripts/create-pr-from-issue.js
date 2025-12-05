#!/usr/bin/env node

import { writeFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Octokit } from '@octokit/rest';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { GITHUB_TOKEN, REPO, ISSUE_NUMBER, ISSUE_BODY, COMMENT_ID, GITHUB_OUTPUT } = process.env;
const [owner, repo] = REPO?.split('/') || [];

const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * Sanitize artist name to create a valid filename
 */
const sanitizeFileName = (name) =>
  name.toLowerCase().trim()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Parse key-value format: [key]: value
 */
const parseKeyValueFormat = (text) => {
  const data = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^\[([^\]]+)\]:\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      const trimmedValue = value.trim();

      if (key === 'tags') {
        // Tags: split by comma, trim each, filter empty, default to empty array
        data[key] = trimmedValue
          ? trimmedValue.split(',').map(t => t.trim()).filter(Boolean)
          : [];
      } else {
        // Other fields: empty string becomes null
        data[key] = trimmedValue || null;
      }
    }
  }

  return data;
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

/**
 * Order and transform properties to match schema
 */
const transformAndOrder = (input) => {
  const data = { ...input };

  // Add dateAdded if not present
  data.dateAdded ??= getTodayDate();

  // Ensure dateUpdated exists
  data.dateUpdated ??= null;

  // Ensure tags is an array
  data.tags ??= [];

  // Ensure urls is an array
  data.urls ??= [];

  // Order properties
  const orderedKeys = [
    'name', 'dateAdded', 'dateUpdated', 'comments', 'tags',
    'spotify', 'apple', 'youtube', 'instagram', 'tiktok', 'amazon', 'urls'
  ];

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
  const baseName = sanitizeFileName(artistName);
  let fileName = `${baseName}.json`;
  let filePath = join(__dirname, '..', 'src', fileName);

  let counter = 2;
  while (existsSync(filePath)) {
    fileName = `${baseName}-${counter}.json`;
    filePath = join(__dirname, '..', 'src', fileName);
    counter++;
  }

  return { fileName, filePath };
};

/**
 * Set GitHub Actions output
 */
const setOutput = (key, value) => {
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
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

    if (!artistData.name?.trim()) {
      throw new Error('Artist name is required');
    }

    const orderedData = transformAndOrder(artistData);
    const { fileName, filePath } = createUniqueFilePath(orderedData.name);
    const branchName = `artist/${sanitizeFileName(orderedData.name)}`;

    // Write artist file
    writeFileSync(filePath, JSON.stringify(orderedData, null, 2) + '\n');
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
