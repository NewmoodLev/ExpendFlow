import { useEffect, useMemo, useState } from 'react';
import { createTag, createTransaction, fetchSummary, fetchTags, fetchTransactions, login, register, fetchProfile, updateProfile, fetchAISummary, updateTransaction, deleteTransaction } from './api';
import { Summary, Tag, Transaction, User, AIResponse } from './types';

// ── helpers ──────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
}

const initialForm = { type: 'expense', amount: 0, description: '', tag: '', date: todayISO() };

function FinflowLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="10" fill="#0B1222"/>
      <path d="M10 34 L20 22 L27 28 L38 14" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="38" cy="14" r="2.5" fill="#C9A84C"/>
      <rect x="10" y="36" width="28" height="1.5" rx="0.75" fill="#1E2D45"/>
    </svg>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────
interface EditModalProps {
  transaction: Transaction;
  tags: Tag[];
  onSave: (id: string, data: Partial<Transaction>) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

function EditModal({ transaction, tags, onSave, onClose, loading }: EditModalProps) {
  const [form, setForm] = useState({
    type: transaction.type,
    amount: transaction.amount,
    description: transaction.description || '',
    tag: transaction.tag,
    date: transaction.date ? transaction.date.split('T')[0] : todayISO(),
  });
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tag) { setErr('กรุณาเลือกหมวดหมู่'); return; }
    if (!form.amount || form.amount <= 0) { setErr('กรุณากรอกจำนวนเงิน'); return; }
    setErr(null);
    await onSave(transaction.id, {
      type: form.type as 'income' | 'expense',
      amount: Number(form.amount),
      description: form.description,
      tag: form.tag,
      date: form.date || todayISO(),
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">แก้ไขรายการ</span>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-row-2">
            <div className="field">
              <label className="field-label">ประเภท</label>
              <div className="type-toggle">
                <button type="button" className={`type-btn ${form.type === 'expense' ? 'active expense' : ''}`}
                  onClick={() => setForm(p => ({ ...p, type: 'expense' }))}>รายจ่าย</button>
                <button type="button" className={`type-btn ${form.type === 'income' ? 'active income' : ''}`}
                  onClick={() => setForm(p => ({ ...p, type: 'income' }))}>รายรับ</button>
              </div>
            </div>
            <div className="field">
              <label className="field-label">จำนวนเงิน (฿)</label>
              <input className="field-input" type="number" min="0" value={form.amount}
                onChange={(e) => setForm(p => ({ ...p, amount: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="field">
              <label className="field-label">หมวดหมู่</label>
              <select className="field-input" value={form.tag} onChange={(e) => setForm(p => ({ ...p, tag: e.target.value }))}>
                <option value="">— เลือกหมวด —</option>
                {tags.map(tag => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">วันที่</label>
              <input className="field-input" type="date" value={form.date}
                onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">รายละเอียด</label>
            <input className="field-input" value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="หมายเหตุ (ไม่บังคับ)" />
          </div>
          {err && <div className="auth-error"><IconAlert />{err}</div>}
          <div className="btn-pair">
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? <><span className="btn-spinner" />กำลังบันทึก...</> : 'บันทึกการแก้ไข'}
            </button>
            <button className="btn-ghost" type="button" onClick={onClose}>ยกเลิก</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ───────────────────────────────────────
interface DeleteConfirmProps {
  transaction: Transaction;
  onConfirm: (id: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

function DeleteConfirmModal({ transaction, onConfirm, onClose, loading }: DeleteConfirmProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">ยืนยันการลบ</span>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <p className="modal-body-text">
          ต้องการลบรายการ <strong>{transaction.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</strong>{' '}
          <strong>฿{transaction.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>{' '}
          หมวด <strong>{transaction.tag}</strong> ใช่ไหม? การดำเนินการนี้ไม่สามารถยกเลิกได้
        </p>
        <div className="btn-pair" style={{ marginTop: 20 }}>
          <button className="btn-danger" disabled={loading} onClick={() => onConfirm(transaction.id)}>
            {loading ? <><span className="btn-spinner" />กำลังลบ...</> : <><IconTrash />ลบรายการ</>}
          </button>
          <button className="btn-ghost" type="button" onClick={onClose}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPage, setCurrentPage] = useState<'login' | 'register' | 'dashboard' | 'profile' | 'ai'>('login');
  const [username, setUsername] = useState(localStorage.getItem('expense-username') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPageDashboard, setCurrentPageDashboard] = useState<'dashboard' | 'profile' | 'ai'>('dashboard');
  const [tags, setTags] = useState<Tag[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expense: 0, balance: 0 });
  const [tagName, setTagName] = useState('');
  const [form, setForm] = useState<typeof initialForm>(initialForm);
  const [profile, setProfile] = useState<User | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<User>>({});
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Edit / Delete state
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const token = localStorage.getItem('expense-token');

  useEffect(() => {
    if (token) { setIsLoggedIn(true); loadData(); }
  }, [token]);

  async function loadData() {
    try {
      setLoading(true);
      const [tagList, transactionList, summaryData, profileData] = await Promise.all([
        fetchTags(), fetchTransactions(), fetchSummary(), fetchProfile()
      ]);
      setTags(tagList); setTransactions(transactionList);
      setSummary(summaryData); setProfile(profileData);
      setForm((prev) => ({ ...prev, tag: tagList[0]?.name ?? '' }));
    } catch (err) { setError('ไม่สามารถโหลดข้อมูลได้'); } finally { setLoading(false); }
  }

  async function handleSubmitAuth(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true); setError(null);
      if (!username?.trim()) { setError('กรุณาใส่ชื่อผู้ใช้'); setLoading(false); return; }
      if (currentPage === 'register') {
        if (username.length < 3) { setError('ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'); setLoading(false); return; }
        if (username.length > 20) { setError('ชื่อผู้ใช้ต้องไม่เกิน 20 ตัวอักษร'); setLoading(false); return; }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) { setError('ชื่อผู้ใช้มีเฉพาะตัวอักษร ตัวเลข และ underscore'); setLoading(false); return; }
        const passwordError = validatePassword(password);
        if (passwordError) { setError(passwordError); setLoading(false); return; }
        if (password !== confirmPassword) { setError('รหัสผ่านไม่ตรงกัน'); setLoading(false); return; }
        await register(username.trim(), password);
        setCurrentPage('login'); setPassword(''); setConfirmPassword('');
      } else {
        const data = await login(username, password);
        localStorage.setItem('expense-token', data.token);
        localStorage.setItem('expense-username', data.username);
        setIsLoggedIn(true); setUsername(data.username);
        setCurrentPageDashboard('dashboard'); await loadData();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setError(`${currentPage === 'register' ? 'ลงทะเบียนล้มเหลว' : 'เข้าสู่ระบบล้มเหลว'}: ${message}`);
    } finally { setLoading(false); }
  }

  function validatePassword(pwd: string): string | null {
    if (pwd.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
    if (!/[A-Z]/.test(pwd)) return 'ต้องมีตัวพิมพ์ใหญ่ (A-Z)';
    if (!/[a-z]/.test(pwd)) return 'ต้องมีตัวพิมพ์เล็ก (a-z)';
    if (!/[0-9]/.test(pwd)) return 'ต้องมีตัวเลข (0-9)';
    if (!/[^a-zA-Z0-9]/.test(pwd)) return 'ต้องมีอักขระพิเศษ (!@#$%^&*)';
    return null;
  }

  function calculatePasswordStrength(pwd: string): number {
    let s = 0;
    if (pwd.length >= 8) s += 25;
    if (pwd.length >= 12) s += 15;
    if (/[a-z]/.test(pwd)) s += 15;
    if (/[A-Z]/.test(pwd)) s += 15;
    if (/[0-9]/.test(pwd)) s += 15;
    if (/[^a-zA-Z0-9]/.test(pwd)) s += 15;
    return Math.min(s, 100);
  }

  function logout() {
    localStorage.removeItem('expense-token'); localStorage.removeItem('expense-username');
    setIsLoggedIn(false); setUsername(''); setTransactions([]); setTags([]);
    setSummary({ income: 0, expense: 0, balance: 0 }); setProfile(null); setCurrentPage('dashboard');
  }

  async function handleAddTag(event: React.FormEvent) {
    event.preventDefault();
    if (!tagName.trim()) return;
    try {
      setLoading(true);
      const newTag = await createTag(tagName.trim());
      setTags((prev) => [...prev, newTag]); setTagName('');
      if (!form.tag) setForm((prev) => ({ ...prev, tag: newTag.name }));
    } catch { setError('เพิ่ม Tag ไม่สำเร็จ'); } finally { setLoading(false); }
  }

  async function handleAddTransaction(event: React.FormEvent) {
    event.preventDefault();
    if (!form.tag) { setError('กรุณาเลือก Tag'); return; }
    try {
      setLoading(true); setError(null);
      const newTransaction = await createTransaction({
        type: form.type as 'income' | 'expense',
        amount: form.amount,
        description: form.description,
        tag: form.tag,
        date: form.date || todayISO(),
      });
      setTransactions((prev) => [newTransaction, ...prev]);
      const newSummary = await fetchSummary(); setSummary(newSummary);
      setForm({ ...initialForm, tag: form.tag, date: todayISO() });
    } catch { setError('บันทึกรายรับรายจ่ายไม่สำเร็จ'); } finally { setLoading(false); }
  }

  // ── Edit transaction ──
  async function handleEditSave(id: string, data: Partial<Transaction>) {
    try {
      setActionLoading(true);
      const updated = await updateTransaction(id, data);
      setTransactions(prev => prev.map(t => t.id === id ? updated : t));
      const newSummary = await fetchSummary(); setSummary(newSummary);
      setEditingTransaction(null);
    } catch { setError('แก้ไขรายการไม่สำเร็จ'); } finally { setActionLoading(false); }
  }

  // ── Delete transaction ──
  async function handleDeleteConfirm(id: string) {
    try {
      setActionLoading(true);
      await deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      const newSummary = await fetchSummary(); setSummary(newSummary);
      setDeletingTransaction(null);
    } catch { setError('ลบรายการไม่สำเร็จ'); } finally { setActionLoading(false); }
  }

  async function handleUpdateProfile(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      const updated = await updateProfile(editData);
      setProfile(updated); setEditMode(false); setEditData({}); setError(null);
    } catch { setError('ไม่สามารถอัปเดตโปรไฟล์ได้'); } finally { setLoading(false); }
  }

  async function handleAIQuery(event: React.FormEvent) {
    event.preventDefault();
    try {
      setAiLoading(true);
      const response = await fetchAISummary(aiQuestion);
      setAiResponse(response); setAiQuestion('');
    } catch { setError('ไม่สามารถขอความช่วยเหลือจาก AI ได้'); } finally { setAiLoading(false); }
  }

  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions]
  );

  // ─────────────────────────────────────────────────
  // AUTH PAGES
  // ─────────────────────────────────────────────────
  if (!isLoggedIn) {
    const isRegister = currentPage === 'register';
    const strength = isRegister ? calculatePasswordStrength(password) : 0;
    const strengthLabel = strength < 40 ? 'อ่อน' : strength < 70 ? 'ปานกลาง' : 'แข็งแรง';
    const strengthColor = strength < 40 ? '#E05252' : strength < 70 ? '#D4943A' : '#3DAF7A';

    return (
      <div className="auth-shell">
        <div className="auth-left">
          <div className="auth-left-content">
            <div className="auth-wordmark">
              <FinflowLogo size={44} />
              <span className="auth-wordmark-text">FinFlow</span>
            </div>
            <div className="auth-headline">
              <h1>บริหารการเงิน<br />อย่างชาญฉลาด</h1>
              <p>ติดตามรายรับรายจ่าย วิเคราะห์แนวโน้ม<br />และรับคำแนะนำจาก AI ส่วนตัวของคุณ</p>
            </div>
            <div className="auth-stats-row">
              <div className="auth-stat">
                <span className="auth-stat-num">98%</span>
                <span className="auth-stat-label">ความแม่นยำ</span>
              </div>
              <div className="auth-stat-divider" />
              <div className="auth-stat">
                <span className="auth-stat-num">AI</span>
                <span className="auth-stat-label">วิเคราะห์อัตโนมัติ</span>
              </div>
              <div className="auth-stat-divider" />
              <div className="auth-stat">
                <span className="auth-stat-num">24/7</span>
                <span className="auth-stat-label">พร้อมใช้งาน</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>{isRegister ? 'เปิดบัญชีใหม่' : 'เข้าสู่ระบบ'}</h2>
              <p>{isRegister ? 'กรอกข้อมูลเพื่อเริ่มต้นใช้งาน' : 'ยินดีต้อนรับกลับสู่ FinFlow'}</p>
            </div>

            <form onSubmit={handleSubmitAuth} className="auth-form">
              <div className="field">
                <label className="field-label">ชื่อผู้ใช้</label>
                <div className="input-wrap">
                  <input className="field-input" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="กรอกชื่อผู้ใช้" disabled={loading} autoComplete="username" />
                  {isRegister && <span className="input-counter">{username.length}/20</span>}
                </div>
              </div>

              <div className="field">
                <label className="field-label">รหัสผ่าน</label>
                <input className="field-input" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" disabled={loading} autoComplete={isRegister ? 'new-password' : 'current-password'} />
                {isRegister && password && (
                  <div className="strength-bar">
                    <div className="strength-segments">
                      {[25, 50, 75, 100].map((threshold) => (
                        <div key={threshold} className="strength-seg" style={{ background: strength >= threshold ? strengthColor : 'var(--line)' }} />
                      ))}
                    </div>
                    <span className="strength-label" style={{ color: strengthColor }}>{strengthLabel}</span>
                  </div>
                )}
              </div>

              {isRegister && (
                <>
                  <div className="field">
                    <label className="field-label">ยืนยันรหัสผ่าน</label>
                    <input className="field-input" type="password" value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••" disabled={loading} />
                    {confirmPassword && (
                      <span className="field-hint" style={{ color: password === confirmPassword ? '#3DAF7A' : '#E05252' }}>
                        {password === confirmPassword ? '✓ รหัสผ่านตรงกัน' : '✗ รหัสผ่านไม่ตรงกัน'}
                      </span>
                    )}
                  </div>
                  <div className="pwd-rules">
                    ต้องมีตัวพิมพ์ใหญ่ · ตัวพิมพ์เล็ก · ตัวเลข · อักขระพิเศษ · อย่างน้อย 8 ตัว
                  </div>
                </>
              )}

              {error && <div className="auth-error"><IconAlert />{error}</div>}

              <button className="btn-primary" type="submit" disabled={loading ||
                (isRegister && (strength < 40 || password !== confirmPassword))}>
                {loading ? <span className="btn-spinner" /> : null}
                {loading ? 'กำลังดำเนินการ...' : (isRegister ? 'เปิดบัญชี' : 'เข้าสู่ระบบ')}
              </button>
            </form>

            <div className="auth-footer">
              {isRegister ? (
                <span>มีบัญชีอยู่แล้ว? <button type="button" className="link-btn" onClick={() => { setCurrentPage('login'); setError(null); setPassword(''); setConfirmPassword(''); }}>เข้าสู่ระบบ</button></span>
              ) : (
                <span>ยังไม่มีบัญชี? <button type="button" className="link-btn" onClick={() => { setCurrentPage('register'); setError(null); setPassword(''); }}>เปิดบัญชีใหม่</button></span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────
  // MAIN APP
  // ─────────────────────────────────────────────────
  return (
    <>
      {/* Modals */}
      {editingTransaction && (
        <EditModal
          transaction={editingTransaction}
          tags={tags}
          onSave={handleEditSave}
          onClose={() => setEditingTransaction(null)}
          loading={actionLoading}
        />
      )}
      {deletingTransaction && (
        <DeleteConfirmModal
          transaction={deletingTransaction}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeletingTransaction(null)}
          loading={actionLoading}
        />
      )}

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <FinflowLogo size={32} />
            <span className="sidebar-brand-name">FinFlow</span>
          </div>

          <div className="sidebar-section-label">เมนูหลัก</div>
          <nav className="sidebar-nav">
            {(['dashboard', 'profile', 'ai'] as const).map((page) => (
              <button key={page} className={`sidebar-item ${currentPageDashboard === page ? 'active' : ''}`}
                onClick={() => setCurrentPageDashboard(page)}>
                <span className="sidebar-icon">
                  {page === 'dashboard' && <IconChart />}
                  {page === 'profile' && <IconUser />}
                  {page === 'ai' && <IconAI />}
                </span>
                <span className="sidebar-label">{page === 'dashboard' ? 'แดชบอร์ด' : page === 'profile' ? 'โปรไฟล์' : 'AI ผู้ช่วย'}</span>
                {currentPageDashboard === page && <span className="sidebar-active-dot" />}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="avatar">{username[0]?.toUpperCase()}</div>
              <div className="sidebar-user-info">
                <span className="sidebar-username">{username}</span>
                <span className="sidebar-user-role">สมาชิก</span>
              </div>
            </div>
            <button className="btn-logout" onClick={logout} title="ออกจากระบบ">
              <IconLogout />
            </button>
          </div>
        </aside>

        <main className="main-content">
          {/* ── DASHBOARD ── */}
          {currentPageDashboard === 'dashboard' && (
            <div className="page-content">
              <div className="page-header">
                <div>
                  <div className="page-eyebrow">ภาพรวม</div>
                  <h2 className="page-title">แดชบอร์ดการเงิน</h2>
                </div>
                <div className="page-date-chip">
                  <IconCalendar />
                  {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>

              <div className="summary-row">
                <div className="stat-card stat-balance">
                  <div className="stat-header">
                    <span className="stat-label">ยอดคงเหลือ</span>
                    <span className="stat-icon-wrap balance-icon"><IconBalance /></span>
                  </div>
                  <div className="stat-value">฿{summary.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
                  <div className="stat-meta">ยอดสุทธิทั้งหมด</div>
                </div>
                <div className="stat-card stat-income">
                  <div className="stat-header">
                    <span className="stat-label">รายรับ</span>
                    <span className="stat-icon-wrap income-icon"><IconArrowUp /></span>
                  </div>
                  <div className="stat-value">฿{summary.income.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
                  <div className="stat-meta">รายรับสะสม</div>
                </div>
                <div className="stat-card stat-expense">
                  <div className="stat-header">
                    <span className="stat-label">รายจ่าย</span>
                    <span className="stat-icon-wrap expense-icon"><IconArrowDown /></span>
                  </div>
                  <div className="stat-value">฿{summary.expense.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
                  <div className="stat-meta">รายจ่ายสะสม</div>
                </div>
              </div>

              <div className="two-col">
                {/* Tags */}
                <div className="card">
                  <div className="card-title-row">
                    <h3 className="card-title">หมวดหมู่</h3>
                    <span className="card-count">{tags.length} หมวด</span>
                  </div>
                  <form onSubmit={handleAddTag} className="inline-form">
                    <input className="field-input" value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="ชื่อหมวดหมู่ใหม่" />
                    <button className="btn-sm" type="submit" disabled={loading}>+ เพิ่ม</button>
                  </form>
                  <div className="tag-row">
                    {tags.map((tag) => (
                      <span key={tag.id} className="tag-chip">{tag.name}</span>
                    ))}
                  </div>
                </div>

                {/* Add Transaction */}
                <div className="card">
                  <div className="card-title-row">
                    <h3 className="card-title">บันทึกรายการ</h3>
                  </div>
                  <form onSubmit={handleAddTransaction} className="form-grid">
                    <div className="form-row-2">
                      <div className="field">
                        <label className="field-label">ประเภท</label>
                        <div className="type-toggle">
                          <button type="button" className={`type-btn ${form.type === 'expense' ? 'active expense' : ''}`}
                            onClick={() => setForm((p) => ({ ...p, type: 'expense' }))}>รายจ่าย</button>
                          <button type="button" className={`type-btn ${form.type === 'income' ? 'active income' : ''}`}
                            onClick={() => setForm((p) => ({ ...p, type: 'income' }))}>รายรับ</button>
                        </div>
                      </div>
                      <div className="field">
                        <label className="field-label">จำนวนเงิน (฿)</label>
                        <input className="field-input" type="number" min="0" value={form.amount}
                          onChange={(e) => setForm((prev) => ({ ...prev, amount: Number(e.target.value) }))} />
                      </div>
                    </div>
                    <div className="form-row-2">
                      <div className="field">
                        <label className="field-label">หมวดหมู่</label>
                        <select className="field-input" value={form.tag} onChange={(e) => setForm((prev) => ({ ...prev, tag: e.target.value }))}>
                          <option value="">— เลือกหมวด —</option>
                          {tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label">
                          วันที่
                          <span className="field-label-hint">ไม่ระบุ = วันนี้</span>
                        </label>
                        <input
                          className="field-input"
                          type="date"
                          value={form.date}
                          onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                          max={todayISO()}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label className="field-label">รายละเอียด</label>
                      <input className="field-input" value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="หมายเหตุ (ไม่บังคับ)" />
                    </div>
                    {error && <div className="auth-error"><IconAlert />{error}</div>}
                    <button className="btn-primary" type="submit" disabled={loading}>
                      {loading ? <span className="btn-spinner" /> : null}
                      {loading ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Transaction Table */}
              <div className="card">
                <div className="card-title-row">
                  <h3 className="card-title">ประวัติรายการ</h3>
                  <span className="card-count">{sortedTransactions.length} รายการ</span>
                </div>
                {sortedTransactions.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><IconInbox /></div>
                    <p>ยังไม่มีรายการ</p>
                    <span>เริ่มบันทึกรายรับรายจ่ายด้านบน</span>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>วันที่</th>
                          <th>ประเภท</th>
                          <th>หมวดหมู่</th>
                          <th>รายละเอียด</th>
                          <th style={{ textAlign: 'right' }}>จำนวน</th>
                          <th style={{ textAlign: 'center', width: 96 }}>จัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTransactions.map((item) => (
                          <tr key={item.id}>
                            <td className="td-date">
                              {new Date(item.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </td>
                            <td>
                              <span className={`type-badge ${item.type}`}>
                                {item.type === 'income' ? '↑ รายรับ' : '↓ รายจ่าย'}
                              </span>
                            </td>
                            <td><span className="tag-chip sm">{item.tag}</span></td>
                            <td className="desc-cell">{item.description || '—'}</td>
                            <td className={`amount-cell ${item.type === 'income' ? 'amount-income' : 'amount-expense'}`} style={{ textAlign: 'right' }}>
                              {item.type === 'income' ? '+' : '-'}฿{item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <div className="action-cell">
                                <button
                                  className="action-btn action-btn--edit"
                                  title="แก้ไข"
                                  onClick={() => setEditingTransaction(item)}
                                >
                                  <IconEdit />
                                </button>
                                <button
                                  className="action-btn action-btn--delete"
                                  title="ลบ"
                                  onClick={() => setDeletingTransaction(item)}
                                >
                                  <IconTrash />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PROFILE ── */}
          {currentPageDashboard === 'profile' && (
            <div className="page-content">
              <div className="page-header">
                <div>
                  <div className="page-eyebrow">บัญชีของฉัน</div>
                  <h2 className="page-title">โปรไฟล์</h2>
                </div>
              </div>
              <div className="profile-layout">
                <div className="profile-hero-card">
                  <div className="profile-avatar-xl">{username[0]?.toUpperCase()}</div>
                  <div className="profile-hero-info">
                    <div className="profile-name">{profile?.username}</div>
                    <div className="profile-since">
                      <IconCalendar size={13} />
                      สมาชิกตั้งแต่ {profile ? new Date(profile.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                    </div>
                  </div>
                  <div className="profile-badge">สมาชิกมาตรฐาน</div>
                </div>

                <div className="card">
                  <div className="card-title-row">
                    <h3 className="card-title">ข้อมูลติดต่อ</h3>
                    {!editMode && <button className="btn-edit" onClick={() => { setEditMode(true); setEditData({ email: profile?.email, phone: profile?.phone }); }}>แก้ไข</button>}
                  </div>

                  {profile && !editMode ? (
                    <div className="profile-fields">
                      <div className="profile-row">
                        <div className="profile-row-left">
                          <span className="profile-key-icon"><IconMail /></span>
                          <span className="profile-key">อีเมล</span>
                        </div>
                        <span className="profile-val">{profile.email || <span className="profile-empty">ยังไม่ได้ระบุ</span>}</span>
                      </div>
                      <div className="profile-row">
                        <div className="profile-row-left">
                          <span className="profile-key-icon"><IconPhone /></span>
                          <span className="profile-key">เบอร์โทร</span>
                        </div>
                        <span className="profile-val">{profile.phone || <span className="profile-empty">ยังไม่ได้ระบุ</span>}</span>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleUpdateProfile} className="form-grid">
                      <div className="form-row-2">
                        <div className="field">
                          <label className="field-label">อีเมล</label>
                          <input className="field-input" type="email" value={editData.email || ''}
                            onChange={(e) => setEditData({ ...editData, email: e.target.value })} placeholder="email@example.com" />
                        </div>
                        <div className="field">
                          <label className="field-label">เบอร์โทร</label>
                          <input className="field-input" type="tel" value={editData.phone || ''}
                            onChange={(e) => setEditData({ ...editData, phone: e.target.value })} placeholder="0xx-xxx-xxxx" />
                        </div>
                      </div>
                      {error && <div className="auth-error"><IconAlert />{error}</div>}
                      <div className="btn-pair">
                        <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                        <button className="btn-ghost" type="button" onClick={() => { setEditMode(false); setEditData({}); }}>ยกเลิก</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── AI ── */}
          {currentPageDashboard === 'ai' && (
            <div className="page-content">
              <div className="page-header">
                <div>
                  <div className="page-eyebrow">Powered by AI</div>
                  <h2 className="page-title">AI ผู้ช่วยการเงิน</h2>
                </div>
                <div className="ai-badge-header">
                  <span className="ai-pulse" />
                  พร้อมวิเคราะห์
                </div>
              </div>

              <div className="ai-prompt-card">
                <div className="ai-prompt-header">
                  <IconAI />
                  <span>ถามคำถามเกี่ยวกับการเงินของคุณ</span>
                </div>
                <form onSubmit={handleAIQuery}>
                  <textarea className="ai-textarea" value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder="เช่น: เดือนนี้ฉันใช้เงินเยอะที่สุดด้านไหน? หรือควรลดค่าใช้จ่ายด้านไหนบ้าง?"
                    rows={3} />
                  <div className="ai-prompt-footer">
                    {error && <div className="auth-error inline-err"><IconAlert />{error}</div>}
                    <button className="btn-primary btn-narrow ai-submit" type="submit" disabled={aiLoading}>
                      {aiLoading ? <><span className="btn-spinner" />กำลังวิเคราะห์...</> : <><IconSend />วิเคราะห์</>}
                    </button>
                  </div>
                </form>
              </div>

              {aiResponse && (
                <div className="ai-result">
                  <div className="ai-result-header">
                    <IconAI />
                    <span>ผลการวิเคราะห์</span>
                  </div>
                  <div className="ai-section">
                    <div className="ai-section-label">
                      <span className="ai-section-num">01</span>
                      สรุปภาพรวม
                    </div>
                    <p className="ai-text">{aiResponse.summary}</p>
                  </div>
                  <div className="ai-divider" />
                  <div className="ai-section">
                    <div className="ai-section-label">
                      <span className="ai-section-num">02</span>
                      ข้อสังเกตสำคัญ
                    </div>
                    <div className="ai-insights">
                      {aiResponse.insights.map((insight, idx) => (
                        <div key={idx} className="ai-insight-item">
                          <span className="ai-insight-dot" />
                          <p>{insight}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="ai-divider" />
                  <div className="ai-section">
                    <div className="ai-section-label">
                      <span className="ai-section-num">03</span>
                      คำแนะนำ
                    </div>
                    <div className="ai-recommendations">
                      {aiResponse.recommendations.map((rec, idx) => (
                        <div key={idx} className="ai-rec-item">
                          <span className="ai-rec-idx">{String(idx + 1).padStart(2, '0')}</span>
                          <p>{rec}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// ── ICONS ──────────────────────────────────────────────────────
function IconChart() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="9" y="8" width="4" height="13"/><rect x="15" y="4" width="4" height="17"/></svg>;
}
function IconUser() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/></svg>;
}
function IconAI() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>;
}
function IconLogout() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
function IconCalendar({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}
function IconArrowUp() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
}
function IconArrowDown() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
}
function IconBalance() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}
function IconAlert() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}
function IconMail() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
}
function IconPhone() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>;
}
function IconSend() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IconInbox() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>;
}
function IconEdit() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>;
}
function IconX() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

export default App;