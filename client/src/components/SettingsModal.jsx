import React, { useState, useEffect } from 'react';
import { Settings, Cloud, CheckCircle, AlertTriangle, X, Loader2, Fingerprint, ShieldCheck } from 'lucide-react';
import { isPlatformAuthenticatorAvailable, registerDeviceCredential, verifyDeviceCredential } from '../utils/webauthn';

export default function SettingsModal({ apiUrl, onClose }) {
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  // Device Lock Screen settings state
  const [lockSupported, setLockSupported] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  useEffect(() => {
    const initLock = async () => {
      const supported = await isPlatformAuthenticatorAvailable();
      setLockSupported(supported);
      setLockEnabled(localStorage.getItem('msa_lock_enabled') === 'true');
    };
    initLock();
  }, []);

  const handleToggleLock = async () => {
    setLockLoading(true);
    try {
      if (lockEnabled) {
        // Disabling: authenticate first
        const credentialId = localStorage.getItem('msa_lock_credential_id');
        if (credentialId) {
          const success = await verifyDeviceCredential(credentialId);
          if (success) {
            localStorage.removeItem('msa_lock_enabled');
            localStorage.removeItem('msa_lock_credential_id');
            setLockEnabled(false);
          }
        } else {
          localStorage.removeItem('msa_lock_enabled');
          setLockEnabled(false);
        }
      } else {
        // Enabling
        const credId = await registerDeviceCredential();
        if (credId) {
          localStorage.setItem('msa_lock_enabled', 'true');
          localStorage.setItem('msa_lock_credential_id', credId);
          setLockEnabled(true);
        }
      }
    } catch (error) {
      console.error('Error toggling screen lock:', error);
      alert(error.message || 'Operation failed or cancelled.');
    } finally {
      setLockLoading(false);
    }
  };

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

              {/* Device Screen Lock Settings Card */}
              <div style={{
                background: lockEnabled ? 'var(--accent-salary-light)' : 'white',
                border: lockEnabled ? '1.5px solid rgba(46, 204, 113, 0.25)' : '1px solid var(--color-border)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                marginTop: '10px'
              }}>
                <Fingerprint size={24} style={{ color: lockEnabled ? 'var(--accent-salary)' : 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                  <h4 style={{ color: 'var(--text-dark)', fontWeight: '700', fontSize: '1rem' }}>Device Screen Lock</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-dark)', opacity: 0.9, lineHeight: '1.4' }}>
                    Require your phone's native lock screen (PIN, fingerprint, Face ID, pattern) to open the app.
                  </p>
                  
                  {!lockSupported ? (
                    <div style={{ 
                      marginTop: '8px',
                      background: 'var(--accent-ot-light)',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid rgba(243, 156, 18, 0.25)',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      color: 'var(--accent-ot)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <AlertTriangle size={14} />
                      <span>WebAuthn unavailable or requires HTTPS/localhost.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', width: '100%' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: lockEnabled ? 'var(--accent-salary)' : 'var(--text-muted)' }}>
                        {lockEnabled ? 'Lock Active' : 'Lock Disabled'}
                      </span>
                      <button
                        onClick={handleToggleLock}
                        disabled={lockLoading}
                        style={{
                          background: lockEnabled ? 'linear-gradient(135deg, #E74C3C, #C0392B)' : 'linear-gradient(135deg, #2ECC71, #27AE60)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '6px 14px',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                        }}
                      >
                        {lockLoading ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : lockEnabled ? (
                          'Disable Lock'
                        ) : (
                          'Enable Lock'
                        )}
                      </button>
                    </div>
                  )}
                </div>
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
