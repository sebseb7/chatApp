import React from 'react';
import { Button, Box, Typography, Paper } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';

const Login = () => {
    return (
        <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="100vh"
            bgcolor="#f5f5f5"
        >
            <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h4" gutterBottom>
                    Welcome to Chat App
                </Typography>
                <Typography variant="body1" paragraph>
                    Please sign in to continue
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<GoogleIcon />}
                    href="/auth/google"
                    size="large"
                    sx={{ mt: 2 }}
                >
                    Sign in with Google
                </Button>
            </Paper>
        </Box>
    );
};

export default Login;
