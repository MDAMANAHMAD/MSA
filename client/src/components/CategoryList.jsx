import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, FileText, Cloud, CloudOff, RefreshCw, Trash2, HelpCircle } from 'lucide-react';

export default function CategoryList({ category, apiUrl, onBack, onAddClick, showToast }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  // Long-press state management
  const [pressingId, setPressingId] = useState(null);
  const pressTimerRef = useRef(null);
  const touchMovedRef = useRef(false);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      let query = `?category=${category}`;
      if (month) query += `&month=${month}`;
      if (year) query += `&year=${year}`;

      const response = await fetch(`${apiUrl}/api/documents${query}`);
      if (!response.ok) throw new Error('Failed to load documents.');
      const data = await response.json();
      setDocuments(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not load documents. Please check server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [category, month, year, apiUrl]);

  // Handle PDF opening in a new tab
  const handleOpenPdf = (doc) => {
    const pdfUrl = `${apiUrl}/uploads/${pathBasename(doc.file_path)}`;
    window.open(pdfUrl, '_blank');
  };

  const pathBasename = (filepath) => {
    // Extracts filename from path (handling windows or unix slash)
    return filepath.replace(/\\/g, '/').split('/').pop();
  };

  // --- LONG-PRESS TRIGGER LOGIC ---
  const handleStartPress = (doc) => {
    // Only OT and Mileage support the Orange/Green received status toggle
    if (category !== 'ot' && category !== 'mileage') return;

    setPressingId(doc.id);
    touchMovedRef.current = false;

    // Start a 1.5-second timer
    pressTimerRef.current = setTimeout(() => {
      toggleReceivedStatus(doc);
      handleCancelPress(); // Clear pressing state
    }, 1500); // 1.5 seconds is the sweet spot for senior mobile holding without strain
  };

  const handleCancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setPressingId(null);
  };

  const handleTouchMove = () => {
    touchMovedRef.current = true;
    handleCancelPress();
  };

  const toggleReceivedStatus = async (doc) => {
    const newStatus = doc.is_received === 1 ? 0 : 1;
    try {
      const response = await fetch(`${apiUrl}/api/documents/${doc.id}/received`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_received: newStatus }),
      });

      if (!response.ok) throw new Error('Status update failed.');
      
      // Update local state
      setDocuments(prev =>
        prev.map(d => d.id === doc.id ? { ...d, is_received: newStatus } : d)
      );

      // Play tiny vibration if device supports it
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }

      showToast(newStatus === 1 ? '✓ Document Marked as Received!' : '⚠️ Document Marked as Pending');
    } catch (err) {
      console.error(err);
      showToast('Error updating status.');
    }
  };

  // Delete document handler
  const handleDeleteDoc = async (e, doc) => {
    e.stopPropagation(); // Avoid triggering open PDF or long press
    if (!window.confirm('Are you sure you want to delete this document from the device?')) return;

    try {
      const response = await fetch(`${apiUrl}/api/documents/${doc.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete.');

      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      showToast('Document deleted.');
    } catch (err) {
      console.error(err);
      showToast('Error deleting document.');
    }
  };

  // Google Drive Manual Sync retry
  const handleSyncRetry = async (e, doc) => {
    e.stopPropagation();
    showToast('Syncing to Google Drive...');
    try {
      const response = await fetch(`${apiUrl}/api/documents/${doc.id}/sync`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed.');

      // Update state
      setDocuments(prev =>
        prev.map(d => d.id === doc.id ? { ...d, google_drive_id: data.google_drive_id } : d)
      );
      showToast('✓ Synced to Google Drive successfully!');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Google Drive Sync failed.');
    }
  };

  const getCategoryTitle = () => {
    if (category === 'salary_slip') return 'Salary Slips';
    if (category === 'ot') return 'Overtime (OT)';
    if (category === 'mileage') return 'Mileage Records';
    return 'Documents';
  };

  const monthsList = [
    { value: '01', name: 'January' },
    { value: '02', name: 'February' },
    { value: '03', name: 'March' },
    { value: '04', name: 'April' },
    { value: '05', name: 'May' },
    { value: '06', name: 'June' },
    { value: '07', name: 'July' },
    { value: '08', name: 'August' },
    { value: '09', name: 'September' },
    { value: '10', name: 'October' },
    { value: '11', name: 'November' },
    { value: '12', name: 'December' },
  ];

  const yearsList = Array.from({ length: 41 }, (_, i) => String(2000 + i));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingBottom: '80px' }}>
      <div className="screen-header">
        <button className="action-btn" onClick={onBack}>
          <ArrowLeft size={24} />
        </button>
        <h2>{getCategoryTitle()}</h2>
      </div>

      <div className="app-content">
        
        {/* Filters */}
        <div className="filter-container">
          <select
            className="select-control"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="">All Months</option>
            {monthsList.map(m => (
              <option key={m.value} value={m.value}>{m.name}</option>
            ))}
          </select>

          <select
            className="select-control"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">All Years</option>
            {yearsList.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Info label for Long Press */}
        {(category === 'ot' || category === 'mileage') && documents.length > 0 && (
          <div className="long-press-hint">
            <HelpCircle size={14} /> Hold card down for 1.5s to toggle Orange/Green state.
          </div>
        )}

        {error && (
          <div className="preview-alert" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', borderColor: 'rgba(231,76,60,0.2)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} style={{ opacity: 0.3 }} />
            <p>No documents found</p>
            <span style={{ fontSize: '0.85rem' }}>Tap the orange "+" below to add one!</span>
          </div>
        ) : (
          <div className="document-list">
            {documents.map((doc) => {
              const isPressing = pressingId === doc.id;
              const isOtOrMileage = category === 'ot' || category === 'mileage';
              
              // Determine visual class based on receipt status
              const statusClass = doc.is_received === 1 ? 'received' : 'pending';
              
              return (
                <div
                  key={doc.id}
                  className={`document-card ${isOtOrMileage ? statusClass : ''} ${isPressing ? 'pressing' : ''}`}
                  onClick={() => handleOpenPdf(doc)}
                  onMouseDown={() => handleStartPress(doc)}
                  onMouseUp={handleCancelPress}
                  onMouseLeave={handleCancelPress}
                  onTouchStart={() => handleStartPress(doc)}
                  onTouchEnd={handleCancelPress}
                  onTouchMove={handleTouchMove}
                  onTouchCancel={handleCancelPress}
                >
                  <div className="document-card-left">
                    <div className="pdf-icon-wrapper">
                      <FileText size={22} />
                    </div>
                    <div className="document-meta">
                      <h4>{doc.file_name}</h4>
                      <p>{new Date(doc.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      
                      <div className="badge-row">
                        {isOtOrMileage && (
                          <span className={`badge ${doc.is_received === 1 ? 'received' : 'pending'}`}>
                            {doc.is_received === 1 ? 'Received' : 'Pending'}
                          </span>
                        )}

                        {category === 'salary_slip' && doc.amount > 0 && (
                          <span className="badge received">
                            ${doc.amount.toLocaleString()}
                          </span>
                        )}

                        {category === 'ot' && doc.hours > 0 && (
                          <span className="badge pending">
                            {doc.hours} Hours
                          </span>
                        )}

                        {category === 'mileage' && doc.miles > 0 && (
                          <span className="badge synced">
                            {doc.miles} Miles
                          </span>
                        )}

                        {doc.google_drive_id ? (
                          <span className="badge synced" title="Synced to Google Drive">
                            <Cloud size={10} /> Synced
                          </span>
                        ) : (
                          <span className="badge local" title="Saved locally only">
                            <CloudOff size={10} /> Local Only
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="document-actions">
                    {!doc.google_drive_id && (
                      <button
                        className="action-btn"
                        onClick={(e) => handleSyncRetry(e, doc)}
                        title="Upload to Google Drive now"
                      >
                        <RefreshCw size={18} />
                      </button>
                    )}
                    <button
                      className="action-btn delete"
                      onClick={(e) => handleDeleteDoc(e, doc)}
                      title="Delete from device"
                    >
                      <Trash2 size={18} style={{ color: 'var(--color-danger)' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button className="fab" onClick={onAddClick}>
        <Plus size={28} />
      </button>
    </div>
  );
}
