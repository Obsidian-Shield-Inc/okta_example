import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  useTheme,
} from '@mui/material';

const AccountCostCard = ({ account }) => {
  const theme = useTheme();
  const percentageOfTotal = (account.cost / account.budgetLimit) * 100;
  const isOverBudget = percentageOfTotal > 100;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom noWrap>
          {account.name}
        </Typography>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {account.id}
        </Typography>
        
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Current Cost
            </Typography>
            <Typography variant="body2" color={isOverBudget ? 'error.main' : 'textPrimary'}>
              ${account.cost.toFixed(2)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Budget Limit
            </Typography>
            <Typography variant="body2">
              ${account.budgetLimit.toFixed(2)}
            </Typography>
          </Box>
          
          <Box sx={{ mt: 2 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(percentageOfTotal, 100)}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.palette.mode === 'dark' 
                  ? 'rgba(255, 255, 255, 0.1)' 
                  : 'rgba(0, 0, 0, 0.1)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: isOverBudget 
                    ? theme.palette.error.main 
                    : percentageOfTotal > 80 
                      ? theme.palette.warning.main 
                      : theme.palette.success.main,
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
              <Typography variant="body2" color="textSecondary">
                {percentageOfTotal.toFixed(1)}% of budget
              </Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="textSecondary">
              Top Services:
            </Typography>
            {account.topServices.map((service) => (
              <Box 
                key={service.name}
                sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  mt: 0.5 
                }}
              >
                <Typography variant="body2" noWrap sx={{ maxWidth: '70%' }}>
                  {service.name}
                </Typography>
                <Typography variant="body2">
                  ${service.cost.toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AccountCostCard; 