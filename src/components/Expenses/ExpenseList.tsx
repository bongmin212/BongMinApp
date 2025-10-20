import React, { useState, useEffect, useMemo } from 'react';
import { Database } from '../../utils/database';
import { Expense, ExpenseFormData, EXPENSE_TYPES } from '../../types';
import { IconPlus, IconEdit, IconTrash, IconReceipt } from '../Icons';
import { useToast } from '../../contexts/ToastContext';
import { exportToXlsx, generateExportFilename } from '../../utils/excel';
import DateRangeInput from '../Shared/DateRangeInput';

const ExpenseList: React.FC = () => {
  const { notify } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmState, setConfirmState] = useState<null | { message: string; onConfirm: () => void }>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadExpenses();
  }, []);

  // Initialize from URL/localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q') || '';
      const type = params.get('type') || '';
      const from = params.get('from') || '';
      const to = params.get('to') || '';
      const min = params.get('min') || '';
      const max = params.get('max') || '';
      const p = parseInt(params.get('page') || '1', 10);
      const l = parseInt((params.get('limit') || localStorage.getItem('expenseList.limit') || '10'), 10);
      setSearchQuery(q);
      setDebouncedSearchQuery(q);
      setFilterType(type);
      setDateFrom(from);
      setDateTo(to);
      setMinAmount(min);
      setMaxAmount(max);
      setPage(!Number.isNaN(p) && p > 0 ? p : 1);
      if (!Number.isNaN(l) && l > 0) setLimit(l);
    } catch {}
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset page on filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery, filterType, dateFrom, dateTo, minAmount, maxAmount]);

  // Persist limit
  useEffect(() => {
    try { localStorage.setItem('expenseList.limit', String(limit)); } catch {}
  }, [limit]);

  // Sync URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (debouncedSearchQuery) params.set('q', debouncedSearchQuery); else params.delete('q');
      if (filterType) params.set('type', filterType); else params.delete('type');
      if (dateFrom) params.set('from', dateFrom); else params.delete('from');
      if (dateTo) params.set('to', dateTo); else params.delete('to');
      if (minAmount) params.set('min', minAmount); else params.delete('min');
      if (maxAmount) params.set('max', maxAmount); else params.delete('max');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const s = params.toString();
      const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [debouncedSearchQuery, filterType, dateFrom, dateTo, minAmount, maxAmount, page, limit]);

  const loadExpenses = async () => {
    try {
      const data = await Database.getExpenses();
      setExpenses(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: ExpenseFormData) => {
    try {
      if (editingExpense) {
        await Database.updateExpense(editingExpense.id, formData);
        notify('Cập nhật chi phí thành công', 'success');
      } else {
        await Database.createExpense(formData);
        notify('Thêm chi phí thành công', 'success');
      }
      await loadExpenses();
      setShowForm(false);
      setEditingExpense(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Có lỗi khi lưu chi phí';
      notify(message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmState({
      message: 'Bạn có chắc chắn muốn xóa chi phí này?',
      onConfirm: async () => {
        try {
          await Database.deleteExpense(id);
          await loadExpenses();
          notify('Xóa chi phí thành công', 'success');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Không thể xóa chi phí';
          notify(message, 'error');
        }
      }
    });
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => setSelectedIds(checked ? ids : []);
  const toggleSelect = (id: string, checked: boolean) => setSelectedIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      message: `Xóa ${selectedIds.length} chi phí đã chọn?`,
      onConfirm: async () => {
        for (const id of selectedIds) {
          await Database.deleteExpense(id);
        }
        setSelectedIds([]);
        await loadExpenses();
        notify('Đã xóa chi phí đã chọn', 'success');
      }
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(date));
  };

  const getExpenseTypeLabel = (type: string) => {
    return EXPENSE_TYPES.find(t => t.value === type)?.label || type;
  };

  const filteredExpenses = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    return expenses.filter(expense => {
      const code = (expense.code || '').toLowerCase();
      const desc = (expense.description || '').toLowerCase();
      const typeLabel = getExpenseTypeLabel(expense.type).toLowerCase();
      const dateStr = formatDate(expense.date).toLowerCase();
      const amountStr = String(expense.amount || 0).toLowerCase();
      const matchesSearch = !q || (
        code.includes(q) ||
        desc.includes(q) ||
        typeLabel.includes(q) ||
        dateStr.includes(q) ||
        amountStr.includes(q)
      );

      const matchesType = !filterType || expense.type === filterType;

      const matchesDateFrom = !dateFrom || new Date(expense.date) >= new Date(dateFrom);
      const matchesDateTo = !dateTo || new Date(expense.date) <= new Date(dateTo);

      const min = minAmount ? Number(minAmount.replace(/[^\d]/g, '')) : undefined;
      const max = maxAmount ? Number(maxAmount.replace(/[^\d]/g, '')) : undefined;
      const matchesMin = min === undefined || expense.amount >= min;
      const matchesMax = max === undefined || expense.amount <= max;

      return matchesSearch && matchesType && matchesDateFrom && matchesDateTo && matchesMin && matchesMax;
    });
  }, [expenses, searchQuery, filterType, dateFrom, dateTo, minAmount, maxAmount]);

  const getTotalExpense = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [filteredExpenses]);

  const total = filteredExpenses.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const sortedExpenses = filteredExpenses
    .slice()
    .sort((a, b) => {
      const getNum = (code?: string | null) => {
        if (!code) return Number.POSITIVE_INFINITY;
        const m = String(code).match(/\d+/);
        return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
      };
      const na = getNum(a.code as any);
      const nb = getNum(b.code as any);
      if (na !== nb) return na - nb;
      return (a.code || '').localeCompare(b.code || '');
    });
  const pageItems = sortedExpenses.slice(start, start + limit);

  const exportExpensesXlsx = (items: Expense[], filename: string) => {
    const rows = items.map(e => ({
      code: e.code || '',
      type: getExpenseTypeLabel(e.type),
      description: (e.description || ''),
      amount: e.amount || 0,
      date: formatDate(e.date)
    }));
    exportToXlsx(rows, [
      { header: 'Mã', key: 'code', width: 12 },
      { header: 'Loại', key: 'type', width: 16 },
      { header: 'Mô tả', key: 'description', width: 50 },
      { header: 'Số tiền', key: 'amount', width: 14 },
      { header: 'Ngày', key: 'date', width: 14 },
    ], filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, 'Chi phí');
  };

  const resetFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setFilterType('');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setPage(1);
  };

  if (loading) {
    return <div className="loading">Đang tải...</div>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="card-title">Danh sách chi phí</h2>
          <div className="d-flex gap-2">
            <div className="text-right">
              <div>Tổng chi: {formatCurrency(getTotalExpense)}</div>
              <small className="text-muted">({total} mục)</small>
            </div>
            <button className="btn btn-light" onClick={() => {
              const filename = generateExportFilename('ChiPhi', {
                debouncedSearchQuery,
                filterType,
                dateFrom,
                dateTo,
                minAmount,
                maxAmount
              }, 'TrangHienTai');
              exportExpensesXlsx(pageItems, filename);
            }}>Xuất Excel (trang hiện tại)</button>
            <button className="btn btn-light" onClick={() => {
              const filename = generateExportFilename('ChiPhi', {
                debouncedSearchQuery,
                filterType,
                dateFrom,
                dateTo,
                minAmount,
                maxAmount
              }, 'KetQuaLoc');
              exportExpensesXlsx(filteredExpenses, filename);
            }}>Xuất Excel (kết quả đã lọc)</button>
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={bulkDelete}>Xóa đã chọn ({selectedIds.length})</button>
            )}
            <button 
              className="btn btn-primary"
              onClick={() => setShowForm(true)}
            >
              Thêm chi phí
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <ExpenseForm
          expense={editingExpense}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingExpense(null);
          }}
        />
      )}

      <div className="mb-3">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm kiếm chi phí..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Tất cả loại</option>
              {EXPENSE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <DateRangeInput
              label="Khoảng ngày"
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            />
          </div>
          <div>
            <input
              type="text"
              inputMode="numeric"
              className="form-control"
              placeholder="Min ₫"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
          </div>
          <div>
            <input
              type="text"
              inputMode="numeric"
              className="form-control"
              placeholder="Max ₫"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>
          <div>
            <button
              className="btn btn-light w-100"
              onClick={resetFilters}
            >
              Reset bộ lọc
            </button>
          </div>
        </div>
      </div>

      {pageItems.length === 0 ? (
        <div className="text-center py-4">
          <p>Không có chi phí nào</p>
        </div>
      ) : (
        <div className="table-responsive expenses-table">
          <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36, minWidth: 36, maxWidth: 36 }}>
                <input
                  type="checkbox"
                  checked={pageItems.length > 0 && pageItems.every(e => selectedIds.includes(e.id))}
                  onChange={(e) => toggleSelectAll(e.target.checked, pageItems.map(e => e.id))}
                />
              </th>
              <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Mã</th>
              <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Loại</th>
              <th style={{ width: '150px', minWidth: '150px', maxWidth: '180px' }}>Mô tả</th>
              <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Số tiền</th>
              <th style={{ width: '80px', minWidth: '80px', maxWidth: '100px' }}>Ngày</th>
              <th style={{ width: '100px', minWidth: '100px', maxWidth: '120px' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(expense => (
              <tr key={expense.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.includes(expense.id)} onChange={(e) => toggleSelect(expense.id, e.target.checked)} />
                </td>
                <td>{expense.code}</td>
                <td>{getExpenseTypeLabel(expense.type)}</td>
                <td>
                  <div className="line-clamp-3" title={expense.description} style={{ maxWidth: 420 }}>
                    {expense.description}
                  </div>
                </td>
                <td className="amount">{formatCurrency(expense.amount)}</td>
                <td>{formatDate(expense.date)}</td>
                <td>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      setEditingExpense(expense);
                      setShowForm(true);
                    }}
                  >
                    <IconEdit />
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(expense.id)}
                  >
                    <IconTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3">
        <div>
          <select className="form-control" style={{ width: 100 }} value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-light" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>«</button>
          <span>Trang {currentPage} / {totalPages}</span>
          <button className="btn btn-light" disabled={currentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>»</button>
        </div>
        <div>
          <small className="text-muted">Hiển thị {pageItems.length}/{total} mục</small>
        </div>
      </div>

      {confirmState && (
        <div className="modal" role="dialog" aria-modal>
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Xác nhận</h3>
              <button className="close" onClick={() => setConfirmState(null)}>×</button>
            </div>
            <div className="mb-4" style={{ color: 'var(--text-primary)' }}>{confirmState.message}</div>
            <div className="d-flex justify-content-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfirmState(null)}>Hủy</button>
              <button className="btn btn-danger" onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ExpenseForm component
const ExpenseForm: React.FC<{
  expense?: Expense | null;
  onSubmit: (data: ExpenseFormData) => void;
  onCancel: () => void;
}> = ({ expense, onSubmit, onCancel }) => {
  const coerceDate = (value: unknown): Date => {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    return new Date();
  };

  const toInputDate = (value: unknown): string => {
    const d = coerceDate(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [formData, setFormData] = useState<ExpenseFormData>({
    code: expense?.code || '',
    type: expense?.type || 'OTHER',
    amount: expense?.amount || 0,
    description: expense?.description || '',
    date: coerceDate(expense?.date ?? new Date()),
  });

  // Auto-generate expense code for new records
  useEffect(() => {
    if (!expense) {
      (async () => {
        try {
          const next = await Database.generateNextExpenseCode();
          setFormData(prev => ({ ...prev, code: next }));
        } catch {}
      })();
    }
  }, [expense]);

  const formatVND = (value: number): string => {
    try {
      return new Intl.NumberFormat('vi-VN').format(value);
    } catch {
      return String(value ?? '');
    }
  };

  const parseVND = (input: string): number => {
    const digitsOnly = input.replace(/[^\d]/g, '');
    return digitsOnly ? Number(digitsOnly) : 0;
  };

  const [amountInput, setAmountInput] = useState<string>(
    formData.amount ? formatVND(formData.amount) : ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{expense ? 'Sửa chi phí' : 'Thêm chi phí mới'}</h3>
          <button type="button" className="close" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Mã chi phí</label>
            <input
              type="text"
              className="form-control"
              value={formData.code}
              readOnly
              disabled
              aria-disabled
              title={'Mã tự động tạo - không chỉnh sửa'}
              style={{ opacity: 0.6 } as React.CSSProperties}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Loại chi phí</label>
            <select
              className="form-control"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
            >
              {EXPENSE_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Số tiền (₫) *</label>
            <input
              type="text"
              inputMode="numeric"
              className="form-control"
              value={amountInput}
              onChange={(e) => {
                const raw = e.target.value;
                const numeric = parseVND(raw);
                setAmountInput(raw === '' ? '' : formatVND(numeric));
                setFormData({ ...formData, amount: numeric });
              }}
              onBlur={() => setAmountInput(formatVND(formData.amount))}
              placeholder="Nhập số tiền"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mô tả *</label>
            <textarea
              className="form-control"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Nhập mô tả chi phí"
              required
              rows={3}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ngày *</label>
            <input
              type="date"
              className="form-control"
              value={toInputDate(formData.date)}
              onChange={(e) => setFormData({ ...formData, date: new Date(e.target.value) })}
              required
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              {expense ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseList;
