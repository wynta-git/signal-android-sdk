'use client';
import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import EmptyState from '../EmptyState';
import { useCommonSelector } from '../../store/hooks';
import {
  openCopilot,
  closeCopilot,
  setCopilotTab,
  sendMessage,
  selectCopilotOpen,
  selectCopilotTab,
  selectCopilotMessages,
  selectCopilotStatus,
} from '../../store/slices/copilotSlice';
import { COPILOT_SUGGESTIONS } from '../../services/copilotApi';
import type { CopilotTab } from '../../types';

const TABS: { id: CopilotTab; label: string; icon: string }[] = [
  { id: 'thread', label: 'Thread', icon: 'message-square' },
  { id: 'copilot', label: 'AI Co-pilot', icon: 'layers' },
];

export default function CopilotPanel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();
  const isOpen = useCommonSelector(selectCopilotOpen);
  const activeTab = useCommonSelector(selectCopilotTab);
  const messages = useCommonSelector(selectCopilotMessages);
  const status = useCommonSelector(selectCopilotStatus);

  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const thinking = status === 'thinking';

  useEffect(() => {
    if (!isOpen) return;
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch(closeCopilot());
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [isOpen, dispatch]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thinking, isOpen, activeTab]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    dispatch(sendMessage(trimmed));
    setDraft('');
    const el = inputRef.current;
    if (el) el.style.height = 'auto';
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  return (
    <>
      {!isOpen && (
        <button
          className="copilot-fab"
          title="AI Co-pilot"
          onClick={() => dispatch(openCopilot())}
        >
          <Icon name="sparkles" size={22} />
        </button>
      )}
      <aside className={'copilot-panel' + (isOpen ? ' open' : '')} aria-hidden={!isOpen}>
      <div className="copilot-header">
        <Icon name="message-square" size={18} />
        <span className="copilot-title">AI Co-pilot</span>
        <button className="copilot-close" title="Close" onClick={() => dispatch(closeCopilot())}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="copilot-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'copilot-tab' + (activeTab === t.id ? ' active' : '')}
            onClick={() => dispatch(setCopilotTab(t.id))}
          >
            <Icon name={t.icon} size={15} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'thread' ? (
        <div className="copilot-body">
          <EmptyState
            icon="message-square"
            label="No thread yet"
            hint="Conversations about this page will appear here."
          />
        </div>
      ) : (
        <>
          <div className="copilot-body" ref={bodyRef}>
            {messages.length === 0 ? (
              <>
                <div className="copilot-welcome">
                  <div className="spark">✦</div>
                  <div className="title">Wynta AI Co-pilot</div>
                  <div className="sub">
                    Ask me anything about campaigns, bonuses, player segments, or what&apos;s
                    happening across your products.
                  </div>
                </div>
                <div className="copilot-suggestions">
                  {COPILOT_SUGGESTIONS.map((s) => (
                    <button key={s.text} className="copilot-suggestion" onClick={() => send(s.text)}>
                      <span className="emoji">{s.emoji}</span>
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="copilot-msgs">
                {messages.map((m) => (
                  <div key={m.id} className={'copilot-msg ' + m.role}>
                    {m.text}
                  </div>
                ))}
                {thinking && (
                  <div className="copilot-msg assistant copilot-typing">
                    <span /><span /><span />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="copilot-inputbar">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder="Ask Wynta AI anything..."
              onChange={onInputChange}
              onKeyDown={onInputKeyDown}
            />
            <button
              className="copilot-send"
              title="Send"
              disabled={!draft.trim() || thinking}
              onClick={() => send(draft)}
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        </>
      )}
      </aside>
    </>
  );
}
