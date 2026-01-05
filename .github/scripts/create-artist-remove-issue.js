import { Octokit } from '@octokit/rest';
import { readFileSync } from 'fs';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);
const data = payload.data;

// Load existing artist data to get the name for the issue title
const existingArtist = JSON.parse(readFileSync(`src/${data.id}.json`, 'utf8'));

const issueData = {
  id: data.id,
  details: data.details || null,
  email: data.email || null,
};

const issueBody = `\`\`\`json\n${JSON.stringify(issueData, null, 2)}\n\`\`\``;

(async () => {
  await octokit.issues.create({
    owner,
    repo,
    title: `Remove Artist: ${existingArtist.name}`,
    body: issueBody,
    labels: ['remove-artist'],
  });
})();
