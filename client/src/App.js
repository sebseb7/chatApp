import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress } from '@mui/material';
import Login from './components/Login';
import Chat from './components/Chat';
import { SocketProvider } from './context/SocketContext';

// Custom dark green-blueish theme
const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#0f4c5c',
            light: '#1a6b7e',
            dark: '#0a2e36',
            contrastText: '#e8f4f8',
        },
        secondary: {
            main: '#00d9ff',
            light: '#4de4ff',
            dark: '#00a8cc',
        },
        background: {
            default: '#0d1b1e',
            paper: '#1a3540',
        },
        text: {
            primary: '#e8f4f8',
            secondary: '#b0c9d1',
        },
        success: {
            main: '#00e676',
        },
        error: {
            main: '#ff5252',
        },
        warning: {
            main: '#ffd600',
        },
        info: {
            main: '#00d9ff',
        },
    },
    typography: {
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
        h4: {
            fontWeight: 600,
        },
        h5: {
            fontWeight: 600,
        },
        h6: {
            fontWeight: 600,
        },
    },
    shape: {
        borderRadius: 12,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 500,
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 16px rgba(0, 217, 255, 0.3)',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#152428',
                    borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                },
            },
        },
    },
});

const App = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch('/api/current_user');
                if (res.status === 200) {
                    const data = await res.json();
                    if (data && data.id) {
                        setUser(data);
                    } else {
                        setUser(null);
                    }
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error("Error fetching user", err);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, []);

    if (loading) {
        return (
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100vh',
                        background: 'linear-gradient(135deg, #0d1b1e 0%, #1a2f35 100%)',
                    }}
                >
                    <CircularProgress size={60} sx={{ color: '#00d9ff' }} />
                </Box>
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={
                        user ? (
                            <SocketProvider user={user}>
                                <Chat user={user} />
                            </SocketProvider>
                        ) : (
                            <Login />
                        )
                    } />
                </Routes>
            </BrowserRouter>
        </ThemeProvider>
    );
};

export default App;
