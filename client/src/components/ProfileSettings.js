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
    Divider,
    Chip
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import { subscribeToPush, unsubscribeFromPush, getSubscriptionStatus, isPushSupported, getNotificationPermission, forceUpdateServiceWorker } from '../services/push';

class ProfileSettings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            customName: props.user?.customName || '',
            avatarPreview: props.user?.avatar || props.user?.googleAvatar || '',
            avatarFile: null,
            loading: false,
            error: null,
            success: false,
            testSuccess: false,
            // Notification state
            pushSupported: isPushSupported(),
            notificationPermission: getNotificationPermission(),
            pushSubscribed: false,
            notificationLoading: false
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
            // Check notification status when dialog opens
            this.checkNotificationStatus();
        }
    }

    checkNotificationStatus = async () => {
        const status = await getSubscriptionStatus();
        this.setState({
            pushSubscribed: status.subscribed,
            notificationPermission: status.permission || getNotificationPermission()
        });
    };

    handleEnableNotifications = async () => {
        this.setState({ notificationLoading: true, error: null });

        try {
            const result = await subscribeToPush();

            if (result.success) {
                this.setState({
                    pushSubscribed: true,
                    notificationPermission: 'granted',
                    notificationLoading: false
                });
            } else {
                this.setState({
                    error: result.error || 'Benachrichtigungen konnten nicht aktiviert werden',
                    notificationLoading: false,
                    notificationPermission: getNotificationPermission()
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Benachrichtigungen konnten nicht aktiviert werden',
                notificationLoading: false
            });
        }
    };

    handleDisableNotifications = async () => {
        this.setState({ notificationLoading: true, error: null });

        try {
            const result = await unsubscribeFromPush();

            if (result.success) {
                this.setState({
                    pushSubscribed: false,
                    notificationLoading: false
                });
            } else {
                this.setState({
                    error: result.error || 'Benachrichtigungen konnten nicht deaktiviert werden',
                    notificationLoading: false
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Benachrichtigungen konnten nicht deaktiviert werden',
                notificationLoading: false
            });
        }
    };

    handleTestNotification = async () => {
        this.setState({ notificationLoading: true, error: null, testSuccess: false });

        try {
            const response = await fetch('/api/push/test', {
                method: 'POST',
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok) {
                this.setState({
                    testSuccess: true,
                    notificationLoading: false
                });
                // Clear success after 3 seconds
                setTimeout(() => this.setState({ testSuccess: false }), 3000);
            } else {
                this.setState({
                    error: data.error || 'Testbenachrichtigung konnte nicht gesendet werden',
                    notificationLoading: false
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Testbenachrichtigung konnte nicht gesendet werden',
                notificationLoading: false
            });
        }
    };

    handleForceUpdateSW = async () => {
        this.setState({ notificationLoading: true, error: null });

        try {
            const result = await forceUpdateServiceWorker();

            if (result.success) {
                // Re-subscribe after updating SW
                const subResult = await subscribeToPush();
                this.setState({
                    testSuccess: true,
                    pushSubscribed: subResult.success,
                    notificationLoading: false
                });
                setTimeout(() => this.setState({ testSuccess: false }), 3000);
            } else {
                this.setState({
                    error: result.error || 'Service Worker konnte nicht aktualisiert werden',
                    notificationLoading: false
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Service Worker konnte nicht aktualisiert werden',
                notificationLoading: false
            });
        }
    };

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
                this.setState({ error: 'Bitte wählen Sie eine gültige Bilddatei (JPEG, PNG, GIF, WebP oder AVIF)' });
                return;
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.setState({ error: 'Bild muss kleiner als 5MB sein' });
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
                throw new Error(data.error || 'Profilaktualisierung fehlgeschlagen');
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
                error: err.message || 'Profilaktualisierung fehlgeschlagen',
                loading: false
            });
        }
    };

    handleResetToGoogle = async () => {
        const { onSave, onClose } = this.props;

        if (!window.confirm('Möchten Sie Ihr Profil auf Ihren Google-Namen und Avatar zurücksetzen?')) {
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
                throw new Error(data.error || 'Profilzurücksetzung fehlgeschlagen');
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

            // Dialog stays open so user can see the result

        } catch (err) {
            this.setState({
                error: err.message || 'Profilzurücksetzung fehlgeschlagen',
                loading: false
            });
        }
    };

    handleDeleteAccount = async () => {
        const confirmText = 'DELETE';
        const userInput = window.prompt(
            `Dies wird Ihr Konto und alle zugehörigen Daten dauerhaft löschen.\n\n` +
            `Diese Aktion kann nicht rückgängig gemacht werden!\n\n` +
            `Geben Sie "${confirmText}" ein, um zu bestätigen:`
        );

        if (userInput !== confirmText) {
            if (userInput !== null) {
                alert('Kontolöschung abgebrochen. Text stimmte nicht überein.');
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
                throw new Error(data.error || 'Kontolöschung fehlgeschlagen');
            }

            // Clear local storage and session storage
            localStorage.removeItem('chat_e2ee_keys');
            sessionStorage.removeItem('chat_e2ee_passphrase');

            // Redirect to logout/home
            window.location.href = '/';

        } catch (err) {
            this.setState({
                error: err.message || 'Kontolöschung fehlgeschlagen',
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
                disableRestoreFocus
                PaperProps={{
                    sx: {
                        background: 'linear-gradient(135deg, #1a3540 0%, #152428 100%)',
                        border: '1px solid rgba(0, 217, 255, 0.2)'
                    }
                }}
            >
                <DialogTitle sx={{ borderBottom: '1px solid rgba(0, 217, 255, 0.1)' }}>
                    Profileinstellungen
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    {success && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Profil erfolgreich aktualisiert!
                        </Alert>
                    )}
                    {this.state.testSuccess && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Testbenachrichtigung gesendet! Prüfen Sie, ob sie erschienen ist.
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
                            Klicken Sie hier, um einen neuen Avatar hochzuladen
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
                        label="Anzeigename"
                        value={customName}
                        onChange={this.handleNameChange}
                        placeholder={googleName}
                        helperText={customName ? '' : `Leer lassen, um Google-Namen zu verwenden: ${googleName}`}
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
                                    Ihr Google-Profil
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
                                    Auf Google-Profil zurücksetzen
                                </Button>
                            </Box>
                        </>
                    )}

                    {/* Notifications Section */}
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{
                        p: 2,
                        borderRadius: 2,
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            {this.state.pushSubscribed ? (
                                <NotificationsActiveIcon color="primary" fontSize="small" />
                            ) : (
                                <NotificationsOffIcon color="disabled" fontSize="small" />
                            )}
                            <Typography variant="subtitle2">
                                Push-Benachrichtigungen
                            </Typography>
                            {this.state.pushSubscribed && (
                                <Chip label="Aktiviert" size="small" color="success" sx={{ ml: 'auto' }} />
                            )}
                            {this.state.notificationPermission === 'denied' && (
                                <Chip label="Blockiert" size="small" color="error" sx={{ ml: 'auto' }} />
                            )}
                        </Box>

                        {!this.state.pushSupported ? (
                            <Typography variant="caption" color="text.secondary">
                                Push-Benachrichtigungen werden in diesem Browser nicht unterstützt.
                            </Typography>
                        ) : this.state.notificationPermission === 'denied' ? (
                            <Typography variant="caption" color="text.secondary">
                                Benachrichtigungen sind blockiert. Bitte aktivieren Sie sie in Ihren Browsereinstellungen.
                            </Typography>
                        ) : (
                            <>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                    {this.state.pushSubscribed
                                        ? 'Sie erhalten Benachrichtigungen über neue Nachrichten, auch wenn der Browser geschlossen ist.'
                                        : 'Aktivieren Sie Benachrichtigungen, um bei neuen Nachrichten benachrichtigt zu werden.'}
                                </Typography>
                                {this.state.pushSubscribed ? (
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={this.handleTestNotification}
                                            disabled={this.state.notificationLoading || loading}
                                        >
                                            {this.state.notificationLoading ? <CircularProgress size={16} /> : 'Testen'}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            color="error"
                                            startIcon={this.state.notificationLoading ? null : <NotificationsOffIcon />}
                                            onClick={this.handleDisableNotifications}
                                            disabled={this.state.notificationLoading || loading}
                                        >
                                            Deaktivieren
                                        </Button>
                                        <Button
                                            variant="text"
                                            size="small"
                                            onClick={this.handleForceUpdateSW}
                                            disabled={this.state.notificationLoading || loading}
                                            sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                                        >
                                            Reparieren/Aktualisieren
                                        </Button>
                                    </Box>
                                ) : (
                                    <Button
                                        variant="contained"
                                        size="small"
                                        startIcon={this.state.notificationLoading ? <CircularProgress size={16} /> : <NotificationsActiveIcon />}
                                        onClick={this.handleEnableNotifications}
                                        disabled={this.state.notificationLoading || loading}
                                    >
                                        Benachrichtigungen aktivieren
                                    </Button>
                                )}
                            </>
                        )}
                    </Box>

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
                                Gefahrenzone
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            Löschen Sie Ihr Konto und alle zugehörigen Daten dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.
                        </Typography>
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteForeverIcon />}
                            onClick={this.handleDeleteAccount}
                            disabled={loading}
                            size="small"
                        >
                            Konto löschen
                        </Button>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(0, 217, 255, 0.1)' }}>
                    <Button onClick={onClose} disabled={loading}>
                        Abbrechen
                    </Button>
                    <Button
                        variant="contained"
                        onClick={this.handleSave}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} /> : 'Änderungen speichern'}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default ProfileSettings;

