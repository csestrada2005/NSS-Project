import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, Loader2, CheckCircle, Clock, Send, Save, Edit2, X } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

interface EmailConfig {
  status: 'pending' | 'verified' | null;
  dnsRecords: DNSRecord[];
}

interface DNSRecord {
  type: string;
  name: string;
  value: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_body: string;
}

interface EmailPanelProps {
  projectId: string | null;
}

async function getAuthHeader() {
  const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
  return { 'Content-Type': 'application/json', Authorization };
}

export function EmailPanel({ projectId }: EmailPanelProps) {
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [sendingDomain, setSendingDomain] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testTemplate, setTestTemplate] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    loadStatus();
    loadTemplates();
  }, [projectId]);

  const loadStatus = async () => {
    if (!projectId) return;
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/email/${projectId}/status`, { headers });
      const data = await response.json();
      setEmailConfig(data);
    } catch { /* ignore */ }
  };

  const loadTemplates = async () => {
    if (!projectId) return;
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/email/${projectId}/templates`, { headers });
      const data = await response.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const setupDomain = async () => {
    if (!sendingDomain.trim() || !projectId) return;
    setIsSettingUp(true);
    setError(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/email/setup/${projectId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sendingDomain: sendingDomain.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Setup failed');
        return;
      }
      setEmailConfig({ status: 'pending', dnsRecords: data.dnsRecords || [] });
    } catch (e: any) {
      setError(e?.message || 'Setup failed');
    } finally {
      setIsSettingUp(false);
    }
  };

  const checkVerification = async () => {
    if (!projectId) return;
    setIsCheckingStatus(true);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/email/${projectId}/status`, { headers });
      const data = await response.json();
      setEmailConfig(data);
      if (data.status === 'verified') {
        setSuccessMsg('Domain verified!');
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const saveTemplate = async (template: Partial<EmailTemplate>) => {
    if (!projectId) return;
    const headers = await getAuthHeader();
    if (template.id) {
      await fetch(`/api/email/${projectId}/templates/${template.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(template),
      });
    } else {
      await fetch(`/api/email/${projectId}/templates`, {
        method: 'POST',
        headers,
        body: JSON.stringify(template),
      });
    }
    setEditingTemplate(null);
    setNewTemplate(null);
    await loadTemplates();
  };

  const deleteTemplate = async (templateId: string) => {
    if (!window.confirm('Delete this template?')) return;
    const headers = await getAuthHeader();
    await fetch(`/api/email/${projectId}/templates/${templateId}`, { method: 'DELETE', headers });
    await loadTemplates();
  };

  const sendTestEmail = async () => {
    if (!testEmail || !testTemplate || !projectId) return;
    setIsSending(true);
    setError(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`/api/email/${projectId}/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: testEmail, templateName: testTemplate, variables: {} }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'Send failed'); return; }
      setSuccessMsg('Test email sent!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      setError(e?.message || 'Send failed');
    } finally {
      setIsSending(false);
    }
  };

  if (!projectId) {
    return <div className="text-center text-zinc-500 py-8 text-sm">Save your project to manage email settings.</div>;
  }

  const TemplateEditor = ({ template, onSave, onCancel }: { template: Partial<EmailTemplate>; onSave: (t: Partial<EmailTemplate>) => void; onCancel: () => void }) => {
    const [local, setLocal] = useState(template);
    return (
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
        <input
          type="text"
          placeholder="Template name (e.g. welcome, otp)"
          value={local.name || ''}
          onChange={e => setLocal(p => ({ ...p, name: e.target.value }))}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Subject line (use {{variable}} for placeholders)"
          value={local.subject || ''}
          onChange={e => setLocal(p => ({ ...p, subject: e.target.value }))}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        />
        <div>
          <p className="text-xs text-zinc-500 mb-1">HTML body — use {'{{variable}}'} for dynamic values</p>
          <textarea
            placeholder="<h1>Hello {{name}}</h1><p>Welcome!</p>"
            value={local.html_body || ''}
            onChange={e => setLocal(p => ({ ...p, html_body: e.target.value }))}
            rows={6}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none resize-y"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSave(local)}
            disabled={!local.name || !local.subject}
            className="px-4 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Save size={13} />
            Save
          </button>
          <button onClick={onCancel} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-sm transition-colors flex items-center gap-1.5">
            <X size={13} />
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-sm text-red-400">{error}</div>
      )}
      {successMsg && (
        <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle size={14} />
          {successMsg}
        </div>
      )}

      {/* Section A: Sending domain */}
      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
          <Mail size={14} />
          Sending Domain
        </h3>

        {!emailConfig?.status ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. mail.myapp.com"
              value={sendingDomain}
              onChange={e => setSendingDomain(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={setupDomain}
              disabled={isSettingUp || !sendingDomain.trim()}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isSettingUp ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Setup
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {emailConfig.status === 'verified'
                ? <CheckCircle size={14} className="text-emerald-400" />
                : <Clock size={14} className="text-amber-400 animate-pulse" />}
              <span className={`text-sm font-medium ${emailConfig.status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {emailConfig.status === 'verified' ? 'Verified' : 'Pending verification'}
              </span>
              {emailConfig.status === 'pending' && (
                <button
                  onClick={checkVerification}
                  disabled={isCheckingStatus}
                  className="ml-auto text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  {isCheckingStatus ? <Loader2 size={11} className="animate-spin" /> : null}
                  Check verification
                </button>
              )}
            </div>

            {emailConfig.dnsRecords && emailConfig.dnsRecords.length > 0 && emailConfig.status === 'pending' && (
              <div>
                <p className="text-xs text-zinc-400 mb-2">Add these DNS records to verify your domain:</p>
                <div className="overflow-x-auto border border-zinc-700 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-800 text-zinc-400 border-b border-zinc-700">
                        <th className="text-left px-3 py-2 font-medium">Type</th>
                        <th className="text-left px-3 py-2 font-medium">Name</th>
                        <th className="text-left px-3 py-2 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {emailConfig.dnsRecords.map((record, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-zinc-300">{record.type}</td>
                          <td className="px-3 py-2 font-mono text-zinc-300 max-w-[120px] truncate">{record.name}</td>
                          <td className="px-3 py-2 font-mono text-zinc-300 max-w-[200px] truncate">{record.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section B: Templates */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            Templates
          </h3>
          {!newTemplate && (
            <button
              onClick={() => setNewTemplate({ name: '', subject: '', html_body: '' })}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              <Plus size={12} />
              New template
            </button>
          )}
        </div>

        {newTemplate && (
          <TemplateEditor
            template={newTemplate}
            onSave={saveTemplate}
            onCancel={() => setNewTemplate(null)}
          />
        )}

        {templates.length === 0 && !newTemplate ? (
          <p className="text-zinc-500 text-sm text-center py-4">No templates yet.</p>
        ) : (
          templates.map(template => (
            <div key={template.id}>
              {editingTemplate?.id === template.id ? (
                <TemplateEditor
                  template={editingTemplate}
                  onSave={saveTemplate}
                  onCancel={() => setEditingTemplate(null)}
                />
              ) : (
                <div className="flex items-center gap-3 bg-zinc-800/50 p-3 rounded border border-zinc-700 group">
                  <Mail size={13} className="text-zinc-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{template.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{template.subject}</p>
                  </div>
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="p-1.5 text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => deleteTemplate(template.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Section C: Test send */}
      {emailConfig?.status === 'verified' && templates.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
            <Send size={14} />
            Test Send
          </h3>
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Recipient email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
            <select
              value={testTemplate}
              onChange={e => setTestTemplate(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select template...</option>
              {templates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <button
              onClick={sendTestEmail}
              disabled={isSending || !testEmail || !testTemplate}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {isSending ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
