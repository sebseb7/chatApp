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
            socket.emit('send_message', {
                groupId: selectedUser.id,
                content: input,
                type: 'text',
                tempId
            });
        } else {
            let content = input;
            let type = 'text';
            let senderPublicKey = null;
            
            if (isE2EEEnabled) {
                if (!keyPair) {
                    alert("You must set a passphrase to use E2EE.");
                    setShowPassphraseDialog(true);
                    return;
                }
                const receiverKey = peerPublicKeys[selectedUser.id];
                if (!receiverKey) {
                    alert("Receiver's public key not found. They might be offline or haven't set a passphrase.");
                    return;
                }
                
                try {
                    const encrypted = await encryptMessage(input, keyPair.privateKey, receiverKey);
                    content = JSON.stringify(encrypted);
                    type = 'eee';
                    senderPublicKey = await exportPublicKey(keyPair.publicKey);
                } catch (e) {
                    console.error("Encryption failed", e);
                    alert("Encryption failed");
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
            
            socket.emit('send_message', {
                receiverId: selectedUser.id,
                content,
                type,
                senderPublicKey,
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
        const { isE2EEEnabled } = this.context;
        
        return (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <Tooltip
                    title={
                        <Box sx={{ p: 1 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Markdown Syntax Supported:</Typography>
                            <Typography variant="caption" component="div">**bold** - <strong>bold text</strong></Typography>
                            <Typography variant="caption" component="div">*italic* - <em>italic text</em></Typography>
                            <Typography variant="caption" component="div">`code` - inline code</Typography>
                            <Typography variant="caption" component="div">```code block``` - code block</Typography>
                            <Typography variant="caption" component="div">[link](url) - hyperlink</Typography>
                            <Typography variant="caption" component="div">![alt](url) - image</Typography>
                            <Typography variant="caption" component="div"># Heading - headings</Typography>
                            <Typography variant="caption" component="div">- item - bullet list</Typography>
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
                    placeholder={isE2EEEnabled ? "Type an encrypted message..." : "Type a message..."}
                    value={input}
                    onChange={this.handleInputChange}
                    onPaste={this.handlePaste}
                    onKeyDown={this.handleKeyDown}
                    multiline
                    maxRows={4}
                    InputProps={{
                        startAdornment: isE2EEEnabled ? <LockIcon color="primary" sx={{ mr: 1 }} /> : null
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

