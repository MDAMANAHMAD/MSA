import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, FileText, Cloud, CloudOff, RefreshCw, Trash2, HelpCircle, Share2, Calendar, X } from 'lucide-react';

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

  // Edit Date State Management
  const [editingDoc, setEditingDoc] = useState(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editMonth, setEditMonth] = useState('01');
  const [editYear, setEditYear] = useState('2026');
  const [editFyStart, setEditFyStart] = useState('2026');

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

  // When focusing the year filter, if it is currently "All Years" (empty string),
  // instantly pre-select the current year so the mobile picker opens scrolled directly to it!
  const handleYearFocus = () => {
    if (year === '') {
      setYear(String(new Date().getFullYear()));
    }
  };

  // Handle PDF opening in a new tab
  const handleOpenPdf = (doc) => {
    const pdfUrl = `${apiUrl}/uploads/${pathBasename(doc.file_path)}`;
    window.open(pdfUrl, '_blank');
  };

  const pathBasename = (filepath) => {
    // Extracts filename from path (handling windows or unix slash)
    return filepath.replace(/\\/g, '/').split('/').pop();
  };

  const formatDateToDDMMYYYY = (dateStr) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  const formatDateToDDMMYYYY_NoTZ = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  const getOtRangePreview = (dateStr) => {
    try {
      const endDate = new Date(dateStr);
      if (isNaN(endDate.getTime())) return '';
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 13);

      const formatDateReadable = (d) => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}-${d.getFullYear()}`;
      };

      return `${formatDateReadable(startDate)} to ${formatDateReadable(endDate)} (14 Days)`;
    } catch (e) {
      return '';
    }
  };

  const handleEditDateClick = (e, doc) => {
    e.stopPropagation();
    setEditingDoc(doc);
    setEditDateValue(doc.date);
    
    const parts = doc.date.split('-');
    if (parts.length === 3) {
      setEditYear(parts[0]);
      setEditMonth(parts[1]);
      
      const docYr = parseInt(parts[0], 10);
      const docMth = parseInt(parts[1], 10);
      const fyStart = docMth >= 4 ? docYr : docYr - 1;
      setEditFyStart(String(fyStart));
    }
  };

  const handleSaveDate = async () => {
    if (!editingDoc) return;
    
    if (!window.confirm('Are you sure you want to update the date of this document? This will rename the file locally and on Google Drive.')) {
      return;
    }
    
    let newDate = editDateValue;
    if (category === 'salary_slip' || category === 'mileage') {
      newDate = `${editYear}-${editMonth}-01`;
    } else if (category === 'itr') {
      newDate = `${editFyStart}-04-01`;
    }
    
    setSavingEdit(true);
    try {
      const response = await fetch(`${apiUrl}/api/documents/${editingDoc.id}/date`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update date.');
      
      setDocuments(prev =>
        prev.map(d => d.id === editingDoc.id ? { 
          ...d, 
          date: data.document.date, 
          file_name: data.document.file_name,
          file_path: data.document.file_path
        } : d)
      );
      
      showToast('✓ Date updated successfully!');
      setEditingDoc(null);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Error updating date.');
    } finally {
      setSavingEdit(false);
    }
  };

  // --- LONG-PRESS TRIGGER LOGIC ---
  const handleStartPress = (doc) => {
    // Only OT supports the Orange/Green received status toggle
    if (category !== 'ot') return;

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

  // Share PDF document utilizing the native Web Share API
  const handleShareDoc = async (e, doc) => {
    e.stopPropagation(); // Avoid triggering standard PDF preview viewer
    const pdfUrl = `${apiUrl}/uploads/${pathBasename(doc.file_path)}`;
    
    if (!navigator.share) {
      // Direct Clipboard link copy fallback for unsupported desktop browsers
      try {
        await navigator.clipboard.writeText(pdfUrl);
        showToast('Link copied to clipboard! (Share not supported on this browser)');
      } catch (err) {
        showToast('Web sharing is not supported on this device.');
      }
      return;
    }

    showToast('Preparing document...');
    try {
      // Attempt to download the PDF as a Blob to share it as a real physical file object
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const file = new File([blob], doc.file_name, { type: 'application/pdf' });

      // Check if standard file sharing is allowed by OS/browser
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: doc.file_name,
          text: doc.file_name,
        });
      } else {
        // Fallback: share the direct cloud sync URL of the document
        await navigator.share({
          title: doc.file_name,
          text: `MSA Hub Document: ${doc.file_name}`,
          url: pdfUrl,
        });
      }
    } catch (err) {
      console.warn('Direct file attachment sharing failed, falling back to link sharing:', err.message);
      try {
        // Fallback link sharing
        await navigator.share({
          title: doc.file_name,
          text: `MSA Hub Document: ${doc.file_name}`,
          url: pdfUrl,
        });
      } catch (fallbackErr) {
        console.error('Sharing failed:', fallbackErr);
      }
    }
  };

  // Get a clean, human-friendly, short title for the document
  const getDocumentDisplayTitle = (doc) => {
    if (category === 'salary_slip' || category === 'mileage') {
      try {
        const d = new Date(doc.date);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); // e.g. "February 2026"
        }
      } catch (e) {}
    } else if (category === 'ot') {
      try {
        const endDate = new Date(doc.date);
        if (!isNaN(endDate.getTime())) {
          const startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - 13);
          
          const formatShort = (d) => {
            const day = String(d.getDate()).padStart(2, '0');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${day} ${months[d.getMonth()]}`;
          };
          
          const formatLong = (d) => {
            const day = String(d.getDate()).padStart(2, '0');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
          };
          
          return `${formatShort(startDate)} to ${formatLong(endDate)}`; // e.g. "17 May to 30 May 2026"
        }
      } catch (e) {}
    } else if (category === 'itr') {
      try {
        const cleanName = doc.file_name.replace(/\.pdf$/i, '');
        const parts = cleanName.split('_');
        const fyStr = parts[0]; // e.g. "25-2026"
        return `ITR Projection FY ${fyStr}`;
      } catch (e) {
        return 'ITR Projection';
      }
    }
    return doc.file_name;
  };

  const getCategoryTitle = () => {
    if (category === 'salary_slip') return 'Salary Slips';
    if (category === 'ot') return 'Overtime (OT)';
    if (category === 'mileage') return 'Mileage Records';
    if (category === 'itr') return 'ITR Projections';
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
            onFocus={handleYearFocus}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">All Years</option>
            {yearsList.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Total PDF count display */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 4px',
          marginBottom: '12px',
          fontSize: '0.85rem',
          fontWeight: '700',
          color: 'var(--text-muted)'
        }}>
          <span>Total PDFs: {documents.length}</span>
        </div>

        {/* Info label for Long Press */}
        {category === 'ot' && documents.length > 0 && (
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
              const isOt = category === 'ot';
              
              // Determine visual class based on receipt status
              const statusClass = doc.is_received === 1 ? 'received' : 'pending';
              
              return (
                <div
                  key={doc.id}
                  className={`document-card ${isOt ? statusClass : ''} ${isPressing ? 'pressing' : ''}`}
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
                      <h4>{getDocumentDisplayTitle(doc)}</h4>
                      <p>{formatDateToDDMMYYYY(doc.date)}</p>
                      
                      <div className="badge-row">
                        {isOt && (
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
                      className="action-btn"
                      onClick={(e) => handleShareDoc(e, doc)}
                      title="Share document"
                      style={{ color: 'var(--accent-mileage)' }}
                    >
                      <Share2 size={18} />
                    </button>
                    <button
                      className="action-btn"
                      onClick={(e) => handleEditDateClick(e, doc)}
                      title="Change date/period"
                      style={{ color: 'var(--accent-ot)' }}
                    >
                      <Calendar size={18} />
                    </button>
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

      {/* Date Edit Modal */}
      {editingDoc && (
        <div className="modal-overlay" onClick={() => setEditingDoc(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-dark)' }}>
                <Calendar size={22} style={{ color: 'var(--accent-ot)' }} />
                <span>Update Document Date</span>
              </h3>
              <button className="modal-close" onClick={() => setEditingDoc(null)} title="Close Modal">
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '600', wordBreak: 'break-all' }}>
                Editing: {editingDoc.file_name}
              </div>
              
              {/* Form Selectors depending on category */}
              
              {(category === 'salary_slip' || category === 'mileage') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>Select Period (Month & Year)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="select-control"
                      value={editMonth}
                      onChange={(e) => setEditMonth(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem' }}
                    >
                      {monthsList.map(m => (
                        <option key={m.value} value={m.value}>{m.name}</option>
                      ))}
                    </select>

                    <select
                      className="select-control"
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem' }}
                    >
                      {yearsList.filter(y => y !== '').map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {category === 'itr' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>Financial Year Range</label>
                  <select
                    className="select-control"
                    value={editFyStart}
                    onChange={(e) => setEditFyStart(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '0.82rem' }}
                  >
                    {Array.from({ length: 37 }, (_, i) => {
                      const start = 2004 + i;
                      const end = start + 1;
                      const shortStart = String(start).slice(-2);
                      return { value: String(start), label: `${shortStart} - ${end}` };
                    }).map(fy => (
                      <option key={fy.value} value={fy.value}>{fy.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {category === 'ot' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>Document Date</label>
                  <div style={{ position: 'relative', width: '100%', height: '52px' }}>
                    <div
                      className="input-control"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: '36px',
                        paddingRight: '10px',
                        fontSize: '0.82rem',
                        height: '52px',
                        cursor: 'pointer',
                        pointerEvents: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      {formatDateToDDMMYYYY_NoTZ(editDateValue)}
                    </div>
                    <input
                      type="date"
                      value={editDateValue}
                      onChange={(e) => setEditDateValue(e.target.value)}
                      required
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '52px',
                        opacity: 0,
                        cursor: 'pointer',
                        zIndex: 2
                      }}
                    />
                    <Calendar
                      size={16}
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '18px',
                        color: 'var(--text-muted)',
                        pointerEvents: 'none',
                        zIndex: 1
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent-ot)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--accent-ot-light)', padding: '6px 10px', borderRadius: '8px' }}>
                    <Calendar size={12} style={{ flexShrink: 0 }} />
                    <span>Cycle: {getOtRangePreview(editDateValue)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-large"
                  onClick={handleSaveDate}
                  disabled={savingEdit}
                  style={{ flex: 1, background: 'linear-gradient(135deg, #E67E22, #D35400)' }}
                >
                  {savingEdit ? 'Saving...' : 'Save Date'}
                </button>
                <button
                  type="button"
                  className="btn-large"
                  onClick={() => setEditingDoc(null)}
                  disabled={savingEdit}
                  style={{ flex: 1, background: '#E8E6E2', color: 'var(--text-dark)', boxShadow: 'none' }}
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
