import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'qamqor',
  port: process.env.DB_PORT || 5432
});

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyDvdyss_1je7sczXOSzie2GzdUc6VUFHIc');

// Database initialization function
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(10) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create quotes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create tips table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tips (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create feedback table
    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check if admin user exists, create if not
    const adminResult = await client.query(`
      SELECT * FROM users WHERE email = 'admin@qamqor.kz'
    `);

    if (adminResult.rowCount === 0) {
      const hashedPassword = await bcrypt.hash('QamqorAdmin123', 10);
      await client.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ('Admin', 'admin@qamqor.kz', $1, 'admin')
      `, [hashedPassword]);
      console.log('Admin user created successfully.');
    }

    // Add some initial quotes and tips if tables are empty
    const quotesResult = await client.query(`SELECT COUNT(*) FROM quotes`);
    if (parseInt(quotesResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO quotes (text) VALUES
        ('Ақшаның құны - оны қалай жұмсайтыныңызда.'),
        ('Ақшаны табу қиын, ал сақтау одан да қиын.'),
        ('Қаржылық еркіндік - бұл уақытты сатып алу мүмкіндігі.')
      `);
      console.log('Initial quotes added.');
    }

    const tipsResult = await client.query(`SELECT COUNT(*) FROM tips`);
    if (parseInt(tipsResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO tips (text) VALUES
        ('Ақшаңыздың 20% әрдайым жинақ шотына аударыңыз.'),
        ('Онлайн банкингте екі факторлы аутентификацияны қосыңыз.'),
        ('Шығындарыңызды жазып, қадағалаңыз.')
      `);
      console.log('Initial tips added.');
    }

    client.release();
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Аутентификация қажет' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'qamqor_secret_key', (err, user) => {
    if (err) return res.status(403).json({ message: 'Токен жарамсыз' });
    req.user = user;
    next();
  });
}

// Admin middleware
function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Админ рұқсаты қажет' });
  }
}

// API Routes
// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Барлық өрістер толтырылуы керек' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ message: 'Құпия сөз кемінде 8 таңбадан тұруы керек' });
    }
    
    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Бұл email тіркелген' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, role',
      [name, email, hashedPassword]
    );
    
    const user = result.rows[0];
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      process.env.JWT_SECRET || 'qamqor_secret_key',
      { expiresIn: '24h' }
    );
    
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email және құпия сөз қажет' });
    }
    
    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email немесе құпия сөз қате' });
    }
    
    const user = result.rows[0];
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ message: 'Email немесе құпия сөз қате' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      process.env.JWT_SECRET || 'qamqor_secret_key',
      { expiresIn: '24h' }
    );
    
    res.json({ 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }, 
      token 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

// Profile route
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Пайдаланушы табылмады' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Атыңызды енгізіңіз' });
    }
    
    const result = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role',
      [name, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

// Main routes
app.get('/api/main/quote', async (req, res) => {
  try {
    // Get a random active quote
    const result = await pool.query(
      'SELECT * FROM quotes WHERE active = true ORDER BY RANDOM() LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Цитаталар табылмады' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Quote fetch error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.get('/api/main/tip', async (req, res) => {
  try {
    // Get a random active tip
    const result = await pool.query(
      'SELECT * FROM tips WHERE active = true ORDER BY RANDOM() LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Кеңестер табылмады' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Tip fetch error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

// Feedback route
app.post('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const { name, message } = req.body;
    
    if (!name || !message) {
      return res.status(400).json({ message: 'Атыңыз бен хабарламаңызды енгізіңіз' });
    }
    
    const result = await pool.query(
      'INSERT INTO feedback (name, message) VALUES ($1, $2) RETURNING *',
      [name, message]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Feedback submission error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

// Admin routes
app.get('/api/admin/messages', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM feedback';
    let params = [];
    
    if (search) {
      query += ' WHERE name ILIKE $1 OR message ILIKE $1';
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Admin messages fetch error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.get('/api/admin/content/quotes', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quotes ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin quotes fetch error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.post('/api/admin/content/quotes', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Мәтін қажет' });
    }
    
    const result = await pool.query(
      'INSERT INTO quotes (text) VALUES ($1) RETURNING *',
      [text]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Admin quote add error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.put('/api/admin/content/quotes/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { text, active } = req.body;
    
    if (text === undefined && active === undefined) {
      return res.status(400).json({ message: 'Өзгерту үшін деректер қажет' });
    }
    
    let query = 'UPDATE quotes SET';
    const params = [];
    
    if (text !== undefined) {
      query += ' text = $1';
      params.push(text);
    }
    
    if (active !== undefined) {
      if (params.length) query += ',';
      query += ` active = $${params.length + 1}`;
      params.push(active);
    }
    
    query += ` WHERE id = $${params.length + 1} RETURNING *`;
    params.push(id);
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Цитата табылмады' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Admin quote update error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.get('/api/admin/content/tips', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tips ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin tips fetch error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.post('/api/admin/content/tips', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Мәтін қажет' });
    }
    
    const result = await pool.query(
      'INSERT INTO tips (text) VALUES ($1) RETURNING *',
      [text]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Admin tip add error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

app.put('/api/admin/content/tips/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { text, active } = req.body;
    
    if (text === undefined && active === undefined) {
      return res.status(400).json({ message: 'Өзгерту үшін деректер қажет' });
    }
    
    let query = 'UPDATE tips SET';
    const params = [];
    
    if (text !== undefined) {
      query += ' text = $1';
      params.push(text);
    }
    
    if (active !== undefined) {
      if (params.length) query += ',';
      query += ` active = $${params.length + 1}`;
      params.push(active);
    }
    
    query += ` WHERE id = $${params.length + 1} RETURNING *`;
    params.push(id);
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Кеңес табылмады' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Admin tip update error:', err);
    res.status(500).json({ message: 'Сервер қатесі' });
  }
});

// Chat route with Gemini AI
app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Хабарлама қажет' });
    }
    
    // Define the system prompt for financial topics in Kazakh
    const systemPrompt = `Сен QamQor-дың қаржылық көмекшісісің. Қаржы саласында кеңес бер:
    1. Банк қауіпсіздігі
    2. Қаржылық жоспарлау
    3. Бюджет
    4. Жинақтау және несиелер
    5. Алаяқтықпен күрес
    6. Инвестициялау
    
    Егер сұрақ қаржы саласына қатысты болмаса, мынаны жауап бер:
    "QamQor — қаржылық көмекшіңіз. Қаржылық тақырыпқа сұрақ қойыңыз."
    
    Жауаптарыңды қазақ тілінде бер, қысқа және нақты түрде.`;
    
    // Generate Gemini response
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: message }
    ]);
    
    const response = result.response.text();
    res.json({ response });
  } catch (err) {
    console.error('Chat AI error:', err);
    res.status(500).json({ 
      message: 'AI сервис қатесі',
      error: err.message 
    });
  }
});

// Initialize database on startup
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize application:', err);
    process.exit(1);
  }); 