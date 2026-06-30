const express = require('express');
const cors = require('cors'); // --- IMPORT CORS FOR CROSS-ORIGIN REQUESTS ---
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mysql = require('mysql2');
const { Kafka } = require('kafkajs'); // --- IMPORT KAFKA ---

const app = express();
app.use(cors()); // --- ENABLE CORS POLICY FOR FRONTEND ACCESS ---
app.use(express.json());

// --- DATABASE CONNECTION POOL ---
const db = mysql.createPool({
  // Matches your exact Docker Compose service name 'mysql'
  host: process.env.DB_HOST || 'mysql',
  user: process.env.DB_USER || 'myuser',
  password: process.env.DB_PASSWORD || 'mypassword',
  database: process.env.DB_DATABASE || 'mydatabase',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// --- KAFKA CLIENT CONFIGURATION ---
const kafka = new Kafka({
  clientId: 'task-manager-backend',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'] //  FIXED: Corrected default internal port to 9092
});

const producer = kafka.producer();

async function connectKafka() {
  try {
    await producer.connect();
    console.log('Successfully connected to Apache Kafka Broker');
  } catch (err) {
    console.error('Failed to connect to Kafka, retrying in 5 seconds...', err);
    setTimeout(connectKafka, 5000);
  }
}
connectKafka();

// --- SCHEMA & STRUCTURAL INITIALIZATION ---
function initializeDatabaseWithRetry() {
  console.log("Attempting to connect to database and initialize schema...");

  // FIXED: Removed the trailing syntax typo here
  db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL
    )
  `, (err) => {
    if (err) {
      if (err.code === 'ECONNREFUSED') {
        console.warn("Database not ready yet. Retrying connection in 3 seconds...");
        setTimeout(initializeDatabaseWithRetry, 3000);
      } else {
        console.error("Database schema initialization error:", err);
      }
      return;
    }

    console.log("Successfully connected! Initializing tables...");

    db.query(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'To Do',
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, () => {
      // Clear out any old or conflicted admin row records from prior init.sql loops
      db.query('DELETE FROM users WHERE id = 1 OR username = "admin"', () => {
        // Seed default admin securely with fresh runtime bcrypt hashing
        const saltRounds = 10;
        bcrypt.hash('password', saltRounds, (hashErr, hashedPassword) => {
          if (!hashErr) {
            db.query(
              'INSERT INTO users (id, username, password) VALUES (1, "admin", ?)',
              [hashedPassword],
              (insertErr) => {
                if (insertErr) {
                  console.error("Database seeding failure:", insertErr);
                } else {
                  console.log("✅ Admin user seeded successfully with password: 'password'!");
                }
              }
            );
          }
        });
      });
    });
  });
}

// Start database check loop
initializeDatabaseWithRetry();


// --- SECURITY PROTOCOL INTERCEPTOR (MIDDLEWARE) ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract from "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Security token missing.' });
  }

  const tokenVerificationQuery = `
    SELECT user_tokens.token, users.id, users.username
    FROM user_tokens
    JOIN users ON user_tokens.user_id = users.id
    WHERE user_tokens.token = ?`;

  db.query(tokenVerificationQuery, [token], (err, results) => {
    if (err || results.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired access token.' });
    }
    req.user = results[0]; // Inject verified user payload into request pipeline
    next();
  });
}


// --- SECURE AUTHENTICATION ENDPOINTS ---

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password fields are required.' });
  }

  db.query('SELECT * FROM users WHERE username = ?', [username.trim()], (err, results) => {
    if (err) return res.status(500).json({ error: 'Internal server query failure.' });
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = results[0];

    // Check hashed password
    bcrypt.compare(password, user.password, (cryptErr, isMatch) => {
      if (cryptErr || !isMatch) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      // Generate secure high-entropy random token
      const generatedSessionToken = crypto.randomBytes(32).toString('hex');

      db.query('INSERT INTO user_tokens (user_id, token) VALUES (?, ?)', [user.id, generatedSessionToken], (insertErr) => {
        if (insertErr) return res.status(500).json({ error: 'Failed to record session token.' });
        res.json({ message: 'Login successful', token: generatedSessionToken });
      });
    });
  });
});


// --- STATEFUL REST API ENDPOINTS FOR TASKS ---

// GET /tasks — Fetch entries belonging exclusively to the logged-in user
app.get('/tasks', authenticateToken, (req, res) => {
  db.query('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database task tracking extraction failed.' });
    res.json(results);
  });
});

// POST /tasks — Create persistent entry linked to active user context
app.post('/tasks', authenticateToken, (req, res) => {
  const { title, description } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const queryInsert = 'INSERT INTO tasks (title, description, status, user_id) VALUES (?, ?, "To Do", ?)';
  db.query(queryInsert, [title.trim(), description || '', req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database execution write failure for task.' });

    const newTask = {
      id: result.insertId,
      title: title.trim(),
      description: description || '',
      status: 'To Do',
      user_id: req.user.id
    };

    // --- KAFKA EVENT FOR TASK CREATION ---
    producer.send({
      topic: 'task-events',
      messages: [
        { key: String(newTask.id), value: JSON.stringify({ event: 'TASK_CREATED', data: newTask }) }
      ]
    }).catch((kafkaErr) => {
      console.error('Failed to dispatch TASK_CREATED event to Kafka:', kafkaErr);
    });

    res.status(201).json(newTask);
  });
});

// PATCH /tasks/:id — Update a specific task status
app.patch('/tasks/:id', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const { status } = req.body;

  if (!status) return res.status(400).json({ error: 'Status field is required.' });

  const queryUpdate = 'UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?';
  db.query(queryUpdate, [status, taskId, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Task patch modifications rejected.' });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Task not found or unauthorized.' });

    // --- KAFKA EVENT FOR TASK UPDATE ---
    producer.send({
      topic: 'task-events',
      messages: [
        { key: String(taskId), value: JSON.stringify({ event: 'TASK_UPDATED', data: { id: parseInt(taskId), status, user_id: req.user.id } }) }
      ]
    }).catch((kafkaErr) => {
      console.error('Failed to dispatch TASK_UPDATED event to Kafka:', kafkaErr);
    });

    res.json({ id: parseInt(taskId), status });
  });
});

// DELETE /tasks/:id — Remove an entry cleanly from database
app.delete('/tasks/:id', authenticateToken, (req, res) => {
  const taskId = req.params.id;

  const queryDelete = 'DELETE FROM tasks WHERE id = ? AND user_id = ?';
  db.query(queryDelete, [taskId, req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Database removal execution error.' });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Task not found or unauthorized.' });

    // --- KAFKA EVENT FOR TASK DELETION ---
    producer.send({
      topic: 'task-events',
      messages: [
        { key: String(taskId), value: JSON.stringify({ event: 'TASK_DELETED', data: { id: parseInt(taskId), user_id: req.user.id } }) }
      ]
    }).catch((kafkaErr) => {
      console.error('Failed to dispatch TASK_DELETED event to Kafka:', kafkaErr);
    });

    res.json({ message: `Task ${taskId} dropped successfully.` });
  });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});