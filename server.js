const express = require('express');
const cors = require('cors');
const { JwtVerifier } = require('@okta/jwt-verifier');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Okta JWT Verifier
const oktaJwtVerifier = new JwtVerifier({
  issuer: process.env.OKTA_ISSUER,
  clientId: process.env.OKTA_CLIENT_ID
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const jwt = await oktaJwtVerifier.verifyAccessToken(token);
    req.user = jwt.claims;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Protected route example
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({
    message: 'This is a protected route',
    user: req.user
  });
});

// Public route example
app.get('/api/public', (req, res) => {
  res.json({ message: 'This is a public route' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 