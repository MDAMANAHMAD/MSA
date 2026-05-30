import React, { useState, useEffect, useRef } from 'react';
import { Calendar, FileText, ArrowLeft, Loader2, DollarSign, Clock, Navigation, CheckCircle } from 'lucide-react';

export default function AddDocument({ category, apiUrl, onBack, onSaveSuccess }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pdfFile, setPdfFile] = useState(null);
  const [metricValue, setMetricValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Auto 15-day calculation details
  const [rangePreview, setRangePreview] = useState('');

  useEffect(() => {
    if (category === 'ot' || category === 'mileage') {
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setPdfFile(file);
        setError('');
      } else {
        setError('Only PDF files are allowed!');
        setPdfFile(null);
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pdfFile) {
      setError('Please select a PDF file.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('pdf', pdfFile);
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

      onSaveSuccess(data.message || 'Saved successfully!');
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryTitle = () => {
    if (category === 'salary_slip') return 'Salary Slip';
    if (category === 'ot') return 'Overtime (OT)';
    if (category === 'mileage') return 'Mileage';
    return 'Document';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="screen-header">
        <button className="action-btn" onClick={onBack}>
          <ArrowLeft size={24} />
        </button>
        <h2>Add {getCategoryTitle()}</h2>
      </div>

      <div className="app-content">
        {error && (
          <div className="preview-alert" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', borderColor: 'rgba(231,76,60,0.2)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* File Picker with Instant Feedback */}
          <div className="form-group">
            <label>Select PDF Document</label>
            <input
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            
            {pdfFile ? (
              <div className="file-upload-box selected" onClick={triggerFileSelect}>
                <CheckCircle size={40} />
                <p>PDF Selected!</p>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#27AE60', wordBreak: 'break-all' }}>
                  {pdfFile.name}
                </span>
                <span style={{ color: '#27AE60' }}>
                  ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB) - Tap to change
                </span>
              </div>
            ) : (
              <div className="file-upload-box" onClick={triggerFileSelect}>
                <FileText size={40} style={{ color: 'var(--text-muted)' }} />
                <p>Tap here to pick PDF File</p>
                <span>Only PDF files are supported</span>
              </div>
            )}
          </div>

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
            <button type="submit" className="btn-large" disabled={loading || !pdfFile}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Saving & Syncing...
                </>
              ) : (
                'Save Document'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
