import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');
const dbFile = path.join(dataDir, 'platform-db.json');
function createEmptyPlatformDatabase() {
    return {
        users: [],
        profiles: [],
        sessions: [],
        authTokens: [],
        activityLogs: [],
        posts: [],
        followers: [],
        profileViews: []
    };
}
async function ensurePlatformStorage() {
    await mkdir(dataDir, { recursive: true });
    try {
        await readFile(dbFile, 'utf8');
    }
    catch {
        await writeFile(dbFile, JSON.stringify(createEmptyPlatformDatabase(), null, 2), 'utf8');
    }
}
export async function readPlatformDatabase() {
    await ensurePlatformStorage();
    const content = await readFile(dbFile, 'utf8');
    return JSON.parse(content);
}
export async function writePlatformDatabase(data) {
    await ensurePlatformStorage();
    await writeFile(dbFile, JSON.stringify(data, null, 2), 'utf8');
}
