const express = require("express");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const jwt = require('jsonwebtoken');
const router = express.Router();

const CLIENT_ID = "335315419f615784535df69023a8edfcb659239b5fd5680d2ea5c9e8ca845fe8";
const CLIENT_SECRET = "472821f4692886d8db496ca38aa76efccd40d4469ecf78554d1f376e4daab655";
const REDIRECT_URI = "https://oauth-code.onrender.com/callback";
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

// Callback route for Sentry OAuth
router.get("/callback", async (req, res) => {
    const code = req.query.code;
    const state = req.query.state; // State parameter contains token and other details in the first call

    if (!code) {
        return res.status(400).send("Authorization code not provided");
    }

    try {
        if (state) {
            // Extract details from the state parameter (second request)
            const { jwtToken, refreshToken, code1, clientId, clientSecret, redirectUri } = JSON.parse(
                Buffer.from(state, "base64").toString()
            );

            console.log("Extracted JWT Token from State:", jwtToken);
            console.log("Refresh Token:", refreshToken);
            console.log("Authorization Code (1st):", code1);
            console.log("Authorization Code (2nd):", code);
            console.log("Client ID:", clientId);
            console.log("Client Secret:", clientSecret);
            console.log("Redirect URI:", redirectUri);

            // Send all the required details to the client and redirect to profile page
            return res.send(
                `<html>
                    <script>
                        window.localStorage.setItem('token', '${jwtToken}');
                        window.localStorage.setItem('refresh_token', '${refreshToken}');
                        window.localStorage.setItem('code1', '${code1}');
                        window.localStorage.setItem('code2', '${code}');
                        window.localStorage.setItem('client_id', '${clientId}');
                        window.localStorage.setItem('client_secret', '${clientSecret}');
                        window.localStorage.setItem('redirect_uri', '${redirectUri}');
                        window.location.href = 'profile.html';
                    </script>
                </html>`
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

        // Extract details from the token response
        const { access_token, refresh_token, user } = tokenResponse.data;
        console.log("Token Response:", tokenResponse.data);

        // Extract user details
        const email = user.email;
        const name = user.name;

        if (!email) {
            return res.status(500).send("Unable to fetch user email");
        }

        // Check if user exists
        let users = readUsers();
        let userRecord = users.find((u) => u.email === email);

        if (!userRecord) {
            // If user doesn't exist, register them
            const newUser = {
                id: users.length + 1,
                email,
                name: name || "New User",
                password: null, // Sentry login users won't have passwords
            };
            users.push(newUser);
            writeUsers(users);
            userRecord = newUser;
        }

        // Generate JWT token for the user
        const jwtToken = jwt.sign(
            { userId: userRecord.id, email: userRecord.email, name: userRecord.name },
            JWT_SECRET,
            { expiresIn: "1h" } // Set the expiration time for the token
        );

        // Redirect to Sentry's authorization page again for the second code
        const scope = encodeURIComponent("project:read event:read");
        const secondLoginUrl = `https://sentry.io/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${Buffer.from(
            JSON.stringify({
                jwtToken,
                refreshToken: refresh_token,
                code1: code,
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET,
                redirectUri: REDIRECT_URI,
            })
        ).toString("base64")}`;

        console.log("Redirecting to fetch second authorization code...");
        return res.redirect(secondLoginUrl);
    } catch (error) {
        console.error("Error during Sentry OAuth:", error.message);
        return res.status(500).send("Something went wrong during the OAuth process");
    }
});

module.exports = router;
