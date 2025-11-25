import React, { Component } from 'react';
import { Box, Typography, Button, Avatar, Chip, FormControlLabel, Switch, Tooltip, IconButton } from '@mui/material';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import LockIcon from '@mui/icons-material/Lock';
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
                            : `Chat with ${selectedUser.name}`}
                    </Typography>
                    {selectedUser.isGroup && (
                        <Box>
                            <Typography variant="caption" color="textSecondary">
                                {selectedUser.isPublic
                                    ? "Public Group"
                                    : `${groupMembers.length} members`
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
                    )}
                    <Tooltip title={selectedUser.isGroup ? "Delete all YOUR messages in this group" : "Delete all messages in this chat"}>
                        <Button
                            color="error"
                            size="small"
                            startIcon={<DeleteSweepIcon />}
                            onClick={deleteAllMessages}
                        >
                            {selectedUser.isGroup ? "Delete My Messages" : "Delete All"}
                        </Button>
                    </Tooltip>
                    {selectedUser.isGroup && !selectedUser.isPublic && (
                        <Button
                            color="error"
                            startIcon={<ExitToAppIcon />}
                            onClick={leaveGroup}
                            sx={{ mr: 1 }}
                        >
                            Leave
                        </Button>
                    )}
                    {selectedUser.isGroup && !selectedUser.isPublic && (
                        <Button onClick={() => setShowAddMemberDialog(true)}>Add Member</Button>
                    )}
                </Box>
            </Box>
        );
    }
}

export default ChatHeader;

