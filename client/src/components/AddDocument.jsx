import React, { useState, useEffect, useRef } from 'react';
import { Calendar, FileText, ArrowLeft, Loader2, DollarSign, Clock, Navigation, CheckCircle, Trash2, Upload, AlertCircle } from 'lucide-react';

export default function AddDocument({ category, apiUrl, onBack, onSaveSuccess }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pdfFiles, setPdfFiles] = useState([]); // File queue: [{ file, id, status: 'pending'|'uploading'|'completed'|'failed', error: '' }]
  const [metricValue, setMetricValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Auto 15-day calculation details (only for Overtime OT)
  const [rangePreview, setRangePreview] = useState('');

  useEffect(() => {
    if (category === 'ot') {
      try {
        const endDate = new Date(date);
        if (!isNaN(endDate.getTime())) {
          const startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - 13);

          const formatDateReadable = (d) => {
            const options = { day: '2-digit', month: 'short', year: 'numeric' };
            return d.toLocaleDateString('en-GB', options);
          };

          setRangePreview(`Automatically calculated cycle period:\n${formatDateReadable(startDate)} to ${formatDateReadable(endDate)} (14 Days)`);
        }
      } catch (err) {
        setRangePreview('');
      }
    } else {
      setRangePreview('');
    }
  }, [date, category]);

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

    const newQueueItems = validFiles.map(file => ({
      file,
      id: Math.random().toString(36).substring(2, 9),
      status: 'pending',
      error: ''
    }));

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

      const formData = new FormData();
      formData.append('pdf', item.file);
      formData.append('category', category);
      formData.append('date', date);

      if (category === 'salary_slip') formData.append('amount', metricValue || 0);
      if (category === 'ot') formData.append('hours', metricValue || 0);
      if (category === 'mileage') formData.append('miles', metricValue || 0);

      try {
        const response = await fetch(`${apiUrl}/api/documents/upload`, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Server upload failed.');
        }

        // Mark the current file as completed
        setPdfFiles(prev =>
          prev.map(f => f.id === item.id ? { ...f, status: 'completed' } : f)
        );
        successCount++;
      } catch (err) {
        console.error('File upload failed:', err.message);
        // Mark the current file as failed
        setPdfFiles(prev =>
          prev.map(f => f.id === item.id ? { ...f, status: 'failed', error: err.message || 'Upload failed' } : f)
        );
        failCount++;
      }
    }

    setLoading(false);

    if (failCount === 0) {
      onSaveSuccess(
        pdfFiles.length > 1
          ? `✓ Successfully saved and synced all ${successCount} documents to Google Drive!`
          : '✓ Document uploaded and synced successfully!'
      );
    } else {
      setError(`Batch complete: Saved ${successCount} successfully, but ${failCount} failed. Please check individual file errors below.`);
    }
  };

  const getCategoryTitle = () => {
    if (category === 'salary_slip') return 'Salary Slip';
    if (category === 'ot') return 'Overtime (OT)';
    if (category === 'mileage') return 'Mileage';
    if (category === 'itr') return 'ITR Projection';
    return 'Document';
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
              style={{ minHeight: '160px', justifyContent: 'center' }}
            >
              {pdfFiles.length > 0 ? (
                <>
                  <CheckCircle size={44} style={{ color: '#27AE60' }} />
                  <p style={{ color: '#27AE60', margin: 0 }}>PDFs Selected!</p>
                  <span style={{ fontWeight: '500', color: '#27AE60', fontSize: '0.85rem' }}>
                    {pdfFiles.length} file(s) in queue. Tap or drag more to add.
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

          {/* Interactive Batch Queue List */}
          {pdfFiles.length > 0 && (
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-dark)' }}>
                  Upload Queue ({pdfFiles.length})
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
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                {pdfFiles.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      backgroundColor: 'white',
                      border: '1px solid var(--color-border)',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                      <FileText size={18} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px', color: 'var(--text-dark)' }}>
                          {item.file.name}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {/* Interactive Status Badges */}
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
                ))}
              </div>
            </div>
          )}

          {/* Date Picker */}
          <div className="form-group">
            <label htmlFor="docDate">Document Date</label>
            <div style={{ position: 'relative' }}>
              <input
                id="docDate"
                type="date"
                className="input-control"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{ paddingLeft: '44px' }}
                disabled={loading}
              />
              <Calendar
                size={20}
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '16px',
                  color: 'var(--text-muted)'
                }}
              />
            </div>
            {rangePreview && (
              <div className="preview-alert" style={{ marginTop: '10px' }}>
                <Calendar size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span style={{ whiteSpace: 'pre-line' }}>{rangePreview}</span>
              </div>
            )}
          </div>

          {/* Dynamic Numeric Metric Input */}
          {category === 'salary_slip' && (
            <div className="form-group">
              <label htmlFor="salaryAmount">Net Salary Amount (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="salaryAmount"
                  type="number"
                  step="any"
                  pattern="[0-9]*"
                  inputMode="decimal"
                  className="input-control"
                  placeholder="Enter amount"
                  value={metricValue}
                  onChange={(e) => setMetricValue(e.target.value)}
                  style={{ paddingLeft: '44px' }}
                  disabled={loading}
                />
                <DollarSign
                  size={20}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '16px',
                    color: 'var(--text-muted)'
                  }}
                />
              </div>
            </div>
          )}

          {category === 'ot' && (
            <div className="form-group">
              <label htmlFor="otHours">Overtime Hours (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="otHours"
                  type="number"
                  step="any"
                  pattern="[0-9]*"
                  inputMode="decimal"
                  className="input-control"
                  placeholder="Enter hours (e.g. 8.5)"
                  value={metricValue}
                  onChange={(e) => setMetricValue(e.target.value)}
                  style={{ paddingLeft: '44px' }}
                  disabled={loading}
                />
                <Clock
                  size={20}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '16px',
                    color: 'var(--text-muted)'
                  }}
                />
              </div>
            </div>
          )}

          {category === 'mileage' && (
            <div className="form-group">
              <label htmlFor="mileageMiles">Miles Driven (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="mileageMiles"
                  type="number"
                  step="any"
                  pattern="[0-9]*"
                  inputMode="decimal"
                  className="input-control"
                  placeholder="Enter miles (e.g. 120)"
                  value={metricValue}
                  onChange={(e) => setMetricValue(e.target.value)}
                  style={{ paddingLeft: '44px' }}
                  disabled={loading}
                />
                <Navigation
                  size={20}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '16px',
                    color: 'var(--text-muted)'
                  }}
                />
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
