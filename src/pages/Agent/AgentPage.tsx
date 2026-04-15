import { useState, useRef, useEffect } from 'react';
import {
  Container, Paper, TextInput, Button, ScrollArea, Text, Stack,
  Tabs, Code, Group, ActionIcon, Loader, Badge, Title, Select,
} from '@mantine/core';
import { IconSend, IconCode, IconSettings, IconChartBar, IconMessage, IconTrash, IconPlayerStop } from '@tabler/icons-react';

const MODELS = [
  { value: 'anthropic:claude-haiku-4-5-20251001', label: 'Haiku 4.5 (fastest)' },
  { value: 'anthropic:claude-sonnet-4-6-20250514', label: 'Sonnet 4.6' },
  { value: 'anthropic:claude-opus-4-6-20250514', label: 'Opus 4.6' },
  { value: 'openai:gpt-4o', label: 'GPT-4o' },
  { value: 'openai:gpt-4o-mini', label: 'GPT-4o Mini' },
];

const CONTROLLER_API_URL = import.meta.env.VITE_CONTROLLER_API_URL;

/** Markdown renderer: headers, bold, code, lists, code blocks. */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks (``` ... ```).
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={elements.length} style={{
          background: 'rgba(0,0,0,0.05)', padding: '8px 12px', borderRadius: 6,
          fontSize: '0.8em', overflow: 'auto', margin: '8px 0',
          fontFamily: '"SF Mono", "Fira Code", monospace',
        }}>
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Headers.
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) { elements.push(<div key={elements.length} style={{ fontWeight: 700, fontSize: '0.9em', margin: '12px 0 4px' }}>{renderInline(h3[1])}</div>); i++; continue; }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) { elements.push(<div key={elements.length} style={{ fontWeight: 700, fontSize: '1em', margin: '16px 0 6px' }}>{renderInline(h2[1])}</div>); i++; continue; }
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) { elements.push(<div key={elements.length} style={{ fontWeight: 700, fontSize: '1.1em', margin: '18px 0 8px' }}>{renderInline(h1[1])}</div>); i++; continue; }

    // Bullet list (- or *).
    const bullet = line.match(/^(\s*)[-*]\s+(.+)/);
    if (bullet) {
      const indent = Math.floor((bullet[1] || '').length / 2);
      elements.push(
        <div key={elements.length} style={{ paddingLeft: 16 + indent * 16, position: 'relative' }}>
          <span style={{ position: 'absolute', left: indent * 16 }}>•</span>
          {renderInline(bullet[2])}
        </div>
      );
      i++; continue;
    }

    // Numbered list (1. 2. etc).
    const numbered = line.match(/^(\d+)\.\s+(.+)/);
    if (numbered) {
      elements.push(
        <div key={elements.length} style={{ paddingLeft: 24 }}>
          <span style={{ position: 'absolute', marginLeft: -20 }}>{numbered[1]}.</span>
          {renderInline(numbered[2])}
        </div>
      );
      i++; continue;
    }

    // Table (| col | col |).
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const row = lines[i].trim();
        // Skip separator rows (|---|---|).
        if (/^\|[\s\-:|]+\|$/.test(row)) { i++; continue; }
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        const header = tableRows[0];
        const body = tableRows.slice(1);
        elements.push(
          <div key={elements.length} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.85em', width: '100%' }}>
              <thead>
                <tr>
                  {header.map((cell, ci) => (
                    <th key={ci} style={{
                      border: '1px solid #d0d0d0', padding: '6px 10px',
                      background: 'rgba(0,0,0,0.04)', textAlign: 'left', fontWeight: 600,
                    }}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{
                        border: '1px solid #d0d0d0', padding: '6px 10px',
                      }}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Empty line.
    if (!line.trim()) { elements.push(<div key={elements.length} style={{ height: 8 }} />); i++; continue; }

    // Normal line.
    elements.push(<div key={elements.length}>{renderInline(line)}</div>);
    i++;
  }

  return elements;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{
        background: 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 3,
        fontSize: '0.85em', fontFamily: '"SF Mono", "Fira Code", monospace',
        color: '#1a1a1a',
      }}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
  timestamp?: number;
}

function formatTime(ts?: number) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface CodeSuggestion {
  file_path: string;
  original: string;
  replacement: string;
  explanation: string;
}

const STORAGE_KEY = 'gnomie-session';
const PROMPT_KEY = 'gnomie-system-prompt';

const DEFAULT_SYSTEM_PROMPT = `You are Gnomie, a quantitative trading assistant for the GNOME backtesting platform. Help users design, configure, run, and analyze HFT backtests. Be concise and actionable.`;

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveSession(data: any) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function AgentPage() {
  const saved = useRef(loadSession());
  const [sessionId] = useState(() => saved.current?.sessionId || `s-${Date.now()}`);
  const [messages, setMessages] = useState<Message[]>(saved.current?.messages || []);
  const [input, setInput] = useState('');
  const [config, setConfig] = useState(saved.current?.config || '');
  const [loading, setLoading] = useState(false);
  const [codeSuggestions, setCodeSuggestions] = useState<CodeSuggestion[]>(saved.current?.codeSuggestions || []);
  const [lastReportSummary, setLastReportSummary] = useState<Record<string, any> | null>(saved.current?.lastReportSummary || null);
  const [model, setModel] = useState(saved.current?.model || MODELS[0].value);
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem(PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopAgent = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
    }
  };

  // Persist session on every state change.
  useEffect(() => {
    saveSession({ messages, config, codeSuggestions, lastReportSummary, model, sessionId });
  }, [messages, config, codeSuggestions, lastReportSummary, model]);

  // Persist system prompt separately (survives session clears).
  useEffect(() => {
    localStorage.setItem(PROMPT_KEY, systemPrompt);
  }, [systemPrompt]);

  const clearSession = () => {
    setMessages([]);
    setConfig('');
    setCodeSuggestions([]);
    setLastReportSummary(null);
    localStorage.removeItem(STORAGE_KEY);
    // Reload to get a fresh session ID.
    window.location.reload();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input, timestamp: Date.now() };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setInput('');
    setLoading(true);

    try {
      const apiConversation = conversation.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      const resp = await fetch(`${CONTROLLER_API_URL}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: apiConversation, config, model, system_prompt: systemPrompt, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.text().catch(() => 'Request failed');
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err}` }]);
        return;
      }

      // Read SSE stream.
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.done) continue;
          if (event.error) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${event.error}`, timestamp: Date.now() }]);
            continue;
          }

          if (event.type === 'message') {
            setMessages(prev => [...prev, { ...event.message, timestamp: Date.now() }]);
          } else if (event.type === 'config_update') {
            console.log('Config updates:', event.updates);
          } else if (event.type === 'code_suggestion') {
            setCodeSuggestions(prev => [...prev, event.suggestion]);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User clicked stop — don't show an error.
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const formatToolName = (name: string) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const renderMessage = (msg: Message, idx: number) => {
    const isUser = msg.role === 'user';

    // Hide tool_result messages — they're internal plumbing.
    if (isUser && Array.isArray(msg.content)) {
      return null;
    }

    // Assistant messages with tool_use blocks — show text, collapse tool calls.
    if (!isUser && Array.isArray(msg.content)) {
      const textBlocks = msg.content.filter((b: any) => b.type === 'text' && b.text?.trim());
      const toolBlocks = msg.content.filter((b: any) => b.type === 'tool_use');

      return (
        <Stack key={idx} gap={4} mb="xs">
          {textBlocks.map((block: any, i: number) => (
            <Paper key={`t${i}`} p="sm" radius="sm" bg="#e8f5e9">
              <Text size="sm" c="#1a1a1a" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{renderMarkdown(block.text)}</Text>
            </Paper>
          ))}
          <Group gap={4} justify="space-between">
            <Group gap={4}>
              {toolBlocks.map((block: any, i: number) => (
                <Badge key={`b${i}`} size="xs" variant="light" color="gray" radius="sm">
                  {formatToolName(block.name)}
                </Badge>
              ))}
            </Group>
            {msg.timestamp && <Text size="xs" c="dimmed">{formatTime(msg.timestamp)}</Text>}
          </Group>
        </Stack>
      );
    }

    // Simple text messages.
    return (
      <Paper
        key={idx}
        p="sm"
        radius="sm"
        bg={isUser ? 'gray.1' : '#e8f5e9'}
        mb="xs"
        ml={isUser ? 'xl' : 0}
        mr={isUser ? 0 : 'xl'}
      >
        <Group justify="space-between" mb={2}>
          {isUser ? <Text size="xs" c="dimmed">You</Text> : <span />}
          {msg.timestamp && <Text size="xs" c="dimmed">{formatTime(msg.timestamp)}</Text>}
        </Group>
        <Text size="sm" c="#1a1a1a" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {typeof msg.content === 'string' ? renderMarkdown(msg.content) : JSON.stringify(msg.content)}
        </Text>
      </Paper>
    );
  };

  return (
    <Container fluid p="md" style={{ height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      <Group justify="space-between" mb="md">
        <Title order={3}>Gnomie</Title>
        <Group gap="xs">
          <Select
            data={MODELS}
            value={model}
            onChange={v => v && setModel(v)}
            size="xs"
            w={250}
          />
          <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={14} />}
            onClick={clearSession}>
            Clear
          </Button>
        </Group>
      </Group>
      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 130px)' }}>
        {/* Chat Panel */}
        <Paper p="md" radius="sm" withBorder style={{ flex: 7, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', marginBottom: 12 }} ref={scrollRef}>
            <Stack gap="xs">
              {messages.map((msg, idx) => renderMessage(msg, idx))}
              {loading && (
                <Group gap="xs">
                  <Loader size="xs" />
                  <Text size="sm" c="dimmed">Thinking...</Text>
                </Group>
              )}
            </Stack>
          </div>
          <Group gap="xs">
            <TextInput
              flex={1}
              placeholder="Ask about strategies, run backtests, analyze results..."
              value={input}
              onChange={e => setInput(e.currentTarget.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              disabled={loading}
            />
            {loading ? (
              <ActionIcon size="lg" onClick={stopAgent} variant="filled" color="red">
                <IconPlayerStop size={16} />
              </ActionIcon>
            ) : (
              <ActionIcon size="lg" onClick={sendMessage} variant="filled">
                <IconSend size={16} />
              </ActionIcon>
            )}
          </Group>
        </Paper>

        {/* Context Panel */}
        <Paper radius="sm" withBorder style={{ flex: 5, overflow: 'hidden' }}>
          <Tabs defaultValue="config" h="100%">
            <Tabs.List>
              <Tabs.Tab value="config" leftSection={<IconSettings size={14} />}>Config</Tabs.Tab>
              <Tabs.Tab value="report" leftSection={<IconChartBar size={14} />}>Report</Tabs.Tab>
              <Tabs.Tab value="code" leftSection={<IconCode size={14} />}>Code</Tabs.Tab>
              <Tabs.Tab value="prompt" leftSection={<IconMessage size={14} />}>Prompt</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="config" p="md" h="calc(100% - 40px)">
              <textarea
                value={config}
                onChange={e => setConfig(e.target.value)}
                placeholder="Paste or load a YAML config..."
                style={{
                  width: '100%',
                  height: '100%',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  border: '1px solid #dee2e6',
                  borderRadius: 4,
                  padding: 8,
                  resize: 'none',
                }}
              />
            </Tabs.Panel>

            <Tabs.Panel value="report" p="md">
              <ScrollArea h="calc(100vh - 200px)">
                {lastReportSummary ? (
                  <Stack gap="xs">
                    <Text size="sm" fw={600}>Latest Report Summary</Text>
                    {Object.entries(lastReportSummary).map(([key, value]) => (
                      <Group key={key} justify="space-between">
                        <Text size="xs" c="dimmed">{key.replace(/_/g, ' ')}</Text>
                        <Text size="xs" ff="monospace">
                          {typeof value === 'number' ? value.toFixed(4) : JSON.stringify(value)}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                ) : (
                  <Text c="dimmed" size="sm">No report yet. Run a backtest to see results.</Text>
                )}
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="code" p="md">
              <ScrollArea h="calc(100vh - 200px)">
                {(() => {
                  const appliedBranches = [...new Set(
                    codeSuggestions
                      .map(s => (s as any).branch)
                      .filter(Boolean) as string[]
                  )];
                  if (appliedBranches.length > 0) {
                    return (
                      <Paper p="sm" radius="sm" bg="green.0" mb="md">
                        <Text size="xs" fw={600} c="#1a1a1a" mb={4}>Active branches</Text>
                        <Group gap="xs">
                          {appliedBranches.map(branch => (
                            <Badge
                              key={branch}
                              size="sm" color="green" variant="light" radius="sm"
                              component="a"
                              href={`https://github.com/gnome-trading-group/gnomepy-research/tree/${branch}`}
                              target="_blank"
                              style={{ cursor: 'pointer', textDecoration: 'none' }}
                            >
                              {branch}
                            </Badge>
                          ))}
                        </Group>
                      </Paper>
                    );
                  }
                  return null;
                })()}
                {codeSuggestions.length > 0 ? (
                  <Stack gap="md">
                    {codeSuggestions.map((s, i) => {
                      const origLines = s.original.split('\n');
                      const replLines = s.replacement.split('\n');
                      return (
                        <Paper key={i} p="sm" radius="sm" withBorder>
                          <Group justify="space-between" mb="xs">
                            <Text size="xs" fw={600} ff="monospace">{s.file_path}</Text>
                            <Group gap="xs">
                              {(s as any).branch && (
                                <Badge
                                  size="sm" color="green" variant="light" radius="sm"
                                  component="a"
                                  href={`https://github.com/gnome-trading-group/gnomepy-research/tree/${(s as any).branch}`}
                                  target="_blank"
                                  style={{ cursor: 'pointer', textDecoration: 'none' }}
                                >
                                  {(s as any).branch}
                                </Badge>
                              )}
                              {!(s as any).branch && <Button size="xs" color="green" variant="light" onClick={async () => {
                                try {
                                  const payload = {
                                    file_path: s.file_path,
                                    original: s.original,
                                    replacement: s.replacement,
                                    session_id: sessionId,
                                  };
                                  console.log('[gnomie] applying:', s.file_path, 'original length:', s.original.length);
                                  const resp = await fetch(`${CONTROLLER_API_URL}/agent/apply`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload),
                                  });
                                  if (!resp.ok) {
                                    const text = await resp.text();
                                    alert(`Failed (${resp.status}): ${text}`);
                                    return;
                                  }
                                  const data = await resp.json();
                                  if (data.error) {
                                    alert(`Failed: ${data.error}`);
                                  } else {
                                    setCodeSuggestions(prev => prev.map((cs, j) =>
                                      j === i ? { ...cs, branch: data.branch } as any : cs
                                    ));
                                  }
                                } catch (err: any) {
                                  console.error('[gnomie] apply error:', err);
                                  alert(`Error: ${err.name}: ${err.message}`);
                                }
                              }}>Apply</Button>}
                              <Button size="xs" color="red" variant="light"
                                onClick={() => setCodeSuggestions(prev => prev.filter((_, j) => j !== i))}
                              >Reject</Button>
                            </Group>
                          </Group>
                          <Text size="xs" c="dimmed" mb="xs">{s.explanation}</Text>
                          <div style={{
                            fontFamily: '"SF Mono", "Fira Code", monospace',
                            fontSize: '0.75rem',
                            lineHeight: 1.7,
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            overflow: 'auto',
                          }}>
                            {origLines.map((line, li) => (
                              <div key={`r${li}`} style={{
                                background: '#fff1f0', color: '#991b1b',
                                padding: '0 8px', borderLeft: '3px solid #f87171',
                              }}>
                                <span style={{ color: '#9ca3af', userSelect: 'none', marginRight: 8 }}>-</span>
                                {line}
                              </div>
                            ))}
                            {replLines.map((line, li) => (
                              <div key={`a${li}`} style={{
                                background: '#f0fdf4', color: '#166534',
                                padding: '0 8px', borderLeft: '3px solid #4ade80',
                              }}>
                                <span style={{ color: '#9ca3af', userSelect: 'none', marginRight: 8 }}>+</span>
                                {line}
                              </div>
                            ))}
                          </div>
                        </Paper>
                      );
                    })}
                  </Stack>
                ) : (
                  <Text c="dimmed" size="sm">No code suggestions yet. Ask the agent to modify a strategy.</Text>
                )}
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="prompt" p="md" h="calc(100% - 40px)">
              <Stack h="100%" gap="xs">
                <Text size="xs" c="dimmed">
                  Customize the system prompt to shape Gnomie's behavior. Changes apply to new messages.
                </Text>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  style={{
                    width: '100%',
                    height: 'calc(100% - 60px)',
                    minHeight: 300,
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    lineHeight: 1.6,
                    border: '1px solid #dee2e6',
                    borderRadius: 4,
                    padding: 12,
                    resize: 'none',
                  }}
                />
                <Button size="xs" variant="light" onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}>
                  Reset to default
                </Button>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </div>
    </Container>
  );
}

export default AgentPage;
