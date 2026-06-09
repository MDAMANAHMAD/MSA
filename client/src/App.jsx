import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import CategoryList from './components/CategoryList';
import AddDocument from './components/AddDocument';
import SettingsModal from './components/SettingsModal';

import { Info, Lock } from 'lucide-react';

export default function App() {
  // Navigation states: 'dashboard', 'list', 'add'
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedCategory, setSelectedCategory] = useState('salary_slip');
  const [showSettings, setShowSettings] = useState(false);

  // App Lock security states (fixed passcode lock '2004')
  const [isLocked, setIsLocked] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleDigitClick = (digit) => {
    if (passcode.length >= 4 || isShaking) return;
    
    const newPasscode = passcode + digit;
    setPasscode(newPasscode);

    if (newPasscode.length === 4) {
      if (newPasscode === '2004') {
        // Unlock app
        setTimeout(() => {
          setIsLocked(false);
          setPasscode('');

          // Auto-sync/self-heal Google Drive immediately in the background
          const savedTokens = localStorage.getItem('msa_google_tokens');
          if (savedTokens) {
            fetch(`${apiUrl}/api/auth/import`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens: JSON.parse(savedTokens) })
            })
            .then(res => {
              if (res.ok) {
                showToast('Google Drive synced successfully!');
              }
            })
            .catch(err => {
              console.error('Failed to auto-sync Google Drive on unlock:', err);
            });
          }
        }, 150);
      } else {
        // Wrong passcode: trigger shake feedback
        setTimeout(() => {
          setIsShaking(true);
          if (navigator.vibrate) {
            navigator.vibrate(100);
          }
          setTimeout(() => {
            setIsShaking(false);
            setPasscode('');
          }, 400);
        }, 150);
      }
    }
  };

  const handleBackspace = () => {
    if (isShaking) return;
    setPasscode(prev => prev.slice(0, -1));
  };

  // Lock the app whenever returning from background/screen lock
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsLocked(true);
        setPasscode('');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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
        <div className="lockscreen-overlay">
          {/* Pulsating Lock Sphere */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(44, 62, 80, 0.05)',
            border: '1.5px solid rgba(44, 62, 80, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            boxShadow: '0 8px 32px rgba(44, 62, 80, 0.05)'
          }}>
            <Lock size={32} style={{ color: 'var(--text-dark)' }} />
          </div>

          <h2 className="lockscreen-title">Enter Passcode</h2>
          <p className="lockscreen-subtitle">Your Document Hub is locked</p>

          {/* Dots Indicator */}
          <div className={`passcode-dots ${isShaking ? 'shake-anim' : ''}`}>
            <div className={`passcode-dot ${passcode.length >= 1 ? 'filled' : ''}`} />
            <div className={`passcode-dot ${passcode.length >= 2 ? 'filled' : ''}`} />
            <div className={`passcode-dot ${passcode.length >= 3 ? 'filled' : ''}`} />
            <div className={`passcode-dot ${passcode.length >= 4 ? 'filled' : ''}`} />
          </div>

          {/* Custom Phone Numeric Keypad Grid */}
          <div className="keypad-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button 
                key={num} 
                className="keypad-btn" 
                onClick={() => handleDigitClick(num.toString())}
              >
                {num}
              </button>
            ))}
            <div className="keypad-btn empty" />
            <button 
              className="keypad-btn" 
              onClick={() => handleDigitClick('0')}
            >
              0
            </button>
            <button 
              className="keypad-btn action" 
              onClick={handleBackspace}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </>
  );
}

