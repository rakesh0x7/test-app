const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const filePath = path.join(__dirname, '../data/users.json');


// Helper functions
const readUsers = () => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeUsers = (users) => fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

// Registration Endpoint
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const users = readUsers();
        if (users.find((user) => user.email === email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: Date.now().toString(), name, email, password: hashedPassword };
        users.push(newUser);
        writeUsers(users);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login Endpoint
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const users = readUsers();
        const user = users.find((user) => user.email === email);
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Profile Endpoint
router.get('/profile', authMiddleware, (req, res) => {
    try {
       
        const users = readUsers();
        const user = users.find((user) => user.id === req.user.userId) || users.find((user) => user.id === req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { password, ...userData } = user;
        res.json(userData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Logout route
router.get("/logout", authMiddleware, (req, res) => {
    // Clear the token stored in localStorage (or session)
    res.clearCookie('token'); // Optional, depending on where you're storing the token
    res.redirect("/"); // Redirect to home page after logout
});


// Update Name Endpoint
router.put('/update-name', authMiddleware, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const users = readUsers();
        const userIndex = users.findIndex((user) => user.id === req.user.id);
        if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

        users[userIndex].name = name;
        writeUsers(users);
        res.json({ message: 'Name updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});





module.exports = router;
