import React, { useCallback } from 'react';
import { useOktaAuth } from '@okta/okta-react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import UserRoles from './UserRoles';

const UsersList = () => {
  const { authState, oktaAuth } = useOktaAuth();
  const [users, setUsers] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const theme = useTheme();

  const fetchUsers = useCallback(async () => {
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
  }, [authState?.isAuthenticated, oktaAuth]);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (!authState) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <Box p={3}>
        <Alert severity="info">Please log in to view the users list.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: '1200px', margin: '0 auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Users List
      </Typography>
      
      {isLoading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      )}
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {!isLoading && !error && (
        <TableContainer 
          component={Paper} 
          sx={{
            backgroundColor: theme.palette.mode === 'dark' ? 'background.paper' : 'background.default',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Full Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Roles</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(user => (
                <TableRow 
                  key={user.id}
                  sx={{
                    '&:last-child td, &:last-child th': { border: 0 },
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                    },
                  }}
                >
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.full_name}</TableCell>
                  <TableCell>{user.roles.map(role => role.name).join(', ')}</TableCell>
                  <TableCell>
                    <UserRoles 
                      user={user} 
                      onRolesUpdated={fetchUsers}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default UsersList; 