import nodemailer from 'nodemailer';
import { nanoid } from 'nanoid';

import { appendChatHistory } from './chat-storage.js';
import { connectorMap } from './catalog.js';
import type {
  ChatHistoryEntry,
  ExecutionStep,
  RuntimeCredentials,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowExecutionResult,
  WorkflowNode
} from './types.js';

interface NodeExecutionOutcome {
  output: unknown;
  chatEntry?: Omit<ChatHistoryEntry, 'id' | 'executionId' | 'workflowId' | 'workflowName' | 'createdAt'>;
}

function getPath(source: unknown, dottedPath: string) {
  return dottedPath.split('.').reduce<unknown>((value, key) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value !== 'object') {
      return undefined;
    }

    return (value as Record<string, unknown>)[key];
  }, source);
}

function interpolateString(template: string, context: Record<string, unknown>) {
  return template.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
    const result = getPath(context, expression.trim());
    return result === undefined || result === null ? '' : String(result);
  });
}

function interpolateValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    return interpolateString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, interpolateValue(nestedValue, context)])
    );
  }

  return value;
}

function parseJsonConfig(rawValue: unknown, fallback: unknown) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return fallback;
  }

  return JSON.parse(rawValue);
}

function getReachableNodes(workflow: WorkflowDefinition) {
  const outgoing = new Map<string, string[]>();
  const reachable = new Set<string>();
  const trigger = workflow.nodes.find((node) => node.type === 'manualTrigger') ?? workflow.nodes[0];

  workflow.edges.forEach((edge) => {
    const current = outgoing.get(edge.source) ?? [];
    current.push(edge.target);
    outgoing.set(edge.source, current);
  });

  const visit = (nodeId: string) => {
    if (reachable.has(nodeId)) {
      return;
    }

    reachable.add(nodeId);
    (outgoing.get(nodeId) ?? []).forEach(visit);
  };

  if (trigger) {
    visit(trigger.id);
  }

  return reachable;
}

function topologicalSort(workflow: WorkflowDefinition) {
  const reachable = getReachableNodes(workflow);
  const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  workflow.nodes.forEach((node) => {
    if (reachable.has(node.id)) {
      indegree.set(node.id, 0);
    }
  });

  workflow.edges.forEach((edge) => {
    if (!reachable.has(edge.source) || !reachable.has(edge.target)) {
      return;
    }

    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);

    const current = outgoing.get(edge.source) ?? [];
    current.push(edge.target);
    outgoing.set(edge.source, current);
  });

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId);
  const order: WorkflowNode[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);

    if (!node) {
      continue;
    }

    order.push(node);

    (outgoing.get(nodeId) ?? []).forEach((targetId) => {
      const nextDegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextDegree);

      if (nextDegree === 0) {
        queue.push(targetId);
      }
    });
  }

  if (order.length !== reachable.size) {
    throw new Error('El workflow contiene ciclos o conexiones invalidas.');
  }

  return { order, reachable };
}

function getIncomingEdges(edges: WorkflowEdge[], nodeId: string) {
  return edges.filter((edge) => edge.target === nodeId);
}

async function executeNode(
  node: WorkflowNode,
  context: Record<string, unknown>,
  runtimeCredentials: RuntimeCredentials
) {
  const config = interpolateValue(
    {
      ...node.data.config,
      ...(runtimeCredentials[node.id] ?? {})
    },
    context
  ) as Record<string, unknown>;

  switch (node.type) {
    case 'manualTrigger':
      return {
        output: context.input,
        chatEntry: {
          nodeId: node.id,
          nodeLabel: node.data.label,
          channel: 'manualTrigger',
          direction: 'inbound',
          status: 'success',
          summary: 'Payload recibido por manual trigger.',
          payload: context.input
        }
      } satisfies NodeExecutionOutcome;
    case 'transform': {
      const template = parseJsonConfig(config.template, {});
      return {
        output: interpolateValue(template, context)
      } satisfies NodeExecutionOutcome;
    }
    case 'wait': {
      const milliseconds = Number(config.milliseconds ?? 0);
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
      return {
        output: {
          waitedMs: milliseconds,
          current: context.current
        }
      } satisfies NodeExecutionOutcome;
    }
    case 'httpRequest': {
      const method = String(config.method ?? 'GET').toUpperCase();
      const url = String(config.url ?? '');
      const headers = parseJsonConfig(config.headers, {});
      const body = parseJsonConfig(config.body, {});
      const response = await fetch(url, {
        method,
        headers: headers as HeadersInit,
        body: method === 'GET' ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let payload: unknown = text;

      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
      }

      return {
        output: {
          status: response.status,
          payload
        }
      } satisfies NodeExecutionOutcome;
    }
    case 'discordWebhook': {
      const content = String(config.content ?? '');
      const webhookUrl = String(config.webhookUrl ?? '');
      const username = String(config.username ?? 'Mini n8n Bot');
      const response = await fetch(String(config.webhookUrl ?? ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          content
        })
      });

      if (!response.ok) {
        throw new Error(`Discord webhook fallo con status ${response.status}`);
      }

      return {
        output: {
          delivered: true,
          status: response.status
        },
        chatEntry: {
          nodeId: node.id,
          nodeLabel: node.data.label,
          channel: 'discordWebhook',
          direction: 'outbound',
          status: 'success',
          summary: `Mensaje enviado a Discord como ${username}.`,
          recipient: 'Discord webhook',
          payload: {
            username,
            content
          }
        }
      } satisfies NodeExecutionOutcome;
    }
    case 'gmailSmtp': {
      const to = String(config.to ?? '');
      const subject = String(config.subject ?? '');
      const html = String(config.html ?? '');
      const transporter = nodemailer.createTransport({
        host: String(config.host ?? 'smtp.gmail.com'),
        port: Number(config.port ?? 465),
        secure: String(config.secure ?? 'true') === 'true',
        auth: {
          user: String(config.user ?? ''),
          pass: String(config.pass ?? '')
        }
      });

      const info = await transporter.sendMail({
        from: String(config.from ?? config.user ?? ''),
        to,
        subject,
        html
      });

      return {
        output: {
          accepted: info.accepted,
          rejected: info.rejected,
          messageId: info.messageId
        },
        chatEntry: {
          nodeId: node.id,
          nodeLabel: node.data.label,
          channel: 'gmailSmtp',
          direction: 'outbound',
          status: 'success',
          summary: `Email enviado a ${to || 'destinatario'}.`,
          recipient: 'Email recipient',
          payload: {
            subject,
            html
          }
        }
      } satisfies NodeExecutionOutcome;
    }
    default: {
      const connector = connectorMap.get(node.type);
      throw new Error(`Nodo no soportado: ${connector?.label ?? node.type}`);
    }
  }
}

export async function executeWorkflow(
  workflow: WorkflowDefinition,
  input: Record<string, unknown>,
  runtimeCredentials: RuntimeCredentials = {}
): Promise<WorkflowExecutionResult> {
  const executionId = nanoid();
  const startedAt = new Date().toISOString();
  const { order } = topologicalSort(workflow);
  const steps: ExecutionStep[] = [];
  const outputs: Record<string, unknown> = {};
  const chatEntries: ChatHistoryEntry[] = [];

  for (const node of order) {
    const incoming = getIncomingEdges(workflow.edges, node.id);
    const parentOutputs = incoming.map((edge) => outputs[edge.source]).filter((value) => value !== undefined);
    const current = parentOutputs.length <= 1 ? parentOutputs[0] ?? input : parentOutputs;
    const context = {
      input,
      steps: outputs,
      current
    };
    const started = performance.now();

    try {
      const outcome = (await executeNode(node, context, runtimeCredentials)) as NodeExecutionOutcome;
      outputs[node.id] = outcome.output;
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        label: node.data.label,
        status: 'success',
        durationMs: Math.round(performance.now() - started),
        output: outcome.output
      });

      if (outcome.chatEntry) {
        chatEntries.push({
          id: nanoid(),
          executionId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          createdAt: new Date().toISOString(),
          ...outcome.chatEntry
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      steps.push({
        nodeId: node.id,
        nodeType: node.type,
        label: node.data.label,
        status: 'failed',
        durationMs: Math.round(performance.now() - started),
        error: message
      });

      await appendChatHistory(chatEntries);

      return {
        executionId,
        workflowId: workflow.id,
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        steps,
        finalOutput: outputs
      };
    }
  }

  const finalStep = steps[steps.length - 1];
  await appendChatHistory(chatEntries);

  return {
    executionId,
    workflowId: workflow.id,
    status: 'success',
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
    finalOutput: finalStep ? outputs[finalStep.nodeId] : input
  };
}
