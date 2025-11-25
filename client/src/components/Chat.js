import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Drawer, List, ListItem, ListItemText, ListItemAvatar, Avatar,
    Typography, TextField, Button, Paper, IconButton, Badge, Divider, Chip, Checkbox, FormControlLabel, Tooltip, Snackbar, Alert, Switch, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteIcon from '@mui/icons-material/Delete';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import MarkdownIcon from '@mui/icons-material/Code';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LockIcon from '@mui/icons-material/Lock';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SettingsIcon from '@mui/icons-material/Settings';
import ReactMarkdown from 'react-markdown';
import { useSocket } from '../context/SocketContext';
import { generateAndStoreKeys, loadKeys, exportPublicKey, importPublicKey, encryptMessage, decryptMessage, clearKeys } from '../services/crypto';
import ProfileSettings from './ProfileSettings';
import KeyFingerprint from './KeyFingerprint';

const drawerWidth = 300;

const Chat = ({ user, onUserUpdate }) => {
    const { socket, isConnected } = useSocket();
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    const [groupMembers, setGroupMembers] = useState([]);

    const [groups, setGroups] = useState([]);
    const [localMutedGroups, setLocalMutedGroups] = useState({});
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupIsPublic, setNewGroupIsPublic] = useState(false);
    const [showGroupDialog, setShowGroupDialog] = useState(false);
    const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
    const [showProfileDialog, setShowProfileDialog] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [readReceipts, setReadReceipts] = useState({}); // { messageId: [user1, user2...] }
    const [deliveryStatus, setDeliveryStatus] = useState({}); // { messageId: 'delivered' | 'queued' }

    // E2EE State
    const [keyPair, setKeyPair] = useState(null);
    const [passphrase, setPassphrase] = useState('');
    const [showPassphraseDialog, setShowPassphraseDialog] = useState(false);
    const [isE2EEEnabled, setIsE2EEEnabled] = useState(false);
    const [peerPublicKeys, setPeerPublicKeys] = useState({}); // userId -> CryptoKey
    const [decryptedMessages, setDecryptedMessages] = useState({}); // messageId -> content
    const [hasStoredKeys, setHasStoredKeys] = useState(false);
    const [myPublicKeyJwk, setMyPublicKeyJwk] = useState(null); // My public key in JWK format for display
    const [showKeyFingerprintDialog, setShowKeyFingerprintDialog] = useState(false);
    const [viewingKeyUser, setViewingKeyUser] = useState(null); // User whose key we're viewing
    const [fullscreenImage, setFullscreenImage] = useState(null); // Image URL for fullscreen view

    // Ref to access current selectedUser inside socket callback closure if needed, 
    // or just use functional state update logic which is safer.
    const selectedUserRef = useRef(selectedUser);

    useEffect(() => {
        selectedUserRef.current = selectedUser;
    }, [selectedUser]);

    // Load keys on mount (check for HMR-preserved passphrase in sessionStorage)
    useEffect(() => {
        const initKeys = async () => {
            const stored = localStorage.getItem("chat_e2ee_keys");
            if (stored) {
                setHasStoredKeys(true);
                
                // Check if passphrase was preserved by HMR (sessionStorage survives HMR reliably)
                const savedPassphrase = sessionStorage.getItem("chat_e2ee_passphrase");
                if (savedPassphrase) {
                    try {
                        const keys = await loadKeys(savedPassphrase, user.googleId);
                        setKeyPair(keys);
                        setPassphrase(savedPassphrase);
                        
                        // Export public key for display
                        const pubKeyJwk = await exportPublicKey(keys.publicKey);
                        setMyPublicKeyJwk(pubKeyJwk);
                        
                        console.log('E2EE keys restored from session-preserved passphrase');
                        return; // Don't show dialog
                    } catch (err) {
                        console.warn('Failed to restore keys from session passphrase:', err);
                        sessionStorage.removeItem("chat_e2ee_passphrase");
                    }
                }
                
                setShowPassphraseDialog(true); // Ask for passphrase to decrypt keys
            }
            // If not stored, do nothing. User can set it manually via icon.
        };
        initKeys();
    }, [user.googleId]);

    const handlePassphraseSubmit = async () => {
        try {
            // With deterministic key generation, we always use the same function
            // It will generate deterministic keys from passphrase + googleId
            const keys = await loadKeys(passphrase, user.googleId);
            setKeyPair(keys);
            setHasStoredKeys(true);
            setShowPassphraseDialog(false);

            // Store passphrase in sessionStorage for HMR survival (dev only, clears when tab closes)
            sessionStorage.setItem("chat_e2ee_passphrase", passphrase);

            // Broadcast public key and store JWK for display
            const pubKeyJwk = await exportPublicKey(keys.publicKey);
            setMyPublicKeyJwk(pubKeyJwk);
            socket.emit('update_public_key', { publicKey: pubKeyJwk });

        } catch (err) {
            alert("Error with keys: " + err.message);
            console.error(err);
        }
    };

    const handleClearKeys = async () => {
        if (window.confirm("Clear stored keys? You can recover them by entering the same passphrase again.")) {
            await clearKeys();
            setKeyPair(null);
            setPassphrase('');
            setHasStoredKeys(false);
            setMyPublicKeyJwk(null);
            setShowPassphraseDialog(true);
            sessionStorage.removeItem("chat_e2ee_passphrase");
        }
    };

    useEffect(() => {
        if (!socket) return;

        socket.on('user_list', async (userList) => {
            setUsers(userList);

            // Import public keys from users
            const newPeerKeys = { ...peerPublicKeys };
            for (const u of userList) {
                if (u.publicKey && !newPeerKeys[u.id]) {
                    try {
                        newPeerKeys[u.id] = await importPublicKey(u.publicKey);
                    } catch (e) {
                        console.error("Failed to import key for user", u.id, e);
                    }
                }
            }
            setPeerPublicKeys(newPeerKeys);
        });

        socket.on('group_list', (groupList) => {
            setGroups(groupList);
        });

        socket.on('group_members', ({ groupId, members }) => {
            if (selectedUserRef.current?.id === groupId && selectedUserRef.current?.isGroup) {
                setGroupMembers(members);
            }
        });

        socket.on('receive_message', async (message) => {
            setMessages((prev) => {
                // Deduplicate using tempId
                if (message.tempId) {
                    const existingIndex = prev.findIndex(m => m.tempId === message.tempId);
                    if (existingIndex !== -1) {
                        const newMessages = [...prev];
                        newMessages[existingIndex] = message;
                        return newMessages;
                    }
                }
                return [...prev, message];
            });

            // Decrypt if EEE
            if (message.type === 'eee' && keyPair) {
                try {
                    let otherKey;
                    if (message.senderId === user.id) {
                        // My own message echoed back.
                        // I need the receiver's public key to decrypt it.
                        // The receiverId is in the message.
                        otherKey = peerPublicKeys[message.receiverId];

                        // If I don't have it in peerPublicKeys (maybe they are offline now?), 
                        // I might have used it to encrypt, so I should have it.
                        // But peerPublicKeys comes from user_list which might only have online users?
                        // Wait, user_list has all users? No, only online?
                        // The server broadcasts `user_list` with online users.
                        // If I sent a message to an offline user, I must have had their key cached or from a previous session?
                        // Actually, `peerPublicKeys` state is reset on reload.
                        // If I reload and the receiver is offline, I won't have their key in `peerPublicKeys`.
                        // So I cannot decrypt my own sent history to an offline user if I don't persist their public key.
                        // BUT, for the immediate echo, the receiver might still be in the list or I just used it.

                        if (!otherKey) {
                            // Fallback: If I just sent it, I might still have the key context?
                            // For now, let's try to find it in the users list even if offline?
                            // The users list from server `user_list` event only contains what server sends.
                            // Server sends all users? Let's check server logic.
                            // Server sends `visibleUsers`.
                        }
                    } else {
                        // Received message
                        otherKey = peerPublicKeys[message.senderId];
                        if (!otherKey && message.senderPublicKey) {
                            otherKey = await importPublicKey(message.senderPublicKey);
                            // Cache it?
                            setPeerPublicKeys(prev => ({ ...prev, [message.senderId]: otherKey }));
                        }
                    }

                    if (otherKey) {
                        const decrypted = await decryptMessage(JSON.parse(message.content), keyPair.privateKey, otherKey);
                        setDecryptedMessages(prev => ({ ...prev, [message.id]: decrypted }));
                    } else {
                        console.warn("Missing public key for message", message.id);
                    }
                } catch (e) {
                    console.error("Decryption failed", e);
                }
            }

            // Set initial delivery status if provided (for sender)
            if (message.senderId === user.id && message.delivered !== undefined) {
                setDeliveryStatus(prev => ({
                    ...prev,
                    [message.id]: message.delivered ? 'delivered' : 'queued'
                }));
            }

            const isGroupMsg = !!message.groupId;
            const chatId = isGroupMsg ? message.groupId : message.senderId;

            // If we are not chatting with this person/group, increment unread
            // We use the ref because the closure might have stale selectedUser
            const currentSelected = selectedUserRef.current;

            // Don't count own messages
            if (message.senderId === user.id) return;

            if (!currentSelected ||
                (isGroupMsg && (!currentSelected.isGroup || currentSelected.id !== chatId)) ||
                (!isGroupMsg && (currentSelected.isGroup || currentSelected.id !== chatId))) {

                // Check if locally muted
                if (isGroupMsg && localMutedGroups[chatId]) return;

                setUnreadCounts(prev => ({
                    ...prev,
                    [chatId]: (prev[chatId] || 0) + 1
                }));
            }
        });

        socket.on('message_read_update', ({ messageId, user }) => {
            setReadReceipts(prev => {
                const currentReaders = prev[messageId] || [];
                if (currentReaders.some(u => u.id === user.id)) return prev;
                return {
                    ...prev,
                    [messageId]: [...currentReaders, user]
                };
            });
        });

        socket.on('delivery_update', ({ messageId }) => {
            setDeliveryStatus(prev => ({
                ...prev,
                [messageId]: 'delivered'
            }));
        });

        socket.emit('get_groups');

        // Re-broadcast key on reconnect
        if (keyPair) {
            exportPublicKey(keyPair.publicKey).then(jwk => {
                socket.emit('update_public_key', { publicKey: jwk });
            });
        }

        return () => {
            socket.off('user_list');
            socket.off('group_list');
            socket.off('group_members');
            socket.off('receive_message');
            socket.off('message_read_update');
            socket.off('delivery_update');
        };
    }, [socket, user.id, keyPair, peerPublicKeys]); // Added dependencies

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, decryptedMessages]);

    // Fetch members when group selected
    useEffect(() => {
        if (selectedUser?.isGroup) {
            socket.emit('get_group_members', { groupId: selectedUser.id });
            setIsE2EEEnabled(false); // Disable E2EE for groups
        } else {
            setGroupMembers([]);
            // Check if we can enable E2EE (both have keys)
            if (selectedUser && !selectedUser.isGroup) {
                // We can enable if we have their key.
                // But user can toggle it.
                // Default to off? Or remember preference?
                setIsE2EEEnabled(false);
            }
        }
    }, [selectedUser, socket]);

    // Mark messages as read when they are displayed
    useEffect(() => {
        if (!selectedUser || !messages.length) return;

        // Simple logic: Mark all visible messages from others as read
        // In a real app, use IntersectionObserver for precise visibility
        const unreadMessages = messages.filter(m => {
            if (m.senderId === user.id) return false; // Don't mark own messages

            // Check if I already read it (locally tracked to avoid spamming)
            // Ideally we check `readReceipts` but that comes from server.
            // Let's just emit for messages in the current chat view.
            // Optimization: Only emit if we haven't seen this messageId in this session?
            // For MVP, just emit. Server handles "INSERT OR IGNORE".

            if (selectedUser.isGroup) {
                return m.groupId === selectedUser.id;
            } else {
                return (m.senderId === selectedUser.id && m.receiverId === user.id);
            }
        });

        unreadMessages.forEach(m => {
            // Check if I am already in the read list for this message to avoid socket spam
            const readers = readReceipts[m.id] || [];
            if (!readers.some(r => r.id === user.id)) {
                socket.emit('mark_read', {
                    messageId: m.id,
                    groupId: m.groupId,
                    senderId: m.senderId
                });
            }
        });

    }, [messages, selectedUser, readReceipts, user.id, socket]);

    const handleLogout = () => {
        window.location.href = '/api/logout';
    };

    const handleSend = async () => {
        if (input.trim() && selectedUser) {
            const tempId = Date.now(); // Use as tempId

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
                        // Include my public key so they can decrypt even if I go offline
                        senderPublicKey = await exportPublicKey(keyPair.publicKey);
                    } catch (e) {
                        console.error("Encryption failed", e);
                        alert("Encryption failed");
                        return;
                    }
                }

                // Optimistic update for E2EE (since server won't echo plain text)
                if (type === 'eee') {
                    const optimisticMsg = {
                        id: tempId, // Use tempId as ID initially
                        tempId,
                        senderId: user.id,
                        senderName: user.name,
                        senderAvatar: user.avatar,
                        receiverId: selectedUser.id,
                        content: input, // Show plain text to self
                        type: 'eee',
                        timestamp: new Date().toISOString(),
                        delivered: false,
                        isOptimistic: true
                    };
                    setMessages(prev => [...prev, optimisticMsg]);
                }

                socket.emit('send_message', {
                    receiverId: selectedUser.id,
                    content,
                    type,
                    senderPublicKey, // Send my key along
                    tempId
                });
            }
            setInput('');
        }
    };

    const handlePaste = (e) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    // For MVP, sending base64. In prod, upload to server/S3 and send URL.
                    const base64 = event.target.result;
                    // Insert markdown image syntax
                    setInput((prev) => prev + `\n![image](${base64}) \n`);
                };
                reader.readAsDataURL(blob);
            }
        }
    };

    const createGroup = () => {
        if (newGroupName.trim()) {
            socket.emit('create_group', { name: newGroupName, isPublic: newGroupIsPublic });
            setNewGroupName('');
            setNewGroupIsPublic(false);
            setShowGroupDialog(false);
        }
    };

    const leaveGroup = () => {
        if (selectedUser && selectedUser.isGroup) {
            if (window.confirm(`Leave group "${selectedUser.name}" ? `)) {
                socket.emit('leave_group', { groupId: selectedUser.id });
                setSelectedUser(null);
            }
        }
    };

    const toggleLocalMute = (groupId) => {
        setLocalMutedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const toggleUserMute = (userId) => {
        if (selectedUser && selectedUser.isGroup) {
            socket.emit('toggle_mute', { groupId: selectedUser.id, userId });
        }
    };

    const addToGroup = (userId) => {
        if (selectedUser && selectedUser.isGroup) { // selectedUser is actually a group here
            socket.emit('add_to_group', { groupId: selectedUser.id, userId });
            setShowAddMemberDialog(false);
        }
    };

    const removeFromGroup = (userId) => {
        if (selectedUser && selectedUser.isGroup) {
            if (window.confirm('Remove this user from the group?')) {
                socket.emit('remove_from_group', { groupId: selectedUser.id, userId });
            }
        }
    };

    const handleSenderClick = (senderId) => {
        // Find user in the visible users list
        const targetUser = users.find(u => u.id === senderId);

        if (targetUser) {
            // User is visible -> Start private chat
            setSelectedUser(targetUser);
            setUnreadCounts(prev => ({ ...prev, [targetUser.id]: 0 }));
        } else {
            // User is NOT visible (invisible and no shared private group)
            alert("Cannot start private chat with this user (User is invisible)");
        }
    };

    const filteredMessages = selectedUser
        ? messages.filter(m => {
            if (selectedUser.isGroup) {
                return m.groupId === selectedUser.id;
            } else {
                return (m.senderId === user.id && m.receiverId === selectedUser.id) ||
                    (m.senderId === selectedUser.id && m.receiverId === user.id);
            }
        })
        : [];

    const currentUser = users.find(u => u.id === user.id) || user;

    return (
        <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            <Drawer
                variant="permanent"
                sx={{
                    width: { xs: 280, sm: drawerWidth },
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: {
                        width: { xs: 280, sm: drawerWidth },
                        boxSizing: 'border-box',
                        background: 'linear-gradient(180deg, #152428 0%, #0f1f23 100%)',
                    },
                }}
            >
                <Box sx={{ p: 2, borderBottom: '1px solid rgba(0, 217, 255, 0.2)', background: 'rgba(15, 76, 92, 0.3)' }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Avatar 
                                src={currentUser.avatar} 
                                sx={{ width: 32, height: 32, cursor: 'pointer' }}
                                onClick={() => setShowProfileDialog(true)}
                            />
                            <Box>
                                <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>{currentUser.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {currentUser.isInvisible ? 'Invisible' : 'Visible'}
                                </Typography>
                            </Box>
                        </Box>
                        <Box>
                            <Tooltip title="Profile Settings">
                                <IconButton size="small" onClick={() => setShowProfileDialog(true)}>
                                    <SettingsIcon />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Set Passphrase for E2EE">
                                <IconButton size="small" onClick={() => setShowPassphraseDialog(true)}>
                                    <VpnKeyIcon color={keyPair ? "primary" : "disabled"} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={currentUser.isInvisible
                                ? "You are currently invisible. You appear offline, and only users in shared private groups can start chats with you."
                                : "You are currently visible. Anyone can see you and start a chat."}>
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const newStatus = currentUser.isInvisible ? 'visible' : 'invisible';
                                        socket.emit('set_status', { status: newStatus });
                                    }}
                                >
                                    {currentUser.isInvisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                </IconButton>
                            </Tooltip>
                            <IconButton
                                size="small"
                                onClick={handleLogout}
                                title="Logout"
                            >
                                <ExitToAppIcon />
                            </IconButton>
                        </Box>
                    </Box>
                    <Button size="small" onClick={() => setShowGroupDialog(true)}>Create Group</Button>
                </Box>
                <List>
                    {groups.map((g) => (
                        <ListItem
                            button
                            key={`group - ${g.id} `}
                            selected={selectedUser?.id === g.id && selectedUser?.isGroup}
                            onClick={() => {
                                setSelectedUser({ ...g, isGroup: true, name: g.name });
                                setUnreadCounts(prev => ({ ...prev, [g.id]: 0 }));
                            }}
                            secondaryAction={
                                <Box>
                                    <IconButton edge="end" onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLocalMute(g.id);
                                    }}>
                                        {localMutedGroups[g.id] ? <VolumeOffIcon color="disabled" /> : <VolumeUpIcon />}
                                    </IconButton>
                                    {user.isAdmin === 1 && (
                                        <IconButton
                                            edge="end"
                                            aria-label="delete"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Delete group "${g.name}" ? `)) {
                                                    socket.emit('delete_group', { groupId: g.id });
                                                    if (selectedUser?.id === g.id) {
                                                        setSelectedUser(null);
                                                    }
                                                }
                                            }}
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    )}
                                </Box>
                            }
                        >
                            <ListItemAvatar>
                                <Badge badgeContent={unreadCounts[g.id] || 0} color="error">
                                    <Avatar>{g.name[0]}</Avatar>
                                </Badge>
                            </ListItemAvatar>
                            <ListItemText
                                primary={g.name}
                                secondary={g.isPublic ? "Public Group" : "Group"}
                            />
                        </ListItem>
                    ))}
                    <Divider />
                    {users.filter(u => u.id !== user.id).map((u) => (
                        <ListItem
                            button
                            key={u.id}
                            selected={selectedUser?.id === u.id && !selectedUser?.isGroup}
                            onClick={() => {
                                setSelectedUser(u);
                                setUnreadCounts(prev => ({ ...prev, [u.id]: 0 }));
                            }}
                        >
                            <ListItemAvatar>
                                <Badge badgeContent={unreadCounts[u.id] || 0} color="error">
                                    <Badge
                                        color={u.status === 'online' ? "success" : (u.status === 'invisible' ? "warning" : "default")}
                                        variant="dot"
                                        overlap="circular"
                                    >
                                        <Avatar src={u.avatar} alt={u.name} />
                                    </Badge>
                                </Badge>
                            </ListItemAvatar>
                            <ListItemText
                                primary={
                                    <Box component="span" display="flex" alignItems="center">
                                        {u.name}
                                        {u.isAdmin === 1 && <AdminPanelSettingsIcon fontSize="small" color="primary" sx={{ ml: 1 }} />}
                                    </Box>
                                }
                                secondary={
                                    <Box component="span" display="flex" alignItems="center">
                                        {u.status}
                                        {u.publicKey && (
                                            <Tooltip title="View key fingerprint">
                                                <LockIcon 
                                                    fontSize="inherit" 
                                                    sx={{ 
                                                        ml: 0.5, 
                                                        fontSize: 12, 
                                                        color: 'primary.main',
                                                        cursor: 'pointer',
                                                        '&:hover': { color: 'secondary.main' }
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setViewingKeyUser(u);
                                                        setShowKeyFingerprintDialog(true);
                                                    }}
                                                />
                                            </Tooltip>
                                        )}
                                    </Box>
                                }
                            />
                        </ListItem>
                    ))}
                </List>
                
                {/* GitHub Link */}
                <Box 
                    sx={{ 
                        position: 'absolute', 
                        bottom: 12, 
                        left: 12,
                        opacity: 0.5,
                        transition: 'opacity 0.2s',
                        '&:hover': { opacity: 1 }
                    }}
                >
                    <Tooltip title="View on GitHub">
                        <IconButton
                            component="a"
                            href="https://github.com/sebseb7/chatApp"
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            sx={{ color: 'text.secondary' }}
                        >
                            <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                            </svg>
                        </IconButton>
                    </Tooltip>
                </Box>
            </Drawer>

            <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                {selectedUser ? (
                    <>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Box>
                                <Typography variant="h5">{selectedUser.isGroup && selectedUser.isPublic ? selectedUser.name : `Chat with ${selectedUser.name}`}</Typography>
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

                        <Paper sx={{ flexGrow: 1, mb: 2, p: 2, overflowY: 'auto' }}>
                            {filteredMessages.map((msg, index) => {
                                if (msg.type === 'system') {
                                    return (
                                        <Box key={index} sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                                            <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                                                {msg.content}
                                            </Typography>
                                        </Box>
                                    );
                                }

                                let displayContent = msg.content;
                                let isEncrypted = msg.type === 'eee';

                                if (isEncrypted) {
                                    if (msg.senderId === user.id && msg.isOptimistic) {
                                        // Optimistic message is plain text
                                        displayContent = msg.content;
                                    } else if (msg.senderId === user.id) {
                                        // My own message echoed back.
                                        // Try to decrypt with receiver's key if available
                                        if (decryptedMessages[msg.id]) {
                                            displayContent = decryptedMessages[msg.id];
                                        } else {
                                            displayContent = "🔒 Encrypted Message";
                                        }
                                    } else {
                                        // Received message
                                        displayContent = decryptedMessages[msg.id] || "🔒 Encrypted Message (Decrypting...)";
                                        if (decryptedMessages[msg.id] === undefined && keyPair) {
                                            // Trigger decryption if not done yet (handled in useEffect, but just in case)
                                        }
                                    }
                                }

                                return (
                                    <Box key={index} sx={{
                                        display: 'flex',
                                        justifyContent: msg.senderId === user.id ? 'flex-end' : 'flex-start',
                                        mb: 1
                                    }}>
                                        <Box sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: msg.senderId === user.id ? 'flex-end' : 'flex-start',
                                            maxWidth: '70%'
                                        }}>
                                            <Paper sx={{
                                                p: 1.5,
                                                background: msg.senderId === user.id
                                                    ? 'linear-gradient(135deg, #0f4c5c 0%, #1a6b7e 100%)'
                                                    : 'linear-gradient(135deg, #1a2f35 0%, #254552 100%)',
                                                width: '100%',
                                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                                                transition: 'transform 0.2s ease',
                                                '&:hover': {
                                                    transform: 'translateY(-1px)',
                                                }
                                            }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, cursor: 'pointer' }} onClick={() => handleSenderClick(msg.senderId)}>
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
                                                            <Tooltip title="End-to-End Encrypted">
                                                                <LockIcon sx={{ fontSize: 12, color: 'success.main', mr: 0.5 }} />
                                                            </Tooltip>
                                                        )}
                                                        <Typography variant="caption" display="block" align="right">
                                                            {new Date(msg.timestamp).toLocaleTimeString()}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            </Paper>
                                            {/* Read Receipts & Delivery Status */}
                                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5, width: '100%', alignItems: 'center' }}>
                                                {/* Queued Icon for Sender */}
                                                {msg.senderId === user.id && deliveryStatus[msg.id] === 'queued' && (
                                                    <Tooltip title="Queued (Receiver is offline)">
                                                        <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5 }} />
                                                    </Tooltip>
                                                )}

                                                {(readReceipts[msg.id] || []).map(reader => (
                                                    <Tooltip key={reader.id} title={`Read by ${reader.name}`}>
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
                            })}
                            <div ref={messagesEndRef} />
                        </Paper>
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
                                onChange={(e) => setInput(e.target.value)}
                                onPaste={handlePaste}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                multiline
                                maxRows={4}
                                InputProps={{
                                    startAdornment: isE2EEEnabled ? <LockIcon color="primary" sx={{ mr: 1 }} /> : null
                                }}
                            />
                            <IconButton color="primary" onClick={handleSend} sx={{ mb: 0.5 }}>
                                <SendIcon />
                            </IconButton>
                        </Box>
                    </>
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Typography variant="h5" color="textSecondary">Select a user or group to start chatting</Typography>
                    </Box>
                )}
            </Box>

            {/* Passphrase Dialog */}
            <Dialog open={showPassphraseDialog} onClose={() => setShowPassphraseDialog(false)}>
                <DialogTitle>Set E2EE Passphrase</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Enter a passphrase to generate your encryption keys.
                        This passphrase is required to decrypt your private messages.
                        If you lose it, you lose access to your encrypted history.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Passphrase"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    {hasStoredKeys && <Button onClick={handleClearKeys} color="error">Reset Keys</Button>}
                    <Button onClick={() => setShowPassphraseDialog(false)}>Cancel</Button>
                    <Button onClick={handlePassphraseSubmit} disabled={!passphrase}>
                        {hasStoredKeys ? "Unlock" : "Generate Keys"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Simple Dialogs for Group Creation and Adding Members */}
            {showGroupDialog && (
                <Paper className="glass" sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', p: 4, zIndex: 1000, background: 'rgba(26, 53, 64, 0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0, 217, 255, 0.2)' }}>
                    <Typography variant="h6">Create Group</Typography>
                    <TextField label="Group Name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} fullWidth sx={{ my: 2 }} />
                    {user.isAdmin === 1 && (
                        <FormControlLabel
                            control={<Checkbox checked={newGroupIsPublic} onChange={(e) => setNewGroupIsPublic(e.target.checked)} />}
                            label="Public Group (Auto-add everyone)"
                        />
                    )}
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button onClick={() => setShowGroupDialog(false)}>Cancel</Button>
                        <Button variant="contained" onClick={createGroup}>Create</Button>
                    </Box>
                </Paper>
            )}

            {showAddMemberDialog && (
                <Paper className="glass" sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', p: 4, zIndex: 1000, maxHeight: '400px', overflow: 'auto', background: 'rgba(26, 53, 64, 0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0, 217, 255, 0.2)' }}>
                    <Typography variant="h6">Add Member to {selectedUser.name}</Typography>
                    <List>
                        {users
                            .filter(u => !groupMembers.some(m => m.id === u.id)) // Filter out existing members
                            .map(u => (
                                <ListItem button key={u.id} onClick={() => addToGroup(u.id)}>
                                    <ListItemText primary={u.name} />
                                </ListItem>
                            ))}
                    </List>
                    <Button onClick={() => setShowAddMemberDialog(false)}>Cancel</Button>
                </Paper>
            )}

            {/* Profile Settings Dialog */}
            <ProfileSettings
                open={showProfileDialog}
                onClose={() => setShowProfileDialog(false)}
                user={currentUser}
                userPublicKey={myPublicKeyJwk}
                onSave={(updatedUser) => {
                    // Update local user state via parent
                    if (onUserUpdate) {
                        onUserUpdate(updatedUser);
                    }
                    // Trigger refresh of user list via socket
                    if (socket) {
                        socket.emit('refresh_user_list');
                    }
                }}
            />

            {/* Fullscreen Image Dialog */}
            <Dialog
                open={!!fullscreenImage}
                onClose={() => setFullscreenImage(null)}
                maxWidth={false}
                PaperProps={{
                    sx: {
                        backgroundColor: 'transparent',
                        boxShadow: 'none',
                        maxWidth: '95vw',
                        maxHeight: '95vh'
                    }
                }}
                onClick={() => setFullscreenImage(null)}
            >
                {fullscreenImage && (
                    <img
                        src={fullscreenImage}
                        alt="Fullscreen"
                        style={{
                            maxWidth: '95vw',
                            maxHeight: '95vh',
                            objectFit: 'contain',
                            borderRadius: '8px'
                        }}
                    />
                )}
            </Dialog>

            {/* Key Fingerprint Dialog */}
            <Dialog
                open={showKeyFingerprintDialog}
                onClose={() => {
                    setShowKeyFingerprintDialog(false);
                    setViewingKeyUser(null);
                }}
                maxWidth="sm"
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
                        Key Fingerprint
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
                                Compare this fingerprint with {viewingKeyUser.name}'s device to verify their identity
                                and ensure your messages are secure from MITM attacks.
                            </Typography>

                            <Box sx={{ 
                                p: 3, 
                                borderRadius: 2, 
                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(0, 217, 255, 0.2)'
                            }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                                    {viewingKeyUser.name}'s Key
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
                                        Your Key (for comparison)
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
                    <Button 
                        onClick={() => {
                            setShowKeyFingerprintDialog(false);
                            setViewingKeyUser(null);
                        }}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={!isConnected}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="error" variant="filled" sx={{ width: '100%' }}>
                    Disconnected from server. Trying to reconnect...
                </Alert>
            </Snackbar>
        </Box >
    );
};

export default Chat;
