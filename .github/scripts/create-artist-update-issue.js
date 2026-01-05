import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);
const data = payload.data;

// Load existing artist data from src/[artistId].json
const existingArtist = JSON.parse(readFileSync(`src/${data.artistId}.json`, 'utf8'));

// Fields that can be updated (excluding artistId which is mandatory)
const updateableFields = [
  'name',
  'comments',
  'tags',
  'spotify',
  'apple',
  'amazon',
  'youtube',
  'tiktok',
  'instagram',
];

// Compare and collect only changed fields
const changedData = { artistId: data.artistId };

// Fields where empty strings should be converted to null
const nullableFields = ['spotify', 'apple', 'amazon', 'youtube', 'tiktok', 'instagram'];

for (const field of updateableFields) {
  if (!(field in data)) continue;

  let newValue = data[field];
  const existingValue = existingArtist?.[field];

  // Convert empty strings to null for nullable fields
  if (nullableFields.includes(field) && newValue === '') {
    newValue = null;
  }

  // Deep comparison for arrays
  const isEqual =
    Array.isArray(newValue) && Array.isArray(existingValue)
      ? JSON.stringify(newValue) === JSON.stringify(existingValue)
      : newValue === existingValue;

  if (!isEqual) {
    changedData[field] = newValue;
  }
}

// Only create issue if there are actual changes (more than just artistId)
if (Object.keys(changedData).length > 1) {
  const issueBody = `\`\`\`json\n${JSON.stringify(changedData, null, 2)}\n\`\`\``;

  (async () => {
    await octokit.issues.create({
      owner,
      repo,
      title: `Update Artist: ${data.artistId}`,
      body: issueBody,
      labels: ['update-artist'],
    });
  })();
} else {
  console.log('No changes detected for artist:', data.artistId);
}