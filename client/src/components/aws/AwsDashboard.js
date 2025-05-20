import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  useTheme,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Divider,
} from '@mui/material';
import { useOktaAuth } from '@okta/okta-react';
import AccountCostCard from './AccountCostCard';
import ServiceUsageChart from './ServiceUsageChart';
import CostTrendChart from './CostTrendChart';

const AwsDashboard = () => {
  const theme = useTheme();
  const { authState, oktaAuth } = useOktaAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [awsData, setAwsData] = useState({
    accounts: [],
    totalCost: 0,
    costByService: {},
    costTrend: []
  });

  const fetchAwsData = async () => {
    if (!authState?.isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);
      const accessToken = await oktaAuth.getAccessToken();
      
      const response = await fetch('http://localhost:8000/api/aws/organization-usage', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch AWS data: ${response.status}`);
      }

      const data = await response.json();
      setAwsData(data);
    } catch (err) {
      console.error('Error fetching AWS data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAwsData();
  }, [authState?.isAuthenticated, oktaAuth]);

  if (!authState?.isAuthenticated) {
    return (
      <Box p={3}>
        <Alert severity="info">Please log in to view AWS usage data.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        AWS Organization Usage
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Cost (MTD)
              </Typography>
              <Typography variant="h4">
                ${awsData.totalCost.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Accounts
              </Typography>
              <Typography variant="h4">
                {awsData.accounts.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Account Costs */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Cost by Account
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {awsData.accounts.map((account) => (
          <Grid item xs={12} md={6} lg={4} key={account.id}>
            <AccountCostCard account={account} />
          </Grid>
        ))}
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Cost by Service
            </Typography>
            <ServiceUsageChart data={awsData.costByService} />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Cost Trend
            </Typography>
            <CostTrendChart data={awsData.costTrend} />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AwsDashboard; 