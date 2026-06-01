import React, { useState, useEffect } from 'react';
import { Settings, Folder, DollarSign, Clock, Navigation, Cloud, AlertTriangle, ChevronRight, CloudOff, RefreshCw } from 'lucide-react';

export default function Dashboard({ apiUrl, onCategoryClick, onSettingsClick }) {
  const [driveAuthorized, setDriveAuthorized] = useState(false);
  const [driveEmail, setDriveEmail] = useState('');
  const [loadingDrive, setLoadingDrive] = useState(true);
  const [greeting, setGreeting] = useState('Welcome Back');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    // Dynamic secular respected greetings based on hour
    const hour = new Date().getHours();
    if (hour < 4) setGreeting('🌙 Good Night');
    else if (hour < 12) setGreeting('☀️ Good Morning');
    else if (hour < 17) setGreeting('🌤️ Good Afternoon');
    else if (hour < 21) setGreeting('🌆 Good Evening');
    else setGreeting('🌙 Good Night');
  }, []);

  // Listen for standard browser online/offline connectivity events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkDriveStatus(); // Re-verify cloud connection when internet restores!
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [apiUrl]);

  const checkDriveStatus = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      setLoadingDrive(false);
      return;
    }

    setLoadingDrive(true);
    try {
      const response = await fetch(`${apiUrl}/api/auth/status`);
      const data = await response.json();
      setApiError(false); // Reset error status on successful response
      
      if (data.authorized) {
        setDriveAuthorized(true);
        setDriveEmail(data.email || '');
        
        // Backup the active connection tokens inside browser's localStorage
        try {
          const exportResponse = await fetch(`${apiUrl}/api/auth/export`);
          if (exportResponse.ok) {
            const exportData = await exportResponse.json();
            if (exportData.tokens) {
              localStorage.setItem('msa_google_tokens', JSON.stringify(exportData.tokens));
            }
          }
        } catch (exportErr) {
          console.error('Failed to backup Google Drive connection locally:', exportErr);
        }
      } else {
        // If server database wiped out but browser holds backup tokens, self-heal the login instantly!
        const savedTokens = localStorage.getItem('msa_google_tokens');
        if (savedTokens) {
          try {
            console.log('Self-healing cloud connection from browser backup...');
            const importResponse = await fetch(`${apiUrl}/api/auth/import`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens: JSON.parse(savedTokens) })
            });
            if (importResponse.ok) {
              // Successfully self-healed connection, query status again!
              const retryResponse = await fetch(`${apiUrl}/api/auth/status`);
              const retryData = await retryResponse.json();
              setDriveAuthorized(retryData.authorized);
              setDriveEmail(retryData.email || '');
              return;
            }
          } catch (importErr) {
            console.error('Auto-healing connection failed:', importErr);
          }
        }
        
        setDriveAuthorized(false);
        setDriveEmail('');
      }
    } catch (error) {
      console.error('Error checking Drive status:', error);
      setDriveAuthorized(false);
      setDriveEmail('');
      setApiError(true); // Flag server connection error
    } finally {
      setLoadingDrive(false);
    }
  };

  useEffect(() => {
    checkDriveStatus();
  }, [apiUrl]);

  const handleLinkDrive = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/url`);
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url; // Redirect to Google OAuth consent
      }
    } catch (error) {
      console.error('Error fetching Auth URL:', error);
      alert('Could not start Google Drive authentication. Check connection.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {/* App Header Banner */}
      <div className="app-header">
        <div className="header-top">
          <div className="header-greeting">{greeting}</div>
          <button className="btn-icon" onClick={onSettingsClick} title="Open Settings">
            <Settings size={22} />
          </button>
        </div>
        <div className="header-sub">
          <span className="shining-name-header" style={{ fontSize: '1.05rem' }}>
            Md Shakil Ahmad
          </span>
          {' '}- Document Hub
        </div>
        <div className="header-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="app-content">
        
        {/* Google Drive Auth Status Banner */}
        {!isOnline || apiError ? (
          <div className="status-card danger" style={{ cursor: 'default' }}>
            <div className="status-card-icon">
              <CloudOff size={20} style={{ color: 'var(--color-danger)' }} />
            </div>
            <div className="status-card-text">
              <h4>Offline Mode</h4>
              <p>Check your internet or server connection.</p>
            </div>
          </div>
        ) : loadingDrive ? (
          <div className="status-card pending" style={{ cursor: 'default' }}>
            <div className="status-card-icon">
              <RefreshCw className="animate-spin" size={20} style={{ color: 'var(--accent-ot)' }} />
            </div>
            <div className="status-card-text">
              <h4>Checking Cloud Status...</h4>
              <p>Verifying Google Drive connection...</p>
            </div>
          </div>
        ) : driveAuthorized ? (
          <div className="status-card success" onClick={onSettingsClick}>
            <div className="status-card-icon">
              <Cloud size={20} style={{ color: 'var(--accent-salary)' }} />
            </div>
            <div className="status-card-text">
              <h4>Google Drive Active</h4>
              <p style={{ fontSize: '0.8rem', opacity: 0.9, fontWeight: 'bold', wordBreak: 'break-all' }}>
                {driveEmail || 'Connected to cloud storage'}
              </p>
            </div>
          </div>
        ) : (
          <div className="status-card pending" onClick={onSettingsClick}>
            <div className="status-card-icon">
              <AlertTriangle size={20} style={{ color: 'var(--accent-ot)' }} />
            </div>
            <div className="status-card-text" style={{ flex: 1 }}>
              <h4>Setup Google Drive Sync</h4>
              <p>Link your account to save files online securely.</p>
            </div>
            <ChevronRight size={18} />
          </div>
        )}

        {/* 3 Core Category Folders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          <h3 className="categories-title">Your Document Folders</h3>

          {/* Salary Slips Folder */}
          <div className="category-card salary" onClick={() => onCategoryClick('salary_slip')}>
            <div className="category-info">
              <div className="category-icon-wrapper">
                <Folder size={26} />
              </div>
              <div className="category-details">
                <h3>Salary Slips</h3>
                <p>View salary documentation</p>
              </div>
            </div>
            <ChevronRight className="arrow-icon" size={20} />
          </div>

          {/* Overtime Folder */}
          <div className="category-card ot" onClick={() => onCategoryClick('ot')}>
            <div className="category-info">
              <div className="category-icon-wrapper">
                <Folder size={26} />
              </div>
              <div className="category-details">
                <h3>Overtime (OT)</h3>
                <p>Manage OT hour cycles</p>
              </div>
            </div>
            <ChevronRight className="arrow-icon" size={20} />
          </div>

          {/* Mileage Folder */}
          <div className="category-card mileage" onClick={() => onCategoryClick('mileage')}>
            <div className="category-info">
              <div className="category-icon-wrapper">
                <Folder size={26} />
              </div>
              <div className="category-details">
                <h3>Mileage Records</h3>
                <p>Track driving mileage slips</p>
              </div>
            </div>
            <ChevronRight className="arrow-icon" size={20} />
          </div>

          {/* ITR Projections Folder */}
          <div className="category-card itr" onClick={() => onCategoryClick('itr')}>
            <div className="category-info">
              <div className="category-icon-wrapper">
                <Folder size={26} />
              </div>
              <div className="category-details">
                <h3>ITR Projections</h3>
                <p>Manage ITR Projection PDFs</p>
              </div>
            </div>
            <ChevronRight className="arrow-icon" size={20} />
          </div>

          {/* Designed & Developed Credit */}
          <div style={{ 
            textAlign: 'center', 
            fontSize: '0.75rem', 
            color: 'var(--text-muted)', 
            padding: '12px 0 0 0', 
            fontWeight: '600',
            letterSpacing: '0.3px',
            borderTop: '1px solid var(--color-border)',
            marginTop: '6px',
            opacity: 0.8
          }}>
            Designed & Developed with <span style={{ color: '#E74C3C', fontSize: '0.85rem' }}>♥</span> by{' '}
            <span className="shining-name" style={{ fontSize: '0.8rem' }}>
              Md Aman Ahmad
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
