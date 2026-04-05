import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { getRuntimeOnlyKeys } from './catalog.js';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../data');
const workflowsFile = path.join(dataDir, 'workflows.json');
function createStarterWorkflow() {
    const timestamp = new Date().toISOString();
    return {
        id: nanoid(),
        name: 'Lead Welcome Flow',
        description: 'Recibe un lead, arma el mensaje y deja el payload listo para enviarlo a una API o email.',
        nodes: [
            {
                id: 'manual-trigger-1',
                type: 'manualTrigger',
                position: { x: 120, y: 160 },
                data: {
                    label: 'Manual Trigger',
                    config: {
                        note: 'Payload de prueba desde el panel Run.'
                    }
                }
            },
            {
                id: 'transform-1',
                type: 'transform',
                position: { x: 430, y: 160 },
                data: {
                    label: 'Prepare Message',
                    config: {
                        template: '{\n  "customer": "${input.name}",\n  "email": "${input.email}",\n  "message": "Hola ${input.name}, gracias por registrarte"\n}'
                    }
                }
            },
            {
                id: 'wait-1',
                type: 'wait',
                position: { x: 760, y: 160 },
                data: {
                    label: 'Wait 1s',
                    config: {
                        milliseconds: 1000
                    }
                }
            }
        ],
        edges: [
            {
                id: 'manual-trigger-1-transform-1',
                source: 'manual-trigger-1',
                target: 'transform-1'
            },
            {
                id: 'transform-1-wait-1',
                source: 'transform-1',
                target: 'wait-1'
            }
        ],
        createdAt: timestamp,
        updatedAt: timestamp
    };
}
function normalizeWorkflows(workflows) {
    const normalized = workflows.map((workflow) => ({
        ...workflow,
        id: workflow.id && workflow.id.trim() ? workflow.id : nanoid(),
        updatedAt: workflow.updatedAt || workflow.createdAt || new Date().toISOString(),
        nodes: workflow.nodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                config: Object.fromEntries(Object.entries(node.data.config).filter(([key]) => !getRuntimeOnlyKeys(node.type).includes(key)))
            }
        }))
    }));
    return normalized.length > 0 ? normalized : [createStarterWorkflow()];
}
async function ensureStorage() {
    await mkdir(dataDir, { recursive: true });
    try {
        const content = await readFile(workflowsFile, 'utf8');
        if (!content.trim()) {
            await writeFile(workflowsFile, JSON.stringify([createStarterWorkflow()], null, 2), 'utf8');
            return;
        }
        const parsed = JSON.parse(content);
        const normalized = normalizeWorkflows(parsed);
        if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
            await writeFile(workflowsFile, JSON.stringify(normalized, null, 2), 'utf8');
        }
    }
    catch {
        await writeFile(workflowsFile, JSON.stringify([createStarterWorkflow()], null, 2), 'utf8');
    }
}
export async function readWorkflows() {
    await ensureStorage();
    const content = await readFile(workflowsFile, 'utf8');
    return normalizeWorkflows(JSON.parse(content));
}
export async function writeWorkflows(workflows) {
    await ensureStorage();
    await writeFile(workflowsFile, JSON.stringify(normalizeWorkflows(workflows), null, 2), 'utf8');
}
