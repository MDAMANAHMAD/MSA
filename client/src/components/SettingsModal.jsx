import React, { useState, useEffect } from 'react';
import { Settings, Cloud, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';

export default function SettingsModal({ apiUrl, onClose }) {
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/auth/status`);
      const data = await response.json();
      setAuthorized(data.authorized);
      setEmail(data.email || '');
    } catch (error) {
      console.error('Error checking Drive status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [apiUrl]);

  const handleLinkDrive = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/url`);
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error fetching Auth URL:', error);
      alert('Could not start Google Drive authentication. Check connection.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-dark)' }}>
            <Settings size={22} style={{ color: 'var(--accent-ot)' }} /> 
            <span>Cloud Sync Settings</span>
          </h3>
          <button className="modal-close" onClick={onClose} title="Close Settings">
            <X size={24} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', gap: '10px' }}>
              <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent-ot)' }} />
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' }}>Checking connection status...</p>
            </div>
          ) : (
            <>
              {/* Account Status Card */}
              {authorized ? (
                <div style={{
                  background: 'var(--accent-salary-light)',
                  border: '1.5px solid rgba(46, 204, 113, 0.25)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px'
                }}>
                  <CheckCircle size={24} style={{ color: '#27AE60', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                    <h4 style={{ color: '#27AE60', fontWeight: '700', fontSize: '1rem' }}>Google Drive Linked</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dark)', opacity: 0.9, lineHeight: '1.4' }}>
                      Your documents are automatically synced to the cloud!
                    </p>
                    <div style={{ 
                      marginTop: '8px',
                      background: 'white',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(46, 204, 113, 0.15)',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: '#27AE60',
                      wordBreak: 'break-all',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                      Connected to: {email}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: 'var(--accent-ot-light)',
                  border: '1.5px solid rgba(243, 156, 18, 0.25)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px'
                }}>
                  <AlertTriangle size={24} style={{ color: '#E67E22', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h4 style={{ color: '#D35400', fontWeight: '700', fontSize: '1rem' }}>No Google Drive Linked</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dark)', opacity: 0.9, lineHeight: '1.4' }}>
                      Connect your Google Drive account to sync and store all documents securely in the cloud.
                    </p>
                  </div>
                </div>
              )}

              {/* Action Button to switch or connect */}
              <div style={{ marginTop: '10px' }}>
                <button 
                  onClick={handleLinkDrive} 
                  className="btn-large" 
                  style={{
                    background: authorized ? 'linear-gradient(135deg, #34495E, #2C3E50)' : 'linear-gradient(135deg, #E67E22, #D35400)',
                    boxShadow: authorized ? '0 4px 15px rgba(44, 62, 80, 0.15)' : '0 4px 15px rgba(211, 84, 0, 0.2)',
                  }}
                >
                  <Cloud size={20} />
                  <span>{authorized ? 'Switch Google Account' : 'Connect Google Drive'}</span>
                </button>
                <p style={{ 
                  textAlign: 'center', 
                  fontSize: '0.75rem', 
                  color: 'var(--text-muted)', 
                  marginTop: '10px',
                  fontWeight: '500',
                  padding: '0 10px',
                  lineHeight: '1.4'
                }}>
                  {authorized 
                    ? 'Tapping this will securely sign you out of the current account and let you link a different Google Drive account.' 
                    : 'Your files are stored safely on this device. Connecting Google Drive uploads and backups your files in real-time.'}
                </p>
              </div>
            </>
          )}

          {/* Close Settings Button */}
          <button 
            type="button" 
            className="btn-large"
            style={{
              background: '#E8E6E2',
              color: 'var(--text-dark)',
              boxShadow: 'none',
              marginTop: '10px'
            }}
            onClick={onClose}
          >
            Close Settings
          </button>

        </div>
      </div>
    </div>
  );
}
