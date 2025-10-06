import React from 'react';

interface DateRangeInputProps {
  label?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 1000,
  background: 'var(--bg-primary, #fff)',
  border: '1px solid var(--border-color, #ddd)',
  borderRadius: 6,
  padding: 12,
  boxShadow: '0 6px 24px rgba(0,0,0,0.12)'
};

export const DateRangeInput: React.FC<DateRangeInputProps> = ({ label = 'Khoảng ngày', from, to, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pretty = (() => {
    const f = from ? new Date(from).toLocaleDateString('vi-VN') : '';
    const t = to ? new Date(to).toLocaleDateString('vi-VN') : '';
    if (!f && !t) return '';
    if (f && !t) return `${f} → ...`;
    if (!f && t) return `... → ${t}`;
    return `${f} → ${t}`;
  })();

  return (
    <div style={{ position: 'relative' }} ref={wrapperRef}>
      <div className="form-control" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {pretty || label}
      </div>
      {open && (
        <div style={popoverStyle}>
          <div className="row g-2" style={{ minWidth: 280 }}>
            <div className="col-12">
              <small className="text-muted">Start</small>
              <div className="d-flex gap-2">
                <input
                  type="date"
                  className="form-control"
                  value={from || ''}
                  onChange={(e) => onChange(e.target.value || '', to)}
                />
              </div>
            </div>
            <div className="col-12">
              <small className="text-muted">End</small>
              <div className="d-flex gap-2">
                <input
                  type="date"
                  className="form-control"
                  value={to || ''}
                  onChange={(e) => onChange(from, e.target.value || '')}
                />
              </div>
            </div>
            <div className="col-12 d-flex justify-content-end gap-2">
              <button className="btn btn-light" onClick={() => { onChange('', ''); setOpen(false); }}>Clear</button>
              <button className="btn btn-primary" onClick={() => setOpen(false)}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangeInput;


