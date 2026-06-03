import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { connectDB, getDB } from './db';
import { Transaction, Tag } from './types';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate limiting map
const requestLimits = new Map<string, { count: number; resetTime: number }>();
const MAX_REQUESTS = 100; // requests per 15 minutes
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

// Rate limiting middleware
function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const limit = requestLimits.get(ip);

  if (limit && now < limit.resetTime) {
    limit.count++;
    if (limit.count > MAX_REQUESTS) {
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }
  } else {
    requestLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  }

  next();
}

// Security headers middleware
function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// Input sanitizer
function sanitizeInput(str: string): string {
  if (!str) return '';
  return str.trim().slice(0, 500).replace(/[<>"']/g, '');
}

app.use(rateLimitMiddleware);
app.use(securityHeaders);
app.use(cors({ 
  origin: CLIENT_ORIGIN, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

const authTokens = new Map<string, string>();

const defaultTags = ['Income', 'Food', 'Transport'];

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  if (!token.match(/^[a-f0-9-]+$/)) {
    return res.status(401).json({ message: 'Invalid token format' });
  }
  const userId = authTokens.get(token);
  if (!userId) {
    return res.status(401).json({ message: 'Invalid token' });
  }
  (req as any).userId = userId;
  next();
}

app.post('/api/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    
    // Input validation
    if (!username?.trim() || !password) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้และรหัสผ่านต้องถูกต้อง' });
    }

    const cleanUsername = sanitizeInput(username);
    
    // Username validation
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้ต้องมี 3-20 ตัวอักษร' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้มีเฉพาะตัวอักษร ตัวเลข และ underscore' });
    }

    // Password validation
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: 'รหัสผ่านต้องมี 8-128 ตัวอักษร' });
    }

    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ message: 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่' });
    }

    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ message: 'รหัสผ่านต้องมีตัวพิมพ์เล็ก' });
    }

    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ message: 'รหัสผ่านต้องมีตัวเลข' });
    }

    if (!/[^a-zA-Z0-9]/.test(password)) {
      return res.status(400).json({ message: 'รหัสผ่านต้องมีอักขระพิเศษ' });
    }

    const db = getDB();
    const users = db.collection('users');
    const existing = await users.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้ถูกใช้งานแล้ว' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await users.insertOne({ 
      username: cleanUsername, 
      passwordHash, 
      email: '',
      phone: '',
      createdAt: new Date() 
    });
    const userId = result.insertedId;

    const tags = db.collection('tags');
    await tags.insertMany(
      defaultTags.map((name) => ({ userId, name, createdAt: new Date() }))
    );

    res.status(201).json({ username: cleanUsername });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

app.post('/api/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username?.trim() || !password) {
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const cleanUsername = sanitizeInput(username);
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const db = getDB();
    const users = db.collection('users');
    const user = await users.findOne({ username: cleanUsername });
    
    if (!user) {
      // Prevent timing attacks
      await bcrypt.compare(password, '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = randomUUID();
    authTokens.set(token, user._id.toHexString());
    
    // Set token expiry (1 hour)
    setTimeout(() => {
      authTokens.delete(token);
    }, 60 * 60 * 1000);

    res.json({ token, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

app.get('/api/tags', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const db = getDB();
    const tags = await db
      .collection('tags')
      .find({ userId: new ObjectId(userId) })
      .limit(1000)
      .toArray();
    res.json(tags.map((tag) => ({ id: tag._id.toHexString(), name: tag.name })));
  } catch (err) {
    console.error('Get tags error:', err);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

app.post('/api/tags', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { name } = req.body as { name: string };
    
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Tag name is required' });
    }

    const cleanName = sanitizeInput(name);
    if (cleanName.length < 1 || cleanName.length > 50) {
      return res.status(400).json({ message: 'Tag name must be 1-50 characters' });
    }

    const db = getDB();
    const existing = await db.collection('tags').findOne({
      userId: new ObjectId(userId),
      name: cleanName
    });
    
    if (existing) {
      return res.status(400).json({ message: 'Tag already exists' });
    }

    const result = await db.collection('tags').insertOne({
      userId: new ObjectId(userId),
      name: cleanName,
      createdAt: new Date()
    });
    
    res.status(201).json({ id: result.insertedId.toHexString(), name: cleanName });
  } catch (err) {
    console.error('Create tag error:', err);
    res.status(500).json({ message: 'Failed to create tag' });
  }
});

app.get('/api/transactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const db = getDB();
    const transactions = await db
      .collection('transactions')
      .find({ userId: new ObjectId(userId) })
      .sort({ date: -1 })
      .limit(1000)
      .toArray();
    res.json(
      transactions.map((transaction) => ({
        id: transaction._id.toHexString(),
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description,
        tag: transaction.tag,
        date: transaction.date.toISOString()
      }))
    );
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { type, amount, description, tag, date} = req.body as {
      type: 'income' | 'expense';
      amount: number;
      description: string;
      tag: string;
      date?: string;
    };

    // Validation
    if (!type || type !== 'income' && type !== 'expense') {
      return res.status(400).json({ message: 'ประเภทไม่ถูกต้อง' });
    }

    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ message: 'จำนวนเงินไม่ถูกต้อง' });
    }

    if (!tag?.trim()) {
      return res.status(400).json({ message: 'Tag ไม่ถูกต้อง' });
    }

    const cleanTag = sanitizeInput(tag);
    const cleanDescription = sanitizeInput(description || '');

    const db = getDB();
    const result = await db.collection('transactions').insertOne({
      userId: new ObjectId(userId),
      type,
      amount,
      description: cleanDescription,
      tag: cleanTag,
      date: date ? new Date(date) : new Date()   // ← แทนที่ date: new Date()
    });

    res.status(201).json({
      id: result.insertedId.toHexString(),
      type,
      amount,
      description: cleanDescription,
      tag: cleanTag,
      date: new Date().toISOString()
    });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ message: 'Failed to create transaction' });
  }
});

app.get('/api/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const db = getDB();
    const transactions = await db.collection('transactions').find({ userId: new ObjectId(userId) }).toArray();
    const income = transactions.filter((item) => item.type === 'income').reduce((acc, item) => acc + item.amount, 0);
    const expense = transactions.filter((item) => item.type === 'expense').reduce((acc, item) => acc + item.amount, 0);
    res.json({ income, expense, balance: income - expense });
  } catch (err) {
    console.error('Get summary error:', err);
    res.status(500).json({ message: 'Failed to fetch summary' });
  }
});

app.get('/api/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    }
    res.json({
      id: user._id.toHexString(),
      username: user.username,
      email: user.email || '',
      phone: user.phone || '',
      createdAt: user.createdAt.toISOString()
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

app.put('/api/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { email, phone } = req.body as { email?: string; phone?: string };
    
    const db = getDB();
    const updateData: any = {};
    
    if (email) {
      const cleanEmail = sanitizeInput(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ message: 'Email ไม่ถูกต้อง' });
      }
      updateData.email = cleanEmail;
    }
    
    if (phone) {
      const cleanPhone = sanitizeInput(phone);
      if (!/^[0-9\-\+\s()]+$/.test(cleanPhone) || cleanPhone.length > 20) {
        return res.status(400).json({ message: 'เบอร์โทรไม่ถูกต้อง' });
      }
      updateData.phone = cleanPhone;
    }
    
    const result = await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: updateData },
      { returnDocument: 'after' }
    );
    
    if (!result) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    }
    
    const user = result;
    res.json({
      id: user._id.toHexString(),
      username: user.username,
      email: user.email || '',
      phone: user.phone || '',
      createdAt: user.createdAt.toISOString()
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// PUT /api/transactions/:id — แก้ไขรายการ
app.put('/api/transactions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { id } = req.params;

    if (!id.match(/^[a-f0-9]{24}$/)) {
      return res.status(400).json({ message: 'Invalid transaction ID' });
    }

    const { type, amount, description, tag, date } = req.body as {
      type: 'income' | 'expense';
      amount: number;
      description: string;
      tag: string;
      date?: string;
    };

    if (!type || (type !== 'income' && type !== 'expense')) {
      return res.status(400).json({ message: 'ประเภทไม่ถูกต้อง' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ message: 'จำนวนเงินไม่ถูกต้อง' });
    }
    if (!tag?.trim()) {
      return res.status(400).json({ message: 'Tag ไม่ถูกต้อง' });
    }

    const cleanTag = sanitizeInput(tag);
    const cleanDescription = sanitizeInput(description || '');

    const db = getDB();
    const result = await db.collection('transactions').findOneAndUpdate(
      { _id: new ObjectId(id), userId: new ObjectId(userId) },
      { $set: { type, amount, description: cleanDescription, tag: cleanTag,
          ...(date ? { date: new Date(date) } : {}) } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ message: 'ไม่พบรายการ' });
    }

    res.json({
      id: result._id.toHexString(),
      type: result.type,
      amount: result.amount,
      description: result.description,
      tag: result.tag,
      date: result.date.toISOString()
    });
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ message: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id — ลบรายการ
app.delete('/api/transactions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { id } = req.params;

    if (!id.match(/^[a-f0-9]{24}$/)) {
      return res.status(400).json({ message: 'Invalid transaction ID' });
    }

    const db = getDB();
    const result = await db.collection('transactions').deleteOne({
      _id: new ObjectId(id),
      userId: new ObjectId(userId)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'ไม่พบรายการ' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ message: 'Failed to delete transaction' });
  }
});

app.post('/api/ai-summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { question } = req.body as { question?: string };

    const db = getDB();
    const transactions = await db.collection('transactions').find({ userId: new ObjectId(userId) }).toArray();

    const income = transactions.filter((item) => item.type === 'income').reduce((acc, item) => acc + item.amount, 0);
    const expense = transactions.filter((item) => item.type === 'expense').reduce((acc, item) => acc + item.amount, 0);
    const balance = income - expense;

    const byTag: { [key: string]: number } = {};
    transactions.forEach((t) => {
      byTag[t.tag] = (byTag[t.tag] || 0) + (t.type === 'expense' ? -t.amount : t.amount);
    });

    const transactionSummary = Object.entries(byTag)
      .map(([tag, amount]) => `- ${tag}: ${amount >= 0 ? '+' : ''}${amount.toFixed(2)} บาท`)
      .join('\n');

    const userQuestion = question?.trim() || 'วิเคราะห์การเงินของฉันและให้คำแนะนำ';

    const prompt = `คุณเป็นที่ปรึกษาการเงินส่วนตัว วิเคราะห์ข้อมูลการเงินต่อไปนี้และตอบคำถามของผู้ใช้

ข้อมูลการเงิน:
- รายรับรวม: ${income.toFixed(2)} บาท
- รายจ่ายรวม: ${expense.toFixed(2)} บาท  
- คงเหลือ: ${balance.toFixed(2)} บาท
- จำนวนธุรกรรม: ${transactions.length} รายการ

แยกตาม Tag:
${transactionSummary || '- ยังไม่มีข้อมูล'}

คำถามของผู้ใช้: ${userQuestion}

ตอบเป็นภาษาไทย ในรูปแบบ JSON เท่านั้น ไม่ต้องมีข้อความอื่น:
{
  "summary": "สรุปภาพรวมการเงิน 1-2 ประโยค",
  "insights": ["ข้อสังเกต 1", "ข้อสังเกต 2", "ข้อสังเกต 3"],
  "recommendations": ["คำแนะนำ 1", "คำแนะนำ 2", "คำแนะนำ 3"]
}`;

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN not configured');
    }

    const aiRes = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${githubToken}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('GitHub AI error:', errText);
      throw new Error('AI service unavailable');
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      const clean = content.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = {
        summary: content,
        insights: ['ไม่สามารถแยกข้อมูลเชิงลึกได้'],
        recommendations: ['ไม่สามารถให้คำแนะนำได้']
      };
    }

    res.json(parsed);
  } catch (err) {
    console.error('AI summary error:', err);
    res.status(500).json({ message: 'Failed to generate AI summary' });
  }
});

app.get('/', (req: Request, res: Response) => {
  res.send('Expense Tracker API is running');
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
