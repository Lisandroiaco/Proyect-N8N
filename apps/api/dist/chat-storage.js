import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');
const chatHistoryFile = path.join(dataDir, 'chat-history.json');
function sanitizeRecipient(entry) {
    if (entry.channel === 'discordWebhook') {
        return 'Discord webhook';
    }
    if (entry.channel === 'gmailSmtp' && entry.recipient) {
        return 'Email recipient';
    }
    return entry.recipient;
}
function sanitizeChatHistory(entries) {
    return entries.map((entry) => ({
        ...entry,
        recipient: sanitizeRecipient(entry)
    }));
}
async function ensureChatStorage() {
    await mkdir(dataDir, { recursive: true });
    try {
        await readFile(chatHistoryFile, 'utf8');
    }
    catch {
        await writeFile(chatHistoryFile, '[]', 'utf8');
    }
}
export async function readChatHistory() {
    await ensureChatStorage();
    const content = await readFile(chatHistoryFile, 'utf8');
    const parsed = JSON.parse(content);
    const sanitized = sanitizeChatHistory(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
        await writeFile(chatHistoryFile, JSON.stringify(sanitized, null, 2), 'utf8');
    }
    return sanitized;
}
export async function appendChatHistory(entries) {
    if (entries.length === 0) {
        return;
    }
    const current = await readChatHistory();
    const next = sanitizeChatHistory([...entries, ...current]).slice(0, 200);
    await writeFile(chatHistoryFile, JSON.stringify(next, null, 2), 'utf8');
}
