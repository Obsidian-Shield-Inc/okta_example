import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate, Link } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth } from '@okta/okta-auth-js';

// Check if required environment variables are present
const issuer = process.env.REACT_APP_OKTA_ISSUER;
const clientId = process.env.REACT_APP_OKTA_CLIENT_ID;
// const clientSecret = process.env.REACT_APP_OKTA_CLIENT_SECRET; // Temporarily commented out for public client PKCE flow

if (!issuer || !clientId) {
  console.error('Missing required environment variables: REACT_APP_OKTA_ISSUER and/or REACT_APP_OKTA_CLIENT_ID');
}

// if (!clientSecret) {
//   console.warn('REACT_APP_OKTA_CLIENT_SECRET is not set. Proceeding as public client.');
// }

// Log Okta configuration (without sensitive data)
console.log('Okta Configuration (Frontend as Public Client with PKCE):', {
  issuer: issuer,
  clientId: clientId ? '***' : undefined,
  // hasClientSecret: !!clientSecret, // No longer relevant for this public client approach
  pkceEnabled: true,
  redirectUri: window.location.origin + '/login/callback'
});

const oktaAuth = new OktaAuth({
  issuer: issuer,
  clientId: clientId,
  // clientSecret: clientSecret, // Temporarily removed
  redirectUri: window.location.origin + '/login/callback',
  scopes: ['openid', 'profile', 'email'],
  pkce: true, // This is critical and MUST be true
  tokenManager: {
    storage: 'localStorage',
    autoRenew: true,
    secure: process.env.NODE_ENV === 'production',
    storageKey: 'okta-token-storage-pkce', // Changed key to avoid conflict
    autoRemove: true
  },
  cookies: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax'
  },
  devMode: process.env.NODE_ENV !== 'production'
});

// Custom SecureRoute component for React Router v6
function SecureRoute({ children }) {
  const { authState } = useOktaAuth();
  
  if (!authState) {
    return <div>Loading...</div>;
  }

  if (!authState.isAuthenticated) {
    console.log('User not authenticated, redirecting to login');
    return <Navigate to="/" replace />;
  }

  return children;
}

function Navigation() {
  const { oktaAuth, authState } = useOktaAuth();

  const login = async () => {
    try {
      console.log('Starting login process...');
      await oktaAuth.signInWithRedirect({
        originalUri: '/protected',
        scopes: ['openid', 'profile', 'email']
      });
      console.log('Redirecting to Okta...');
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please check the console for details.');
    }
  };

  const logout = async () => {
    try {
      console.log('Starting logout process...');
      await oktaAuth.signOut({
        postLogoutRedirectUri: window.location.origin
      });
    } catch (error) {
      console.error('Logout error:', error);
      alert('Logout failed. Please check the console for details.');
    }
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.navBrand}>Okta SSO Demo</div>
      <div style={styles.navLinks}>
        <Link to="/" style={styles.navLink}>Home</Link>
        <Link to="/protected" style={styles.navLink}>Protected Page</Link>
        {!authState?.isAuthenticated ? (
          <button onClick={login} style={styles.button}>Login</button>
        ) : (
          <button onClick={logout} style={styles.button}>Logout</button>
        )}
      </div>
    </nav>
  );
}

function Home() {
  const { authState } = useOktaAuth();
  
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Welcome to the Home Page!</h1>
      <p style={styles.text}>
        {authState?.isAuthenticated 
          ? "You are logged in. Try accessing the protected page!"
          : "Please log in to access protected content."}
      </p>
      {!authState?.isAuthenticated && (
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>
            If you're having trouble logging in, please check:
          </p>
          <ul style={styles.errorList}>
            <li>Your Okta domain is correct</li>
            <li>The application is properly configured in Okta</li>
            <li>The client ID is correct</li>
          </ul>
          <div style={styles.debugInfo}>
            <p>Debug Information:</p>
            <pre style={styles.pre}>
              {JSON.stringify({
                issuer: issuer,
                redirectUri: window.location.origin + '/login/callback',
                isAuthenticated: authState?.isAuthenticated,
                hasError: authState?.error
              }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Protected() {
  const { authState } = useOktaAuth();
  
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Protected Page</h1>
      <p style={styles.text}>
        {authState?.isAuthenticated 
          ? "You have successfully accessed the protected page!"
          : "You need to be logged in to see this content."}
      </p>
    </div>
  );
}

// Wrapper component to handle navigation
function SecurityWrapper({ children }) {
  const navigate = useNavigate();
  
  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    console.log('Restoring original URI:', originalUri);
    navigate(originalUri || '/');
  };

  const onAuthRequired = () => {
    console.log('Auth required, redirecting to home');
    navigate('/');
  };

  return (
    <Security 
      oktaAuth={oktaAuth}
      restoreOriginalUri={restoreOriginalUri}
      onAuthRequired={onAuthRequired}
    >
      <Navigation />
      {children}
    </Security>
  );
}

const styles = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#2c3e50',
    color: 'white',
  },
  navBrand: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
  },
  navLinks: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  navLink: {
    color: 'white',
    textDecoration: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    transition: 'background-color 0.3s',
    ':hover': {
      backgroundColor: '#34495e',
    },
  },
  button: {
    padding: '0.5rem 1rem',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    ':hover': {
      backgroundColor: '#2980b9',
    },
  },
  container: {
    maxWidth: '800px',
    margin: '2rem auto',
    padding: '2rem',
    textAlign: 'center',
  },
  title: {
    fontSize: '2rem',
    color: '#2c3e50',
    marginBottom: '1rem',
  },
  text: {
    fontSize: '1.1rem',
    color: '#34495e',
    lineHeight: '1.6',
  },
  errorContainer: {
    marginTop: '2rem',
    padding: '1rem',
    backgroundColor: '#f8d7da',
    borderRadius: '4px',
  },
  errorText: {
    color: '#721c24',
    marginBottom: '0.5rem',
  },
  errorList: {
    textAlign: 'left',
    color: '#721c24',
    margin: '0',
    paddingLeft: '1.5rem',
  },
  debugInfo: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
    textAlign: 'left',
  },
  pre: {
    backgroundColor: '#e9ecef',
    padding: '1rem',
    borderRadius: '4px',
    overflow: 'auto',
    fontSize: '0.9rem',
  },
};

function App() {
  return (
    <Router>
      <SecurityWrapper>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login/callback" element={<LoginCallback />} />
          <Route
            path="/protected"
            element={
              <SecureRoute>
                <Protected />
              </SecureRoute>
            }
          />
        </Routes>
      </SecurityWrapper>
    </Router>
  );
}

export default App; 