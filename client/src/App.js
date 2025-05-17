import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate, Link } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth } from '@okta/okta-auth-js';
import UsersList from './components/UsersList';

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
  clientId: clientId,
  pkceEnabled: true,
  redirectUri: window.location.origin + '/login/callback',
  environment: process.env.NODE_ENV,
  hasIssuer: !!process.env.REACT_APP_OKTA_ISSUER,
  hasClientId: !!process.env.REACT_APP_OKTA_CLIENT_ID
});

const oktaAuth = new OktaAuth({
  issuer: issuer,
  clientId: clientId,
  redirectUri: window.location.origin + '/login/callback',
  scopes: ['openid', 'profile', 'email'],
  pkce: true,
  tokenManager: {
    storage: 'localStorage',
    autoRenew: true,
    secure: process.env.NODE_ENV === 'production',
    storageKey: 'okta-token-storage-pkce',
    autoRemove: true
  },
  cookies: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax'
  },
  devMode: process.env.NODE_ENV !== 'production',
  postLogoutRedirectUri: window.location.origin,
  responseType: ['token', 'id_token'],
  grantType: 'authorization_code',
  authParams: {
    pkce: true,
    issuer: issuer,
    display: 'page',
    responseType: ['token', 'id_token'],
    responseMode: 'fragment',
    scopes: ['openid', 'profile', 'email'],
    tokenManager: {
      expireEarlySeconds: 120,
      autoRenew: true
    }
  }
});

// Add token event listeners for debugging
oktaAuth.tokenManager.on('added', (key, token) => {
  console.log('Token added:', key);
  console.log('Token claims:', token.claims);
  // Log specific claims we need
  if (token.claims) {
    console.log('Email:', token.claims.email);
    console.log('Sub:', token.claims.sub);
    console.log('Scopes:', token.claims.scp || token.claims.scope);
  }
});

oktaAuth.tokenManager.on('error', (error) => {
  console.error('Token error:', error);
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
        responseType: ['id_token', 'token'],
        scopes: ['openid', 'profile', 'email'],
        authParams: {
          responseMode: 'fragment',
          display: 'page',
          prompt: 'consent',
          nonce: Math.random().toString(36)
        }
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
        <Link to="/profile" style={styles.navLink}>Profile</Link>
        <Link to="/users" style={styles.navLink}>Users</Link>
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
  const { authState, oktaAuth } = useOktaAuth();
  const [backendData, setBackendData] = React.useState(null);
  const [error, setError] = React.useState(null);
  
  React.useEffect(() => {
    const fetchProtectedData = async () => {
      if (authState?.isAuthenticated) {
        try {
          // Get the access token specifically
          const accessToken = await oktaAuth.getAccessToken();
          console.log('Calling backend with access token');
          
          const response = await fetch('http://localhost:8000/api/protected', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
          }
          
          const data = await response.json();
          setBackendData(data);
          setError(null);
        } catch (err) {
          console.error('Error fetching protected data:', err);
          setError(err.message);
          setBackendData(null);
        }
      }
    };

    fetchProtectedData();
  }, [authState, oktaAuth]);
  
  if (!authState) {
    return <div>Loading...</div>;
  }
  
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Protected Page</h1>
      {authState.isAuthenticated ? (
        <div>
          <p style={styles.text}>You have successfully accessed the protected page!</p>
          {backendData && (
            <div style={styles.successContainer}>
              <h2>Backend Response:</h2>
              <pre style={styles.pre}>{JSON.stringify(backendData, null, 2)}</pre>
            </div>
          )}
          {error && (
            <div style={styles.errorContainer}>
              <h2>Error:</h2>
              <p style={styles.errorText}>{error}</p>
              <p>Please check:</p>
              <ul>
                <li>Backend server is running</li>
                <li>CORS is properly configured</li>
                <li>Token is being sent correctly</li>
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p style={styles.text}>You need to be logged in to see this content.</p>
      )}
    </div>
  );
}

function UserProfile() {
  const { authState, oktaAuth } = useOktaAuth();
  const [userData, setUserData] = React.useState(null);
  const [error, setError] = React.useState(null);
  
  React.useEffect(() => {
    const fetchUserData = async () => {
      if (authState?.isAuthenticated) {
        try {
          // Get tokens
          const accessToken = await oktaAuth.getAccessToken();
          
          // Get user info from Okta's UserInfo endpoint
          const userInfo = await oktaAuth.token.getUserInfo();
          console.log('Okta UserInfo:', userInfo);
          
          // Get ID token for additional claims
          const idToken = await oktaAuth.getIdToken();
          console.log('ID Token Claims:', await oktaAuth.token.decode(idToken));
          
          const response = await fetch('http://localhost:8000/api/users/me', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-ID-Token': idToken,
              'X-User-Info': JSON.stringify({
                name: userInfo.name,
                given_name: userInfo.given_name,
                family_name: userInfo.family_name,
                email: userInfo.email
              })
            }
          });
          
          if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
          }
          
          const data = await response.json();
          setUserData(data);
          setError(null);
        } catch (err) {
          console.error('Error fetching user data:', err);
          setError(err.message);
          setUserData(null);
        }
      }
    };

    fetchUserData();
  }, [authState, oktaAuth]);
  
  if (!authState) {
    return <div>Loading...</div>;
  }
  
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>User Profile</h1>
      {authState.isAuthenticated ? (
        <div>
          {userData && (
            <div style={styles.successContainer}>
              <h2>Your Profile:</h2>
              <pre style={styles.pre}>{JSON.stringify(userData, null, 2)}</pre>
            </div>
          )}
          {error && (
            <div style={styles.errorContainer}>
              <h2>Error:</h2>
              <p style={styles.errorText}>{error}</p>
            </div>
          )}
        </div>
      ) : (
        <p style={styles.text}>Please log in to view your profile.</p>
      )}
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
  successContainer: {
    marginTop: '2rem',
    padding: '1rem',
    backgroundColor: '#d4edda',
    borderRadius: '4px',
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
          <Route
            path="/profile"
            element={
              <SecureRoute>
                <UserProfile />
              </SecureRoute>
            }
          />
          <Route
            path="/users"
            element={
              <SecureRoute>
                <UsersList />
              </SecureRoute>
            }
          />
        </Routes>
      </SecurityWrapper>
    </Router>
  );
}

export default App; 