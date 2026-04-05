import { useEffect, useMemo, useState } from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type OnSelectionChangeParams
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { deleteWorkflow, executeWorkflow, fetchChatHistory, fetchConnectors, fetchWorkflows, saveWorkflow } from '../api';
import { AutomationNode } from './AutomationNode';
import type {
  CanvasNode,
  ChatHistoryEntry,
  ConnectorDefinition,
  RequestContext,
  RuntimeCredentials,
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowNodeType
} from '../types';

const nodeTypes = {
  automation: AutomationNode
};

function getPersistedFields(connector: ConnectorDefinition) {
  return connector.fields.filter((field) => !field.runtimeOnly);
}

function getRuntimeFields(connector: ConnectorDefinition) {
  return connector.fields.filter((field) => field.runtimeOnly);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function createNodeFromConnector(connector: ConnectorDefinition, index: number): CanvasNode {
  return {
    id: `${connector.type}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'automation',
    position: {
      x: 140 + index * 40,
      y: 120 + index * 32
    },
    data: {
      nodeType: connector.type,
      label: connector.label,
      accent: connector.accent,
      description: connector.description,
      config: structuredClone(connector.defaults)
    }
  };
}

function createEmptyWorkflow(connectors: ConnectorDefinition[]): WorkflowDefinition {
  const manual = connectors.find((connector) => connector.type === 'manualTrigger');
  const transform = connectors.find((connector) => connector.type === 'transform');
  const nodes = [manual, transform].filter(Boolean).map((connector, index) => createNodeFromConnector(connector!, index));
  const edges: Edge[] = nodes.length > 1 ? [{ id: `${nodes[0].id}-${nodes[1].id}`, source: nodes[0].id, target: nodes[1].id }] : [];
  const now = new Date().toISOString();

  return {
    id: '',
    name: 'Lead Capture Flow',
    description: 'Recibe un payload, transforma datos y queda listo para conectarlo a APIs.',
    nodes: nodes.map((node, index) => ({
      id: node.id,
      type: (index === 0 ? 'manualTrigger' : 'transform') as WorkflowNodeType,
      position: node.position,
      data: node.data
    })),
    edges,
    createdAt: now,
    updatedAt: now
  };
}

function flowFromWorkflow(workflow: WorkflowDefinition, connectors: ConnectorDefinition[]) {
  const connectorByType = new Map(connectors.map((connector) => [connector.type, connector]));
  const nodes: CanvasNode[] = workflow.nodes.map((node) => {
    const connector = connectorByType.get(node.type);
    return {
      id: node.id,
      type: 'automation',
      position: node.position,
      data: {
        nodeType: node.type,
        label: node.data.label,
        accent: connector?.accent ?? node.data.accent,
        description: connector?.description ?? node.data.description,
        config: node.data.config
      }
    };
  });

  const edges: Edge[] = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
    style: { stroke: '#0b3b66', strokeWidth: 2 }
  }));

  return { nodes, edges };
}

function workflowFromFlow(workflow: WorkflowDefinition, nodes: CanvasNode[], edges: Edge[]): WorkflowDefinition {
  return {
    ...workflow,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      position: node.position,
      data: {
        label: node.data.label,
        accent: node.data.accent,
        description: node.data.description,
        config: node.data.config
      }
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target
    })),
    updatedAt: new Date().toISOString()
  };
}

function parsePayload(raw: string) {
  if (!raw.trim()) {
    return {};
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

function validateNodeConfigs(nodes: CanvasNode[]) {
  const jsonFieldsByType: Partial<Record<WorkflowNodeType, string[]>> = {
    transform: ['template'],
    httpRequest: ['headers', 'body']
  };

  for (const node of nodes) {
    const fields = jsonFieldsByType[node.data.nodeType] ?? [];

    for (const field of fields) {
      const value = node.data.config[field];

      if (typeof value !== 'string' || value.trim() === '') {
        continue;
      }

      JSON.parse(value);
    }
  }
}

function sanitizeNodesForSave(nodes: CanvasNode[], connectors: ConnectorDefinition[]) {
  const connectorByType = new Map(connectors.map((connector) => [connector.type, connector]));

  return nodes.map((node) => {
    const connector = connectorByType.get(node.data.nodeType);
    const runtimeFieldKeys = new Set((connector ? getRuntimeFields(connector) : []).map((field) => field.key));

    return {
      ...node,
      data: {
        ...node.data,
        config: Object.fromEntries(Object.entries(node.data.config).filter(([key]) => !runtimeFieldKeys.has(key)))
      }
    };
  });
}

function buildRuntimeCredentials(nodes: CanvasNode[], connectors: ConnectorDefinition[], values: RuntimeCredentials) {
  const connectorByType = new Map(connectors.map((connector) => [connector.type, connector]));

  return Object.fromEntries(
    nodes
      .map((node) => {
        const connector = connectorByType.get(node.data.nodeType);
        const runtimeFields = connector ? getRuntimeFields(connector) : [];

        if (runtimeFields.length === 0) {
          return null;
        }

        const nodeValues = values[node.id] ?? {};
        return [node.id, Object.fromEntries(runtimeFields.map((field) => [field.key, nodeValues[field.key] ?? '']))];
      })
      .filter(Boolean) as Array<[string, Record<string, string>]>
  );
}

function validateRuntimeCredentials(nodes: CanvasNode[], connectors: ConnectorDefinition[], values: RuntimeCredentials) {
  const connectorByType = new Map(connectors.map((connector) => [connector.type, connector]));

  for (const node of nodes) {
    const connector = connectorByType.get(node.data.nodeType);
    const runtimeFields = connector ? getRuntimeFields(connector) : [];
    const nodeValues = values[node.id] ?? {};

    for (const field of runtimeFields) {
      if (!String(nodeValues[field.key] ?? '').trim()) {
        throw new Error(`${node.data.label}: falta ${field.label} para ejecutar.`);
      }
    }
  }
}

interface WorkflowStudioProps {
  accessToken: string;
  csrfToken: string;
}

function WorkflowStudioShell({ accessToken, csrfToken }: WorkflowStudioProps) {
  const requestContext: RequestContext = { accessToken, csrfToken };
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowDefinition | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runPayload, setRunPayload] = useState(`{
  "name": "Lucia",
  "email": "lucia@demo.dev"
}`);
  const [execution, setExecution] = useState<WorkflowExecutionResult | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [runtimeCredentials, setRuntimeCredentials] = useState<RuntimeCredentials>({});
  const [status, setStatus] = useState('Cargando proyecto...');
  const [isBusy, setIsBusy] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [connectorData, workflowData, historyData] = await Promise.all([
          fetchConnectors(),
          fetchWorkflows(requestContext),
          fetchChatHistory(requestContext)
        ]);
        const nextWorkflow = workflowData[0] ?? createEmptyWorkflow(connectorData);
        const flow = flowFromWorkflow(nextWorkflow, connectorData);

        setConnectors(connectorData);
        setWorkflows(workflowData.length > 0 ? workflowData : [nextWorkflow]);
        setChatHistory(historyData);
        setActiveWorkflow(nextWorkflow);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setSelectedNodeId(flow.nodes[0]?.id ?? null);
        setStatus('Listo para diseñar y ejecutar workflows.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'No se pudo cargar la app.');
      } finally {
        setIsBusy(false);
      }
    }

    void bootstrap();
  }, [accessToken, csrfToken, setEdges, setNodes]);

  const connectorByType = useMemo(() => new Map(connectors.map((connector) => [connector.type, connector])), [connectors]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedConnector = selectedNode ? connectors.find((connector) => connector.type === selectedNode.data.nodeType) ?? null : null;
  const filteredChatHistory = activeWorkflow ? chatHistory.filter((entry) => entry.workflowId === activeWorkflow.id) : chatHistory;

  async function refreshChatHistory() {
    const history = await fetchChatHistory(requestContext);
    setChatHistory(history);
  }

  function syncWorkflow(nextWorkflow: WorkflowDefinition) {
    setActiveWorkflow(nextWorkflow);
    setWorkflows((current) => {
      const existingIndex = current.findIndex((workflow) => workflow.id === nextWorkflow.id && workflow.id !== '');

      if (existingIndex >= 0) {
        const copy = [...current];
        copy[existingIndex] = nextWorkflow;
        return copy;
      }

      if (!nextWorkflow.id) {
        return [nextWorkflow, ...current.filter((workflow) => workflow.id !== '')];
      }

      return [nextWorkflow, ...current.filter((workflow) => workflow.id !== nextWorkflow.id)];
    });
  }

  function loadWorkflow(workflow: WorkflowDefinition) {
    const flow = flowFromWorkflow(workflow, connectors);
    setActiveWorkflow(workflow);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setRuntimeCredentials({});
    setSelectedNodeId(flow.nodes[0]?.id ?? null);
    setExecution(null);
  }

  function addConnectorNode(connector: ConnectorDefinition) {
    const nextNode = createNodeFromConnector(connector, nodes.length + 1);
    setNodes((current) => [...current, nextNode]);
    setSelectedNodeId(nextNode.id);
    setStatus(`${connector.label} agregado al canvas.`);
  }

  function updateSelectedNodeField(key: string, value: string) {
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } }
          : node
      )
    );
  }

  function updateWorkflowMeta(key: 'name' | 'description', value: string) {
    if (!activeWorkflow) return;
    syncWorkflow({ ...activeWorkflow, [key]: value });
  }

  async function handleSave() {
    if (!activeWorkflow) return;

    try {
      setIsBusy(true);
      validateNodeConfigs(nodes);
      const draft = workflowFromFlow(activeWorkflow, sanitizeNodesForSave(nodes, connectors), edges);
      const saved = await saveWorkflow(draft, requestContext);
      syncWorkflow(saved);
      setStatus('Workflow guardado en el backend.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo guardar el workflow.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRun() {
    if (!activeWorkflow) return;

    try {
      setIsBusy(true);
      validateNodeConfigs(nodes);
      validateRuntimeCredentials(nodes, connectors, runtimeCredentials);
      const draft = workflowFromFlow(activeWorkflow, sanitizeNodesForSave(nodes, connectors), edges);
      const persisted = draft.id ? draft : await saveWorkflow(draft, requestContext);
      syncWorkflow(persisted);
      const result = await executeWorkflow(
        persisted.id,
        parsePayload(runPayload),
        buildRuntimeCredentials(nodes, connectors, runtimeCredentials),
        requestContext
      );
      setExecution(result);
      await refreshChatHistory();
      setStatus(result.status === 'success' ? 'Workflow ejecutado correctamente.' : 'La ejecucion fallo.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo ejecutar el workflow.');
    } finally {
      setIsBusy(false);
    }
  }

  function handleCreateWorkflow() {
    const workflow = createEmptyWorkflow(connectors);
    const flow = flowFromWorkflow(workflow, connectors);
    setActiveWorkflow(workflow);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setRuntimeCredentials({});
    setSelectedNodeId(flow.nodes[0]?.id ?? null);
    setExecution(null);
    setStatus('Nuevo workflow listo para editar.');
  }

  async function handleDeleteWorkflow() {
    if (!activeWorkflow?.id) {
      handleCreateWorkflow();
      return;
    }

    try {
      setIsBusy(true);
      await deleteWorkflow(activeWorkflow.id, requestContext);
      const remaining = workflows.filter((workflow) => workflow.id !== activeWorkflow.id);

      if (remaining.length > 0) {
        loadWorkflow(remaining[0]);
        setWorkflows(remaining);
      } else {
        handleCreateWorkflow();
        setWorkflows([]);
      }

      setStatus('Workflow eliminado.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo eliminar el workflow.');
    } finally {
      setIsBusy(false);
    }
  }

  function handleConnect(connection: Connection) {
    setEdges((current) =>
      addEdge({ ...connection, id: `${connection.source}-${connection.target}`, animated: true, style: { stroke: '#0b3b66', strokeWidth: 2 } }, current)
    );
  }

  function handleSelectionChange(selection: OnSelectionChangeParams) {
    setSelectedNodeId(selection.nodes[0]?.id ?? null);
  }

  function handleDuplicateSelectedNode() {
    if (!selectedNode) return;
    const connector = connectorByType.get(selectedNode.data.nodeType) ?? null;
    const duplicate = {
      ...selectedNode,
      id: `${slugify(selectedNode.data.label)}-${Math.random().toString(36).slice(2, 7)}`,
      position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
      data: { ...selectedNode.data, accent: connector?.accent ?? selectedNode.data.accent, config: structuredClone(selectedNode.data.config) }
    };
    setNodes((current) => [...current, duplicate]);
    setSelectedNodeId(duplicate.id);
  }

  function handleDeleteSelectedNode() {
    if (!selectedNodeId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar sidebar--left">
        <div className="panel hero-panel">
          <p className="eyebrow">Automation Builder</p>
          <h1>Mini n8n para portfolio</h1>
          <p className="muted">Diseña workflows visuales, conéctalos a APIs y ejecútalos desde una sola interfaz.</p>
          <div className="hero-actions">
            <button onClick={handleSave} disabled={isBusy || !activeWorkflow}>Guardar</button>
            <button className="ghost" onClick={handleCreateWorkflow} disabled={isBusy || connectors.length === 0}>Nuevo</button>
            <button className="ghost danger" onClick={handleDeleteWorkflow} disabled={isBusy || !activeWorkflow}>Eliminar</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><h2>Workflows</h2><span>{workflows.length}</span></div>
          <div className="workflow-list">
            {workflows.map((workflow) => (
              <button key={`${workflow.id || 'draft'}-${workflow.updatedAt}`} className={workflow.id === activeWorkflow?.id && workflow.name === activeWorkflow?.name ? 'workflow-card active' : 'workflow-card'} onClick={() => loadWorkflow(workflow)}>
                <strong>{workflow.name}</strong>
                <span>{workflow.description || 'Sin descripcion'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><h2>Nodos</h2><span>{connectors.length}</span></div>
          <div className="connector-grid">
            {connectors.map((connector) => (
              <button key={connector.type} className="connector-card" onClick={() => addConnectorNode(connector)} style={{ borderColor: connector.accent }}>
                <strong>{connector.label}</strong>
                <span>{connector.description}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="canvas-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workflow activo</p>
            <input value={activeWorkflow?.name ?? ''} onChange={(event) => updateWorkflowMeta('name', event.target.value)} placeholder="Nombre del workflow" />
            <textarea value={activeWorkflow?.description ?? ''} onChange={(event) => updateWorkflowMeta('description', event.target.value)} placeholder="Describe que automatiza este flujo" />
          </div>
          <div className="status-chip">{status}</div>
        </header>

        <section className="canvas-panel">
          <ReactFlow<CanvasNode, Edge> fitView nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={handleConnect} onSelectionChange={handleSelectionChange} nodeTypes={nodeTypes} defaultEdgeOptions={{ animated: true }}>
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#94a3b8" />
            <MiniMap zoomable pannable nodeStrokeWidth={3} />
            <Controls />
          </ReactFlow>
        </section>
      </main>

      <aside className="sidebar sidebar--right">
        <div className="panel">
          <div className="panel-header"><h2>Inspector</h2><span>{selectedNode ? selectedNode.data.label : 'Sin seleccion'}</span></div>
          {selectedNode && selectedConnector ? (
            <>
              <div className="inspector-actions">
                <button className="ghost" onClick={handleDuplicateSelectedNode}>Duplicar</button>
                <button className="ghost danger" onClick={handleDeleteSelectedNode}>Eliminar</button>
              </div>
              <label className="field">
                <span>Nombre visible</span>
                <input value={selectedNode.data.label} onChange={(event) => {
                  const value = event.target.value;
                  setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, data: { ...node.data, label: value } } : node));
                }} />
              </label>
              {getPersistedFields(selectedConnector).map((field) => {
                const value = String(selectedNode.data.config[field.key] ?? '');
                return (
                  <label key={field.key} className="field">
                    <span>{field.label}</span>
                    {field.type === 'textarea' ? (
                      <textarea rows={field.key === 'template' || field.key === 'body' || field.key === 'headers' || field.key === 'html' ? 6 : 4} value={value} placeholder={field.placeholder} onChange={(event) => updateSelectedNodeField(field.key, event.target.value)} />
                    ) : field.type === 'select' ? (
                      <select value={value} onChange={(event) => updateSelectedNodeField(field.key, event.target.value)}>
                        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : (
                      <input type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'} value={value} placeholder={field.placeholder} onChange={(event) => updateSelectedNodeField(field.key, event.target.value)} />
                    )}
                  </label>
                );
              })}
            </>
          ) : <p className="muted">Selecciona un nodo para editar su configuracion.</p>}
        </div>

        <div className="panel">
          <div className="panel-header"><h2>Run</h2><span>{execution?.status ?? 'idle'}</span></div>
          <label className="field">
            <span>Payload JSON</span>
            <textarea rows={8} value={runPayload} onChange={(event) => setRunPayload(event.target.value)} />
          </label>
          {nodes.map((node) => {
            const connector = connectorByType.get(node.data.nodeType);
            const runtimeFields = connector ? getRuntimeFields(connector) : [];
            if (runtimeFields.length === 0) return null;
            return (
              <div key={node.id} className="runtime-credentials">
                <div className="panel-header"><h2>{node.data.label}</h2><span>Credenciales</span></div>
                {runtimeFields.map((field) => (
                  <label key={`${node.id}-${field.key}`} className="field">
                    <span>{field.label}</span>
                    <input type={field.type === 'password' ? 'password' : 'text'} value={runtimeCredentials[node.id]?.[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => {
                      const nextValue = event.target.value;
                      setRuntimeCredentials((current) => ({ ...current, [node.id]: { ...(current[node.id] ?? {}), [field.key]: nextValue } }));
                    }} />
                  </label>
                ))}
              </div>
            );
          })}
          <button onClick={handleRun} disabled={isBusy || !activeWorkflow || nodes.length === 0}>Ejecutar workflow</button>
          <div className="execution-card"><strong>Resultado</strong><pre>{execution ? JSON.stringify(execution, null, 2) : 'Sin ejecuciones aun.'}</pre></div>
        </div>

        <div className="panel">
          <div className="panel-header"><h2>Chats</h2><span>{filteredChatHistory.length}</span></div>
          <div className="chat-history">
            {filteredChatHistory.length > 0 ? filteredChatHistory.map((entry) => (
              <article key={entry.id} className="chat-entry">
                <div className="chat-entry__meta"><strong>{entry.nodeLabel}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span></div>
                <div className="chat-entry__badges"><span className="status-chip">{entry.channel}</span><span className="status-chip">{entry.direction}</span><span className="status-chip">{entry.status}</span></div>
                <p>{entry.summary}</p>
                {entry.recipient ? <p className="muted">Destino: {entry.recipient}</p> : null}
                <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
              </article>
            )) : <p className="muted">Todavia no hay mensajes guardados para este workflow.</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function WorkflowStudio(props: WorkflowStudioProps) {
  return (
    <ReactFlowProvider>
      <WorkflowStudioShell {...props} />
    </ReactFlowProvider>
  );
}