import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Drawer, List, ListItem, ListItemText, ListItemAvatar, Avatar,
    Typography, TextField, Button, Paper, IconButton, Badge, Divider, Chip, Checkbox, FormControlLabel, Tooltip, Snackbar, Alert
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
import ReactMarkdown from 'react-markdown';
import { useSocket } from '../context/SocketContext';

const drawerWidth = 300;

const Chat = ({ user }) => {
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
    const [unreadCounts, setUnreadCounts] = useState({});
    const [readReceipts, setReadReceipts] = useState({}); // { messageId: [user1, user2...] }
    const [deliveryStatus, setDeliveryStatus] = useState({}); // { messageId: 'delivered' | 'queued' }

    // Ref to access current selectedUser inside socket callback closure if needed, 
    // or just use functional state update logic which is safer.
    const selectedUserRef = useRef(selectedUser);

    useEffect(() => {
        selectedUserRef.current = selectedUser;
    }, [selectedUser]);

    useEffect(() => {
        if (!socket) return;

        socket.on('user_list', (userList) => {
            setUsers(userList);
        });

        socket.on('group_list', (groupList) => {
            setGroups(groupList);
        });

        socket.on('group_members', ({ groupId, members }) => {
            if (selectedUserRef.current?.id === groupId && selectedUserRef.current?.isGroup) {
                setGroupMembers(members);
            }
        });

        socket.on('receive_message', (message) => {
            setMessages((prev) => [...prev, message]);

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

        return () => {
            socket.off('user_list');
            socket.off('group_list');
            socket.off('group_members');
            socket.off('receive_message');
            socket.off('message_read_update');
            socket.off('delivery_update');
        };
    }, [socket, user.id]); // Added user.id dependency

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Fetch members when group selected
    useEffect(() => {
        if (selectedUser?.isGroup) {
            socket.emit('get_group_members', { groupId: selectedUser.id });
        } else {
            setGroupMembers([]);
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

    const handleSend = () => {
        if (input.trim() && selectedUser) {
            if (selectedUser.isGroup) {
                socket.emit('send_message', {
                    groupId: selectedUser.id,
                    content: input,
                    type: 'text'
                });
            } else {
                socket.emit('send_message', {
                    receiverId: selectedUser.id,
                    content: input,
                    type: 'text'
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
            // Show error/notification
            // Since we don't have a global snackbar for custom messages easily accessible without state,
            // let's just alert for MVP or use the existing error handling mechanism if possible.
            // But wait, we can use a simple alert or console log, or better, reuse the snackbar?
            // The existing snackbar is for connection status.
            // Let's add a local state for error message.
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
                    <Typography variant="h6">Users</Typography>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Typography variant="caption">{currentUser.name} ({currentUser.isInvisible ? 'Invisible' : 'Visible'})</Typography>
                        <Box>
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
                                    <Box display="flex" alignItems="center">
                                        {u.name}
                                        {u.isAdmin === 1 && <AdminPanelSettingsIcon fontSize="small" color="primary" sx={{ ml: 1 }} />}
                                    </Box>
                                }
                                secondary={u.status}
                            />
                        </ListItem>
                    ))}
                </List>
            </Drawer>

            <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                {selectedUser ? (
                    <>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Box>
                                <Typography variant="h5">Chat with {selectedUser.name}</Typography>
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
                            <Box>
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

                        {/* Dialogs would go here, but for MVP let's use simple prompts or inline inputs if needed.
                            Actually, let's just add the Dialog components from MUI. */}

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
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                <Typography variant="caption" display="block" align="right">
                                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                                </Typography>
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
                                placeholder="Type a message..."
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
