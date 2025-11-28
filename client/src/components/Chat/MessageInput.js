import React, { Component } from 'react';
import { Box, TextField, IconButton, Tooltip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import MarkdownIcon from '@mui/icons-material/Code';
import LockIcon from '@mui/icons-material/Lock';
import { ChatContext } from './ChatContext';
import { encryptMessage, exportPublicKey } from '../../services/crypto';

class MessageInput extends Component {
    static contextType = ChatContext;

    constructor(props) {
        super(props);
        this.state = {
            input: ''
        };
    }

    handleInputChange = (e) => {
        this.setState({ input: e.target.value });
    };

    handleSend = async () => {
        const { input } = this.state;
        const {
            selectedUser,
            socket,
            user,
            isE2EEEnabled,
            keyPair,
            peerPublicKeys,
            setShowPassphraseDialog,
            addMessage
        } = this.context;

        if (!input.trim() || !selectedUser) return;

        const tempId = Date.now();

        if (selectedUser.isGroup) {
            if (selectedUser.isEncrypted) {
                // Encrypted Group: Fan-out encryption
                if (!keyPair) {
                    alert("Sie müssen eine Passphrase festlegen, um E2EE zu verwenden.");
                    setShowPassphraseDialog(true);
                    return;
                }

                const { groupMembers } = this.context;
                if (!groupMembers || groupMembers.length === 0) {
                    alert("Keine Mitglieder in dieser Gruppe gefunden, an die gesendet werden kann.");
                    return;
                }

                // Optimistic update
                const optimisticMsg = {
                    id: tempId,
                    tempId,
                    senderId: user.id,
                    senderName: user.name,
                    senderAvatar: user.avatar,
                    receiverId: 0,
                    groupId: selectedUser.id,
                    content: input,
                    type: 'eee',
                    timestamp: new Date().toISOString(),
                    delivered: false,
                    isOptimistic: true
                };
                addMessage(optimisticMsg);

                // Send to each member (including self)
                for (const member of groupMembers) {
                    let receiverKey = peerPublicKeys[member.id];

                    // If sending to self, use own public key
                    if (member.id === user.id) {
                        receiverKey = keyPair.publicKey;
                    }

                    if (!receiverKey) {
                        console.warn(`Skipping member ${member.id} (no public key)`);
                        continue;
                    }

                    try {
                        const encrypted = await encryptMessage(input, keyPair.privateKey, receiverKey);
                        const content = JSON.stringify(encrypted);
                        const senderPublicKey = await exportPublicKey(keyPair.publicKey);

                        socket.emit('send_message', {
                            groupId: selectedUser.id,
                            receiverId: member.id,
                            content,
                            type: 'eee',
                            senderPublicKey,
                            tempId
                        });
                    } catch (e) {
                        console.error(`Failed to encrypt for member ${member.id}`, e);
                    }
                }

            } else {
                // Normal Group Message
                socket.emit('send_message', {
                    groupId: selectedUser.id,
                    content: input,
                    type: 'text',
                    tempId
                });
            }
        } else {
            let content = input;
            let type = 'text';
            let senderPublicKey = null;

            if (isE2EEEnabled) {
                if (!keyPair) {
                    alert("Sie müssen eine Passphrase festlegen, um E2EE zu verwenden.");
                    setShowPassphraseDialog(true);
                    return;
                }
                const receiverKey = peerPublicKeys[selectedUser.id];
                if (!receiverKey) {
                    alert("Öffentlicher Schlüssel des Empfängers nicht gefunden. Er ist möglicherweise offline oder hat keine Passphrase festgelegt.");
                    return;
                }

                try {
                    const encrypted = await encryptMessage(input, keyPair.privateKey, receiverKey);
                    content = JSON.stringify(encrypted);
                    type = 'eee';
                    senderPublicKey = await exportPublicKey(keyPair.publicKey);
                } catch (e) {
                    console.error("Encryption failed", e);
                    alert("Verschlüsselung fehlgeschlagen");
                    return;
                }
            }

            // Optimistic update for E2EE
            if (type === 'eee') {
                const optimisticMsg = {
                    id: tempId,
                    tempId,
                    senderId: user.id,
                    senderName: user.name,
                    senderAvatar: user.avatar,
                    receiverId: selectedUser.id,
                    content: input,
                    type: 'eee',
                    timestamp: new Date().toISOString(),
                    delivered: false,
                    isOptimistic: true
                };
                addMessage(optimisticMsg);
            }

            // Get receiver's public key in JWK format for storage (so sender can decrypt their own sent messages in history)
            let receiverPublicKey = null;
            if (type === 'eee' && selectedUser.publicKey) {
                receiverPublicKey = selectedUser.publicKey;
            }

            socket.emit('send_message', {
                receiverId: selectedUser.id,
                content,
                type,
                senderPublicKey,
                receiverPublicKey,
                tempId
            });
        }

        this.setState({ input: '' });
    };

    handlePaste = (e) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target.result;
                    this.setState(prev => ({
                        input: prev.input + `\n![image](${base64}) \n`
                    }));
                };
                reader.readAsDataURL(blob);
            }
        }
    };

    handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSend();
        }
    };

    render() {
        const { input } = this.state;
        const { isE2EEEnabled, selectedUser } = this.context;

        const isEncrypted = isE2EEEnabled || (selectedUser && selectedUser.isEncrypted);

        return (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', flexShrink: 0 }}>
                <Tooltip
                    title={
                        <Box sx={{ p: 1 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Unterstützte Markdown-Syntax:</Typography>
                            <Typography variant="caption" component="div">**fett** - <strong>fetter Text</strong></Typography>
                            <Typography variant="caption" component="div">*kursiv* - <em>kursiver Text</em></Typography>
                            <Typography variant="caption" component="div">`code` - Inline-Code</Typography>
                            <Typography variant="caption" component="div">```code block``` - Code-Block</Typography>
                            <Typography variant="caption" component="div">[link](url) - Hyperlink</Typography>
                            <Typography variant="caption" component="div">![alt](url) - Bild</Typography>
                            <Typography variant="caption" component="div"># Heading - Überschriften</Typography>
                            <Typography variant="caption" component="div">- item - Aufzählungsliste</Typography>
                        </Box>
                    }
                    placement="top"
                    arrow
                >
                    <IconButton size="small" sx={{ mb: 0.5, color: 'text.secondary' }}>
                        <MarkdownIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <TextField
                    fullWidth
                    variant="outlined"
                    placeholder={isEncrypted ? "Geben Sie eine verschlüsselte Nachricht ein..." : "Geben Sie eine Nachricht ein..."}
                    value={input}
                    onChange={this.handleInputChange}
                    onPaste={this.handlePaste}
                    onKeyDown={this.handleKeyDown}
                    multiline
                    maxRows={4}
                    InputProps={{
                        startAdornment: isEncrypted ? <LockIcon color="primary" sx={{ mr: 1 }} /> : null
                    }}
                />
                <IconButton color="primary" onClick={this.handleSend} sx={{ mb: 0.5 }}>
                    <SendIcon />
                </IconButton>
            </Box>
        );
    }
}

export default MessageInput;

