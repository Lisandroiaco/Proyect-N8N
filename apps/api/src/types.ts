export type WorkflowNodeType =
  | 'manualTrigger'
  | 'transform'
  | 'wait'
  | 'httpRequest'
  | 'discordWebhook'
  | 'gmailSmtp';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: {
    x: number;
    y: number;
  };
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionStep {
  nodeId: string;
  nodeType: WorkflowNodeType;
  label: string;
  status: 'success' | 'failed';
  durationMs: number;
  output?: unknown;
  error?: string;
}

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'success' | 'failed';
  startedAt: string;
  finishedAt: string;
  steps: ExecutionStep[];
  finalOutput: unknown;
}

export interface RuntimeCredentials {
  [nodeId: string]: Record<string, string>;
}

export type ChatChannel = 'manualTrigger' | 'discordWebhook' | 'gmailSmtp';

export interface ChatHistoryEntry {
  id: string;
  executionId: string;
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  channel: ChatChannel;
  direction: 'inbound' | 'outbound';
  status: 'success' | 'failed';
  summary: string;
  recipient?: string;
  payload: unknown;
  createdAt: string;
}

export interface ConnectorField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'password' | 'select';
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  runtimeOnly?: boolean;
}

export interface ConnectorDefinition {
  type: WorkflowNodeType;
  label: string;
  accent: string;
  description: string;
  defaults: Record<string, unknown>;
  fields: ConnectorField[];
}
