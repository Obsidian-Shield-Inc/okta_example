import React from 'react';
import { useOktaAuth } from '@okta/okta-react';

const UserRoles = ({ user, onRolesUpdated }) => {
  const { authState, oktaAuth } = useOktaAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Available roles
  const availableRoles = ['ROLE_BASIC_USER', 'ROLE_ADMIN'];
  
  // Current role state (take the first role, or default to ROLE_BASIC_USER)
  const [selectedRole, setSelectedRole] = React.useState(
    user.roles[0]?.name || 'ROLE_BASIC_USER'
  );

  const handleRoleChange = async (event) => {
    const newRole = event.target.value;
    setSelectedRole(newRole);
    await updateRole(newRole);
  };

  const updateRole = async (roleName) => {
    if (!authState?.isAuthenticated) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const accessToken = await oktaAuth.getAccessToken();
      const response = await fetch(`http://localhost:8000/api/users/${user.id}/role`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(roleName),
        credentials: 'include',
        mode: 'cors'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update role: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Role updated:', result);
      
      // Notify parent component
      if (onRolesUpdated) {
        onRolesUpdated();
      }
    } catch (err) {
      console.error('Error updating role:', err);
      setError(err.message);
      // Revert selection on error
      setSelectedRole(user.roles[0]?.name || 'ROLE_BASIC_USER');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <select
        value={selectedRole}
        onChange={handleRoleChange}
        disabled={isLoading}
        style={styles.select}
      >
        {availableRoles.map(role => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      
      {isLoading && (
        <div style={styles.loading}>
          Updating...
        </div>
      )}
      
      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  select: {
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #dee2e6',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '0.9rem',
    minWidth: '200px',
  },
  loading: {
    fontSize: '0.9rem',
    color: '#666',
  },
  error: {
    padding: '0.5rem',
    color: '#721c24',
    backgroundColor: '#f8d7da',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
};

export default UserRoles; 