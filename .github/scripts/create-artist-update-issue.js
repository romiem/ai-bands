import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);
const data = payload.data;

const issueBody = `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

// If an issue with the same artist name exists, add a comment instead of creating a new issue
(async () => {
  await octokit.issues.create({
    owner,
    repo,
    title: `Update Artist: ${data.name}`,
    body: issueBody,
    labels: ['update-artist'],
  });
})();