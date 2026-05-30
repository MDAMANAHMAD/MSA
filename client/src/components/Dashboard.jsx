import React, { useState, useEffect } from 'react';
import { Folder, DollarSign, Clock, Navigation, Cloud, AlertTriangle, ChevronRight } from 'lucide-react';

export default function Dashboard({ apiUrl, onCategoryClick, onSettingsClick }) {
  const [driveAuthorized, setDriveAuthorized] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(true);
  const [greeting, setGreeting] = useState('Assalamu Alaikum');

  useEffect(() => {
    // Determine dynamic Islamic greeting based on hour
    const hour = new Date().getHours();
    if (hour < 4) setGreeting('Assalamu Alaikum, Mr. Shakil');
    else if (hour < 12) setGreeting('Assalamu Alaikum, Good Morning');
    else if (hour < 16) setGreeting('Assalamu Alaikum, Good Afternoon');
    else setGreeting('Assalamu Alaikum, Good Evening');
  }, []);

  const checkDriveStatus = async () => {
    setLoadingDrive(true);
    try {
      const response = await fetch(`${apiUrl}/api/auth/status`);
      const data = await response.json();
      setDriveAuthorized(data.authorized);
    } catch (error) {
      console.error('Error checking Drive status:', error);
      setDriveAuthorized(false);
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
        </div>
        <div className="header-sub">Md Shakil Ahmad - Document Hub</div>
        <div className="header-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="app-content">
        
        {/* Google Drive Auth Status Banner */}
        {!loadingDrive && (
          driveAuthorized ? (
            <div className="status-card success" onClick={() => checkDriveStatus()}>
              <div className="status-card-icon">
                <Cloud size={20} style={{ color: 'var(--accent-salary)' }} />
              </div>
              <div className="status-card-text">
                <h4>Google Drive Active</h4>
                <p>Documents are automatically synced to the cloud!</p>
              </div>
            </div>
          ) : (
            <div className="status-card pending" onClick={handleLinkDrive}>
              <div className="status-card-icon">
                <AlertTriangle size={20} style={{ color: 'var(--accent-ot)' }} />
              </div>
              <div className="status-card-text" style={{ flex: 1 }}>
                <h4>Setup Google Drive Sync</h4>
                <p>Link your account to save files online securely.</p>
              </div>
              <ChevronRight size={18} />
            </div>
          )
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
        </div>



      </div>
    </div>
  );
}
