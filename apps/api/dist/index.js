import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { readChatHistory } from './chat-storage.js';
import { connectorCatalog, connectorMap } from './catalog.js';
import { executeWorkflow } from './engine.js';
import platformRouter, { requireAuth } from './platform-router.js';
import { readWorkflows, writeWorkflows } from './storage.js';
const app = express();
const port = Number(process.env.PORT ?? 4000);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(currentDir, '../uploads');
const positionSchema = z.object({
    x: z.number(),
    y: z.number()
});
const workflowNodeSchema = z.object({
    id: z.string().min(1),
    type: z.enum(['manualTrigger', 'transform', 'wait', 'httpRequest', 'discordWebhook', 'gmailSmtp']),
    position: positionSchema,
    data: z.object({
        label: z.string().min(1),
        config: z.record(z.unknown())
    })
});
const workflowEdgeSchema = z.object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1)
});
const workflowInputSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(3),
    description: z.string().default(''),
    nodes: z.array(workflowNodeSchema).min(1),
    edges: z.array(workflowEdgeSchema),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
});
app.use(cors());
app.use(helmet({
    crossOriginResourcePolicy: false
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/api', platformRouter);
app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
});
app.get('/api/connectors', (_request, response) => {
    response.json(connectorCatalog);
});
app.get('/api/workflows', requireAuth, async (_request, response) => {
    const workflows = await readWorkflows();
    response.json(workflows);
});
app.get('/api/chat-history', requireAuth, async (_request, response) => {
    const history = await readChatHistory();
    response.json(history);
});
app.post('/api/workflows', requireAuth, async (request, response) => {
    const payload = workflowInputSchema.parse(request.body);
    const workflows = await readWorkflows();
    const timestamp = new Date().toISOString();
    const workflow = {
        id: payload.id?.trim() ? payload.id : nanoid(),
        name: payload.name,
        description: payload.description,
        nodes: payload.nodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                label: node.data.label || connectorMap.get(node.type)?.label || node.type
            }
        })),
        edges: payload.edges,
        createdAt: payload.createdAt ?? timestamp,
        updatedAt: timestamp
    };
    const existingIndex = workflows.findIndex((item) => item.id === workflow.id);
    if (existingIndex >= 0) {
        workflows[existingIndex] = workflow;
    }
    else {
        workflows.unshift(workflow);
    }
    await writeWorkflows(workflows);
    response.json(workflow);
});
app.post('/api/workflows/:id/execute', requireAuth, async (request, response) => {
    const workflows = await readWorkflows();
    const workflow = workflows.find((item) => item.id === request.params.id);
    if (!workflow) {
        response.status(404).json({ message: 'Workflow no encontrado.' });
        return;
    }
    const payloadSchema = z.object({
        input: z.record(z.unknown()).default({}),
        credentials: z.record(z.record(z.string())).default({})
    });
    const payload = payloadSchema.parse(request.body ?? {});
    const result = await executeWorkflow(workflow, payload.input, payload.credentials);
    response.json(result);
});
app.delete('/api/workflows/:id', requireAuth, async (request, response) => {
    const workflows = await readWorkflows();
    const filtered = workflows.filter((item) => item.id !== request.params.id);
    if (filtered.length === workflows.length) {
        response.status(404).json({ message: 'Workflow no encontrado.' });
        return;
    }
    await writeWorkflows(filtered);
    response.status(204).send();
});
app.listen(port, () => {
    console.log(`Mini n8n API listening on http://localhost:${port}`);
});
