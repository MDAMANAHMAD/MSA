import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import CategoryList from './components/CategoryList';
import AddDocument from './components/AddDocument';
import SettingsModal from './components/SettingsModal';

import { Info, Lock, Cloud, Loader2 } from 'lucide-react';

// Premium Glassmorphic Device Authorization Lock Screen
function DeviceLockScreen({ apiUrl, onAuthorize }) {
  const [loading, setLoading] = useState(false);

  const handleAuthorize = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/auth/url`);
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
        alert('Could not start Google Drive authorization. Please verify server connection.');
      }
    } catch (err) {
      console.error('Error fetching Auth URL:', err);
      setLoading(false);
      alert('Could not connect to the document server. Please try again.');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-cream)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px 20px',
      fontFamily: 'var(--font-main)'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '24px',
        padding: '35px 25px',
        boxShadow: 'var(--shadow-lg)',
        border: '1.5px solid var(--color-border)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px'
      }}>
        {/* Glowing Lock Logo Badge */}
        <div style={{
          position: 'relative',
          width: '76px',
          height: '76px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FF9F43, #FF5252)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 8px 24px rgba(255, 82, 82, 0.25)',
          marginBottom: '6px'
        }}>
          <Lock size={32} color="white" style={{ position: 'relative', zIndex: 2 }} />
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FF9F43, #FF5252)',
            filter: 'blur(12px)',
            opacity: 0.5,
            zIndex: 1
          }} />
        </div>

        {/* Branding & Status Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h2 style={{ color: 'var(--text-dark)', fontWeight: '700', fontSize: '1.5rem', letterSpacing: '-0.5px' }}>
            Device Authorization
          </h2>
          <span className="shining-name" style={{ fontSize: '1rem', fontWeight: '700' }}>
            Md Shakil Ahmad Document Hub
          </span>
        </div>

        {/* User security explanation card */}
        <p style={{
          fontSize: '0.88rem',
          color: 'var(--text-dark)',
          opacity: 0.9,
          lineHeight: '1.55',
          background: 'rgba(230, 126, 34, 0.05)',
          border: '1px dashed rgba(230, 126, 34, 0.25)',
          borderRadius: '16px',
          padding: '16px',
          margin: '0',
          fontWeight: '500',
          textAlign: 'center'
        }}>
          Assalamu Alaikum. This device is currently <strong>unauthorized</strong> to view the records. Please connect your Google Drive account to verify ownership and authorize this device.
        </p>

        {/* Premium Orange Action Button */}
        <button
          onClick={handleAuthorize}
          disabled={loading}
          className="btn-large"
          style={{
            background: 'linear-gradient(135deg, #E67E22, #D35400)',
            boxShadow: '0 4px 15px rgba(211, 84, 0, 0.25)',
            border: 'none',
            color: 'white',
            fontWeight: '700',
            fontSize: '1rem',
            padding: '14px 28px',
            borderRadius: '30px',
            cursor: 'pointer',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            transition: 'var(--transition-smooth)'
          }}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>Requesting Access...</span>
            </>
          ) : (
            <>
              <Cloud size={20} />
              <span>Authorize Device</span>
            </>
          )}
        </button>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
          🔒 Secure Device-Level Verification
        </span>
      </div>
    </div>
  );
}

export default function App() {
  // Navigation states: 'dashboard', 'list', 'add'
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedCategory, setSelectedCategory] = useState('salary_slip');
  const [showSettings, setShowSettings] = useState(false);

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

  // Track if this device has been authorized via stored localStorage tokens
  const [deviceAuthorized, setDeviceAuthorized] = useState(() => {
    return !!localStorage.getItem('msa_google_tokens');
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
        setDeviceAuthorized(true);
        showToast('Assalamu Alaikum. Device authorized successfully!');
        
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

  // If this device is unauthorized, block all operations and render DeviceLockScreen
  if (!deviceAuthorized) {
    return (
      <>
        <DeviceLockScreen apiUrl={apiUrl} />
        {toastVisible && (
          <div className="toast">
            <Info size={16} /> {toastMessage}
          </div>
        )}
      </>
    );
  }

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
    </>
  );
}

