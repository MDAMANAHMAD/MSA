import React, { useState, useEffect, useRef } from 'react';
import { FileText, ArrowLeft, Loader2, DollarSign, Clock, Navigation, CheckCircle, Trash2, Upload, AlertCircle, Calendar } from 'lucide-react';

export default function AddDocument({ category, apiUrl, onBack, onSaveSuccess }) {
  const [pdfFiles, setPdfFiles] = useState([]); // File queue: [{ file, id, status, error, month, year, otDate, fyStartYear, metric }]
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Month options list
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

  // Year options list (2004 to 2040) in ascending order
  const yearsList = Array.from({ length: 37 }, (_, i) => String(2004 + i));

  // Financial Year options list (2004 to 2040) in ascending order
  const fyList = Array.from({ length: 37 }, (_, i) => {
    const start = 2004 + i;
    const end = start + 1;
    const shortStart = String(start).slice(-2);
    return { value: String(start), label: `${shortStart} - ${end}` };
  });

  // Calculate default values based on current time
  const getDefaultState = (file) => {
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = String(now.getFullYear());
    const otDate = now.toISOString().split('T')[0];
    
    // Financial year start year calculation
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

    return {
      file,
      id: Math.random().toString(36).substring(2, 9),
      status: 'pending',
      error: '',
      month: currentMonth,
      year: currentYear,
      otDate: otDate,
      fyStartYear: String(fyStart),
      metric: ''
    };
  };

  // Helper to calculate OT range preview for a specific date
  const getOtRangePreview = (dateStr) => {
    try {
      const endDate = new Date(dateStr);
      if (isNaN(endDate.getTime())) return '';
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 13);

      const formatDateReadable = (d) => {
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
      };

      return `${formatDateReadable(startDate)} to ${formatDateReadable(endDate)} (14 Days)`;
    } catch (e) {
      return '';
    }
  };

  // Handle drag over the upload zone
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // Handle drag leaving the upload zone
  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Process standard file input selection or drop files
  const processSelectedFiles = (filesList) => {
    const files = Array.from(filesList);
    const validFiles = files.filter(file => {
      return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    });

    if (validFiles.length < files.length) {
      setError('Only PDF files are allowed! Non-PDF files were skipped.');
    }

    const newQueueItems = validFiles.map(file => getDefaultState(file));
    setPdfFiles(prev => [...prev, ...newQueueItems]);
  };

  // Handle drop event on the upload zone
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  // Handle file picker selection
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFiles(e.target.files);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const removeFileFromQueue = (id) => {
    setPdfFiles(prev => prev.filter(item => item.id !== id));
  };

  const clearQueue = () => {
    setPdfFiles([]);
    setError('');
  };

  // Update specific metadata on an individual queue item
  const updateQueueItem = (id, fields) => {
    setPdfFiles(prev =>
      prev.map(item => item.id === id ? { ...item, ...fields } : item)
    );
  };

  // Handle sequential upload submission (one by one)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pdfFiles.length === 0) {
      setError('Please select or drag & drop at least one PDF file.');
      return;
    }

    setLoading(true);
    setError('');

    let successCount = 0;
    let failCount = 0;

    try {
      // Loop through files sequentially (one-by-one)
      for (let i = 0; i < pdfFiles.length; i++) {
        const item = pdfFiles[i];
        if (item.status === 'completed') {
          successCount++;
          continue; // Skip already successfully uploaded files
        }

        // Mark the current file as uploading
        setPdfFiles(prev =>
          prev.map(f => f.id === item.id ? { ...f, status: 'uploading' } : f)
        );

        console.log(`[MSA Hub] Uploading file ${i + 1}/${pdfFiles.length}: "${item.file.name}"...`);

        // Reconstruct standard YYYY-MM-DD date based on category
        let uploadDate = '';
        if (category === 'salary_slip' || category === 'mileage') {
          uploadDate = `${item.year}-${item.month}-01`;
        } else if (category === 'itr') {
          uploadDate = `${item.fyStartYear}-04-01`; // Store April 1st of starting financial year
        } else {
          // Overtime (OT) uses exact date
          uploadDate = item.otDate;
        }

        const formData = new FormData();
        formData.append('pdf', item.file);
        formData.append('category', category);
        formData.append('date', uploadDate);

        if (category === 'salary_slip') formData.append('amount', item.metric || 0);
        if (category === 'ot') formData.append('hours', item.metric || 0);
        if (category === 'mileage') formData.append('miles', item.metric || 0);

        // AbortController timeout of 35 seconds per request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        try {
          const response = await fetch(`${apiUrl}/api/documents/upload`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Server upload failed.');
          }

          console.log(`[MSA Hub] Upload successful for: "${item.file.name}"`);

          // Mark the current file as completed
          setPdfFiles(prev =>
            prev.map(f => f.id === item.id ? { ...f, status: 'completed' } : f)
          );
          successCount++;
        } catch (err) {
          clearTimeout(timeoutId);
          const errorMsg = err.name === 'AbortError' ? 'Upload timed out (35s).' : err.message;
          console.error(`[MSA Hub] Upload failed for "${item.file.name}":`, errorMsg);
          
          // Mark the current file as failed
          setPdfFiles(prev =>
            prev.map(f => f.id === item.id ? { ...f, status: 'failed', error: errorMsg || 'Upload failed' } : f)
          );
          failCount++;
        }
      }

      if (failCount === 0) {
        onSaveSuccess(
          pdfFiles.length > 1
            ? `✓ Successfully saved and synced all ${successCount} documents to Google Drive!`
            : '✓ Document uploaded and synced successfully!'
        );
      } else {
        setError(`Batch complete: Saved ${successCount} successfully, but ${failCount} failed. Please check individual file errors below.`);
      }
    } catch (globalErr) {
      console.error('[MSA Hub] Global batch upload error:', globalErr);
      setError(`An unexpected error occurred during batch upload: ${globalErr.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryTitle = () => {
    if (category === 'salary_slip') return 'Salary Slips';
    if (category === 'ot') return 'Overtime (OT)';
    if (category === 'mileage') return 'Mileage';
    if (category === 'itr') return 'ITR Projections';
    return 'Documents';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingBottom: '80px' }}>
      <div className="screen-header">
        <button className="action-btn" onClick={onBack}>
          <ArrowLeft size={24} />
        </button>
        <h2>Add {getCategoryTitle()}</h2>
      </div>

      <div className="app-content">
        {error && (
          <div className="preview-alert" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', borderColor: 'rgba(231,76,60,0.2)', marginBottom: '15px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Unified Drag & Drop / File Select Box */}
          <div className="form-group">
            <label>Select or Drag & Drop PDF Documents</label>
            <input
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
            />
            
            <div
              className={`file-upload-box ${isDragging ? 'dragging' : ''} ${pdfFiles.length > 0 ? 'selected' : ''}`}
              onClick={triggerFileSelect}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ minHeight: '140px', justifyContent: 'center' }}
            >
              {pdfFiles.length > 0 ? (
                <>
                  <CheckCircle size={44} style={{ color: '#27AE60' }} />
                  <p style={{ color: '#27AE60', margin: 0 }}>PDFs Added!</p>
                  <span style={{ fontWeight: '500', color: '#27AE60', fontSize: '0.82rem' }}>
                    {pdfFiles.length} file(s) in queue. Adjust settings below, or tap here to add more.
                  </span>
                </>
              ) : (
                <>
                  <Upload size={44} style={{ color: 'var(--text-muted)', opacity: 0.8 }} />
                  <p style={{ margin: 0 }}>Tap or Drag & Drop PDFs here</p>
                  <span style={{ fontSize: '0.8rem' }}>Multiple selection supported (PDF only)</span>
                </>
              )}
            </div>
          </div>

          {/* Interactive Batch Queue List with Individual Settings */}
          {pdfFiles.length > 0 && (
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>
                  Upload Settings per Document
                </span>
                {!loading && (
                  <button
                    type="button"
                    onClick={clearQueue}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-danger)',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Trash2 size={12} /> Clear Queue
                  </button>
                )}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {pdfFiles.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '14px',
                      borderRadius: '16px',
                      backgroundColor: 'white',
                      border: '1px solid var(--color-border)',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'all 0.2s ease',
                      gap: '12px'
                    }}
                  >
                    {/* Header Row: File Details & Status */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                        <FileText size={18} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: '700', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px', color: 'var(--text-dark)' }}>
                            {item.file.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {item.status === 'pending' && (
                          <span className="badge local" style={{ fontSize: '0.7rem', padding: '3px 8px' }}>Pending</span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="badge pending" style={{ fontSize: '0.7rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Loader2 size={10} className="animate-spin" /> uploading...
                          </span>
                        )}
                        {item.status === 'completed' && (
                          <span className="badge synced" style={{ fontSize: '0.7rem', padding: '3px 8px' }}>✓ Saved</span>
                        )}
                        {item.status === 'failed' && (
                          <span 
                            className="badge local" 
                            style={{ 
                              fontSize: '0.7rem', 
                              padding: '3px 8px', 
                              backgroundColor: 'var(--color-danger-light)', 
                              color: 'var(--color-danger)', 
                              border: 'none',
                              cursor: 'help'
                            }} 
                            title={item.error}
                          >
                            Failed
                          </span>
                        )}

                        {/* Remove from queue button */}
                        {!loading && item.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => removeFileFromQueue(item.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.85rem'
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Interactive Form Settings Block per File */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
                      
                      {/* 1. Date/Period Selectors */}
                      
                      {/* For Salary Slip & Mileage: Select Month and Year only */}
                      {(category === 'salary_slip' || category === 'mileage') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Period (Month & Year)</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              className="select-control"
                              value={item.month}
                              onChange={(e) => updateQueueItem(item.id, { month: e.target.value })}
                              style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem', height: 'auto', minHeight: 'auto' }}
                              disabled={loading || item.status === 'completed'}
                            >
                              {monthsList.map(m => (
                                <option key={m.value} value={m.value}>{m.name}</option>
                              ))}
                            </select>

                            <select
                              className="select-control"
                              value={item.year}
                              onChange={(e) => updateQueueItem(item.id, { year: e.target.value })}
                              style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem', height: 'auto', minHeight: 'auto' }}
                              disabled={loading || item.status === 'completed'}
                            >
                              {yearsList.map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* For ITR Projections: Select Year Range only (e.g. 25 - 2026) */}
                      {category === 'itr' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Financial Year Range</label>
                          <select
                            className="select-control"
                            value={item.fyStartYear}
                            onChange={(e) => updateQueueItem(item.id, { fyStartYear: e.target.value })}
                            style={{ padding: '8px 10px', fontSize: '0.82rem', height: 'auto', minHeight: 'auto' }}
                            disabled={loading || item.status === 'completed'}
                          >
                            {fyList.map(fy => (
                              <option key={fy.value} value={fy.value}>{fy.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* For Overtime (OT): Select exact calendar Date */}
                      {category === 'ot' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Document Date</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="date"
                              className="input-control"
                              value={item.otDate}
                              onChange={(e) => updateQueueItem(item.id, { otDate: e.target.value })}
                              required
                              style={{ paddingLeft: '36px', paddingRight: '10px', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.82rem', minHeight: 'auto' }}
                              disabled={loading || item.status === 'completed'}
                            />
                            <Calendar
                              size={16}
                              style={{
                                position: 'absolute',
                                left: '10px',
                                top: '10px',
                                color: 'var(--text-muted)'
                              }}
                            />
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--accent-ot)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--accent-ot-light)', padding: '6px 10px', borderRadius: '8px' }}>
                            <Calendar size={12} style={{ flexShrink: 0 }} />
                            <span>Cycle: {getOtRangePreview(item.otDate)}</span>
                          </div>
                        </div>
                      )}

                      {/* 2. Dynamic Metric Numeric Input per File */}
                      
                      {category === 'salary_slip' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Net Salary Amount (Optional)</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              step="any"
                              pattern="[0-9]*"
                              inputMode="decimal"
                              className="input-control"
                              placeholder="Enter amount"
                              value={item.metric}
                              onChange={(e) => updateQueueItem(item.id, { metric: e.target.value })}
                              style={{ paddingLeft: '36px', paddingRight: '10px', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.82rem', minHeight: 'auto' }}
                              disabled={loading || item.status === 'completed'}
                            />
                            <DollarSign
                              size={16}
                              style={{
                                position: 'absolute',
                                left: '10px',
                                top: '10px',
                                color: 'var(--text-muted)'
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {category === 'ot' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Overtime Hours (Optional)</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              step="any"
                              pattern="[0-9]*"
                              inputMode="decimal"
                              className="input-control"
                              placeholder="Enter hours (e.g. 8.5)"
                              value={item.metric}
                              onChange={(e) => updateQueueItem(item.id, { metric: e.target.value })}
                              style={{ paddingLeft: '36px', paddingRight: '10px', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.82rem', minHeight: 'auto' }}
                              disabled={loading || item.status === 'completed'}
                            />
                            <Clock
                              size={16}
                              style={{
                                position: 'absolute',
                                left: '10px',
                                top: '10px',
                                color: 'var(--text-muted)'
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {category === 'mileage' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Miles Driven (Optional)</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              step="any"
                              pattern="[0-9]*"
                              inputMode="decimal"
                              className="input-control"
                              placeholder="Enter miles (e.g. 120)"
                              value={item.metric}
                              onChange={(e) => updateQueueItem(item.id, { metric: e.target.value })}
                              style={{ paddingLeft: '36px', paddingRight: '10px', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.82rem', minHeight: 'auto' }}
                              disabled={loading || item.status === 'completed'}
                            />
                            <Navigation
                              size={16}
                              style={{
                                position: 'absolute',
                                left: '10px',
                                top: '10px',
                                color: 'var(--text-muted)'
                              }}
                            />
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button type="submit" className="btn-large" disabled={loading || pdfFiles.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Saving & Syncing...
                </>
              ) : (
                pdfFiles.length > 1 ? `Save Documents (${pdfFiles.length} Files)` : 'Save Document'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
