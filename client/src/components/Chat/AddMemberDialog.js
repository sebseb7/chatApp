import React, { Component } from 'react';
import { Paper, Typography, List, ListItem, ListItemText, Button } from '@mui/material';
import { ChatContext } from './ChatContext';

class AddMemberDialog extends Component {
    static contextType = ChatContext;

    render() {
        const {
            showAddMemberDialog,
            selectedUser,
            users,
            groupMembers,
            setShowAddMemberDialog,
            addToGroup
        } = this.context;

        if (!showAddMemberDialog || !selectedUser) return null;

        const availableUsers = users.filter(u => !groupMembers.some(m => m.id === u.id));

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
                    maxHeight: '400px',
                    overflow: 'auto',
                    background: 'rgba(26, 53, 64, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 217, 255, 0.2)'
                }}
            >
                <Typography variant="h6">Mitglied zu {selectedUser.name} hinzufügen</Typography>
                <List>
                    {availableUsers.map(u => (
                        <ListItem button key={u.id} onClick={() => addToGroup(u.id)}>
                            <ListItemText primary={u.name} />
                        </ListItem>
                    ))}
                </List>
                <Button onClick={() => setShowAddMemberDialog(false)}>Abbrechen</Button>
            </Paper>
        );
    }
}

export default AddMemberDialog;

