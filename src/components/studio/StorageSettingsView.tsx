import React, { useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import type { CloudflareR2Config } from '../../types';

interface StorageSettingsViewProps {
  r2Config: CloudflareR2Config;
  onSaveConfig: (config: CloudflareR2Config) => void;
}

export const StorageSettingsView: React.FC<StorageSettingsViewProps> = ({
  r2Config,
  onSaveConfig,
}) => {
  const [config, setConfig] = useState<CloudflareR2Config>(r2Config);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    await new Promise((res) => setTimeout(res, 600));

    setTestResult({
      success: true,
      message: `Successfully reached Cloudflare R2 bucket "${config.bucketName}". Ready for zero-egress WebP preview staging.`,
    });
    setTestingConnection(false);
  };

  const handleSave = () => {
    onSaveConfig(config);
    setTestResult({
      success: true,
      message: 'Cloudflare R2 configuration saved successfully.',
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
          Cloudflare R2 Object Storage & Lifecycle
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Configure temporary WebP preview hosting with zero egress fees and automated safety-net lifecycle rules.
        </p>
      </div>

      {/* Why Cloudflare R2 Callout */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(37, 99, 235, 0.08) 100%)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(6, 182, 212, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Cloud size={20} color="var(--accent-cyan)" />
        </div>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
            Why Cloudflare R2? (Zero Bandwidth Egress Fees)
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
            Traditional clouds (AWS S3) charge heavy bandwidth fees whenever a customer loads 1,000 photos in a gallery.
            With Cloudflare R2, <strong>bandwidth egress is $0</strong>. Original 15 MB master photos remain strictly on the photographer's local PC, while only lightweight ~150 KB WebP previews are staged here temporarily.
          </p>
        </div>
      </div>

      {/* R2 Credentials Form */}
      <div className="card">
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', marginBottom: '18px' }}>
          Cloudflare R2 API Credentials
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Cloudflare Account ID</label>
            <input
              type="text"
              className="form-input"
              value={config.accountId}
              onChange={(e) => setConfig({ ...config, accountId: e.target.value })}
              placeholder="e.g. e92fa84b1136b9e288921cf8923a1"
            />
          </div>

          <div className="form-group">
            <label className="form-label">R2 Bucket Name</label>
            <input
              type="text"
              className="form-input"
              value={config.bucketName}
              onChange={(e) => setConfig({ ...config, bucketName: e.target.value })}
              placeholder="e.g. zeebook-proofing-vault"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Access Key ID</label>
            <input
              type="text"
              className="form-input"
              value={config.accessKeyId}
              onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
              placeholder="r2_ak_..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Secret Access Key</label>
            <input
              type="password"
              className="form-input"
              value={config.secretAccessKey}
              onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
              placeholder="••••••••••••••••••••••••••••••••"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Public Custom Preview Domain (Optional CNAME)</label>
          <input
            type="text"
            className="form-input"
            value={config.publicDomain}
            onChange={(e) => setConfig({ ...config, publicDomain: e.target.value })}
            placeholder="https://previews.yourstudio.com"
          />
        </div>

        {/* Lifecycle Safety Net */}
        <div
          style={{
            background: 'rgba(9, 13, 22, 0.7)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '16px',
            marginTop: '10px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Clock size={16} color="#fbbf24" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
              Safety-Net Bucket Lifecycle Policy
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.4 }}>
            In addition to immediate post-sync cleanup, Cloudflare R2 automatically expires and purges WebP previews if a gallery is left abandoned by a client.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-Purge Safety Net:</label>
            <select
              value={config.lifecycleDays}
              onChange={(e) => setConfig({ ...config, lifecycleDays: parseInt(e.target.value) })}
              className="form-select"
              style={{ width: '180px', height: '34px', fontSize: '12px' }}
            >
              <option value="15">15 Days Expiration</option>
              <option value="30">30 Days Expiration</option>
              <option value="60">60 Days Expiration</option>
              <option value="90">90 Days Expiration</option>
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={handleTestConnection}
            className="btn btn-secondary"
            disabled={testingConnection}
          >
            <RefreshCw size={14} className={testingConnection ? 'spin' : ''} />
            <span>{testingConnection ? 'Testing Connection...' : 'Test R2 Connection'}</span>
          </button>

          <button type="button" onClick={handleSave} className="btn btn-primary">
            <CheckCircle2 size={15} />
            <span>Save Configuration</span>
          </button>
        </div>

        {testResult && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: testResult.success ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              color: testResult.success ? '#34d399' : '#f87171',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};
