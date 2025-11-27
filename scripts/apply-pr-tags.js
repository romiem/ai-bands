#!/usr/bin/env node

/**
 * GitHub Actions script to apply tags to PRs based on populated fields in artist JSON files.
 */

const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const CHANGED_FILES = process.env.CHANGED_FILES ? process.env.CHANGED_FILES.split(' ') : [];
const REPO_OWNER = process.env.GITHUB_REPOSITORY?.split('/')[0] || 'romiem';
const REPO_NAME = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'ai-bands';
const GITHUB_API = 'https://api.github.com';

/**
 * Make a GitHub API request
 */
async function githubRequest(endpoint, options = {}) {
  const url = `${GITHUB_API}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return response.json();
}

/**
 * Get all labels in the repository
 */
async function getAllLabels() {
  try {
    return await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/labels`);
  } catch (error) {
    console.error('Error fetching labels:', error.message);
    return [];
  }
}

/**
 * Create a label if it doesn't exist
 */
async function ensureLabelExists(name, color) {
  const labels = await getAllLabels();
  const existingLabel = labels.find(label => label.name === name);

  const cleanColor = color.replace(/^#/, '');

  if (existingLabel) {
    // Check if color needs updating
    if (existingLabel.color.toLowerCase() !== cleanColor.toLowerCase()) {
      console.log(`Updating label "${name}" color from #${existingLabel.color} to #${cleanColor}`);
      await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/labels/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: JSON.stringify({ color: cleanColor }),
      });
    } else {
      console.log(`Label "${name}" already exists with correct color #${cleanColor}`);
    }
  } else {
    console.log(`Creating label "${name}" with color #${cleanColor}`);
    await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/labels`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        color: cleanColor,
        description: `Auto-generated tag for ${name}`,
      }),
    });
  }
}

/**
 * Apply labels to the PR
 */
async function applyLabelsToPR(labels) {
  if (labels.length === 0) {
    console.log('No labels to apply');
    return;
  }

  console.log(`Applying labels to PR #${PR_NUMBER}:`, labels.join(', '));
  await githubRequest(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels }),
  });
}

/**
 * Get fields from schema that have githubTag metadata
 */
function getTaggableFields(schema) {
  const taggableFields = {};

  if (!schema.properties) {
    return taggableFields;
  }

  for (const [fieldName, fieldDef] of Object.entries(schema.properties)) {
    if (fieldDef.githubTag && Array.isArray(fieldDef.githubTag)) {
      const [tagName, tagColor] = fieldDef.githubTag;
      taggableFields[fieldName] = { name: tagName, color: tagColor };
    }
  }

  return taggableFields;
}

/**
 * Check if a field value is populated (not null or empty string)
 */
function isFieldPopulated(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }
  return true;
}

/**
 * Analyze changed files and determine which tags to apply
 */
function analyzeChangedFiles(changedFiles, taggableFields) {
  const tagsToApply = new Set();

  for (const file of changedFiles) {
    // Only process JSON files in the src directory
    if (!file.startsWith('src/') || !file.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(process.cwd(), file);

    // Check if file exists (it might have been deleted)
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping deleted file: ${file}`);
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const artistData = JSON.parse(content);

      console.log(`\nAnalyzing ${file}:`);

      // Check each taggable field
      for (const [fieldName, tagInfo] of Object.entries(taggableFields)) {
        if (artistData.hasOwnProperty(fieldName) && isFieldPopulated(artistData[fieldName])) {
          console.log(`  ✓ ${fieldName} is populated → tag: "${tagInfo.name}"`);
          tagsToApply.add(JSON.stringify(tagInfo));
        } else {
          console.log(`  ✗ ${fieldName} is not populated`);
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  // Convert back to objects
  return Array.from(tagsToApply).map(tag => JSON.parse(tag));
}

/**
 * Main function
 */
async function main() {
  if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN is not set');
    process.exit(1);
  }

  if (!PR_NUMBER) {
    console.error('Error: PR_NUMBER is not set');
    process.exit(1);
  }

  if (CHANGED_FILES.length === 0) {
    console.log('No changed files to process');
    return;
  }

  console.log(`Repository: ${REPO_OWNER}/${REPO_NAME}`);
  console.log(`PR Number: ${PR_NUMBER}`);
  console.log(`Changed files: ${CHANGED_FILES.length}`);
  console.log(`Files: ${CHANGED_FILES.join(', ')}\n`);

  // Read the schema
  const schemaPath = path.join(process.cwd(), 'artist.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  // Get fields that have githubTag metadata
  const taggableFields = getTaggableFields(schema);
  console.log('Taggable fields from schema:');
  for (const [field, tag] of Object.entries(taggableFields)) {
    console.log(`  ${field} → "${tag.name}" (${tag.color})`);
  }

  // Analyze changed files
  const tags = analyzeChangedFiles(CHANGED_FILES, taggableFields);

  if (tags.length === 0) {
    console.log('\nNo tags to apply (no populated fields with githubTag metadata)');
    return;
  }

  console.log(`\nTags to apply: ${tags.length}`);

  // Ensure all tags exist with correct colors
  for (const tag of tags) {
    await ensureLabelExists(tag.name, tag.color);
  }

  // Apply tags to PR
  const labelNames = tags.map(tag => tag.name);
  await applyLabelsToPR(labelNames);

  console.log('\n✓ Successfully applied tags to PR');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
