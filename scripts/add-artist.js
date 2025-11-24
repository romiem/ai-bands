#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

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
    return {
        name: "",
        dateAdded: getTodayDate(),
        comments: "",
        spotify: "",
        apple: "",
        youtube: "",
        instagram: "",
        tiktok: "",
        urls: []
    };
};

const sanitizeBranchName = (name) => {
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
            result[key] = null;
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
        const tempFile = path.join(__dirname, '.temp-artist.json');
        const template = createTemplate();
        fs.writeFileSync(tempFile, JSON.stringify(template, null, 2));

        console.log('Opening editor with artist template...\x1b[0m');
        console.log('\x1b[32mFill in the artist details and close the tab editor when done.\x1b[0m');

        await openEditor(tempFile);

        const editedContent = fs.readFileSync(tempFile, 'utf8');
        let artistData;

        try {
            artistData = JSON.parse(editedContent);
        } catch (e) {
            console.error('Error: Invalid JSON format');
            fs.unlinkSync(tempFile);
            rl.close();
            process.exit(1);
        }

        // Validate artist name
        if (!artistData.name || artistData.name.trim() === '') {
            console.error('Error: Artist name is required');
            fs.unlinkSync(tempFile);
            rl.close();
            process.exit(1);
        }

        // Replace empty strings with null
        artistData = replaceEmptyStringsWithNull(artistData);

        // Read current ai-bands.json
        const jsonPath = path.join(__dirname, '..', 'ai-bands.json');
        const currentData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // Add new artist and sort
        currentData.push(artistData);
        currentData.sort((a, b) => a.name.localeCompare(b.name));

        fs.writeFileSync(jsonPath, JSON.stringify(currentData, null, 2) + '\n');
        console.log('\nArtist added to ai-bands.json');
        fs.unlinkSync(tempFile);

        const branchName = `artist/${sanitizeBranchName(artistData.name)}`;

        const confirmBranch = await question(`\nPush to branch "${branchName}"? (Press Enter for yes, or type alternative name): `);
        const trimmedResponse = confirmBranch.trim();
        const finalBranchName = (!trimmedResponse || trimmedResponse.toLowerCase() === 'yes' || trimmedResponse.toLowerCase() === 'y') 
            ? branchName 
            : trimmedResponse;

        console.log(`\nCreating branch: ${finalBranchName}`);

        try {
            // Checkout to main and pull latest
            console.log('Fetching latest changes...');
            await execCommand('git', ['fetch', 'origin']);

            // Check if branch already exists locally
            try {
                await execCommand('git', ['rev-parse', '--verify', finalBranchName]);
                console.log(`Branch ${finalBranchName} already exists, deleting and recreating...`);
                await execCommand('git', ['branch', '-D', finalBranchName]);
            } catch (e) { }

            await execCommand('git', ['checkout', '-b', finalBranchName]);
            await execCommand('git', ['add', 'ai-bands.json']);

            const commitMessage = `Add ${artistData.name}`;
            await execCommand('git', ['commit', '-m', commitMessage]);

            console.log(`\nPushing to origin/${finalBranchName}...`);
            await execCommand('git', ['push', '-u', 'origin', finalBranchName]);

            await execCommand('git', ['checkout', 'main']);

            console.log('\nSuccess - your branch has been pushed.');
            console.log(`\nNext steps:`);
            console.log(`1. Go to https://github.com/romiem/ai-bands`);
            console.log(`2. Create a Pull Request from ${finalBranchName} to main`);

        } catch (error) {
            console.error(`\nGit error: ${error.message}`);
            console.log('\nYou may need to manually commit and push the changes.');
        }

        rl.close();

    } catch (error) {
        console.error(`\nError: ${error.message}`);
        rl.close();
        process.exit(1);
    }
};

main();
