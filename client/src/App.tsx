import { useEffect, useMemo, useState } from 'react';
import { createTag, createTransaction, fetchSummary, fetchTags, fetchTransactions, login, register, fetchProfile, updateProfile, fetchAISummary } from './api';
import { Summary, Tag, Transaction, User, AIResponse } from './types';

const initialForm = { type: 'expense', amount: 0, description: '', tag: '' };

function FinflowLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="12" fill="#0A0F1E"/>
      <path d="M10 34 L20 22 L27 28 L38 14" stroke="#4F8EF7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="38" cy="14" r="2.5" fill="#4F8EF7"/>
      <rect x="10" y="36" width="28" height="2" rx="1" fill="#1E2D4E"/>
    </svg>
  );
}

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
        type: form.type as 'income' | 'expense', amount: form.amount,
        description: form.description, tag: form.tag
      });
      setTransactions((prev) => [newTransaction, ...prev]);
      const newSummary = await fetchSummary(); setSummary(newSummary); setForm(initialForm);
    } catch { setError('บันทึกรายรับรายจ่ายไม่สำเร็จ'); } finally { setLoading(false); }
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

  // AUTH PAGES
  if (!isLoggedIn) {
    const isRegister = currentPage === 'register';
    const strength = isRegister ? calculatePasswordStrength(password) : 0;
    const strengthLabel = strength < 40 ? 'อ่อน' : strength < 70 ? 'ปานกลาง' : 'แข็งแรง';
    const strengthColor = strength < 40 ? '#ef4444' : strength < 70 ? '#f59e0b' : '#22c55e';

    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <FinflowLogo size={52} />
            <div>
              <h1 className="brand-name">FinFlow</h1>
              <p className="brand-sub">{isRegister ? 'สร้างบัญชีใหม่' : 'ยินดีต้อนรับกลับ'}</p>
            </div>
          </div>

          <form onSubmit={handleSubmitAuth} className="auth-form">
            <div className="field">
              <label className="field-label">ชื่อผู้ใช้</label>
              <input className="field-input" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="username" disabled={loading} autoComplete="username" />
              {isRegister && <span className="field-hint">{username.length}/20</span>}
            </div>

            <div className="field">
              <label className="field-label">รหัสผ่าน</label>
              <input className="field-input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" disabled={loading} autoComplete={isRegister ? 'new-password' : 'current-password'} />
              {isRegister && password && (
                <div className="strength-bar">
                  <div className="strength-track">
                    <div className="strength-fill" style={{ width: `${strength}%`, background: strengthColor }} />
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
                    <span className="field-hint" style={{ color: password === confirmPassword ? '#22c55e' : '#ef4444' }}>
                      {password === confirmPassword ? 'ตรงกัน' : 'ไม่ตรงกัน'}
                    </span>
                  )}
                </div>
                <div className="pwd-rules">
                  <p>รหัสผ่านต้องประกอบด้วย: ตัวพิมพ์ใหญ่ A-Z · ตัวพิมพ์เล็ก a-z · ตัวเลข 0-9 · อักขระพิเศษ · อย่างน้อย 8 ตัว</p>
                </div>
              </>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button className="btn-primary" type="submit" disabled={loading ||
              (isRegister && (strength < 40 || password !== confirmPassword))}>
              {loading ? (isRegister ? 'กำลังสมัคร...' : 'กำลังเข้าสู่ระบบ...') : (isRegister ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ')}
            </button>
          </form>

          <div className="auth-footer">
            {isRegister ? (
              <span>มีบัญชีอยู่แล้ว? <button type="button" className="link-btn" onClick={() => { setCurrentPage('login'); setError(null); setPassword(''); setConfirmPassword(''); }}>เข้าสู่ระบบ</button></span>
            ) : (
              <span>ยังไม่มีบัญชี? <button type="button" className="link-btn" onClick={() => { setCurrentPage('register'); setError(null); setPassword(''); }}>สมัครสมาชิก</button></span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <FinflowLogo size={36} />
          <span className="sidebar-brand-name">FinFlow</span>
        </div>
        <nav className="sidebar-nav">
          {(['dashboard', 'profile', 'ai'] as const).map((page) => (
            <button key={page} className={`sidebar-item ${currentPageDashboard === page ? 'active' : ''}`}
              onClick={() => setCurrentPageDashboard(page)}>
              <span className="sidebar-icon">
                {page === 'dashboard' && <IconChart />}
                {page === 'profile' && <IconUser />}
                {page === 'ai' && <IconAI />}
              </span>
              <span>{page === 'dashboard' ? 'แดชบอร์ด' : page === 'profile' ? 'โปรไฟล์' : 'AI ผู้ช่วย'}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="avatar">{username[0]?.toUpperCase()}</div>
            <span className="sidebar-username">{username}</span>
          </div>
          <button className="btn-logout" onClick={logout}>ออก</button>
        </div>
      </aside>

      <main className="main-content">
        {/* DASHBOARD */}
        {currentPageDashboard === 'dashboard' && (
          <div className="page-content">
            <div className="page-header">
              <h2 className="page-title">แดชบอร์ด</h2>
              <span className="page-date">{new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>

            <div className="summary-row">
              <div className="stat-card stat-income">
                <div className="stat-label">รายรับ</div>
                <div className="stat-value">฿{summary.income.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
                <div className="stat-bar"><div className="stat-bar-fill income-fill" /></div>
              </div>
              <div className="stat-card stat-expense">
                <div className="stat-label">รายจ่าย</div>
                <div className="stat-value">฿{summary.expense.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
                <div className="stat-bar"><div className="stat-bar-fill expense-fill" /></div>
              </div>
              <div className="stat-card stat-balance">
                <div className="stat-label">คงเหลือ</div>
                <div className="stat-value">฿{summary.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
                <div className="stat-bar"><div className="stat-bar-fill balance-fill" /></div>
              </div>
            </div>

            <div className="two-col">
              <div className="card">
                <h3 className="card-title">จัดการ Tag</h3>
                <form onSubmit={handleAddTag} className="inline-form">
                  <input className="field-input" value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="ชื่อ Tag ใหม่" />
                  <button className="btn-sm" type="submit" disabled={loading}>เพิ่ม</button>
                </form>
                <div className="tag-row">
                  {tags.map((tag) => (
                    <span key={tag.id} className="tag-chip">{tag.name}</span>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 className="card-title">บันทึกรายการ</h3>
                <form onSubmit={handleAddTransaction} className="form-grid">
                  <div className="field">
                    <label className="field-label">ประเภท</label>
                    <select className="field-input" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as 'income' | 'expense' }))}>
                      <option value="expense">รายจ่าย</option>
                      <option value="income">รายรับ</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">จำนวนเงิน (฿)</label>
                    <input className="field-input" type="number" min="0" value={form.amount}
                      onChange={(e) => setForm((prev) => ({ ...prev, amount: Number(e.target.value) }))} />
                  </div>
                  <div className="field">
                    <label className="field-label">Tag</label>
                    <select className="field-input" value={form.tag} onChange={(e) => setForm((prev) => ({ ...prev, tag: e.target.value }))}>
                      <option value="">— เลือก Tag —</option>
                      {tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">รายละเอียด</label>
                    <input className="field-input" value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="หมายเหตุ (ไม่บังคับ)" />
                  </div>
                  {error && <div className="auth-error">{error}</div>}
                  <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'กำลังบันทึก...' : 'บันทึกรายการ'}</button>
                </form>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">ประวัติรายการ</h3>
              {sortedTransactions.length === 0 ? (
                <div className="empty-state">ยังไม่มีรายการ</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>วันที่</th><th>ประเภท</th><th>จำนวน</th><th>Tag</th><th>รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTransactions.map((item) => (
                        <tr key={item.id}>
                          <td>{new Date(item.date).toLocaleString('th-TH')}</td>
                          <td>
                            <span className={`type-badge ${item.type}`}>
                              {item.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                            </span>
                          </td>
                          <td className={item.type === 'income' ? 'amount-income' : 'amount-expense'}>
                            {item.type === 'income' ? '+' : '-'}฿{item.amount.toFixed(2)}
                          </td>
                          <td><span className="tag-chip sm">{item.tag}</span></td>
                          <td className="desc-cell">{item.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {currentPageDashboard === 'profile' && (
          <div className="page-content">
            <div className="page-header">
              <h2 className="page-title">โปรไฟล์</h2>
            </div>
            <div className="card profile-card">
              <div className="profile-avatar-row">
                <div className="profile-avatar">{username[0]?.toUpperCase()}</div>
                <div>
                  <div className="profile-name">{profile?.username}</div>
                  <div className="profile-since">สมาชิกตั้งแต่ {profile ? new Date(profile.createdAt).toLocaleDateString('th-TH') : ''}</div>
                </div>
              </div>

              {profile && !editMode ? (
                <div className="profile-fields">
                  <div className="profile-row">
                    <span className="profile-key">อีเมล</span>
                    <span className="profile-val">{profile.email || '—'}</span>
                  </div>
                  <div className="profile-row">
                    <span className="profile-key">เบอร์โทร</span>
                    <span className="profile-val">{profile.phone || '—'}</span>
                  </div>
                  <button className="btn-primary btn-narrow" onClick={() => { setEditMode(true); setEditData({ email: profile.email, phone: profile.phone }); }}>
                    แก้ไขข้อมูล
                  </button>
                </div>
              ) : (
                <form onSubmit={handleUpdateProfile} className="form-grid">
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
                  {error && <div className="auth-error">{error}</div>}
                  <div className="btn-pair">
                    <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                    <button className="btn-ghost" type="button" onClick={() => { setEditMode(false); setEditData({}); }}>ยกเลิก</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* AI */}
        {currentPageDashboard === 'ai' && (
          <div className="page-content">
            <div className="page-header">
              <h2 className="page-title">AI ผู้ช่วย</h2>
              <span className="page-sub">วิเคราะห์การเงินของคุณด้วย AI</span>
            </div>
            <div className="card">
              <form onSubmit={handleAIQuery} className="form-grid">
                <div className="field">
                  <label className="field-label">ถามคำถาม</label>
                  <textarea className="field-textarea" value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder="เช่น: เดือนนี้ฉันใช้เงินไปที่ไหนบ้าง? หรือควรลดค่าใช้จ่ายด้านไหน?"
                    rows={4} />
                </div>
                {error && <div className="auth-error">{error}</div>}
                <button className="btn-primary btn-narrow" type="submit" disabled={aiLoading}>
                  {aiLoading ? 'กำลังวิเคราะห์...' : 'ส่งคำถาม'}
                </button>
              </form>
            </div>

            {aiResponse && (
              <div className="ai-result">
                <div className="ai-section">
                  <h4 className="ai-section-title">สรุป</h4>
                  <p>{aiResponse.summary}</p>
                </div>
                <div className="ai-section">
                  <h4 className="ai-section-title">ข้อมูลเชิงลึก</h4>
                  <ul className="ai-list">
                    {aiResponse.insights.map((insight, idx) => <li key={idx}>{insight}</li>)}
                  </ul>
                </div>
                <div className="ai-section">
                  <h4 className="ai-section-title">คำแนะนำ</h4>
                  <ul className="ai-list">
                    {aiResponse.recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9"/><rect x="9" y="8" width="4" height="13"/><rect x="15" y="4" width="4" height="17"/>
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/>
    </svg>
  );
}
function IconAI() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  );
}

export default App;