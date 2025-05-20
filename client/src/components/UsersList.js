import React from 'react';
import { useOktaAuth } from '@okta/okta-react';
import UserRoles from './UserRoles';

const UsersList = () => {
  const { authState, oktaAuth } = useOktaAuth();
  const [users, setUsers] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchUsers = async () => {
    if (!authState?.isAuthenticated) return;

    try {
      setIsLoading(true);
      setError(null);
      const accessToken = await oktaAuth.getAccessToken();
      
      const response = await fetch('http://localhost:8000/api/users', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchUsers();
  }, [authState, oktaAuth]);

  if (!authState) {
    return <div>Loading...</div>;
  }

  if (!authState.isAuthenticated) {
    return <div>Please log in to view the users list.</div>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Users List</h1>
      
      {isLoading && <div style={styles.loading}>Loading users...</div>}
      
      {error && (
        <div style={styles.error}>
          Error: {error}
        </div>
      )}
      
      {!isLoading && !error && (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Full Name</th>
                <th style={styles.th}>Roles</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={styles.tr}>
                  <td style={styles.td}>{user.email}</td>
                  <td style={styles.td}>{user.full_name}</td>
                  <td style={styles.td}>
                    {user.roles.map(role => role.name).join(', ')}
                  </td>
                  <td style={styles.td}>
                    <UserRoles 
                      user={user} 
                      onRolesUpdated={fetchUsers}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  title: {
    fontSize: '2rem',
    marginBottom: '2rem',
    color: '#2c3e50',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    borderRadius: '4px',
  },
  th: {
    backgroundColor: '#f8f9fa',
    padding: '1rem',
    textAlign: 'left',
    borderBottom: '2px solid #dee2e6',
  },
  tr: {
    borderBottom: '1px solid #dee2e6',
  },
  td: {
    padding: '1rem',
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#666',
  },
  error: {
    padding: '1rem',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
};

export default UsersList; 