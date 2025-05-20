import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { Security, LoginCallback, useOktaAuth } from '@okta/okta-react';
import { OktaAuth } from '@okta/okta-auth-js';
import { ThemeProvider, CssBaseline } from '@mui/material';
import UsersList from './components/UsersList';
import Layout from './components/Layout';
import { getTheme } from './theme';

// Check if required environment variables are present
const issuer = process.env.REACT_APP_OKTA_ISSUER;
const clientId = process.env.REACT_APP_OKTA_CLIENT_ID;

if (!issuer || !clientId) {
  console.error('Missing required environment variables: REACT_APP_OKTA_ISSUER and/or REACT_APP_OKTA_CLIENT_ID');
}

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

function Home() {
  const { authState } = useOktaAuth();
  
  return (
    <div>
      <h1>Welcome to the Home Page!</h1>
      <p>
        {authState?.isAuthenticated 
          ? "You are logged in. Try accessing the protected page!"
          : "Please log in to access protected content."}
      </p>
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
          const accessToken = await oktaAuth.getAccessToken();
          console.log('Calling backend with access token');
          
          const response = await fetch('http://localhost:8000/api/protected', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            mode: 'cors'
          });
          
          if (!response.ok) {
            throw new Error(`Backend error: ${response.status} - ${await response.text()}`);
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
  
  return (
    <div>
      <h1>Protected Page</h1>
      {authState?.isAuthenticated ? (
        <div>
          <p>You have successfully accessed the protected page!</p>
          {backendData && (
            <div>
              <h2>Backend Response:</h2>
              <pre>{JSON.stringify(backendData, null, 2)}</pre>
            </div>
          )}
          {error && (
            <div>
              <h2>Error:</h2>
              <p>{error}</p>
            </div>
          )}
        </div>
      ) : (
        <p>You need to be logged in to see this content.</p>
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
          const accessToken = await oktaAuth.getAccessToken();
          const userInfo = await oktaAuth.token.getUserInfo();
          console.log('Okta UserInfo:', userInfo);
          
          const idToken = await oktaAuth.getIdToken();
          
          const response = await fetch('http://localhost:8000/api/users/me', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-ID-Token': idToken
            },
            credentials: 'include',
            mode: 'cors'
          });

          if (!response.ok) {
            throw new Error(`Backend error: ${response.status} - ${await response.text()}`);
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
  
  return (
    <div>
      <h1>User Profile</h1>
      {authState?.isAuthenticated ? (
        <div>
          {userData && (
            <div>
              <h2>Your Profile:</h2>
              <pre>{JSON.stringify(userData, null, 2)}</pre>
            </div>
          )}
          {error && (
            <div>
              <h2>Error:</h2>
              <p>{error}</p>
            </div>
          )}
        </div>
      ) : (
        <p>Please log in to view your profile.</p>
      )}
    </div>
  );
}

// Wrapper component to handle navigation and theme
function SecurityWrapper({ children }) {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState('light');
  
  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const restoreOriginalUri = async (_oktaAuth, originalUri) => {
    console.log('Restoring original URI:', originalUri);
    navigate(originalUri || '/');
  };

  const onAuthRequired = () => {
    console.log('Auth required, redirecting to home');
    navigate('/');
  };

  return (
    <ThemeProvider theme={getTheme(mode)}>
      <CssBaseline />
      <Security 
        oktaAuth={oktaAuth}
        restoreOriginalUri={restoreOriginalUri}
        onAuthRequired={onAuthRequired}
      >
        <Layout toggleColorMode={toggleColorMode}>
          {children}
        </Layout>
      </Security>
    </ThemeProvider>
  );
}

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