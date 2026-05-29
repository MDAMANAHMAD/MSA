import React, { useState } from 'react';
import { Settings, Globe, Check, X } from 'lucide-react';

export default function SettingsModal({ currentUrl, onSave, onClose }) {
  const [url, setUrl] = useState(currentUrl);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={22} className="arrow-icon" /> Settings
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="apiUrl">Server Base URL (Render/Local)</label>
            <div style={{ position: 'relative' }}>
              <input
                id="apiUrl"
                type="url"
                className="input-control"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:5000"
                required
                style={{ paddingLeft: '44px' }}
              />
              <Globe
                size={20}
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '16px',
                  color: 'var(--text-muted)'
                }}
              />
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Set this to your Render URL (e.g. <code>https://msa-backend.onrender.com</code>) when deploying online!
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn-large"
              style={{
                background: '#E8E6E2',
                color: 'var(--text-dark)',
                boxShadow: 'none',
                flex: 1
              }}
              onClick={onClose}
            >
              <X size={20} /> Cancel
            </button>
            <button type="submit" className="btn-large" style={{ flex: 1 }}>
              <Check size={20} /> Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
