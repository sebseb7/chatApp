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
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <VpnKeyIcon color="primary" />
                        E2EE Passphrase
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Your passphrase deterministically generates your encryption keys.
                        The same passphrase will always produce the same fingerprint.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Passphrase"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                    />
                    
                    {/* Live Fingerprint Preview */}
                    {previewKeyJwk && (
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
                                <KeyFingerprint 
                                    publicKey={previewKeyJwk} 
                                    size={80} 
                                    showHex={true}
                                />
                            </Box>
                        </Box>
                    )}
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

