import React from 'react';
import { Button, Box, Typography, Paper } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';

const Login = () => {
    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0a2e36 0%, #0f4c5c 50%, #1a6b7e 100%)',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: '-50%',
                    left: '-50%',
                    width: '200%',
                    height: '200%',
                    background: 'radial-gradient(circle, rgba(0, 217, 255, 0.1) 0%, transparent 70%)',
                    animation: 'pulse 8s ease-in-out infinite',
                },
            }}
        >
            <Paper
                elevation={24}
                className="glass animate-fade-in"
                sx={{
                    p: { xs: 3, sm: 5 },
                    textAlign: 'center',
                    maxWidth: '450px',
                    width: '90%',
                    background: 'rgba(26, 53, 64, 0.8)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 217, 255, 0.2)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 217, 255, 0.2)',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <Box
                    sx={{
                        mb: 3,
                        fontSize: '48px',
                        filter: 'drop-shadow(0 0 20px rgba(0, 217, 255, 0.5))',
                    }}
                >
                    💬
                </Box>
                <Typography
                    variant="h4"
                    gutterBottom
                    sx={{
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #e8f4f8 0%, #00d9ff 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        mb: 2,
                    }}
                >
                    Telegraf
                </Typography>
                <Typography
                    variant="body1"
                    paragraph
                    sx={{
                        color: '#b0c9d1',
                        mb: 4,
                    }}
                >
                    end2end encrypted chat 
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<GoogleIcon />}
                    href="/auth/google"
                    size="large"
                    sx={{
                        py: 1.5,
                        px: 4,
                        fontSize: '16px',
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #0f4c5c 0%, #1a6b7e 100%)',
                        border: '1px solid rgba(0, 217, 255, 0.3)',
                        boxShadow: '0 4px 16px rgba(0, 217, 255, 0.3)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #1a6b7e 0%, #2a8a9e 100%)',
                            boxShadow: '0 6px 24px rgba(0, 217, 255, 0.5)',
                            transform: 'translateY(-2px)',
                        },
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    Sign in with Google
                </Button>
            </Paper>
            <Box
                component="footer"
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    py: 2,
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    color: 'rgba(176, 201, 209, 0.7)',
                    zIndex: 1,
                }}
            >
                <Typography variant="caption" component="p">
                    Verify file SHA-256 hashes:{' '}
                    <Box
                        component="a"
                        href="https://www.srihash.org/?url=https://c.growheads.de/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: '#26c6da', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                        index.html
                    </Box>
                    {' | '}
                    <Box
                        component="a"
                        href="https://www.srihash.org/?url=https://c.growheads.de/bundle.js"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: '#26c6da', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                        bundle.js
                    </Box>
                    {' | '}
                    <Box
                        component="a"
                        href="https://www.srihash.org/?url=https://c.growheads.de/sw.js"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: '#26c6da', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                        sw.js
                    </Box>
                </Typography>
            </Box>
        </Box>
    );
};

export default Login;
