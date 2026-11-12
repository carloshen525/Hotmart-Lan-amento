export type NodeType = 'trigger' | 'action' | 'condition' | 'delay';

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
