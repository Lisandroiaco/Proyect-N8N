import { Handle, Position, type NodeProps } from '@xyflow/react';

import type { CanvasNode } from '../types';

export function AutomationNode({ data, selected }: NodeProps<CanvasNode>) {
  const nodeData = data;

  return (
    <div
      className="automation-node"
      data-selected={selected}
      style={{
        borderColor: nodeData.accent ?? '#0b3b66',
        boxShadow: `0 18px 36px color-mix(in srgb, ${nodeData.accent ?? '#0b3b66'} 22%, transparent)`
      }}
    >
      <Handle className="automation-node__handle" type="target" position={Position.Left} />
      <div className="automation-node__accent" style={{ background: nodeData.accent ?? '#0b3b66' }} />
      <div className="automation-node__label">{nodeData.label}</div>
      <div className="automation-node__description">{nodeData.description}</div>
      <Handle className="automation-node__handle" type="source" position={Position.Right} />
    </div>
  );
}
