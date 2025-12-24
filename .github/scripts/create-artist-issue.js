import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);
const data = payload.data;

const schemaPath = path.join(process.cwd(), 'artist.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const propertyOrder = Object.keys(schema.properties);

const orderedData = {};
for (const key of propertyOrder) {
  orderedData[key] = data[key];
}

// Convert comma-delimited strings to arrays for tags and urls, default to empty array
orderedData.tags = orderedData.tags && typeof orderedData.tags === 'string' ? orderedData.tags.split(',').map(s => s.trim()) : [];
orderedData.urls = orderedData.urls && typeof orderedData.urls === 'string' ? orderedData.urls.split(',').map(s => s.trim()) : [];

// Create link to souloverai.com submission form with prefilled data
const params = Object.keys(orderedData).map(key => {
  let value = orderedData[key];
  if (Array.isArray(value)) {
    value = value.join(',');
  }
  return `${key}=${encodeURIComponent(value)}`;
}).join('&');
const link = `https://souloverai.com/add?${params}`;

const issueBody = `\`\`\`json\n${JSON.stringify(orderedData, null, 2)}\n\`\`\`\n\n${link}`;

// If an issue with the same artist name exists, add a comment instead of creating a new issue
(async () => {
  const searchQuery = `repo:${owner}/${repo} is:issue is:open in:title "Artist Submission: ${data.name}"`;
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
      title: `Artist Submission: ${data.name}`,
      body: issueBody,
      labels: [data.confidenceScore >= 3 ? 'artist-submission:high' : 'artist-submission:low'],
    });
  }
})();