import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCheck,
  Clock3,
  Inbox,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRoundCheck
} from 'lucide-react';
import Toast from '../components/Toast';
import {
  generateWhatsAppAiDraft,
  loadWhatsAppConversations,
  loadWhatsAppThread,
  markConversationHumanReview,
  markConversationRead,
  sendWhatsAppCloudMessage,
  subscribeToWhatsAppInbox,
  type AiReplyDraft,
  type WhatsAppConversation,
  type WhatsAppMessage
} from '../services/whatsappCloudService';

const relativeTime = (value: string) => {
  if (!value) return 'No messages';
  const difference = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(difference)) return '';
  const minutes = Math.max(0, Math.floor(difference / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const messageTime = (value: string) => value
  ? new Date(value).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
  : '';

export default function WhatsAppAssistantInbox() {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [draft, setDraft] = useState<AiReplyDraft | null>(null);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => !query || `${conversation.customerName} ${conversation.phoneNumber} ${conversation.lastMessage}`.toLowerCase().includes(query));
  }, [conversations, search]);

  const loadConversations = useCallback(async () => {
    try {
      const rows = await loadWhatsAppConversations();
      setConversations(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id || '');
      setError('');
    } catch (loadError) {
      console.error('WhatsApp inbox load failed:', loadError);
      setError(loadError instanceof Error ? loadError.message : String((loadError as { message?: string })?.message || 'Unable to load WhatsApp inbox.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId: string) => {
    if (!conversationId) { setMessages([]); setDraft(null); setReply(''); return; }
    setThreadLoading(true);
    try {
      const data = await loadWhatsAppThread(conversationId);
      setMessages(data.messages);
      setDraft(data.draft);
      setReply(data.draft?.content || '');
    } catch (threadError) {
      console.error('WhatsApp thread load failed:', threadError);
      setToast({ message: threadError instanceof Error ? threadError.message : 'Unable to load conversation.', type: 'error' });
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { void loadThread(selectedId); }, [loadThread, selectedId]);
  useEffect(() => {
    const conversation = conversations.find((item) => item.id === selectedId);
    if (!conversation || conversation.unreadCount <= 0) return;
    setConversations((current) => current.map((item) => item.id === selectedId ? { ...item, unreadCount: 0 } : item));
    void markConversationRead(selectedId).catch((readError) => console.error('Failed to mark WhatsApp conversation read:', readError));
  }, [conversations, selectedId]);
  useEffect(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  useEffect(() => subscribeToWhatsAppInbox(() => {
    void loadConversations();
    if (selectedId) void loadThread(selectedId);
  }), [loadConversations, loadThread, selectedId]);

  const generateDraft = async () => {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const nextDraft = await generateWhatsAppAiDraft(selectedId);
      setDraft(nextDraft);
      setReply(nextDraft.content);
      setToast({ message: 'AI draft generated. Review it before sending.', type: 'success' });
    } catch (generateError) {
      console.error('AI draft generation failed:', generateError);
      setToast({ message: generateError instanceof Error ? generateError.message : 'AI draft generation failed.', type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    if (!window.confirm('Send this reviewed message to the customer through WhatsApp?')) return;
    setSending(true);
    try {
      await sendWhatsAppCloudMessage({ conversationId: selectedId, message: reply.trim(), draftId: draft?.id });
      setDraft(null);
      setReply('');
      await loadThread(selectedId);
      await loadConversations();
      setToast({ message: 'WhatsApp message sent.', type: 'success' });
    } catch (sendError) {
      console.error('WhatsApp manual send failed:', sendError);
      setToast({ message: sendError instanceof Error ? sendError.message : 'WhatsApp send failed.', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const markHumanReview = async () => {
    if (!selectedId) return;
    try {
      await markConversationHumanReview(selectedId);
      await loadConversations();
      setToast({ message: 'Conversation marked for human review.', type: 'success' });
    } catch (reviewError) {
      setToast({ message: reviewError instanceof Error ? reviewError.message : 'Unable to update review status.', type: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
      <section className="rounded-2xl border border-[#334155] bg-[#111111] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C8A96B]">Customer Messaging Operations</p><h1 className="mt-1.5 text-2xl font-semibold text-white">WhatsApp AI Assistant</h1><p className="mt-1.5 text-sm text-slate-400">Review inbound conversations, generate safe drafts and send replies manually.</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">Human approval required</span><button type="button" onClick={() => void loadConversations()} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#334155] text-slate-300" aria-label="Refresh inbox"><RefreshCw size={15} /></button></div>
        </div>
      </section>

      {error ? <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100"><div className="flex gap-2"><AlertTriangle size={18} className="shrink-0" /><span>{error}</span></div></section> : null}

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-[#334155] bg-[#0B1120] shadow-panel xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="border-b border-[#334155] bg-[#0d1119] xl:border-b-0 xl:border-r">
          <div className="border-b border-[#334155] p-3"><div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer or phone" className="h-10 w-full rounded-xl border border-[#334155] bg-[#111827] pl-9 pr-3 text-sm text-white outline-none" /></div></div>
          <div className="max-h-[360px] overflow-y-auto xl:max-h-[590px]">
            {loading ? <div className="space-y-2 p-3">{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-white/5" />)}</div> : filteredConversations.length ? filteredConversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-[#263348] p-3 text-left transition ${selectedId === conversation.id ? 'bg-[#C8A96B]/10' : 'hover:bg-white/[0.03]'}`}>
                <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-white">{conversation.customerName}</p><span className="shrink-0 text-[10px] text-slate-500">{relativeTime(conversation.lastMessageAt)}</span></div>
                <div className="mt-1 flex items-center justify-between gap-2"><p className="truncate text-xs text-slate-400">{conversation.lastMessage || conversation.phoneNumber}</p>{conversation.unreadCount > 0 ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-black">{conversation.unreadCount}</span> : null}</div>
                {conversation.status === 'human_review' ? <p className="mt-1 text-[10px] font-semibold text-amber-300">Human review</p> : null}
              </button>
            )) : <div className="p-8 text-center"><Inbox size={24} className="mx-auto text-slate-600" /><p className="mt-3 text-sm font-semibold text-white">No conversations yet</p><p className="mt-1 text-xs text-slate-500">Inbound webhook messages will appear here.</p></div>}
          </div>
        </aside>

        <main className="flex min-h-[520px] flex-col border-b border-[#334155] xl:border-b-0 xl:border-r">
          {selectedConversation ? <>
            <header className="flex items-center justify-between gap-3 border-b border-[#334155] bg-[#0d1119] px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{selectedConversation.customerName}</p><p className="mt-0.5 text-xs text-slate-500">+{selectedConversation.phoneNumber}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${selectedConversation.status === 'human_review' ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'}`}>{selectedConversation.status.replace('_', ' ')}</span></header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {threadLoading ? <div className="space-y-3">{[1,2,3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-white/5" />)}</div> : messages.map((message) => (
                <div key={message.id} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${message.direction === 'outbound' ? 'rounded-br-md bg-[#C8A96B] text-black' : 'rounded-bl-md border border-[#334155] bg-[#111827] text-slate-100'}`}><p className="whitespace-pre-wrap text-sm leading-5">{message.body}</p><div className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${message.direction === 'outbound' ? 'text-black/60' : 'text-slate-500'}`}><span>{messageTime(message.messageTimestamp)}</span>{message.direction === 'outbound' ? <CheckCheck size={11} /> : null}</div>{message.errorMessage ? <p className="mt-1 text-[10px] text-rose-700">{message.errorMessage}</p> : null}</div></div>
              ))}<div ref={threadEndRef} />
            </div>
          </> : <div className="flex flex-1 items-center justify-center p-8 text-center"><div><MessageCircle size={28} className="mx-auto text-slate-600" /><p className="mt-3 text-sm font-semibold text-white">Select a conversation</p><p className="mt-1 text-xs text-slate-500">Open a customer thread to review and reply.</p></div></div>}
        </main>

        <aside className="bg-[#0d1119] p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">AI Suggested Reply</p><p className="mt-1 text-xs text-slate-500">Draft only · never auto-sent</p></div><Bot size={19} className="text-[#C8A96B]" /></div>
          <button type="button" onClick={generateDraft} disabled={!selectedId || generating} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#C8A96B]/35 bg-[#C8A96B]/10 text-sm font-semibold text-[#E4C98E] disabled:opacity-45"><RefreshCw size={15} className={generating ? 'animate-spin' : ''} />{generating ? 'Generating...' : 'Generate AI Reply'}</button>
          <textarea value={reply} onChange={(event) => setReply(event.target.value)} disabled={!selectedId} rows={12} placeholder="Generate a draft or write a reply manually..." className="mt-3 w-full resize-none rounded-xl border border-[#334155] bg-[#111827] p-3 text-sm leading-6 text-white outline-none focus:border-[#C8A96B]/50 disabled:opacity-45" />
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3"><div className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-amber-300" /><div><p className="text-xs font-semibold text-amber-100">Staff review required</p><p className="mt-1 text-[11px] leading-5 text-amber-200/70">Check pricing, availability, urgency, discounts and order details before sending.</p></div></div></div>
          {draft ? <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500"><Clock3 size={12} /><span>Drafted by {draft.model}</span></div> : null}
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={sendReply} disabled={!selectedId || !reply.trim() || sending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-black disabled:opacity-45"><Send size={15} />{sending ? 'Sending...' : 'Send WhatsApp'}</button>
            <button type="button" onClick={markHumanReview} disabled={!selectedId} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-sm font-semibold text-amber-200 disabled:opacity-45"><UserRoundCheck size={15} />Mark Human Review</button>
          </div>
          <p className="mt-4 text-center text-[10px] leading-4 text-slate-600">No automatic replies, order confirmations, refunds or discount approvals are enabled.</p>
        </aside>
      </section>
    </div>
  );
}
