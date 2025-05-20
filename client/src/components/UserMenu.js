import React, { useState, useEffect } from 'react';
import { useOktaAuth } from '@okta/okta-react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Divider,
  Box,
  Typography,
} from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';

const UserMenu = () => {
  const { oktaAuth, authState } = useOktaAuth();
  const [userInfo, setUserInfo] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (authState?.isAuthenticated) {
        try {
          const info = await oktaAuth.getUser();
          setUserInfo(info);
        } catch (error) {
          console.error('Error fetching user info:', error);
        }
      }
    };

    fetchUserInfo();
  }, [authState, oktaAuth]);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const logout = async () => {
    try {
      await oktaAuth.signOut({
        postLogoutRedirectUri: window.location.origin
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!authState?.isAuthenticated || !userInfo) {
    return null;
  }

  // Get initials for avatar
  const initials = userInfo.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        sx={{ ml: 2 }}
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
          {initials}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            mt: 1.5,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            {userInfo.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {userInfo.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={logout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default UserMenu; 