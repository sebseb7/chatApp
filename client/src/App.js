import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress } from '@mui/material';
import Login from './components/Login';
import Chat from './components/Chat';
import { SocketProvider } from './context/SocketContext';

// Custom dark green-blueish theme with high contrast buttons
const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#26c6da', // Cyan 400 - Bright and visible
            light: '#6ff9ff',
            dark: '#0095a8',
            contrastText: '#000000',
        },
        secondary: {
            main: '#00e5ff', // Cyan A400
            light: '#6effff',
            dark: '#00b2cc',
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
                    fontWeight: 600,
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 16px rgba(38, 198, 218, 0.3)',
                    },
                },
                text: {
                    color: '#26c6da', // Explicitly bright cyan for text buttons
                },
                containedPrimary: {
                    background: 'linear-gradient(45deg, #00acc1 30%, #26c6da 90%)',
                    color: '#000000', // Black text on bright button
                    fontWeight: 700,
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
                    <CircularProgress size={60} sx={{ color: '#26c6da' }} />
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
                                <Chat
                                    user={user}
                                    onUserUpdate={(updatedUser) => setUser(updatedUser)}
                                />
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
