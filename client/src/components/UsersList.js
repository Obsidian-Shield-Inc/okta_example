import React from 'react';
import { useOktaAuth } from '@okta/okta-react';

function UsersList() {
  const { authState, oktaAuth } = useOktaAuth();
  const [users, setUsers] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchUsers = async () => {
      if (authState?.isAuthenticated) {
        try {
          const accessToken = await oktaAuth.getAccessToken();
          const response = await fetch('http://localhost:8000/api/users', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!response.ok) {
            if (response.status === 403) {
              throw new Error('You do not have permission to view the users list.');
            }
            throw new Error(`Error fetching users: ${response.status}`);
          }

          const data = await response.json();
          setUsers(data);
          setError(null);
        } catch (err) {
          console.error('Error fetching users:', err);
          setError(err.message);
          setUsers(null);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchUsers();
  }, [authState, oktaAuth]);

  if (!authState) {
    return <div>Loading...</div>;
  }

  if (!authState.isAuthenticated) {
    return <p>Please log in to view the users list.</p>;
  }

  if (loading) {
    return <div>Loading users...</div>;
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <h2>Error:</h2>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Users List</h1>
      {users && users.length > 0 ? (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Full Name</th>
                <th style={styles.th}>Roles</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={styles.tr}>
                  <td style={styles.td}>{user.email}</td>
                  <td style={styles.td}>{user.full_name || 'Not set'}</td>
                  <td style={styles.td}>
                    {user.roles.map(role => role.name).join(', ') || 'No roles'}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.status,
                      backgroundColor: user.is_active ? '#4CAF50' : '#f44336'
                    }}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No users found.</p>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '2rem auto',
    padding: '2rem',
  },
  title: {
    fontSize: '2rem',
    color: '#2c3e50',
    marginBottom: '2rem',
    textAlign: 'center',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    borderRadius: '8px',
  },
  th: {
    backgroundColor: '#2c3e50',
    color: 'white',
    padding: '1rem',
    textAlign: 'left',
  },
  tr: {
    borderBottom: '1px solid #eee',
  },
  td: {
    padding: '1rem',
  },
  status: {
    padding: '0.25rem 0.75rem',
    borderRadius: '12px',
    color: 'white',
    fontSize: '0.875rem',
    display: 'inline-block',
  },
  errorContainer: {
    maxWidth: '800px',
    margin: '2rem auto',
    padding: '2rem',
    backgroundColor: '#f8d7da',
    borderRadius: '8px',
    textAlign: 'center',
  },
  errorText: {
    color: '#721c24',
    marginBottom: '0.5rem',
  },
};

export default UsersList; 