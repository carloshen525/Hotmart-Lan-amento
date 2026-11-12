'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  BackgroundVariant,
} from '@xyflow/react';

import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  Plus,
  Sparkles,
  Zap,
  Mail,
  MessageSquare,
  Clock,
  GitFork,
  Tag,
  XCircle,
  X,
  CheckCircle2,
} from 'lucide-react';

import {
  TriggerNode,
  ActionNode,
  ConditionNode,
  DelayNode,
} from '@/components/automation/CustomNodes';

export default function AutomationCanvasPage() {
  const params = useParams();
  const router = useRouter();
  const automationId = params.id as string;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Seleção e edição de nó
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Modal de Simulação
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simClientStatus, setSimClientStatus] = useState(false);
  const [simPixStatus, setSimPixStatus] = useState(false);
  const [simulationSteps, setSimulationSteps] = useState<any[]>([]);
  const [simulating, setSimulating] = useState(false);

  // Mapeamento de nós customizados do React Flow
  const nodeTypes = useMemo(
    () => ({
      trigger: TriggerNode,
      action: ActionNode,
      condition: ConditionNode,
      delay: DelayNode,
    }),
    []
  );

  useEffect(() => {
    fetch(`/api/automations/${automationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.automation) {
          setName(data.automation.name);
          setStatus(data.automation.status);
          setNodes(data.automation.nodes || []);
          setEdges(data.automation.edges || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [automationId]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  const handleSave = async (publishStatus?: string) => {
    setSaving(true);
    setSaveNotice(null);
    try {
      const newStatus = publishStatus || status;
      const res = await fetch(`/api/automations/${automationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          status: newStatus,
          nodes,
          edges,
        }),
      });

      if (res.ok) {
        setStatus(newStatus);
        setSaveNotice(publishStatus === 'ACTIVE' ? 'Automação Ativada com Sucesso!' : 'Rascunho Salvo!');
        setTimeout(() => setSaveNotice(null), 3000);
      }
    } catch {
      setSaveNotice('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const addBlock = (type: string, subtype: string, label: string, config: any = {}) => {
    const id = `node_${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 300 + Math.random() * 80, y: 150 + nodes.length * 60 },
      data: {
        label,
        type,
        subtype,
        config,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
  };

  const updateSelectedNodeConfig = (key: string, value: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = {
            ...n,
            data: {
              ...n.data,
              config: {
                ...(n.data.config as object),
                [key]: value,
              },
            },
          };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );
  };

  const updateSelectedNodeLabel = (label: string) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = {
            ...n,
            data: { ...n.data, label },
          };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  // Simulação de fluxo
  const runSimulation = async () => {
    setSimulating(true);
    setSimulationSteps([]);
    try {
      const res = await fetch(`/api/automations/${automationId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactTags: ['Inscrito', ...(simClientStatus ? ['Cliente'] : []), ...(simPixStatus ? ['Pix Gerado'] : [])],
          isClient: simClientStatus,
          hasGeneratedPix: simPixStatus,
        }),
      });
      const data = await res.json();
      setSimulationSteps(data.steps || []);
    } catch {}
    setSimulating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-8 bg-slate-100 overflow-hidden">
      {/* Topo do Construtor */}
      <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/automations')}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-bold text-slate-800 text-sm border-b border-transparent hover:border-slate-300 focus:border-indigo-600 focus:outline-none px-1"
          />
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              status === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {status === 'ACTIVE' ? 'Publicado / Ativo' : 'Rascunho'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {saveNotice && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 animate-fade-in">
              {saveNotice}
            </span>
          )}

          <button
            onClick={() => {
              setIsSimulateOpen(true);
              runSimulation();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-semibold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simular Fluxo</span>
          </button>

          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Rascunho</span>
          </button>

          <button
            onClick={() => handleSave(status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-semibold shadow-sm transition-all ${
              status === 'ACTIVE'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
            }`}
          >
            {status === 'ACTIVE' ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Publicar Automação</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Área Central: Barra de Ferramentas + Canvas React Flow + Painel Lateral de Configuração */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Barra Flutuante de Adição de Blocos */}
        <div className="absolute top-4 left-4 z-20 bg-white rounded-xl shadow-xl border border-slate-200 p-2 flex flex-col gap-1 w-48 text-xs">
          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Adicionar Blocos
          </div>

          <button
            onClick={() =>
              addBlock('action', 'SEND_EMAIL', 'Enviar E-mail', {
                subject: 'Link da Aula ao Vivo',
                content: '<p>Olá {{nome}}, nossa transmissão vai começar!</p>',
              })
            }
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium text-left"
          >
            <Mail className="w-3.5 h-3.5 text-blue-600" />
            <span>Enviar E-mail</span>
          </button>

          <button
            onClick={() =>
              addBlock('action', 'SEND_WHATSAPP', 'Enviar WhatsApp', {
                text: 'Olá {{nome}}! Seu link exclusivo para entrar na sala é: https://zoom.us/demo',
              })
            }
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium text-left"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>Enviar WhatsApp</span>
          </button>

          <button
            onClick={() =>
              addBlock('condition', 'HAS_TAG', 'Condição: Comprou?', {
                tagName: 'Cliente',
              })
            }
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium text-left"
          >
            <GitFork className="w-3.5 h-3.5 text-amber-500" />
            <span>Condição SE / SENÃO</span>
          </button>

          <button
            onClick={() =>
              addBlock('delay', 'WAIT_DAYS', 'Aguardar 1 Dia', {
                days: 1,
                cancelCondition: 'PURCHASE_APPROVED',
              })
            }
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium text-left"
          >
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Temporizador / Espera</span>
          </button>

          <button
            onClick={() =>
              addBlock('action', 'ADD_TAG', 'Adicionar Tag', {
                tagName: 'Super Engajado',
              })
            }
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium text-left"
          >
            <Tag className="w-3.5 h-3.5 text-purple-600" />
            <span>Adicionar Tag</span>
          </button>

          <button
            onClick={() =>
              addBlock('action', 'CANCEL_OTHER_FLOWS', 'Cancelar Cobranças', {})
            }
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 font-medium text-left"
          >
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>Interromper Cobranças</span>
          </button>
        </div>

        {/* Canvas React Flow */}
        <div className="flex-1 h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
            <Controls className="!bg-white !border-slate-200 !shadow-lg" />
          </ReactFlow>
        </div>

        {/* Painel Lateral de Edição do Bloco Selecionado */}
        {selectedNode && (
          <div className="w-80 bg-white border-l border-slate-200 shadow-xl p-5 overflow-y-auto z-20 shrink-0 text-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <span className="font-bold text-slate-900 text-sm">Configurar Bloco</span>
                <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Título do Bloco</label>
                  <input
                    type="text"
                    value={selectedNode.data.label as string}
                    onChange={(e) => updateSelectedNodeLabel(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Configurações específicas conforme o subtipo */}
                {selectedNode.data.subtype === 'SEND_EMAIL' && (
                  <>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Assunto do E-mail</label>
                      <input
                        type="text"
                        value={(selectedNode.data.config as any)?.subject || ''}
                        onChange={(e) => updateSelectedNodeConfig('subject', e.target.value)}
                        placeholder="Ex: Sua vaga está confirmada!"
                        className="w-full p-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Conteúdo (HTML ou Texto)</label>
                      <textarea
                        rows={5}
                        value={(selectedNode.data.config as any)?.content || ''}
                        onChange={(e) => updateSelectedNodeConfig('content', e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg font-mono text-[11px]"
                      />
                      <span className="text-[10px] text-slate-400">Variáveis suportadas: {'{{nome}}'}, {'{{email}}'}</span>
                    </div>
                  </>
                )}

                {selectedNode.data.subtype === 'SEND_WHATSAPP' && (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Mensagem de Texto</label>
                    <textarea
                      rows={5}
                      value={(selectedNode.data.config as any)?.text || ''}
                      onChange={(e) => updateSelectedNodeConfig('text', e.target.value)}
                      placeholder="Olá {{nome}}, seu link de acesso é..."
                      className="w-full p-2 border border-slate-200 rounded-lg"
                    />
                    <span className="text-[10px] text-slate-400">Variável: {'{{nome}}'}</span>
                  </div>
                )}

                {selectedNode.data.subtype === 'HAS_TAG' && (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nome da Tag a Verificar</label>
                    <input
                      type="text"
                      value={(selectedNode.data.config as any)?.tagName || ''}
                      onChange={(e) => updateSelectedNodeConfig('tagName', e.target.value)}
                      placeholder="Ex: Cliente"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Se o contato possuir esta tag, o fluxo seguirá pela saída verde (SIM). Caso contrário, pela vermelha (NÃO).
                    </p>
                  </div>
                )}

                {(selectedNode.data.subtype === 'ADD_TAG' || selectedNode.data.subtype === 'REMOVE_TAG') && (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nome da Tag</label>
                    <input
                      type="text"
                      value={(selectedNode.data.config as any)?.tagName || ''}
                      onChange={(e) => updateSelectedNodeConfig('tagName', e.target.value)}
                      placeholder="Ex: VIP Lançamento"
                      className="w-full p-2 border border-slate-200 rounded-lg"
                    />
                  </div>
                )}

                {selectedNode.data.type === 'delay' && (
                  <>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Dias de Espera</label>
                      <input
                        type="number"
                        min={0}
                        value={(selectedNode.data.config as any)?.days || 1}
                        onChange={(e) => updateSelectedNodeConfig('days', Number(e.target.value))}
                        className="w-full p-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Condição de Cancelamento</label>
                      <select
                        value={(selectedNode.data.config as any)?.cancelCondition || 'PURCHASE_APPROVED'}
                        onChange={(e) => updateSelectedNodeConfig('cancelCondition', e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="PURCHASE_APPROVED">Se Compra Aprovada (Hotmart)</option>
                        <option value="NONE">Não Cancelar</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={deleteSelectedNode}
              className="mt-6 w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg transition-colors"
            >
              Excluir Bloco
            </button>
          </div>
        )}
      </div>

      {/* Modal Interativo de Simulação de Fluxo */}
      {isSimulateOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 max-h-[85vh] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-indigo-600 font-bold text-base">
                  <Sparkles className="w-5 h-5" />
                  <span>Simulador de Automação</span>
                </div>
                <button onClick={() => setIsSimulateOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Cenário do Lead de Teste */}
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <span className="font-semibold text-slate-700 block mb-2">Configure o Cenário do Lead:</span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simClientStatus}
                      onChange={(e) => setSimClientStatus(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Lead já comprou (Possui tag Cliente)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simPixStatus}
                      onChange={(e) => setSimPixStatus(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Gerou Pix (Tag Pix Gerado)</span>
                  </label>
                </div>
              </div>

              {/* Rastro Passo a Passo */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Caminho Percorrido ({simulationSteps.length} passos)
                  </span>
                  <button
                    onClick={runSimulation}
                    disabled={simulating}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    {simulating ? 'Executando...' : 'Re-executar Teste'}
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {simulationSteps.map((st, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-start gap-3"
                    >
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-[10px] mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-800">{st.label}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">{st.details}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end mt-4">
              <button
                onClick={() => setIsSimulateOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg"
              >
                Concluir Simulação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
