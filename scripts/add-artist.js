#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const schemaPath = join(__dirname, '..', 'artist.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const execCommand = (command, args = []) => {
    return new Promise((resolve, reject) => {
        const quotedArgs = args.map(arg => {
            if (arg.includes(' ') || arg.includes("'") || arg.includes('"')) {
                return `"${arg.replace(/"/g, '\\"')}"`;
            }
            return arg;
        });

        const fullCommand = args.length > 0 
            ? `${command} ${quotedArgs.join(' ')}`
            : command;

        const proc = spawn(fullCommand, [], {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(stderr || stdout));
            }
        });
    });
};

const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const createTemplate = () => {
    const template = {};
    
    for (const [key, prop] of Object.entries(schema.properties)) {
        // Skip dateAdded and dateUpdated - these will be auto-generated
        if (key === 'dateAdded' || key === 'dateUpdated') {
            continue;
        }
        
        // Determine default value based on type
        if (prop.type === 'array') {
            template[key] = [];
        } else if (prop.type === 'string') {
            template[key] = "";
        } else if (Array.isArray(prop.type) && prop.type.includes('string')) {
            // String that support null will be replaced later if empty
            template[key] = "";
        } else {
            template[key] = null;
        }
    }
    
    return template;
};

const sanitizeFileName = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

const replaceEmptyStringsWithNull = (obj) => {
    const result = { ...obj };
    for (const key in result) {
        if (result[key] === "") {
            // Only replace with null if the schema allows null
            const prop = schema.properties[key];
            if (prop && Array.isArray(prop.type) && prop.type.includes('null')) {
                result[key] = null;
            }
        }
    }
    return result;
};

const openEditor = async (filePath) => {
    const editor = 'code';
    const args = ['--wait', filePath];

    return new Promise((resolve, reject) => {
        const proc = spawn(editor, args, {
            stdio: 'inherit',
            shell: true
        });

        proc.on('close', (code) => {
            if (code === 0 || code === null) {
                resolve();
            } else {
                reject(new Error(`Editor exited with code ${code}`));
            }
        });
    });
};

const main = async () => {
    try {
        const tempFile = join(__dirname, '.temp-artist.json');
        const template = createTemplate();
        writeFileSync(tempFile, JSON.stringify(template, null, 2));

        console.log('Opening editor with artist template...');
        console.log('\x1b[32mFill in the artist details and close the editor tab when done.\x1b[0m');

        await openEditor(tempFile);

        const editedContent = readFileSync(tempFile, 'utf8');
        let artistData;

        try {
            artistData = JSON.parse(editedContent);
        } catch (e) {
            console.error('Error: Invalid JSON format');
            unlinkSync(tempFile);
            process.exit(1);
        }

        // Validate artist name
        if (!artistData.name || artistData.name.trim() === '') {
            console.error('Error: Artist name is required');
            unlinkSync(tempFile);
            process.exit(1);
        }

        // Replace empty strings with null
        artistData = replaceEmptyStringsWithNull(artistData);

        // Add dateAdded and dateUpdated
        artistData.dateAdded = getTodayDate();
        artistData.dateUpdated = null;

        // Reorder properties to match schema since dates were injected manually
        const orderedData = {};
        for (const key of Object.keys(schema.properties)) {
            orderedData[key] = artistData[key];
        }

        // Create filename
        let fileName = sanitizeFileName(artistData.name) + '.json';
        let filePath = join(__dirname, '..', 'src', fileName);

        // Make sure the filename is unique
        let counter = 2;
        while (existsSync(filePath)) {
            fileName = sanitizeFileName(artistData.name) + `-${counter}.json`;
            filePath = join(__dirname, '..', 'src', fileName);
            counter++;
        }

        // Write artist file
        writeFileSync(filePath, JSON.stringify(orderedData, null, 2) + '\n');
        console.log(`\nArtist file created: src/${fileName}`);
        unlinkSync(tempFile);

        const branchName = `artist/${sanitizeFileName(artistData.name)}`;
        console.log(`\nCreating branch: ${branchName}`);

        try {
            // Fetch latest changes
            console.log('Fetching latest changes...');
            await execCommand('git', ['fetch', 'origin']);

            // Check if branch already exists locally and delete it
            try {
                await execCommand('git', ['rev-parse', '--verify', branchName]);
                console.log(`Branch ${branchName} already exists, deleting and recreating...`);
                await execCommand('git', ['branch', '-D', branchName]);
            } catch (e) { }

            // Create and checkout new branch
            await execCommand('git', ['checkout', '-b', branchName]);
            await execCommand('git', ['add', `src/${fileName}`]);

            const commitMessage = `Add ${artistData.name}`;
            await execCommand('git', ['commit', '-m', commitMessage]);

            console.log(`\nPushing to origin/${branchName}...`);
            await execCommand('git', ['push', '-u', 'origin', branchName]);

            // Switch back to main
            await execCommand('git', ['checkout', 'main']);

            console.log('\nSuccess - your branch has been pushed.');
            console.log(`\nNext steps:`);
            console.log(`1. Go to https://github.com/romiem/ai-bands`);
            console.log(`2. Create a Pull Request from ${branchName} to main`);

        } catch (error) {
            console.error(`\nGit error: ${error.message}`);
            console.log('\nYou may need to manually commit and push the changes.');
        }

    } catch (error) {
        console.error(`\nError: ${error.message}`);
        process.exit(1);
    }
};

main();
