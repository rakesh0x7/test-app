const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const jwt = require('jsonwebtoken');
const router = express.Router();

const CLIENT_ID = "186dd9d367bb4bdced88ec5970b82916f4ac7ad6c77ecb422b8acefa259515f0";
const CLIENT_SECRET = "6d49285c3d00cb16e560d782c80cd232775b042168be004efc3a6c94a815a794";
const REDIRECT_URI = "http://localhost:5000/callback";
const JWT_SECRET = process.env.JWT_SECRET; // Ensure you have a secret for JWT

// Utility functions for managing users
const USERS_FILE = path.join(__dirname, "../data/users.json");
const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
const writeUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

// Route to initiate login with Sentry
router.get("/sentry-login", (req, res) => {
    const scope = encodeURIComponent("project:read event:read"); // Specify the required scopes
    const loginUrl = `https://sentry.io/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}`;
    res.redirect(loginUrl);
});


// Callback route for Sentry OAuth
router.get("/callback", async (req, res) => {
    const code = req.query.code;
    const state = req.query.state; // State parameter contains the token in the first call

    if (!code) {
        return res.status(400).send("Authorization code not provided");
    }

    try {
        if (state) {
            // Extract the token from the state parameter (second request)
            console.log("Extracted Token from State:", state);
            console.log("Authorization Code (2nd):", code);
        

            // Log the second code and redirect the user to their profile page
            return res.send(
                `<html><script>window.localStorage.setItem('token', '${state}'); window.localStorage.setItem('code', '${code}'); window.location.href = 'profile.html';</script></html>`
            );
        }

        // Handle the first authorization code
        console.log("Authorization Code (1st):", code);

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
        const { data } = tokenResponse;
        console.log("Token Response:", data);

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

       
        // Redirect to Sentry's authorization page again for the second code
        const scope = encodeURIComponent("project:read event:read");
        const secondLoginUrl = `https://sentry.io/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${token}`;

        console.log("Redirecting to fetch second authorization code...");
        return res.redirect(secondLoginUrl);
    } catch (error) {
        console.error("Error during Sentry OAuth:", error.message);
        return res.status(500).send("Something went wrong during the OAuth process");
    }
});

module.exports = router;
