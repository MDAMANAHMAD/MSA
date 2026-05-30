import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import CategoryList from './components/CategoryList';
import AddDocument from './components/AddDocument';
import SettingsModal from './components/SettingsModal';

import { Info } from 'lucide-react';

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
    // Permanent production fallback to your live Render backend
    return 'https://msa-ozae.onrender.com';
  });

  // Visual Toast notifications
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
  };

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
