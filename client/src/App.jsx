import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import CategoryList from './components/CategoryList';
import AddDocument from './components/AddDocument';
import SettingsModal from './components/SettingsModal';

import { Info, Lock, Fingerprint, Loader2 } from 'lucide-react';
import { verifyDeviceCredential } from './utils/webauthn';

export default function App() {
  // Navigation states: 'dashboard', 'list', 'add'
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedCategory, setSelectedCategory] = useState('salary_slip');
  const [showSettings, setShowSettings] = useState(false);

  // App Lock security states
  const [isLocked, setIsLocked] = useState(() => {
    return localStorage.getItem('msa_lock_enabled') === 'true';
  });
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleUnlock = useCallback(async () => {
    const isLockEnabled = localStorage.getItem('msa_lock_enabled') === 'true';
    if (!isLockEnabled) {
      setIsLocked(false);
      return;
    }
    
    const credentialId = localStorage.getItem('msa_lock_credential_id');
    if (!credentialId) {
      localStorage.removeItem('msa_lock_enabled');
      setIsLocked(false);
      return;
    }

    setIsAuthenticating(true);
    setAuthError('');
    try {
      const success = await verifyDeviceCredential(credentialId);
      if (success) {
        setIsLocked(false);
      } else {
        setAuthError('Authentication failed.');
      }
    } catch (err) {
      console.error('Unlock error:', err);
      setAuthError(err.message || 'Verification cancelled.');
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  // Trigger unlock prompt automatically on mount if app is locked
  useEffect(() => {
    if (isLocked) {
      const timer = setTimeout(() => {
        handleUnlock();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLocked, handleUnlock]);

  // Handle auto-locking on returning from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isLockEnabled = localStorage.getItem('msa_lock_enabled') === 'true';
      if (!isLockEnabled) return;

      if (document.visibilityState === 'visible') {
        setIsLocked(prev => {
          if (!prev) {
            setTimeout(() => {
              handleUnlock();
            }, 300);
            return true;
          }
          return prev;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleUnlock]);

  // Settings base API Url state
  const [apiUrl, setApiUrl] = useState(() => {
    const saved = localStorage.getItem('msa_api_url');
    if (saved) return saved;
    
    // If running locally in development, default to local server port 5000
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    // Permanent production fallback to Render backend
    return 'https://msa-ozae.onrender.com';
  });


  // Visual Toast notifications
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  // 1. Intercept url tokens parameter on startup to approve device authorization
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokensParam = params.get('auth_tokens');
    if (tokensParam) {
      try {
        const parsedTokens = JSON.parse(decodeURIComponent(tokensParam));
        
        // Write tokens locally inside browser storage to authorize this device forever
        localStorage.setItem('msa_google_tokens', JSON.stringify(parsedTokens));
        showToast('Welcome! Google Drive connected successfully!');
        
        // Instantly wipe tokens query parameter from window location cleanly
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);

        // Self-heal and sync the backend database instantly with authorized tokens
        fetch(`${apiUrl}/api/auth/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: parsedTokens })
        })
        .then(res => res.json())
        .then(data => {
          console.log('Self-healing verification callback success:', data.message);
        })
        .catch(err => {
          console.error('Self-healing import on load failed:', err.message);
        });

      } catch (err) {
        console.error('Failed to parse redirected authorization tokens:', err);
        showToast('Device authorization failed. Please try again.');
      }
    }
  }, [apiUrl]);

  // 2. Force scroll coordination alignment to absolute top on view or category switch
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentView, selectedCategory]);

  useEffect(() => {
    if (toastVisible) {
      const timer = setTimeout(() => {
        setToastVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastVisible]);

  useEffect(() => {
    // Initialize standard browser history states to map mobile physical back actions
    window.history.replaceState({ view: 'dashboard' }, '', '#dashboard');

    const handlePopState = (event) => {
      if (event.state && event.state.view) {
        setCurrentView(event.state.view);
      } else {
        setCurrentView('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setCurrentView('list');
    window.history.pushState({ view: 'list' }, '', '#list');
  };

  const handleAddSuccess = (message) => {
    setCurrentView('list');
    window.history.replaceState({ view: 'list' }, '', '#list');
    showToast(message);
  };


  // Normal Authorized Device Flow
  return (
    <>
      {currentView === 'dashboard' && (
        <Dashboard
          apiUrl={apiUrl}
          onCategoryClick={handleCategorySelect}
          onSettingsClick={() => setShowSettings(true)}
        />
      )}

      {currentView === 'list' && (
        <CategoryList
          category={selectedCategory}
          apiUrl={apiUrl}
          onBack={() => window.history.back()}
          onAddClick={() => {
            setCurrentView('add');
            window.history.pushState({ view: 'add' }, '', '#add');
          }}
          showToast={showToast}
        />
      )}

      {currentView === 'add' && (
        <AddDocument
          category={selectedCategory}
          apiUrl={apiUrl}
          onBack={() => window.history.back()}
          onSaveSuccess={handleAddSuccess}
        />
      )}

      {showSettings && (
        <SettingsModal
          apiUrl={apiUrl}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Floating Status Toast HUD */}
      {toastVisible && (
        <div className="toast">
          <Info size={16} /> {toastMessage}
        </div>
      )}

      {/* App Lock Screen Overlay */}
      {isLocked && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(250, 248, 245, 0.75)', // Glass effect matching bg-cream
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'var(--font-main)'
        }}>
          {/* Glowing lock sphere */}
          <div className="lock-sphere" style={{
            position: 'relative',
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'rgba(44, 62, 80, 0.05)',
            border: '1.5px solid rgba(44, 62, 80, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '28px',
            boxShadow: '0 8px 32px rgba(44, 62, 80, 0.05)'
          }}>
            <Lock size={40} style={{ color: 'var(--text-dark)' }} />
          </div>

          <h2 style={{
            color: 'var(--text-dark)',
            fontWeight: '700',
            fontSize: '1.6rem',
            marginBottom: '10px',
            letterSpacing: '-0.5px'
          }}>
            Application Locked
          </h2>
          
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '0.95rem',
            lineHeight: '1.5',
            maxWidth: '280px',
            marginBottom: '36px',
            fontWeight: '500'
          }}>
            Authenticate using your phone's screen lock to access your documents.
          </p>

          <button
            onClick={handleUnlock}
            disabled={isAuthenticating}
            style={{
              background: 'linear-gradient(135deg, #2C3E50, #1A252F)',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              padding: '16px 28px',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 24px rgba(44, 62, 80, 0.2)',
              transition: 'transform 0.2s ease, opacity 0.2s ease',
              width: '100%',
              maxWidth: '280px',
              justifyContent: 'center'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Fingerprint size={20} />
                <span>Unlock App</span>
              </>
            )}
          </button>

          {authError && (
            <p style={{
              color: 'var(--color-danger)',
              fontSize: '0.85rem',
              fontWeight: '600',
              marginTop: '20px',
              background: 'var(--color-danger-light)',
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(231, 76, 60, 0.15)',
              maxWidth: '280px'
            }}>
              {authError}
            </p>
          )}
        </div>
      )}
    </>
  );
}

