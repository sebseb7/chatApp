import React, { Component } from 'react';
import { Box, Paper, Avatar, Typography, Tooltip, IconButton } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReactMarkdown from 'react-markdown';
import { ChatContext } from './ChatContext';

class Message extends Component {
    static contextType = ChatContext;

    render() {
        const { msg } = this.props;
        const {
            user,
            decryptedMessages,
            decryptionFailed,
            readReceipts,
            deliveryStatus,
            handleSenderClick,
            setFullscreenImage,
            deleteMessage,
            selectedUser
        } = this.context;

        // System message
        if (msg.type === 'system') {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                    <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                        {msg.content}
                    </Typography>
                </Box>
            );
        }

        let displayContent = msg.content;
        const isEncrypted = msg.type === 'eee';
        const { keyPair } = this.context;

        if (isEncrypted) {
            if (msg.senderId === user.id && msg.isOptimistic) {
                displayContent = msg.content;
            } else if (decryptedMessages[msg.id]) {
                displayContent = decryptedMessages[msg.id];
            } else if (!keyPair) {
                displayContent = "🔒 Verschlüsselte Nachricht (geben Sie Ihre Schlüssel ein, um sie zu entschlüsseln)";
            } else if (decryptionFailed[msg.id]) {
                const reason = decryptionFailed[msg.id];
                if (reason === 'OperationError') {
                    displayContent = "🔒 Verschlüsselte Nachricht (Entschlüsselung fehlgeschlagen - Schlüssel stimmen nicht überein)";
                } else if (reason === 'missing_key') {
                    displayContent = "🔒 Verschlüsselte Nachricht (Schlüssel des Absenders fehlt)";
                } else {
                    displayContent = `🔒 Verschlüsselte Nachricht (Entschlüsselung fehlgeschlagen: ${reason})`;
                }
            } else {
                displayContent = "🔒 Verschlüsselte Nachricht";
            }
        }

        const isOwnMessage = msg.senderId === user.id;
        const readers = readReceipts[msg.id] || [];
        const deliveryState = deliveryStatus[msg.id];

        // Can delete: own messages always, or any message in P2P chat (not group)
        const isGroupChat = selectedUser?.isGroup;
        const canDelete = isOwnMessage || !isGroupChat;

        return (
            <Box sx={{
                display: 'flex',
                justifyContent: isOwnMessage ? 'flex-end' : 'flex-start',
                mb: 1
            }}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOwnMessage ? 'flex-end' : 'flex-start',
                    maxWidth: '70%'
                }}>
                    <Paper sx={{
                        p: 1.5,
                        background: isOwnMessage
                            ? 'linear-gradient(135deg, #0f4c5c 0%, #1a6b7e 100%)'
                            : 'linear-gradient(135deg, #1a2f35 0%, #254552 100%)',
                        width: '100%',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        transition: 'transform 0.2s ease',
                        '&:hover': {
                            transform: 'translateY(-1px)',
                        }
                    }}>
                        <Box
                            sx={{ display: 'flex', alignItems: 'center', mb: 0.5, cursor: 'pointer' }}
                            onClick={() => handleSenderClick(msg.senderId)}
                        >
                            <Avatar src={msg.senderAvatar} sx={{ width: 24, height: 24, mr: 1 }} />
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'secondary.main' }}>
                                {msg.senderName}
                            </Typography>
                        </Box>
                        <ReactMarkdown
                            components={{
                                img: ({ node, ...props }) => (
                                    <img
                                        {...props}
                                        style={{
                                            maxWidth: '100px',
                                            maxHeight: '100px',
                                            objectFit: 'cover',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            border: '1px solid rgba(255,255,255,0.2)'
                                        }}
                                        onClick={() => setFullscreenImage(props.src)}
                                        alt={props.alt || 'image'}
                                    />
                                )
                            }}
                        >{displayContent}</ReactMarkdown>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mt={0.5}>
                            <Box display="flex" alignItems="center">
                                {isEncrypted && (
                                    <Tooltip title="Ende-zu-Ende verschlüsselt">
                                        <LockIcon sx={{ fontSize: 12, color: 'success.main', mr: 0.5 }} />
                                    </Tooltip>
                                )}
                                <Typography variant="caption" display="block" align="right">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </Typography>
                            </Box>
                            {canDelete && (
                                <Tooltip title="Nachricht löschen">
                                    <IconButton
                                        size="small"
                                        onClick={() => deleteMessage(msg.id)}
                                        sx={{
                                            p: 0.25,
                                            opacity: 0.5,
                                            '&:hover': { opacity: 1, color: 'error.main' }
                                        }}
                                    >
                                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>
                    </Paper>

                    {/* Read Receipts & Delivery Status */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5, width: '100%', alignItems: 'center' }}>
                        {isOwnMessage && deliveryState === 'queued' && (
                            <Tooltip title="In der Warteschlange (Empfänger ist offline)">
                                <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5 }} />
                            </Tooltip>
                        )}

                        {readers.map(reader => (
                            <Tooltip key={reader.id} title={`Gelesen von ${reader.name}`}>
                                <Avatar
                                    src={reader.avatar}
                                    sx={{ width: 16, height: 16, ml: 0.5, border: '1px solid #1a3540' }}
                                />
                            </Tooltip>
                        ))}
                    </Box>
                </Box>
            </Box>
        );
    }
}

export default Message;

