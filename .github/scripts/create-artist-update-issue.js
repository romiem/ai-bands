import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);
const data = payload.data;

// Load existing artist data from src/[id].json
const existingArtist = JSON.parse(readFileSync(`src/${data.id}.json`, 'utf8'));

// Fields that can be updated (excluding id which is mandatory)
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
const changedData = { id: data.id };

// Fields where empty strings should be converted to null
const nullableFields = ['comments', 'spotify', 'apple', 'amazon', 'youtube', 'tiktok', 'instagram'];

for (const field of updateableFields) {
  if (!(field in data)) continue;

  let newValue = data[field];
  const existingValue = existingArtist?.[field];

  // Trim string values to avoid whitespace differences
  if (typeof newValue === 'string') {
    newValue = newValue.trim();
  }

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

// Only create issue if there are actual changes (more than just id)
if (Object.keys(changedData).length > 1) {
  
  // Create link to souloverai.com update form with prefilled data
  const params = Object.keys(changedData)
    .filter(key => key !== 'id') // id is in the URL path, not query params
    .map(key => {
      let value = changedData[key];
      if (Array.isArray(value)) {
        if (value.length === 0) return null;
        value = value.join(',');
      } else if (value === null || value === undefined) {
        return null;
      }
      const encodedValue = encodeURIComponent(value)
        .replace(/\(/g, '%28') // left parenthesis
        .replace(/\)/g, '%29'); // right parenthesis
      return `${key}=${encodedValue}`;
    })
    .filter(Boolean)
    .join('&');

  const link = `[Review changes](https://souloverai.com/artist/${data.id}/update?${params ? params : ''})`
  const issueBody = `\`\`\`json\n${JSON.stringify(changedData, null, 2)}\n\`\`\`\n\n${link}`;

  // If an issue with the same artist ID exists, add a comment instead of creating a new issue
  (async () => {
    const searchQuery = `repo:${owner}/${repo} is:issue is:open in:title "Update Artist: ${data.id}"`;
    const searchResults = await octokit.search.issuesAndPullRequests({ q: searchQuery });

    // Add comment
    if (searchResults.data.items.length > 0) {
      const existingIssue = searchResults.data.items[0];
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: existingIssue.number,
        body: issueBody,
      });
    }
    // Add new issue
    else {
      await octokit.issues.create({
        owner,
        repo,
        title: `Update Artist: ${data.id}`,
        body: issueBody,
        labels: ['update-artist'],
      });
    }
  })();
} else {
  console.log('No changes detected for artist:', data.id);
}