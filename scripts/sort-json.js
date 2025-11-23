#!/usr/bin/env node

// This script sources ai-bands.json on commit.

const fs = require('fs');
const path = require('path');

const jsonFilePath = path.join(__dirname, '..', 'ai-bands.json');

try {
  // Read and validate JSON
  const rawData = fs.readFileSync(jsonFilePath, 'utf8');
  JSON.parse(rawData); // Throws an error if invalid

  // Parse and sort JSON
  const data = JSON.parse(rawData);
  data.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // Write back sorted JSON
  fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('✓ ai-bands.json validated and sorted alphabetically');
} catch (error) {
  console.error('Error validating or sorting JSON:', error.message);
  process.exit(1);
}
