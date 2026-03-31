import React, { useState } from 'react';
import { Button, Box, Typography, Paper, TextField, Divider, Alert, CircularProgress, InputAdornment, IconButton } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

const Login = () => {
    const [mode, setMode] = useState('login'); // 'login' or 'register'
    const [username, setUsername] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (mode === 'register' && passphrase !== confirmPassphrase) {
            setError('Passphrasen stimmen nicht überein');
            setLoading(false);
            return;
        }

        const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, passphrase }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ein Fehler ist aufgetreten');
            }

            // Reload to get the session and start the app
            window.location.reload();
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

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
                    Ende-zu-Ende verschlüsselter Chat
                </Typography>

                <Button
                    variant="contained"
                    startIcon={<GoogleIcon />}
                    href="/auth/google"
                    fullWidth
                    size="large"
                    sx={{
                        py: 1.5,
                        mb: 3,
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
                    Mit Google anmelden
                </Button>

                <Divider sx={{ my: 3, '&::before, &::after': { borderColor: 'rgba(0, 217, 255, 0.2)' } }}>
                    <Typography variant="caption" sx={{ color: 'rgba(176, 201, 209, 0.7)' }}>
                        ODER
                    </Typography>
                </Divider>

                <form onSubmit={handleSubmit}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        fullWidth
                        label="Benutzername"
                        variant="outlined"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        margin="normal"
                        required
                        InputLabelProps={{ shrink: true }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: 'rgba(0, 217, 255, 0.2)' },
                                '&:hover fieldset': { borderColor: 'rgba(0, 217, 255, 0.5)' },
                                '&.Mui-focused fieldset': { borderColor: '#00d9ff' },
                                color: '#e8f4f8',
                            },
                            '& .MuiInputLabel-root': { color: 'rgba(176, 201, 209, 0.7)' },
                            '& .MuiInputLabel-root.Mui-focused': { color: '#00d9ff' },
                        }}
                    />

                    <TextField
                        fullWidth
                        label={mode === 'register' ? 'Passphrase wählen' : 'Passphrase'}
                        type={showPassphrase ? 'text' : 'password'}
                        variant="outlined"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        margin="normal"
                        required
                        InputLabelProps={{ shrink: true }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="toggle password visibility"
                                        onClick={() => setShowPassphrase(!showPassphrase)}
                                        edge="end"
                                        sx={{ color: 'rgba(176, 201, 209, 0.7)' }}
                                    >
                                        {showPassphrase ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: 'rgba(0, 217, 255, 0.2)' },
                                '&:hover fieldset': { borderColor: 'rgba(0, 217, 255, 0.5)' },
                                '&.Mui-focused fieldset': { borderColor: '#00d9ff' },
                                color: '#e8f4f8',
                            },
                            '& .MuiInputLabel-root': { color: 'rgba(176, 201, 209, 0.7)' },
                            '& .MuiInputLabel-root.Mui-focused': { color: '#00d9ff' },
                        }}
                    />

                    {mode === 'register' && (
                        <>
                            <TextField
                                fullWidth
                                label="Passphrase bestätigen"
                                type={showPassphrase ? 'text' : 'password'}
                                variant="outlined"
                                value={confirmPassphrase}
                                onChange={(e) => setConfirmPassphrase(e.target.value)}
                                margin="normal"
                                required
                                InputLabelProps={{ shrink: true }}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': { borderColor: 'rgba(0, 217, 255, 0.2)' },
                                        '&:hover fieldset': { borderColor: 'rgba(0, 217, 255, 0.5)' },
                                        '&.Mui-focused fieldset': { borderColor: '#00d9ff' },
                                        color: '#e8f4f8',
                                    },
                                    '& .MuiInputLabel-root': { color: 'rgba(176, 201, 209, 0.7)' },
                                    '& .MuiInputLabel-root.Mui-focused': { color: '#00d9ff' },
                                }}
                            />
                            <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                                Achtung: Es gibt keine Möglichkeit, die Passphrase wiederherzustellen!
                            </Alert>
                        </>
                    )}

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        size="large"
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : (mode === 'register' ? <PersonAddIcon /> : <VpnKeyIcon />)}
                        sx={{
                            mt: 3,
                            py: 1.5,
                            fontSize: '16px',
                            fontWeight: 600,
                            background: 'rgba(0, 217, 255, 0.1)',
                            border: '1px solid rgba(0, 217, 255, 0.3)',
                            color: '#00d9ff',
                            '&:hover': {
                                background: 'rgba(0, 217, 255, 0.2)',
                            },
                        }}
                    >
                        {mode === 'register' ? 'Registrieren' : 'Anmelden'}
                    </Button>

                    <Button
                        variant="text"
                        onClick={() => {
                            setMode(mode === 'login' ? 'register' : 'login');
                            setError(null);
                            setPassphrase('');
                            setConfirmPassphrase('');
                        }}
                        sx={{ mt: 2, color: 'rgba(176, 201, 209, 0.7)' }}
                    >
                        {mode === 'login' ? 'Neues Konto erstellen' : 'Bereits ein Konto? Anmelden'}
                    </Button>
                </form>
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
                    Überprüfe Datei SHA-256 Hashes:{' '}
                    <Box
                        component="a"
                        href="https://www.srihash.org/?url=https://telegraf.sebgreen.net/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: '#26c6da', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                        index.html
                    </Box>
                    {' | '}
                    <Box
                        component="a"
                        href="https://www.srihash.org/?url=https://telegraf.sebgreen.net/bundle.js"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: '#26c6da', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                        bundle.js
                    </Box>
                    {' | '}
                    <Box
                        component="a"
                        href="https://www.srihash.org/?url=https://telegraf.sebgreen.net/sw.js"
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
