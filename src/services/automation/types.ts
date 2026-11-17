export type NodeType =
  | 'trigger'
  | 'action'
  | 'condition'
  | 'delay'
  | 'timer'
  | 'sequence_lead'
  | 'tag'
  | 'aquecimento'
  | 'warmup'
  | 'whatsapp'
  | 'email'
  | 'start'
  | 'editar_grupo'
  | 'group_action';

export interface WorkflowNodeData {
  label: string;
  type: NodeType;
  subtype: string;
  config?: Record<string, any>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // 'yes' | 'no' | null
}

export interface ExecutionContext {
  tenantId: string;
  automationId: string;
  enrollmentId: string;
  contactId: string;
  variables?: Record<string, any>;
}
