import React, { Component } from 'react';
import { Box, Typography, Button, Avatar, Chip, FormControlLabel, Switch, Tooltip, IconButton } from '@mui/material';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import LockIcon from '@mui/icons-material/Lock';
import VpnKeyOffIcon from '@mui/icons-material/VpnKeyOff';
import { ChatContext } from './ChatContext';

class ChatHeader extends Component {
    static contextType = ChatContext;

    render() {
        const {
            selectedUser,
            groupMembers,
            keyPair,
            peerPublicKeys,
            isE2EEEnabled,
            user,
            setShowAddMemberDialog,
            setIsE2EEEnabled,
            leaveGroup,
            toggleUserMute,
            removeFromGroup,
            deleteAllMessages,
            handleClearKeys,
            isMobile,
            setSelectedUser
        } = this.context;

        if (!selectedUser) return null;

        return (
            <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={2}
                sx={{
                    flexShrink: 0,
                    ...(isMobile && {
                        background: 'linear-gradient(180deg, #152428 0%, #0f1f23 100%)',
                        py: 1,
                        mx: -1,
                        px: 1,
                    })
                }}
            >
                <Box display="flex" alignItems="center" gap={1}>
                    {isMobile && (
                        <IconButton onClick={() => setSelectedUser(null)} edge="start" color="inherit">
                            <ArrowBackIcon />
                        </IconButton>
                    )}
                    <Box>
                        <Typography variant="h5">
                            {selectedUser.isGroup && selectedUser.isPublic
                                ? selectedUser.name
                                : `Chat mit ${selectedUser.name}`}
                        </Typography>
                        {selectedUser.isGroup && (
                            <Box>
                                <Typography variant="caption" color="textSecondary">
                                    {selectedUser.isPublic
                                        ? "Öffentliche Gruppe"
                                        : `${groupMembers.length} Mitglieder`
                                    }
                                </Typography>
                                {!selectedUser.isPublic && (
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                                        {groupMembers.map(m => (
                                            <Chip
                                                key={m.id}
                                                avatar={<Avatar src={m.avatar} />}
                                                label={m.name}
                                                size="small"
                                                color={m.isMuted ? "error" : "default"}
                                                variant={m.isMuted ? "outlined" : "filled"}
                                                onDelete={user.isAdmin === 1 && !selectedUser.isPublic ? () => removeFromGroup(m.id) : undefined}
                                                onClick={user.isAdmin === 1 ? () => toggleUserMute(m.id) : undefined}
                                                deleteIcon={user.isAdmin === 1 ? <DeleteIcon /> : undefined}
                                                sx={{ textDecoration: m.isMuted ? 'line-through' : 'none' }}
                                            />
                                        ))}
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                    {!selectedUser.isGroup && (
                        <>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={isE2EEEnabled}
                                        onChange={(e) => setIsE2EEEnabled(e.target.checked)}
                                        color="primary"
                                        disabled={!keyPair || !peerPublicKeys[selectedUser.id]}
                                    />
                                }
                                label={
                                    <Box display="flex" alignItems="center">
                                        <Typography variant="body2" sx={{ mr: 0.5 }}>EEE</Typography>
                                        <LockIcon fontSize="small" />
                                    </Box>
                                }
                            />
                            {keyPair && (
                                <Tooltip title="Verschlüsselungsschlüssel zurücksetzen (löscht entschlüsselte Nachrichten aus der Ansicht)">
                                    <IconButton
                                        onClick={handleClearKeys}
                                        size="small"
                                        color="warning"
                                    >
                                        <VpnKeyOffIcon />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </>
                    )}
                    <Tooltip title={selectedUser.isGroup ? "Lösche alle DEINE Nachrichten in dieser Gruppe" : "Lösche alle Nachrichten in diesem Chat"}>
                        <Button
                            color="error"
                            size="small"
                            startIcon={<DeleteSweepIcon />}
                            onClick={deleteAllMessages}
                        >
                            {selectedUser.isGroup ? "Meine Nachrichten löschen" : "Alle löschen"}
                        </Button>
                    </Tooltip>
                    {selectedUser.isGroup && !selectedUser.isPublic && (
                        <Button
                            color="error"
                            startIcon={<ExitToAppIcon />}
                            onClick={leaveGroup}
                            sx={{ mr: 1 }}
                        >
                            Verlassen
                        </Button>
                    )}
                    {selectedUser.isGroup && !selectedUser.isPublic && (
                        <Button onClick={() => setShowAddMemberDialog(true)}>Mitglied hinzufügen</Button>
                    )}
                </Box>
            </Box>
        );
    }
}

export default ChatHeader;

