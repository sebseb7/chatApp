import React, { Component } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, TextField, Button
} from '@mui/material';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { ChatContext } from './ChatContext';
import KeyFingerprint from '../KeyFingerprint';

class PassphraseDialog extends Component {
    static contextType = ChatContext;
    
    render() {
        const {
            showPassphraseDialog,
            passphrase,
            previewKeyJwk,
            hasStoredKeys,
            setShowPassphraseDialog,
            setPassphrase,
            handlePassphraseSubmit,
            handleClearKeys
        } = this.context;
        
        return (
            <Dialog 
                open={showPassphraseDialog} 
                onClose={() => setShowPassphraseDialog(false)} 
                maxWidth="sm" 
                fullWidth
                disableRestoreFocus
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <VpnKeyIcon color="primary" />
                        E2EE Passphrase
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <form 
                        onSubmit={(e) => { e.preventDefault(); if (passphrase) handlePassphraseSubmit(); }}
                        autoComplete="off"
                        data-lpignore="true"
                        data-form-type="other"
                    >
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Your passphrase deterministically generates your encryption keys.
                            The same passphrase will always produce the same fingerprint.
                        </Typography>
                        <input type="text" name="username" autoComplete="username" style={{ display: 'none' }} tabIndex={-1} />
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Passphrase"
                            type="password"
                            fullWidth
                            variant="outlined"
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            autoComplete="new-password"
                            name="encryption-key-passphrase"
                            inputProps={{ 
                                autoComplete: 'new-password',
                                'data-lpignore': 'true', 
                                'data-1p-ignore': 'true',
                                'data-form-type': 'other'
                            }}
                        />
                    </form>
                    
                    {/* Live Fingerprint Preview - always show to prevent layout shift */}
                    <Box sx={{ 
                        mt: 3, 
                        p: 2, 
                        borderRadius: 2, 
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid rgba(0, 217, 255, 0.2)',
                        textAlign: 'center'
                    }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Your Public Key Fingerprint
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minHeight: 130 }}>
                                {previewKeyJwk ? (
                                    <KeyFingerprint 
                                        publicKey={previewKeyJwk} 
                                        size={80} 
                                        showHex={true}
                                    />
                                ) : (
                                    <>
                                        <Box
                                            sx={{
                                                width: 80,
                                                height: 80,
                                                borderRadius: 2,
                                                overflow: 'hidden',
                                                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                                                border: '2px dashed rgba(0, 217, 255, 0.3)',
                                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxSizing: 'content-box'
                                            }}
                                        >
                                            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.5 }}>
                                                ?
                                            </Typography>
                                        </Box>
                                        <Typography 
                                            variant="caption" 
                                            sx={{ 
                                                mt: 1.5, 
                                                fontFamily: 'monospace', 
                                                fontSize: '0.7rem',
                                                color: 'text.secondary',
                                                opacity: 0.5,
                                                wordBreak: 'break-all',
                                                textAlign: 'center',
                                                maxWidth: 160,
                                                userSelect: 'all',
                                                padding: '4px 8px',
                                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                                borderRadius: 1
                                            }}
                                        >
                                            ---- ---- ---- ---- ---- ---- ---- ----
                                        </Typography>
                                    </>
                                )}
                            </Box>
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    {hasStoredKeys && <Button onClick={handleClearKeys} color="error">Reset Keys</Button>}
                    <Button onClick={() => setShowPassphraseDialog(false)}>Cancel</Button>
                    <Button 
                        onClick={handlePassphraseSubmit} 
                        disabled={!passphrase} 
                        variant="contained"
                        sx={{
                            background: 'linear-gradient(135deg, #0f4c5c 0%, #1a6b7e 100%)',
                            color: '#ffffff',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #1a6b7e 0%, #2a8a9e 100%)',
                            }
                        }}
                    >
                        {hasStoredKeys ? "Unlock" : "Generate Keys"}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default PassphraseDialog;

