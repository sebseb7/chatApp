import React, { Component } from 'react';
import { Paper, Typography, TextField, Button, Box, FormControlLabel, Checkbox } from '@mui/material';
import { ChatContext } from './ChatContext';

class GroupDialog extends Component {
    static contextType = ChatContext;

    render() {
        const {
            showGroupDialog,
            newGroupName,
            newGroupIsPublic,
            newGroupIsEncrypted,
            user,
            setShowGroupDialog,
            setNewGroupName,
            setNewGroupIsPublic,
            setNewGroupIsEncrypted,
            createGroup
        } = this.context;

        if (!showGroupDialog) return null;

        return (
            <Paper
                className="glass"
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    p: 4,
                    zIndex: 1000,
                    background: 'rgba(26, 53, 64, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 217, 255, 0.2)'
                }}
            >
                <Typography variant="h6">Create Group</Typography>
                <TextField
                    label="Group Name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    fullWidth
                    sx={{ my: 2 }}
                />
                {user.isAdmin === 1 && (
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={newGroupIsPublic}
                                onChange={(e) => setNewGroupIsPublic(e.target.checked)}
                            />
                        }
                        label="Public Group (Auto-add everyone)"
                    />
                )}
                {!newGroupIsPublic && (
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={newGroupIsEncrypted}
                                onChange={(e) => setNewGroupIsEncrypted(e.target.checked)}
                            />
                        }
                        label="Encrypted Only (End-to-End Encrypted)"
                    />
                )}
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <Button onClick={() => setShowGroupDialog(false)}>Cancel</Button>
                    <Button variant="contained" onClick={createGroup}>Create</Button>
                </Box>
            </Paper>
        );
    }
}

export default GroupDialog;

