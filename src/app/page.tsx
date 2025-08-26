"use client";
import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import React from "react";

export default function Home() {
  const { data: session } = useSession();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkApiKey() {
      if (session?.user) {
        try {
          const res = await fetch("/api/key/verify");
          if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
              setHasApiKey(true);
              return;
            }
          }
        } catch {}
        setHasApiKey(false);
      }
    }
    checkApiKey();
  }, [session]);

  return (
    <div className="container">
      {session?.user && (
        <div className="signout-topright">
          <SignOutButton />
        </div>
      )}
      <h1 style={{ marginBottom: 24 }}>LlamaCloud MCP Gateway</h1>
      {session?.user ? (
        <div className="auth-container">
          {hasApiKey === null ? null : hasApiKey ? (
            <>
              <IndexesList />
              <DeleteApiKeyButton onDeleted={() => setHasApiKey(false)} />
            </>
          ) : (
            <>
              <p>Welcome {session.user.name}! You can use this interface to create MCP tools out of your LlamaCloud indexes. To get started, you'll need to create an API key in the <a href="https://cloud.llamaindex.ai/" target="_blank">LlamaCloud main interface</a>. Make sure the API key is attached to the Project where the Indexes you want to expose are located.</p>
              <ApiKeyForm onSuccess={() => setHasApiKey(true)} />
            </>
          )}
        </div>
      ) : (
        <>
          <p style={{ marginBottom: 20 }}>
            Welcome to the LlamaCloud MCP Gateway!<br/>
            Sign in to connect your LlamaCloud indexes and expose them as MCP tools for use in Claude, Cursor, VS Code, and more.
          </p>
          <SignInButton />
        </>
      )}
    </div>
  );
}

function SignInButton() {
  const [loading, setLoading] = useState(false);
  const handleSignIn = async () => {
    setLoading(true);
    await signIn("google");
    setLoading(false);
  };
  return (
    <button className="button button-signin" onClick={handleSignIn} disabled={loading}>
      {loading ? "Signing in..." : "Sign in with Google"}
    </button>
  );
}

function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const handleSignOut = async () => {
    setLoading(true);
    await signOut();
    setLoading(false);
  };
  return (
    <button className="button button-signout" onClick={handleSignOut} disabled={loading}>
      {loading ? "Signing out..." : "Sign Out"}
    </button>
  );
}

function ApiKeyForm({ onSuccess }: { onSuccess?: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<null | "success" | "error">(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/key/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (res.ok) {
        setStatus("success");
        setApiKey("");
        if (onSuccess) onSuccess();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="input-group" onSubmit={handleSubmit}>
      <input
        className="input"
        type="text"
        name="apiKey"
        placeholder="Enter API key"
        value={apiKey}
        onChange={e => setApiKey(e.target.value)}
        required
        disabled={loading}
      />
      <button className="button button-primary" type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </button>
      {status === "success" && <span className="success-message">Saved!</span>}
      {status === "error" && <span className="error">Invalid API key</span>}
    </form>
  );
}

function IndexesList() {
  const [indexes, setIndexes] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<{ [id: string]: boolean }>({});
  const [toggleLoading, setToggleLoading] = useState<{ [id: string]: boolean }>({});
  const [toolConfigs, setToolConfigs] = useState<{ [id: string]: { tool_name: string; tool_description: string; preset_retrieval_parameters?: any } }>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ tool_name: string; tool_description: string; preset_retrieval_parameters?: any }>({ tool_name: '', tool_description: '' });
  const [toolNameError, setToolNameError] = useState<string | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const descInputRef = React.useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'indexes' | 'instructions'>('indexes');
  const [showAdvanced, setShowAdvanced] = useState<{ [id: string]: boolean }>({});

  useEffect(() => {
    async function fetchIndexes() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/index/list");
        if (!res.ok) throw new Error("Failed to fetch indexes");
        const data = await res.json();
        const list = Array.isArray(data.indexes) ? data.indexes : data.indexes?.data || [];
        setIndexes(list);
        const initial: { [id: string]: boolean } = {};
        const configs: { [id: string]: { tool_name: string; tool_description: string; preset_retrieval_parameters?: any } } = {};
        list.forEach((idx: any) => {
          const id = idx.id || idx.name;
          let tool_name = '';
          let tool_description = '';
          let preset_retrieval_parameters = {};
          let enabled = false;
          if (idx.tool_config) {
            tool_name = idx.tool_config.tool_name || '';
            tool_description = idx.tool_config.tool_description || '';
            preset_retrieval_parameters = idx.tool_config.preset_retrieval_parameters || {};
            enabled = true;
          } else {
            const name = idx.name || id;
            tool_name = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            tool_description = `Search ${name}`;
            preset_retrieval_parameters = {};
            enabled = false;
          }
          initial[id] = enabled;
          configs[id] = { tool_name, tool_description, preset_retrieval_parameters };
        });
        setEnabled(initial);
        setToolConfigs(configs);
      } catch (e: any) {
        setError(e.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchIndexes();
  }, []);

  const handleToggle = async (id: string, newValue: boolean) => {
    setToggleLoading(t => ({ ...t, [id]: true }));
    const prev = enabled[id];
    setEnabled(e => ({ ...e, [id]: newValue }));
    try {
      let body: any = { indexId: id, enabled: newValue };
      if (newValue && toolConfigs[id]) {
        body.config = {
          tool_name: toolConfigs[id].tool_name,
          tool_description: toolConfigs[id].tool_description,
          preset_retrieval_parameters: toolConfigs[id].preset_retrieval_parameters || {},
        };
      }
      const res = await fetch("/api/tool/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update tool");
    } catch (e) {
      setEnabled(e => ({ ...e, [id]: prev }));
      alert("Failed to update tool status");
    } finally {
      setToggleLoading(t => ({ ...t, [id]: false }));
    }
  };

  const startEditing = (id: string) => {
    setEditingId(id);
    setEditValues({
      tool_name: toolConfigs[id]?.tool_name || '',
      tool_description: toolConfigs[id]?.tool_description || '',
      preset_retrieval_parameters: toolConfigs[id]?.preset_retrieval_parameters || {},
    });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'tool_name') {
      const valid = value.replace(/[^a-z0-9_]/g, '');
      setEditValues(v => ({ ...v, tool_name: valid }));
      if (value !== valid) {
        setToolNameError('Tool name can only contain lowercase letters, numbers, and underscores.');
      } else {
        setToolNameError(null);
      }
    } else {
      setEditValues(v => ({ ...v, [name]: value }));
    }
  };

  const handlePresetParamChange = (paramName: string, value: any) => {
    setEditValues(v => ({
      ...v,
      preset_retrieval_parameters: {
        ...v.preset_retrieval_parameters,
        [paramName]: value
      }
    }));
  };

  const handleEditBlur = (id: string) => {
    setTimeout(() => {
      const active = document.activeElement;
      if (
        active !== nameInputRef.current &&
        active !== descInputRef.current
      ) {
        setToolConfigs(cfgs => ({
          ...cfgs,
          [id]: { ...cfgs[id], ...editValues },
        }));
        setEditingId(null);
        fetch("/api/tool/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            indexId: id,
            enabled: true,
            config: {
              tool_name: editValues.tool_name,
              tool_description: editValues.tool_description,
              preset_retrieval_parameters: editValues.preset_retrieval_parameters || {},
            },
          }),
        }).catch(() => alert("Failed to update tool config"));
      }
    }, 0);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') {
      setToolConfigs(cfgs => ({
        ...cfgs,
        [id]: { ...cfgs[id], ...editValues },
      }));
      setEditingId(null);
      fetch("/api/tool/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indexId: id,
          enabled: true,
          config: {
            tool_name: editValues.tool_name,
            tool_description: editValues.tool_description,
            preset_retrieval_parameters: editValues.preset_retrieval_parameters || {},
          },
        }),
      }).catch(() => alert("Failed to update tool config"));
    }
  };

  const handleInstructionsLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setActiveTab('instructions');
  };

  if (loading) return <div>Loading indexes...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!indexes || indexes.length === 0) return <div>No indexes found.</div>;

  return (
    <div>
      <div className="indexes-tabs">
        <div className="indexes-tabs-header">
          <button
            className={`indexes-tab${activeTab === 'indexes' ? ' active' : ''}`}
            onClick={() => setActiveTab('indexes')}
            type="button"
          >
            Available Indexes
          </button>
          <button
            className={`indexes-tab${activeTab === 'instructions' ? ' active' : ''}`}
            onClick={() => setActiveTab('instructions')}
            type="button"
          >
            Installation Instructions
          </button>
        </div>
        <div className="indexes-tabs-content">
          {activeTab === 'indexes' && (
            <>
              <ul className="indexes-list">
                {indexes.map((idx: any) => {
                  const id = idx.id || idx.name;
                  const name = idx.name || id;
                  const config = toolConfigs[id] || { tool_name: '', tool_description: '' };
                  return (
                    <li key={id} className="index-list-item">
                      <div className="index-row">
                        <label className="ios-switch">
                          <input
                            type="checkbox"
                            checked={enabled[id] || false}
                            disabled={toggleLoading[id]}
                            onChange={() => handleToggle(id, !enabled[id])}
                          />
                          <span className="slider" />
                        </label>
                        <span className="index-name">{name}</span>
                      </div>
                      {enabled[id] && (
                        <div className="tool-fields">
                          {editingId === id ? (
                            <>
                              <div className="tool-field-row">
                                <label className="tool-field-label">Tool Name</label>
                                <input
                                  ref={nameInputRef}
                                  name="tool_name"
                                  value={editValues.tool_name}
                                  onChange={handleEditChange}
                                  onBlur={() => handleEditBlur(id)}
                                  onKeyDown={e => handleEditKeyDown(e, id)}
                                  className="tool-name-input"
                                  autoFocus
                                />
                                {toolNameError && (
                                  <span style={{ color: '#ef4444', fontSize: 12, marginLeft: 8 }}>{toolNameError}</span>
                                )}
                              </div>
                              <div className="tool-field-row tool-desc-row">
                                <label className="tool-field-label tool-desc-label">Description</label>
                                <textarea
                                  ref={descInputRef as any}
                                  name="tool_description"
                                  value={editValues.tool_description}
                                  onChange={e => handleEditChange(e as any)}
                                  onBlur={() => handleEditBlur(id)}
                                  onKeyDown={e => handleEditKeyDown(e as any, id)}
                                  className="tool-desc-textarea"
                                />
                              </div>
                              <div className="tool-field-row">
                                <button
                                  type="button"
                                  onClick={() => setShowAdvanced(s => ({ ...s, [id]: !s[id] }))}
                                  className="advanced-toggle-btn"
                                >
                                  {showAdvanced[id] ? '▼' : '▶'} Advanced Settings
                                </button>
                              </div>
                              {showAdvanced[id] && (
                                <div className="advanced-params">
                                  <div className="tool-field-row">
                                    <label className="tool-field-label">Top K</label>
                                    <input
                                      type="number"
                                      min="1"
                                      max="100"
                                      value={editValues.preset_retrieval_parameters?.dense_similarity_top_k || 30}
                                      onChange={e => handlePresetParamChange('dense_similarity_top_k', parseInt(e.target.value))}
                                      className="param-input"
                                      onBlur={() => handleEditBlur(id)}
                                    />
                                  </div>
                                  <div className="tool-field-row">
                                    <label className="tool-field-label">Similarity Cutoff</label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="1"
                                      step="0.1"
                                      value={editValues.preset_retrieval_parameters?.dense_similarity_cutoff || 0.0}
                                      onChange={e => handlePresetParamChange('dense_similarity_cutoff', parseFloat(e.target.value))}
                                      className="param-input"
                                      onBlur={() => handleEditBlur(id)}
                                    />
                                  </div>
                                  <div className="tool-field-row">
                                    <label className="tool-field-label">Enable Reranking</label>
                                    <input
                                      type="checkbox"
                                      checked={editValues.preset_retrieval_parameters?.enable_reranking || false}
                                      onChange={e => handlePresetParamChange('enable_reranking', e.target.checked)}
                                      onBlur={() => handleEditBlur(id)}
                                    />
                                  </div>
                                  {editValues.preset_retrieval_parameters?.enable_reranking && (
                                    <div className="tool-field-row">
                                      <label className="tool-field-label">Rerank Top N</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={editValues.preset_retrieval_parameters?.rerank_top_n || 6}
                                        onChange={e => handlePresetParamChange('rerank_top_n', parseInt(e.target.value))}
                                        className="param-input"
                                        onBlur={() => handleEditBlur(id)}
                                      />
                                    </div>
                                  )}
                                  <div className="tool-field-row">
                                    <label className="tool-field-label">Retrieval Mode</label>
                                    <select
                                      value={editValues.preset_retrieval_parameters?.retrieval_mode || 'chunks'}
                                      onChange={e => handlePresetParamChange('retrieval_mode', e.target.value)}
                                      className="param-select"
                                      onBlur={() => handleEditBlur(id)}
                                    >
                                      <option value="chunks">Chunks</option>
                                      <option value="files_via_metadata">Files via Metadata</option>
                                      <option value="files_via_content">Files via Content</option>
                                      <option value="auto_routed">Auto Routed</option>
                                    </select>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="tool-field-row">
                                <label className="tool-field-label">Tool Name</label>
                                <div
                                  className="tool-name-view"
                                  onClick={() => startEditing(id)}
                                  tabIndex={0}
                                  role="button"
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') startEditing(id); }}
                                >
                                  {config.tool_name}
                                </div>
                              </div>
                              <div className="tool-field-row tool-desc-row">
                                <label className="tool-field-label tool-desc-label">Description</label>
                                <div
                                  className="tool-desc-view"
                                  onClick={() => startEditing(id)}
                                  tabIndex={0}
                                  role="button"
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') startEditing(id); }}
                                >
                                  {config.tool_description}
                                </div>
                              </div>
                              {config.preset_retrieval_parameters && Object.keys(config.preset_retrieval_parameters).length > 0 && (
                                <div className="tool-field-row">
                                  <label className="tool-field-label">Advanced</label>
                                  <div className="preset-params-summary" onClick={() => startEditing(id)}>
                                                                         {Object.entries(config.preset_retrieval_parameters)
                                       .filter(([, value]) => value !== undefined && value !== null && value !== '')
                                       .map(([key, value]) => (
                                         <span key={key} className="param-tag">
                                           {key}: {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                                         </span>
                                       ))
                                     }
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="indexes-instructions">
                <p>These are the Indexes in your project. Click the slider to enable that Index as an MCP tool.
                You should also add a clear tool name and description for each tool you enable, as the LLM will use this to discover what the tool can do.</p>
                <p>Once you've enabled some tools, you're ready to add this MCP Gateway to your favorite client! Read the <a href="#instructions" className="instructions-link" onClick={handleInstructionsLinkClick}>instructions</a> for more details.</p>
              </div>
            </>
          )}
          {activeTab === 'instructions' && (
            <div className="installation-instructions-tab">
              <h3>Claude Desktop and Claude.ai</h3>
              <ol>
                <li>Click the <b>Connect apps</b> button</li>
                <li>Click <b>Add integration</b></li>
                <li>Enter "LlamaCloud" as the name</li>
                <li>
                  Enter <CopyableCode value="https://mcp.llamaindex.ai/mcp/sse" /> as the URL
                </li>
              </ol>
              <h3>Cursor</h3>
              <ol>
                <li>From the menu bar, select Cursor &gt; Settings &gt; Cursor Settings</li>
                <li>Select Tools & Integrations</li>
                <li>Click New MCP Server. This will open mcp.json.</li>                
                <li>Edit mcp.json to look like this:
                  <CopyableJsonCode value={
`{
  "mcpServers": {
    "LlamaCloud": {
      "name": "LlamaCloud MCP",
      "url": "https://mcp.llamaindex.ai/mcp/mcp",
      "transport": "http-stream"
    }
  }
}`}
                  />
                </li>
              </ol>
              <h3>VS Code</h3>
              <ol>
                <li>Open settings.json by hitting CMD + Shift + P and typing "Open User Settings (JSON)"</li>
                <li>Add this to your settings.json:
                  <CopyableJsonCode value={
`"mcp": {
    "servers": {
        "LlamaCloud MCP": {
            "url": "https://mcp.llamaindex.ai/mcp/mcp"
        }
    }
}`}
                  />
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeleteApiKeyButton({ onDeleted }: { onDeleted: () => void }) {
  const [loading, setLoading] = useState(false);
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your API key? This will remove all current tools.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/key/delete', { method: 'POST' });
      if (res.ok) {
        onDeleted();
      } else {
        alert('Failed to delete API key');
      }
    } catch {
      alert('Failed to delete API key');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{ marginTop: 32, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <button
        className="button button-danger"
        style={{ background: '#ef4444', color: 'white', borderRadius: 6, padding: '0.5rem 1.5rem', fontWeight: 500, marginBottom: 4 }}
        onClick={handleDelete}
        disabled={loading}
      >
        {loading ? 'Deleting...' : 'Delete API key'}
      </button>
      <div style={{ fontSize: 13, color: '#888', marginTop: 2, textAlign: 'center' }}>
        Any current tools will be removed.
      </div>
    </div>
  );
}

function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <span className="copyable-code-wrapper">
      <code>{value}</code>
      <button
        className="copy-code-btn"
        onClick={handleCopy}
        type="button"
        aria-label="Copy to clipboard"
        tabIndex={0}
      >
        {copied ? (
          <span className="copy-feedback">Copied!</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="7" width="9" height="9" rx="2" stroke="#888" strokeWidth="1.5"/>
            <rect x="7" y="4" width="9" height="9" rx="2" stroke="#bbb" strokeWidth="1.5"/>
          </svg>
        )}
      </button>
    </span>
  );
}

function CopyableJsonCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div className="copyable-json-wrapper">
      <pre className="json-pre"><code>{value}</code></pre>
      <button
        className="copy-code-btn json-copy-btn"
        onClick={handleCopy}
        type="button"
        aria-label="Copy JSON to clipboard"
        tabIndex={0}
      >
        {copied ? (
          <span className="copy-feedback">Copied!</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="7" width="9" height="9" rx="2" stroke="#888" strokeWidth="1.5"/>
            <rect x="7" y="4" width="9" height="9" rx="2" stroke="#bbb" strokeWidth="1.5"/>
          </svg>
        )}
      </button>
    </div>
  );
}
