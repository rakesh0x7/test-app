const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const jwt = require('jsonwebtoken');
const router = express.Router();

const CLIENT_ID = "0ec6c7fce99b0338cb80c61223c4abe55ec919c9f8c924386c9d3dcfd2644092";
const CLIENT_SECRET = "57d895931cf6bb142bd9616d9b77b5f81dde43360c0cd767bcd883405dcc362f";
const REDIRECT_URI = "http://localhost:5000/callback";
const JWT_SECRET = process.env.JWT_SECRET; // Ensure you have a secret for JWT

// Utility functions for managing users
const USERS_FILE = path.join(__dirname, "../data/users.json");
const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
const writeUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

// Route to initiate login with Sentry
router.get("/sentry-login", (req, res) => {

    const loginUrl = `https://sentry.io/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code`;
    res.redirect(loginUrl);
});

// Callback route for Sentry OAuth
router.get("/callback", async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).send("Authorization code not provided");
    }

    try {
        // Exchange authorization code for access token
        const tokenResponse = await axios.post(
            "https://sentry.io/oauth/token/",
            new URLSearchParams({
                grant_type: "authorization_code",
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                redirect_uri: REDIRECT_URI,
            }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        // Extract user details from the token response
        const { data } = tokenResponse; // Assuming tokenResponse contains the structure as given
        // console.log(data);

        // Extract user data
        const email = data.user.email;
        const name = data.user.name;

        if (!email) {
            return res.status(500).send("Unable to fetch user email");
        }

        // Check if user exists
        let users = readUsers();
        let user = users.find((u) => u.email === email);
     

        if (!user) {
            // If user doesn't exist, register them
            const newUser = {
                id: users.length + 1,
                email,
                name: name || "New User",
                password: null, // Sentry login users won't have passwords
            };
            users.push(newUser);
            writeUsers(users);
            user = newUser;
        }

        // Create JWT token for the user
        const token = jwt.sign(
            { userId: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '1h' } // Set the expiration time for the token
        );


        res.send("<html><script>window.localStorage.setItem('token', '"+token+"');window.location.href = 'profile.html';</script></html>")

    } catch (error) {
        console.error("Error during Sentry OAuth:", error.message);
        res.status(500).send("Something went wrong during the OAuth process");
    }
});

module.exports = router;
