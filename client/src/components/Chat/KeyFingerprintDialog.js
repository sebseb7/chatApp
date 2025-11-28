import React, { Component } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, Typography, Avatar, Button
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { ChatContext } from './ChatContext';
import KeyFingerprint from '../KeyFingerprint';

class KeyFingerprintDialog extends Component {
    static contextType = ChatContext;

    handleClose = () => {
        const { setShowKeyFingerprintDialog, setViewingKeyUser } = this.context;
        setShowKeyFingerprintDialog(false);
        setViewingKeyUser(null);
    };

    render() {
        const {
            showKeyFingerprintDialog,
            viewingKeyUser,
            myPublicKeyJwk
        } = this.context;

        return (
            <Dialog
                open={showKeyFingerprintDialog && !!viewingKeyUser}
                onClose={this.handleClose}
                maxWidth="sm"
                disableRestoreFocus
                PaperProps={{
                    sx: {
                        background: 'linear-gradient(135deg, #1a3540 0%, #152428 100%)',
                        border: '1px solid rgba(0, 217, 255, 0.2)'
                    }
                }}
            >
                <DialogTitle sx={{ borderBottom: '1px solid rgba(0, 217, 255, 0.1)' }}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <LockIcon color="primary" />
                        Schlüssel-Fingerabdruck
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {viewingKeyUser && (
                        <Box sx={{ textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 3 }}>
                                <Avatar src={viewingKeyUser.avatar} sx={{ width: 48, height: 48 }} />
                                <Typography variant="h6">{viewingKeyUser.name}</Typography>
                            </Box>

                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Vergleichen Sie diesen Fingerabdruck mit dem Gerät von {viewingKeyUser.name}, um deren Identität zu überprüfen
                                und sicherzustellen, dass Ihre Nachrichten vor MITM-Angriffen sicher sind.
                            </Typography>

                            <Box sx={{
                                p: 3,
                                borderRadius: 2,
                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(0, 217, 255, 0.2)'
                            }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                                    {viewingKeyUser.name}s Fingerabdruck (kann öffentlich geteilt werden)
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                    <KeyFingerprint
                                        publicKey={viewingKeyUser.publicKey}
                                        size={100}
                                        showHex={true}
                                    />
                                </Box>
                            </Box>

                            {myPublicKeyJwk && (
                                <Box sx={{
                                    mt: 3,
                                    p: 3,
                                    borderRadius: 2,
                                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                    border: '1px solid rgba(0, 217, 255, 0.2)'
                                }}>
                                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                                        Ihr Fingerabdruck (kann öffentlich geteilt werden)
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                        <KeyFingerprint
                                            publicKey={myPublicKeyJwk}
                                            size={100}
                                            showHex={true}
                                        />
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(0, 217, 255, 0.1)' }}>
                    <Button onClick={this.handleClose}>
                        Schließen
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default KeyFingerprintDialog;

