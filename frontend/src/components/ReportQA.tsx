import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
import { askFollowup } from '../api/civitas'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  reportId: string
}

export default function ReportQA({ reportId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const answer = await askFollowup(reportId, question, history)
      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Unable to generate a response. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full mt-3 flex items-center gap-2.5 px-4 py-3 bg-white shadow-apple-xs border border-separator rounded-apple-lg
                   hover:border-accent-muted hover:shadow-apple-sm transition-all duration-200 group"
      >
        <div className="w-7 h-7 rounded-apple-sm bg-accent-light flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <span className="text-[13px] font-medium text-ink-primary group-hover:text-accent transition-colors">
            Ask about this report
          </span>
          <p className="text-[11px] text-ink-quaternary mt-0.5">
            Ask follow-up questions about findings, records, or context
          </p>
        </div>
        <svg className="w-4 h-4 text-ink-quaternary group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    )
  }

  return (
    <div className="mt-3 bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-separator flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-[13px] font-semibold text-ink-primary">Ask about this report</span>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-ink-quaternary hover:text-ink-secondary text-[14px] p-1"
        >
          &times;
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[280px] overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-[12px] text-ink-tertiary">Ask a question about the report findings, records, or context.</p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
              {[
                'What is the most urgent issue?',
                'Explain the tax lien history',
                'Summarize violations',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-[11px] px-2.5 py-1 bg-surface-raised border border-separator rounded-full
                             text-ink-secondary hover:text-accent hover:border-accent-muted transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-apple px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-accent text-white text-[13px]'
                : 'bg-surface-raised border border-separator text-[13px] text-ink-primary'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-slate max-w-none [&>p]:m-0 [&>p]:text-[13px]">
                  <Markdown>{msg.content}</Markdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-raised border border-separator rounded-apple px-3 py-2 flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-[2px] border-separator border-t-accent animate-spin" />
              <span className="text-[12px] text-ink-tertiary">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-separator flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={loading}
          className="flex-1 h-9 px-3 text-[13px] bg-surface-sunken border border-separator rounded-apple
                     placeholder:text-ink-quaternary text-ink-primary
                     focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40
                     disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="h-9 px-3 bg-accent hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-ink-quaternary
                     text-white text-[12px] font-semibold rounded-apple
                     transition-all duration-150 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  )
}
