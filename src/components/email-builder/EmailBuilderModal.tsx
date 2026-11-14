'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Monitor,
  RotateCcw,
  RotateCw,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Send,
  Eye,
  Sliders,
  Type,
  Image as ImageIcon,
  Video as VideoIcon,
  Square,
  Minus,
  Columns as ColumnsIcon,
  Share2,
  Bookmark,
  Check,
  Upload,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  EmailDocument,
  EmailBlock,
  BlockType,
  EmailDesignConfig,
} from '@/services/email-builder/types';
import {
  generateResponsiveEmailHtml,
  renderBlockToHtml,
} from '@/services/email-builder/generator';
import { PREBUILT_TEMPLATES, PrebuiltTemplate } from '@/services/email-builder/templates';

interface EmailBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSubject?: string;
  initialContentJson?: string;
  onSave: (data: {
    subject: string;
    contentJson: string;
    generatedHtml: string;
    plainTextSummary: string;
  }) => void;
}

export function EmailBuilderModal({
  isOpen,
  onClose,
  initialSubject = '',
  initialContentJson,
  onSave,
}: EmailBuilderModalProps) {
  // Documento padrão inicial caso não haja dados anteriores
  const defaultDoc: EmailDocument = {
    version: 1,
    subject: initialSubject || 'Confira seu acesso exclusivo',
    settings: {
      bodyBg: '#f1f5f9',
      contentBg: '#ffffff',
      contentWidth: 600,
      fontFamily: 'Inter, Arial, sans-serif',
      textColor: '#1e293b',
      borderRadius: 12,
    },
    blocks: [
      {
        id: 'blk_header_init',
        type: 'header',
        title: 'Bem-vindo ao Lançamento!',
        subtitle: 'Sua jornada definitiva começa agora',
        align: 'center',
        bg: '#4f46e5',
        textColor: '#ffffff',
      },
      {
        id: 'blk_text_init',
        type: 'text',
        content: 'Olá <strong>{{primeiro_nome}}</strong>,\n\nEstamos muito felizes em ter você conosco! Seu cadastro foi realizado com sucesso e seu acesso já está disponível.',
        fontSize: 16,
        color: '#334155',
        align: 'left',
        lineHeight: 1.6,
      },
      {
        id: 'blk_btn_init',
        type: 'button',
        text: 'Acessar Conteúdo Agora',
        url: 'https://seusite.com',
        bg: '#10b981',
        color: '#ffffff',
        fontSize: 16,
        borderRadius: 8,
        paddingY: 14,
        paddingX: 28,
        fullWidth: true,
        align: 'center',
      },
      {
        id: 'blk_footer_init',
        type: 'footer',
        companyName: 'Equipe do Lançamento',
        text: 'Você recebeu este e-mail porque se cadastrou em nossa lista VIP.',
      },
    ],
  };

  const [doc, setDoc] = useState<EmailDocument>(defaultDoc);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>('blk_header_init');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activeTab, setActiveTab] = useState<'blocks' | 'settings'>('blocks');

  // Histórico de Desfazer/Refazer
  const [history, setHistory] = useState<EmailDocument[]>([defaultDoc]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Modais auxiliares
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Inicializa a partir de initialContentJson
  useEffect(() => {
    if (initialContentJson) {
      try {
        const parsed = JSON.parse(initialContentJson);
        if (parsed.blocks && parsed.settings) {
          const loadedDoc: EmailDocument = {
            ...parsed,
            subject: initialSubject || parsed.subject || defaultDoc.subject,
          };
          setDoc(loadedDoc);
          setHistory([loadedDoc]);
          setHistoryIndex(0);
          if (loadedDoc.blocks.length > 0) {
            setSelectedBlockId(loadedDoc.blocks[0].id);
          }
        }
      } catch (e) {
        console.error('Falha ao parsear contentJson:', e);
      }
    }
  }, [initialContentJson, initialSubject]);

  // Atualiza documento com snapshot no histórico
  const updateDoc = (newDoc: EmailDocument, addToHistory = true) => {
    setDoc(newDoc);
    if (addToHistory) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newDoc);
      // Limita histórico a 30 passos
      if (newHistory.length > 30) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setDoc(history[newIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setDoc(history[newIdx]);
    }
  };

  // Bloco selecionado
  const selectedBlock = doc.blocks.find((b) => b.id === selectedBlockId) || null;

  // Atualiza propriedade do bloco selecionado
  const updateSelectedBlock = (updates: Partial<EmailBlock>) => {
    if (!selectedBlockId) return;
    const newBlocks = doc.blocks.map((b) => {
      if (b.id === selectedBlockId) {
        return { ...b, ...updates } as EmailBlock;
      }
      return b;
    });
    updateDoc({ ...doc, blocks: newBlocks });
  };

  // Adicionar novo bloco
  const handleAddBlock = (type: BlockType) => {
    const id = `blk_${type}_${Date.now()}`;
    let newBlock: EmailBlock;

    switch (type) {
      case 'header':
        newBlock = {
          id,
          type: 'header',
          title: 'Título do Cabeçalho',
          subtitle: 'Subtítulo explicativo',
          align: 'center',
          bg: '#4f46e5',
          textColor: '#ffffff',
        };
        break;
      case 'text':
        newBlock = {
          id,
          type: 'text',
          content: 'Digite seu texto aqui. Você pode usar variáveis dinâmicas como <strong>{{primeiro_nome}}</strong> para personalizar.',
          fontSize: 16,
          color: '#334155',
          align: 'left',
          lineHeight: 1.6,
        };
        break;
      case 'image':
        newBlock = {
          id,
          type: 'image',
          url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop',
          alt: 'Imagem ilustrativa',
          width: 100,
          align: 'center',
          borderRadius: 8,
        };
        break;
      case 'video':
        newBlock = {
          id,
          type: 'video',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Assista a esta mensagem especial',
          align: 'center',
        };
        break;
      case 'button':
        newBlock = {
          id,
          type: 'button',
          text: 'Comprar Agora',
          url: 'https://seusite.com/checkout',
          bg: '#0066FF',
          color: '#ffffff',
          fontSize: 18,
          borderRadius: 12,
          paddingY: 16,
          paddingX: 32,
          fullWidth: false,
          align: 'center',
        };
        break;
      case 'spacer':
        newBlock = { id, type: 'spacer', height: 24 };
        break;
      case 'divider':
        newBlock = { id, type: 'divider', color: '#e2e8f0', thickness: 1, marginY: 16 };
        break;
      case 'social':
        newBlock = {
          id,
          type: 'social',
          align: 'center',
          links: {
            instagram: 'https://instagram.com',
            youtube: 'https://youtube.com',
            whatsapp: 'https://wa.me/5511999999999',
          },
        };
        break;
      case 'footer':
        newBlock = {
          id,
          type: 'footer',
          companyName: 'Equipe de Lançamento',
          text: 'Você está recebendo este e-mail por estar cadastrado em nossa lista.',
        };
        break;
      case 'columns':
        newBlock = {
          id,
          type: 'columns',
          split: '50-50',
          leftContent: [
            {
              id: `${id}_l1`,
              type: 'text',
              content: '<strong>Coluna da Esquerda</strong>\nConteúdo explicativo ou benefício 1.',
              fontSize: 14,
            },
          ],
          rightContent: [
            {
              id: `${id}_r1`,
              type: 'text',
              content: '<strong>Coluna da Direita</strong>\nConteúdo explicativo ou benefício 2.',
              fontSize: 14,
            },
          ],
        };
        break;
      default:
        return;
    }

    const newBlocks = [...doc.blocks, newBlock];
    updateDoc({ ...doc, blocks: newBlocks });
    setSelectedBlockId(id);
  };

  // Reordenar blocos
  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= doc.blocks.length) return;
    const newBlocks = [...doc.blocks];
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;
    updateDoc({ ...doc, blocks: newBlocks });
  };

  // Duplicar bloco
  const duplicateBlock = (block: EmailBlock) => {
    const newId = `blk_${block.type}_${Date.now()}`;
    const copy = { ...JSON.parse(JSON.stringify(block)), id: newId };
    const index = doc.blocks.findIndex((b) => b.id === block.id);
    const newBlocks = [...doc.blocks];
    newBlocks.splice(index + 1, 0, copy);
    updateDoc({ ...doc, blocks: newBlocks });
    setSelectedBlockId(newId);
  };

  // Excluir bloco
  const deleteBlock = (blockId: string) => {
    const newBlocks = doc.blocks.filter((b) => b.id !== blockId);
    updateDoc({ ...doc, blocks: newBlocks });
    if (selectedBlockId === blockId) {
      setSelectedBlockId(newBlocks.length > 0 ? newBlocks[0].id : null);
    }
  };

  // Carregar template pré-configurado
  const handleApplyTemplate = (template: PrebuiltTemplate) => {
    updateDoc({
      ...template.document,
      subject: template.document.subject,
    });
    if (template.document.blocks.length > 0) {
      setSelectedBlockId(template.document.blocks[0].id);
    }
    setIsTemplatesModalOpen(false);
  };

  // Upload de imagem local para o bloco de imagem
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/whatsapp/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        updateSelectedBlock({ url: data.dataUrl || data.url });
      }
    } catch (err) {
      console.error('Erro no upload da imagem:', err);
    } finally {
      setUploadingImage(false);
    }
  };

  // Enviar e-mail de teste real pelo servidor SMTP
  const handleSendTestEmail = async () => {
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      setTestResult({ success: false, message: 'Informe um e-mail válido para envio do teste.' });
      return;
    }

    setTestSending(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/email/builder/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmailRecipient,
          subject: doc.subject,
          document: doc,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || 'E-mail de teste enviado com sucesso!' });
      } else {
        setTestResult({ success: false, message: data.error || 'Falha ao enviar e-mail de teste.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Erro inesperado ao conectar ao servidor.' });
    } finally {
      setTestSending(false);
    }
  };

  // Salvar design atual como um novo template na biblioteca
  const handleSaveAsTemplate = async () => {
    if (!customTemplateName.trim()) return;

    setSavingTemplate(true);
    try {
      const res = await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customTemplateName.trim(),
          subject: doc.subject,
          contentJson: doc,
          category: 'custom',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsSaveTemplateModalOpen(false);
        setCustomTemplateName('');
        alert('Modelo salvo com sucesso na sua biblioteca de templates!');
      } else {
        alert(data.error || 'Falha ao salvar modelo');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar modelo');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Concluir e salvar no fluxo de automação
  const handleFinishSave = () => {
    const generatedHtml = generateResponsiveEmailHtml(doc);
    // Cria resumo em texto limpo para visualizações compactas
    const plainText = doc.blocks
      .map((b) => {
        if (b.type === 'header') return `${b.title} - ${b.subtitle || ''}`;
        if (b.type === 'text') return b.content.replace(/<[^>]*>?/gm, '');
        if (b.type === 'button') return `[Botão: ${b.text}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 300);

    onSave({
      subject: doc.subject,
      contentJson: JSON.stringify(doc),
      generatedHtml,
      plainTextSummary: plainText,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#090b10] text-slate-100 flex flex-col overflow-hidden select-none animate-in fade-in duration-200">
      {/* ============================================================ */}
      {/* 1. TOP BAR DO CONSTRUTOR VISUAL */}
      {/* ============================================================ */}
      <div className="h-16 bg-[#12151c] border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-4 flex-1 max-w-xl">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                Construtor Visual de E-mails
                <span className="text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded-full">
                  JSON Builder
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Design responsivo profissional sem tocar em HTML</p>
            </div>
          </div>

          {/* Campo de Assunto Integrado com Variáveis */}
          <div className="flex-1 ml-4 relative">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={doc.subject}
                onChange={(e) => updateDoc({ ...doc, subject: e.target.value })}
                placeholder="Assunto do E-mail (Ex: {{primeiro_nome}}, seu acesso está liberado!)"
                className="w-full bg-[#181c25] border border-slate-700/80 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <div className="flex items-center gap-1 shrink-0">
                {['{{nome}}', '{{primeiro_nome}}'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateDoc({ ...doc, subject: `${doc.subject} ${v}` })}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono text-[10px] rounded-lg border border-slate-700"
                    title={`Inserir ${v} no assunto`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Controles Centrais: Desktop / Mobile & Desfazer / Refazer */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#181c25] p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setPreviewMode('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                previewMode === 'desktop'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                previewMode === 'mobile'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile</span>
            </button>
          </div>

          <div className="flex items-center bg-[#181c25] p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Desfazer (Ctrl+Z)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Refazer (Ctrl+Y)"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ações da Direita */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsTemplatesModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span>Modelos Prontos</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTestResult(null);
              setIsTestEmailModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold"
          >
            <Send className="w-3.5 h-3.5 text-blue-400" />
            <span>Enviar Teste</span>
          </button>

          <button
            type="button"
            onClick={handleFinishSave}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Salvar no Fluxo</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl"
            title="Fechar construtor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. CORPO DO CONSTRUTOR: SIDEBAR (ESQUERDA) + CANVAS (DIREITA) */}
      {/* ============================================================ */}
      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR DA ESQUERDA: PALETA DE BLOCOS & PROPRIEDADES */}
        <div className="w-80 bg-[#141720] border-r border-slate-800/80 flex flex-col shrink-0">
          {/* Abas da Sidebar */}
          <div className="flex border-b border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('blocks')}
              className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'blocks'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Elementos & Blocos</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'settings'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Estilos Globais</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {activeTab === 'blocks' ? (
              <>
                {/* 1. Grade de Elementos Disponíveis para Adicionar */}
                <div>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                    Adicionar Novo Elemento
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { type: 'text', label: 'Texto', icon: Type },
                      { type: 'button', label: 'Botão', icon: Square },
                      { type: 'image', label: 'Imagem', icon: ImageIcon },
                      { type: 'video', label: 'Vídeo', icon: VideoIcon },
                      { type: 'header', label: 'Cabeçalho', icon: Sparkles },
                      { type: 'columns', label: '2 Colunas', icon: ColumnsIcon },
                      { type: 'divider', label: 'Divisor', icon: Minus },
                      { type: 'spacer', label: 'Espaçador', icon: Sliders },
                      { type: 'social', label: 'Redes Sociais', icon: Share2 },
                      { type: 'footer', label: 'Rodapé', icon: Bookmark },
                    ].map((item) => {
                      const IconComp = item.icon;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => handleAddBlock(item.type as BlockType)}
                          className="flex items-center gap-2 p-2.5 bg-[#1a1e29] hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition-all group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            <IconComp className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-white">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Painel de Propriedades do Bloco Selecionado */}
                {selectedBlock ? (
                  <div className="pt-4 border-t border-slate-800/80 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Propriedades: {selectedBlock.type.toUpperCase()}</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => deleteBlock(selectedBlock.id)}
                        className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-950/40"
                        title="Excluir este bloco"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* PROPRIEDADES: TEXTO */}
                    {selectedBlock.type === 'text' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Conteúdo do Texto (HTML permitido)
                          </label>
                          <textarea
                            rows={5}
                            value={selectedBlock.content}
                            onChange={(e) => updateSelectedBlock({ content: e.target.value })}
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                          />
                          {/* Variáveis dinâmicas para texto */}
                          <div className="flex items-center gap-1 flex-wrap mt-1.5">
                            {['{{nome}}', '{{primeiro_nome}}', '{{email}}'].map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() =>
                                  updateSelectedBlock({
                                    content: `${selectedBlock.content} ${v}`,
                                  })
                                }
                                className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[9px] border border-slate-700"
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Tamanho da Fonte</label>
                            <input
                              type="number"
                              min={10}
                              max={48}
                              value={selectedBlock.fontSize || 16}
                              onChange={(e) => updateSelectedBlock({ fontSize: Number(e.target.value) })}
                              className="w-full p-1.5 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Cor do Texto</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={selectedBlock.color || '#334155'}
                                onChange={(e) => updateSelectedBlock({ color: e.target.value })}
                                className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                              />
                              <input
                                type="text"
                                value={selectedBlock.color || '#334155'}
                                onChange={(e) => updateSelectedBlock({ color: e.target.value })}
                                className="flex-1 p-1 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Alinhamento</label>
                          <div className="grid grid-cols-4 gap-1 p-1 bg-[#101217] rounded-lg border border-slate-800 text-center">
                            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => updateSelectedBlock({ align: a })}
                                className={`py-1 text-[11px] rounded font-semibold capitalize ${
                                  (selectedBlock.align || 'left') === a
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PROPRIEDADES: BOTÃO */}
                    {selectedBlock.type === 'button' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Texto do Botão</label>
                          <input
                            type="text"
                            value={selectedBlock.text}
                            onChange={(e) => updateSelectedBlock({ text: e.target.value })}
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Link de Destino (URL)</label>
                          <input
                            type="text"
                            value={selectedBlock.url}
                            onChange={(e) => updateSelectedBlock({ url: e.target.value })}
                            placeholder="https://seusite.com"
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Cor do Fundo</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={selectedBlock.bg || '#0066FF'}
                                onChange={(e) => updateSelectedBlock({ bg: e.target.value })}
                                className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                              />
                              <input
                                type="text"
                                value={selectedBlock.bg || '#0066FF'}
                                onChange={(e) => updateSelectedBlock({ bg: e.target.value })}
                                className="flex-1 p-1 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white font-mono"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Cor do Texto</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={selectedBlock.color || '#ffffff'}
                                onChange={(e) => updateSelectedBlock({ color: e.target.value })}
                                className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                              />
                              <input
                                type="text"
                                value={selectedBlock.color || '#ffffff'}
                                onChange={(e) => updateSelectedBlock({ color: e.target.value })}
                                className="flex-1 p-1 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white font-mono"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Arredondamento (Raio)</label>
                            <input
                              type="number"
                              min={0}
                              max={32}
                              value={selectedBlock.borderRadius !== undefined ? selectedBlock.borderRadius : 12}
                              onChange={(e) => updateSelectedBlock({ borderRadius: Number(e.target.value) })}
                              className="w-full p-1.5 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Tamanho da Fonte</label>
                            <input
                              type="number"
                              min={12}
                              max={24}
                              value={selectedBlock.fontSize || 18}
                              onChange={(e) => updateSelectedBlock({ fontSize: Number(e.target.value) })}
                              className="w-full p-1.5 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-2 bg-[#101217] border border-slate-800 rounded-lg">
                          <span className="text-xs text-slate-300 font-semibold">Largura Total (100%)</span>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedBlock.fullWidth)}
                            onChange={(e) => updateSelectedBlock({ fullWidth: e.target.checked })}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Alinhamento</label>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-[#101217] rounded-lg border border-slate-800 text-center">
                            {(['left', 'center', 'right'] as const).map((a) => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => updateSelectedBlock({ align: a })}
                                className={`py-1 text-[11px] rounded font-semibold capitalize ${
                                  (selectedBlock.align || 'center') === a
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PROPRIEDADES: CABEÇALHO */}
                    {selectedBlock.type === 'header' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Título Principal</label>
                          <input
                            type="text"
                            value={selectedBlock.title || ''}
                            onChange={(e) => updateSelectedBlock({ title: e.target.value })}
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Subtítulo</label>
                          <input
                            type="text"
                            value={selectedBlock.subtitle || ''}
                            onChange={(e) => updateSelectedBlock({ subtitle: e.target.value })}
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Cor do Fundo</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={selectedBlock.bg || '#4f46e5'}
                              onChange={(e) => updateSelectedBlock({ bg: e.target.value })}
                              className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                            />
                            <input
                              type="text"
                              value={selectedBlock.bg || '#4f46e5'}
                              onChange={(e) => updateSelectedBlock({ bg: e.target.value })}
                              className="flex-1 p-1 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white font-mono"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">URL da Logo (Opcional)</label>
                          <input
                            type="text"
                            value={selectedBlock.logoUrl || ''}
                            onChange={(e) => updateSelectedBlock({ logoUrl: e.target.value })}
                            placeholder="https://seusite.com/logo.png"
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* PROPRIEDADES: IMAGEM */}
                    {selectedBlock.type === 'image' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Arquivo do Computador ou URL
                          </label>
                          <div className="space-y-2">
                            <input
                              type="file"
                              id="builder_img_upload"
                              accept="image/*"
                              onChange={handleImageUpload}
                              className="hidden"
                            />
                            <label
                              htmlFor="builder_img_upload"
                              className="flex items-center justify-center gap-2 w-full p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl cursor-pointer text-xs font-semibold text-slate-200"
                            >
                              <Upload className="w-4 h-4 text-emerald-400" />
                              <span>{uploadingImage ? 'Enviando...' : 'Carregar Imagem do PC'}</span>
                            </label>
                            <input
                              type="text"
                              value={selectedBlock.url}
                              onChange={(e) => updateSelectedBlock({ url: e.target.value })}
                              placeholder="Ou cole a URL da imagem aqui"
                              className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Link ao Clicar (Opcional)</label>
                          <input
                            type="text"
                            value={selectedBlock.linkUrl || ''}
                            onChange={(e) => updateSelectedBlock({ linkUrl: e.target.value })}
                            placeholder="https://..."
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Largura: {selectedBlock.width || 100}%</label>
                          <input
                            type="range"
                            min={20}
                            max={100}
                            value={selectedBlock.width || 100}
                            onChange={(e) => updateSelectedBlock({ width: Number(e.target.value) })}
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* PROPRIEDADES: VÍDEO */}
                    {selectedBlock.type === 'video' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Link do Vídeo (YouTube, Vimeo ou URL)
                          </label>
                          <input
                            type="text"
                            value={selectedBlock.videoUrl}
                            onChange={(e) => updateSelectedBlock({ videoUrl: e.target.value })}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">
                            Gera capa automática com ícone de play para máxima compatibilidade no e-mail.
                          </p>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Título do Vídeo</label>
                          <input
                            type="text"
                            value={selectedBlock.title || ''}
                            onChange={(e) => updateSelectedBlock({ title: e.target.value })}
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Imagem de Capa Personalizada (Opcional)</label>
                          <input
                            type="text"
                            value={selectedBlock.coverUrl || ''}
                            onChange={(e) => updateSelectedBlock({ coverUrl: e.target.value })}
                            placeholder="https://..."
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* PROPRIEDADES: ESPAÇADOR */}
                    {selectedBlock.type === 'spacer' && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Altura: {selectedBlock.height}px</label>
                        <input
                          type="range"
                          min={8}
                          max={80}
                          value={selectedBlock.height}
                          onChange={(e) => updateSelectedBlock({ height: Number(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                    )}

                    {/* PROPRIEDADES: DIVISOR */}
                    {selectedBlock.type === 'divider' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Cor do Divisor</label>
                          <input
                            type="color"
                            value={selectedBlock.color || '#e2e8f0'}
                            onChange={(e) => updateSelectedBlock({ color: e.target.value })}
                            className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Espessura: {selectedBlock.thickness || 1}px</label>
                          <input
                            type="number"
                            min={1}
                            max={6}
                            value={selectedBlock.thickness || 1}
                            onChange={(e) => updateSelectedBlock({ thickness: Number(e.target.value) })}
                            className="w-full p-1.5 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                      </div>
                    )}

                    {/* PROPRIEDADES: REDES SOCIAIS */}
                    {selectedBlock.type === 'social' && (
                      <div className="space-y-3">
                        <p className="text-[11px] text-slate-400">
                          Preencha as URLs das redes que deseja exibir com os logos reais e oficiais:
                        </p>
                        {[
                          { key: 'instagram', label: 'Instagram', iconUrl: 'https://cdn-icons-png.flaticon.com/512/3955/3955024.png' },
                          { key: 'whatsapp', label: 'WhatsApp', iconUrl: 'https://cdn-icons-png.flaticon.com/512/3670/3670051.png' },
                          { key: 'youtube', label: 'YouTube', iconUrl: 'https://cdn-icons-png.flaticon.com/512/3670/3670147.png' },
                          { key: 'facebook', label: 'Facebook', iconUrl: 'https://cdn-icons-png.flaticon.com/512/5968/5968764.png' },
                          { key: 'linkedin', label: 'LinkedIn', iconUrl: 'https://cdn-icons-png.flaticon.com/512/3536/3536505.png' },
                          { key: 'tiktok', label: 'TikTok', iconUrl: 'https://cdn-icons-png.flaticon.com/512/3046/3046121.png' },
                          { key: 'telegram', label: 'Telegram', iconUrl: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png' },
                          { key: 'twitter', label: 'X (Twitter)', iconUrl: 'https://cdn-icons-png.flaticon.com/512/5969/5969020.png' },
                          { key: 'website', label: 'Website / Blog', iconUrl: 'https://cdn-icons-png.flaticon.com/512/1006/1006771.png' },
                        ].map((net) => (
                          <div key={net.key}>
                            <div className="flex items-center gap-1.5 mb-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={net.iconUrl} alt={net.label} className="w-4 h-4 rounded-sm object-contain" />
                              <label className="text-[11px] font-semibold text-slate-300">{net.label}</label>
                            </div>
                            <input
                              type="text"
                              value={(selectedBlock.links as any)?.[net.key] || ''}
                              onChange={(e) =>
                                updateSelectedBlock({
                                  links: { ...selectedBlock.links, [net.key]: e.target.value },
                                })
                              }
                              placeholder={`https://${net.key}.com/...`}
                              className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* PROPRIEDADES: RODAPÉ */}
                    {selectedBlock.type === 'footer' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Nome da Empresa / Projeto</label>
                          <input
                            type="text"
                            value={selectedBlock.companyName || ''}
                            onChange={(e) => updateSelectedBlock({ companyName: e.target.value })}
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Texto Legal / Motivo do Envio</label>
                          <textarea
                            rows={3}
                            value={selectedBlock.text || ''}
                            onChange={(e) => updateSelectedBlock({ text: e.target.value })}
                            className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                    Clique em um bloco na pré-visualização ao lado para editar suas propriedades.
                  </div>
                )}
              </>
            ) : (
              /* ABA 2: ESTILOS GLOBAIS DO E-MAIL */
              <div className="space-y-4">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Configurações Globais do E-mail
                </h4>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Cor de Fundo da Tela</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={doc.settings.bodyBg}
                      onChange={(e) =>
                        updateDoc({
                          ...doc,
                          settings: { ...doc.settings, bodyBg: e.target.value },
                        })
                      }
                      className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={doc.settings.bodyBg}
                      onChange={(e) =>
                        updateDoc({
                          ...doc,
                          settings: { ...doc.settings, bodyBg: e.target.value },
                        })
                      }
                      className="flex-1 p-1.5 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Cor do Card do E-mail</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={doc.settings.contentBg}
                      onChange={(e) =>
                        updateDoc({
                          ...doc,
                          settings: { ...doc.settings, contentBg: e.target.value },
                        })
                      }
                      className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={doc.settings.contentBg}
                      onChange={(e) =>
                        updateDoc({
                          ...doc,
                          settings: { ...doc.settings, contentBg: e.target.value },
                        })
                      }
                      className="flex-1 p-1.5 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Fonte Padrão</label>
                  <select
                    value={doc.settings.fontFamily}
                    onChange={(e) =>
                      updateDoc({
                        ...doc,
                        settings: { ...doc.settings, fontFamily: e.target.value },
                      })
                    }
                    className="w-full p-2 bg-[#101217] border border-slate-700 rounded-lg text-xs text-white"
                  >
                    <option value="Inter, Arial, sans-serif">Inter (Moderna)</option>
                    <option value="Arial, sans-serif">Arial (Clássica / Segura)</option>
                    <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                    <option value="'Segoe UI', Tahoma, sans-serif">Segoe UI</option>
                    <option value="Georgia, serif">Georgia (Elegante)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Arredondamento do Card: {doc.settings.borderRadius}px
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    value={doc.settings.borderRadius}
                    onChange={(e) =>
                      updateDoc({
                        ...doc,
                        settings: { ...doc.settings, borderRadius: Number(e.target.value) },
                      })
                    }
                    className="w-full"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTemplateName(doc.subject || 'Meu Modelo');
                      setIsSaveTemplateModalOpen(true);
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <Bookmark className="w-4 h-4 text-amber-400" />
                    <span>Salvar Como Novo Template</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. CANVAS DE PRÉ-VISUALIZAÇÃO INTERATIVA EM TEMPO REAL */}
        {/* ============================================================ */}
        <div className="flex-1 bg-[#0b0d13] overflow-y-auto p-8 flex justify-center items-start">
          <div
            style={{
              width: previewMode === 'desktop' ? '600px' : '375px',
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            className={`relative rounded-2xl shadow-2xl overflow-hidden border ${
              previewMode === 'mobile'
                ? 'border-slate-700 ring-8 ring-slate-900 bg-slate-900'
                : 'border-slate-800'
            }`}
          >
            {/* Notch falso para simular celular no modo mobile */}
            {previewMode === 'mobile' && (
              <div className="h-6 bg-slate-950 flex items-center justify-center">
                <div className="w-24 h-3 bg-slate-800 rounded-full" />
              </div>
            )}

            {/* Container do E-mail */}
            <div
              style={{
                backgroundColor: doc.settings.bodyBg,
                padding: previewMode === 'mobile' ? '12px' : '24px 16px',
                fontFamily: doc.settings.fontFamily,
                minHeight: '400px',
              }}
            >
              <div
                style={{
                  backgroundColor: doc.settings.contentBg,
                  borderRadius: `${doc.settings.borderRadius}px`,
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                }}
              >
                {doc.blocks.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <p className="text-sm">Seu e-mail está vazio.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Adicione elementos no menu lateral esquerdo para começar.
                    </p>
                  </div>
                ) : (
                  doc.blocks.map((block, index) => {
                    const isSelected = selectedBlockId === block.id;
                    const blockHtml = renderBlockToHtml(block, doc.settings, {
                      nome: 'Carlos Henrique',
                      primeiro_nome: 'Carlos',
                      email: 'carlos@exemplo.com',
                      telefone: '(11) 99999-8888',
                    });

                    return (
                      <div
                        key={block.id}
                        onClick={() => setSelectedBlockId(block.id)}
                        className={`relative group cursor-pointer transition-all ${
                          isSelected
                            ? 'ring-2 ring-indigo-500 bg-indigo-50/5'
                            : 'hover:ring-1 hover:ring-indigo-300/40'
                        }`}
                      >
                        {/* Barra de Ações Rápidas Flutuante no Bloco */}
                        <div
                          className={`absolute top-1 right-2 z-10 flex items-center gap-1 bg-[#181c25] border border-slate-700 rounded-lg p-1 shadow-lg transition-opacity ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveBlock(index, 'up');
                            }}
                            disabled={index === 0}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveBlock(index, 'down');
                            }}
                            disabled={index === doc.blocks.length - 1}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateBlock(block);
                            }}
                            className="p-1 text-slate-400 hover:text-white"
                            title="Duplicar bloco"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBlock(block.id);
                            }}
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Excluir bloco"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Renderização do HTML do Bloco */}
                        <div dangerouslySetInnerHTML={{ __html: blockHtml }} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. MODAL DE BIBLIOTECA DE MODELOS PRONTOS (TEMPLATES) */}
      {/* ============================================================ */}
      {isTemplatesModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181c25] rounded-2xl border border-slate-800 max-w-2xl w-full p-6 text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">Biblioteca de Modelos Prontos</h3>
                  <p className="text-[11px] text-slate-400">Escolha um modelo de alta conversão para começar</p>
                </div>
              </div>
              <button
                onClick={() => setIsTemplatesModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 max-h-[60vh] overflow-y-auto">
              {PREBUILT_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="p-4 bg-[#12151c] hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/50 rounded-xl cursor-pointer transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tmpl.thumbnailColor }}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        {tmpl.category}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white group-hover:text-indigo-400 transition-colors">
                      {tmpl.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      {tmpl.description}
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-indigo-400 font-semibold">
                    <span>Usar este modelo</span>
                    <span>→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. MODAL DE ENVIAR E-MAIL DE TESTE REAL VIA SMTP */}
      {/* ============================================================ */}
      {isTestEmailModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181c25] rounded-2xl border border-slate-800 max-w-md w-full p-6 text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">Disparo de E-mail de Teste</h3>
                  <p className="text-[11px] text-slate-400">Valide o visual na sua caixa de entrada</p>
                </div>
              </div>
              <button
                onClick={() => setIsTestEmailModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail de Destino
                </label>
                <input
                  type="email"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="w-full p-2.5 bg-[#12141a] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                      : 'bg-red-950/60 text-red-300 border border-red-800'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsTestEmailModalOpen(false)}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-300"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={testSending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {testSending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{testSending ? 'Disparando...' : 'Enviar Agora'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODAL DE SALVAR COMO NOVO TEMPLATE */}
      {/* ============================================================ */}
      {isSaveTemplateModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181c25] rounded-2xl border border-slate-800 max-w-md w-full p-6 text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Salvar como Modelo</h3>
              </div>
              <button
                onClick={() => setIsSaveTemplateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Modelo
                </label>
                <input
                  type="text"
                  value={customTemplateName}
                  onChange={(e) => setCustomTemplateName(e.target.value)}
                  placeholder="Ex: Minha Boas-vindas VIP"
                  className="w-full p-2.5 bg-[#12141a] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsSaveTemplateModalOpen(false)}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                disabled={savingTemplate || !customTemplateName.trim()}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingTemplate ? 'Salvando...' : 'Salvar Modelo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
