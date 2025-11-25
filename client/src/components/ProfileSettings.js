import React, { Component } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Avatar,
    Box,
    Typography,
    IconButton,
    CircularProgress,
    Alert,
    Divider
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import RestoreIcon from '@mui/icons-material/Restore';
import LockIcon from '@mui/icons-material/Lock';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import KeyFingerprint from './KeyFingerprint';

class ProfileSettings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            customName: props.user?.customName || '',
            avatarPreview: props.user?.avatar || props.user?.googleAvatar || '',
            avatarFile: null,
            loading: false,
            error: null,
            success: false
        };
        this.fileInputRef = React.createRef();
    }

    componentDidUpdate(prevProps) {
        // Reset state when dialog opens with fresh user data
        if (!prevProps.open && this.props.open) {
            this.setState({
                customName: this.props.user?.customName || '',
                avatarPreview: this.props.user?.avatar || this.props.user?.googleAvatar || '',
                avatarFile: null,
                loading: false,
                error: null,
                success: false
            });
        }
    }

    handleNameChange = (e) => {
        this.setState({ customName: e.target.value, error: null });
    };

    handleAvatarClick = () => {
        this.fileInputRef.current?.click();
    };

    handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
            if (!allowedTypes.includes(file.type)) {
                this.setState({ error: 'Please select a valid image file (JPEG, PNG, GIF, WebP, or AVIF)' });
                return;
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.setState({ error: 'Image must be smaller than 5MB' });
                return;
            }

            // Create preview
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setState({
                    avatarPreview: event.target.result,
                    avatarFile: file,
                    error: null
                });
            };
            reader.readAsDataURL(file);
        }
    };

    handleSave = async () => {
        const { customName, avatarFile } = this.state;
        const { onSave, onClose } = this.props;

        this.setState({ loading: true, error: null });

        try {
            const formData = new FormData();
            
            // Only send customName if it's different from empty (to allow clearing)
            formData.append('customName', customName);
            
            if (avatarFile) {
                formData.append('avatar', avatarFile);
            }

            const response = await fetch('/api/profile', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update profile');
            }

            const updatedUser = await response.json();
            
            this.setState({ success: true, loading: false });
            
            // Notify parent of update
            if (onSave) {
                onSave(updatedUser);
            }

            // Close dialog after brief success message
            setTimeout(() => {
                onClose();
            }, 500);

        } catch (err) {
            this.setState({ 
                error: err.message || 'Failed to update profile', 
                loading: false 
            });
        }
    };

    handleResetToGoogle = async () => {
        const { onSave, onClose } = this.props;

        if (!window.confirm('Reset your profile to use your Google name and avatar?')) {
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            const response = await fetch('/api/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ resetToGoogle: true }),
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset profile');
            }

            const updatedUser = await response.json();
            
            this.setState({ 
                success: true, 
                loading: false,
                customName: '',
                avatarPreview: updatedUser.avatar || updatedUser.googleAvatar
            });
            
            if (onSave) {
                onSave(updatedUser);
            }

            setTimeout(() => {
                onClose();
            }, 500);

        } catch (err) {
            this.setState({ 
                error: err.message || 'Failed to reset profile', 
                loading: false 
            });
        }
    };

    handleDeleteAccount = async () => {
        const confirmText = 'DELETE';
        const userInput = window.prompt(
            `This will permanently delete your account and all associated data.\n\n` +
            `This action cannot be undone!\n\n` +
            `Type "${confirmText}" to confirm:`
        );

        if (userInput !== confirmText) {
            if (userInput !== null) {
                alert('Account deletion cancelled. Text did not match.');
            }
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            const response = await fetch('/api/account', {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete account');
            }

            // Clear local storage and session storage
            localStorage.removeItem('chat_e2ee_keys');
            sessionStorage.removeItem('chat_e2ee_passphrase');

            // Redirect to logout/home
            window.location.href = '/';

        } catch (err) {
            this.setState({ 
                error: err.message || 'Failed to delete account', 
                loading: false 
            });
        }
    };

    render() {
        const { open, onClose, user } = this.props;
        const { customName, avatarPreview, loading, error, success } = this.state;

        const hasCustomProfile = user?.hasCustomProfile || user?.customName || user?.customAvatar;
        const googleName = user?.googleName || user?.name;
        const googleAvatar = user?.googleAvatar || user?.avatar;

        return (
            <Dialog 
                open={open} 
                onClose={onClose}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'linear-gradient(135deg, #1a3540 0%, #152428 100%)',
                        border: '1px solid rgba(0, 217, 255, 0.2)'
                    }
                }}
            >
                <DialogTitle sx={{ borderBottom: '1px solid rgba(0, 217, 255, 0.1)' }}>
                    Profile Settings
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    {success && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Profile updated successfully!
                        </Alert>
                    )}

                    {/* Avatar Section */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                        <Box sx={{ position: 'relative', mb: 2 }}>
                            <Avatar
                                src={avatarPreview}
                                sx={{ 
                                    width: 120, 
                                    height: 120,
                                    border: '3px solid',
                                    borderColor: 'primary.main',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        opacity: 0.8,
                                        transform: 'scale(1.02)'
                                    }
                                }}
                                onClick={this.handleAvatarClick}
                            />
                            <IconButton
                                sx={{
                                    position: 'absolute',
                                    bottom: 0,
                                    right: 0,
                                    backgroundColor: 'primary.main',
                                    '&:hover': {
                                        backgroundColor: 'primary.dark'
                                    }
                                }}
                                size="small"
                                onClick={this.handleAvatarClick}
                            >
                                <PhotoCameraIcon fontSize="small" />
                            </IconButton>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            Click to upload a new avatar
                        </Typography>
                        <input
                            ref={this.fileInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/avif"
                            style={{ display: 'none' }}
                            onChange={this.handleFileChange}
                        />
                    </Box>

                    {/* Name Input */}
                    <TextField
                        fullWidth
                        label="Display Name"
                        value={customName}
                        onChange={this.handleNameChange}
                        placeholder={googleName}
                        helperText={customName ? '' : `Leave empty to use Google name: ${googleName}`}
                        sx={{ mb: 3 }}
                    />

                    {/* Google Profile Info */}
                    {hasCustomProfile && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ 
                                p: 2, 
                                borderRadius: 2, 
                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                                    Your Google Profile
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Avatar src={googleAvatar} sx={{ width: 40, height: 40 }} />
                                    <Typography variant="body2">{googleName}</Typography>
                                </Box>
                                <Button
                                    startIcon={<RestoreIcon />}
                                    size="small"
                                    onClick={this.handleResetToGoogle}
                                    sx={{ mt: 2 }}
                                    disabled={loading}
                                >
                                    Reset to Google Profile
                                </Button>
                            </Box>
                        </>
                    )}

                    {/* E2EE Key Fingerprint */}
                    {this.props.userPublicKey && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ 
                                p: 2, 
                                borderRadius: 2, 
                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(0, 217, 255, 0.2)'
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                    <LockIcon color="primary" fontSize="small" />
                                    <Typography variant="subtitle2" color="text.secondary">
                                        Your E2EE Key Fingerprint
                                    </Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                    Share this visual pattern with contacts to verify your identity and prevent MITM attacks.
                                    Compare fingerprints in person or via a trusted channel.
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                    <KeyFingerprint 
                                        publicKey={this.props.userPublicKey} 
                                        size={80} 
                                        showHex={true}
                                    />
                                </Box>
                            </Box>
                        </>
                    )}

                    {/* Danger Zone - Delete Account */}
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ 
                        p: 2, 
                        borderRadius: 2, 
                        backgroundColor: 'rgba(255, 0, 0, 0.05)',
                        border: '1px solid rgba(255, 82, 82, 0.3)'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <DeleteForeverIcon color="error" fontSize="small" />
                            <Typography variant="subtitle2" color="error">
                                Danger Zone
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            Permanently delete your account and all associated data. This action cannot be undone.
                        </Typography>
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteForeverIcon />}
                            onClick={this.handleDeleteAccount}
                            disabled={loading}
                            size="small"
                        >
                            Delete Account
                        </Button>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(0, 217, 255, 0.1)' }}>
                    <Button onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={this.handleSave}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} /> : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default ProfileSettings;

