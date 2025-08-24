// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 4000

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// --- Database Setup ---
const dbPath = path.resolve(__dirname, 'shoppingpaglu.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDb();
    }
});

function initializeDb() {
    db.serialize(() => {
        // Create users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT
        )`, (err) => {
            if (err) console.error('Error creating users table', err.message);
        });

        // Create products table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT,
            price REAL,
            description TEXT,
            imageUrl TEXT
        )`, (err) => {
            if (err) console.error('Error creating products table', err.message);
            else seedProducts(); // Seed products after table creation
        });

        // Create orders table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userEmail TEXT,
            orderDate TEXT,
            totalAmount REAL
        )`, (err) => {
            if (err) console.error('Error creating orders table', err.message);
        });

        // Create order_items table
        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId INTEGER,
            productId TEXT,
            quantity INTEGER,
            price REAL,
            FOREIGN KEY (orderId) REFERENCES orders (id),
            FOREIGN KEY (productId) REFERENCES products (id)
        )`, (err) => {
             if (err) console.error('Error creating order_items table', err.message);
        });
    });
}

function seedProducts() {
    const products = [
        { id: 'p1', name: 'Classic Tee', price: 499, description: 'A comfortable and stylish tee for everyday wear.', imageUrl: 'https://placehold.co/600x400/6366f1/ffffff?text=Classic+Tee' },
        { id: 'p2', name: 'Denim Jeans', price: 1999, description: 'Perfectly fitted denim jeans for any occasion.', imageUrl: 'https://placehold.co/600x400/3b82f6/ffffff?text=Denim+Jeans' },
        { id: 'p3', name: 'Leather Jacket', price: 4999, description: 'A timeless leather jacket that adds an edge to your look.', imageUrl: 'https://placehold.co/600x400/1f2937/ffffff?text=Leather+Jacket' },
        { id: 'p4', name: 'Running Sneakers', price: 2499, description: 'Lightweight and supportive sneakers for your daily run.', imageUrl: 'https://placehold.co/600x400/10b981/ffffff?text=Sneakers' },
        { id: 'p5', name: 'Stylish Watch', price: 7999, description: 'An elegant watch to complete your sophisticated look.', imageUrl: 'https://placehold.co/600x400/8b5cf6/ffffff?text=Watch' },
        { id: 'p6', name: 'Wool Scarf', price: 799, description: 'A warm and cozy scarf for chilly days.', imageUrl: 'https://placehold.co/600x400/ef4444/ffffff?text=Scarf' },
        { id: 'p7', name: 'Canvas Backpack', price: 1499, description: 'A durable and spacious backpack for all your essentials.', imageUrl: 'https://placehold.co/600x400/f97316/ffffff?text=Backpack' },
        { id: 'p8', name: 'Sunglasses', price: 999, description: 'Protect your eyes in style with these modern sunglasses.', imageUrl: 'https://placehold.co/600x400/f59e0b/ffffff?text=Sunglasses' },
    ];

    const stmt = db.prepare("INSERT OR IGNORE INTO products (id, name, price, description, imageUrl) VALUES (?, ?, ?, ?, ?)");
    products.forEach(p => {
        stmt.run(p.id, p.name, p.price, p.description, p.imageUrl);
    });
    stmt.finalize();
    console.log('Products seeded with INR prices.');
}


// --- API Routes ---

// Register a new user
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    // NOTE: In a real app, hash the password before storing!
    const sql = `INSERT INTO users (email, password) VALUES (?, ?)`;
    db.run(sql, [email, password], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(400).json({ message: 'This email is already registered.' });
        }
        res.status(201).json({ email: email, id: this.lastID });
    });
});

// Login a user
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = ? AND password = ?`;
    db.get(sql, [email, password], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Server error' });
        }
        if (row) {
            res.json({ message: 'Login successful', email: row.email });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    });
});

// Get all products
app.get('/api/products', (req, res) => {
    const sql = `SELECT * FROM products`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching products' });
        }
        res.json(rows);
    });
});

// Get a single product by ID
app.get('/api/products/:id', (req, res) => {
    const sql = `SELECT * FROM products WHERE id = ?`;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching product' });
        }
        if (row) {
            res.json(row);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    });
});

// Create a new order
app.post('/api/orders', (req, res) => {
    const { userEmail, cart } = req.body;
    
    // 1. Get product details from DB to calculate total
    const productIds = Object.keys(cart);
    if (productIds.length === 0) {
        return res.status(400).json({ message: 'Cart is empty' });
    }
    const placeholders = productIds.map(() => '?').join(',');
    const sqlProducts = `SELECT * FROM products WHERE id IN (${placeholders})`;

    db.all(sqlProducts, productIds, (err, products) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching product details for order.' });
        }

        let subtotal = 0;
        products.forEach(p => {
            const quantity = cart[p.id];
            subtotal += p.price * quantity;
        });
        const tax = subtotal * 0.08;
        const totalAmount = subtotal + tax;

        // 2. Insert into orders table
        const sqlOrder = `INSERT INTO orders (userEmail, orderDate, totalAmount) VALUES (?, ?, ?)`;
        db.run(sqlOrder, [userEmail, new Date().toISOString(), totalAmount], function(err) {
            if (err) {
                return res.status(500).json({ message: 'Failed to create order.' });
            }
            const orderId = this.lastID;

            // 3. Insert into order_items table
            const sqlItems = `INSERT INTO order_items (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)`;
            const stmtItems = db.prepare(sqlItems);
            products.forEach(p => {
                stmtItems.run(orderId, p.id, cart[p.id], p.price);
            });
            stmtItems.finalize((err) => {
                if(err) {
                    return res.status(500).json({ message: 'Failed to save order items.' });
                }
                res.status(201).json({ message: 'Order created successfully', orderId: orderId });
            });
        });
    });
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
