import React, { Component } from 'react';
import {
    Box, Drawer, List, ListItem, ListItemText, ListItemAvatar, Avatar,
    Typography, Button, IconButton, Badge, Divider, Tooltip
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteIcon from '@mui/icons-material/Delete';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LockIcon from '@mui/icons-material/Lock';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import VpnKeyOffIcon from '@mui/icons-material/VpnKeyOff';
import SettingsIcon from '@mui/icons-material/Settings';
import { ChatContext } from './ChatContext';

const drawerWidth = 300;

class UserList extends Component {
    static contextType = ChatContext;

    handleLogout = () => {
        window.location.href = '/api/logout';
    };

    render() {
        const {
            users,
            groups,
            selectedUser,
            unreadCounts,
            localMutedGroups,
            keyPair,
            user,
            socket,
            setSelectedUser,
            setShowGroupDialog,
            setShowProfileDialog,
            setShowPassphraseDialog,
            setViewingKeyUser,
            setShowKeyFingerprintDialog,
            toggleLocalMute,
            deleteGroup,
            handleClearKeys
        } = this.context;

        const currentUser = users.find(u => u.id === user.id) || user;
        const { isMobile } = this.context;

        return (
            <Drawer
                variant="permanent"
                sx={{
                    width: isMobile ? '100%' : drawerWidth,
                    flexShrink: 0,
                    display: isMobile && selectedUser ? 'none' : 'block',
                    [`& .MuiDrawer-paper`]: {
                        width: isMobile ? '100%' : drawerWidth,
                        boxSizing: 'border-box',
                        background: 'linear-gradient(180deg, #152428 0%, #0f1f23 100%)',
                    },
                }}
            >
                {/* Header */}
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
                                <IconButton size="small" onClick={(e) => { e.currentTarget.blur(); setShowProfileDialog(true); }}>
                                    <SettingsIcon />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={keyPair ? "E2EE Settings" : "Set Passphrase for E2EE"}>
                                <IconButton size="small" onClick={(e) => { e.currentTarget.blur(); setShowPassphraseDialog(true); }}>
                                    <VpnKeyIcon color={keyPair ? "primary" : "disabled"} />
                                </IconButton>
                            </Tooltip>
                            {keyPair && (
                                <Tooltip title="Reset encryption keys">
                                    <IconButton size="small" onClick={(e) => { e.currentTarget.blur(); handleClearKeys(); }} color="warning">
                                        <VpnKeyOffIcon />
                                    </IconButton>
                                </Tooltip>
                            )}
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
                                onClick={this.handleLogout}
                                title="Logout"
                            >
                                <ExitToAppIcon />
                            </IconButton>
                        </Box>
                    </Box>
                    <Button size="small" onClick={() => setShowGroupDialog(true)}>Create Group</Button>
                </Box>

                {/* Groups & Users List */}
                <List>
                    {groups.map((g) => (
                        <ListItem
                            button
                            key={`group-${g.id}`}
                            selected={selectedUser?.id === g.id && selectedUser?.isGroup}
                            onClick={() => setSelectedUser({ ...g, isGroup: true, name: g.name })}
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
                                                deleteGroup(g.id);
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
                                secondary={
                                    <Box component="span" display="flex" alignItems="center">
                                        {g.isPublic ? "Public Group" : "Group"}
                                        {!!g.isEncrypted && (
                                            <Tooltip title="Encrypted Group">
                                                <LockIcon sx={{ fontSize: 12, ml: 0.5, color: 'primary.main' }} />
                                            </Tooltip>
                                        )}
                                    </Box>
                                }
                            />
                        </ListItem>
                    ))}
                    <Divider />
                    {users.filter(u => u.id !== user.id).map((u) => (
                        <ListItem
                            button
                            key={u.id}
                            selected={selectedUser?.id === u.id && !selectedUser?.isGroup}
                            onClick={() => setSelectedUser(u)}
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
                                            <Tooltip title="View key fingerprint" disableInteractive>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        ml: 0.5,
                                                        p: 0,
                                                        color: 'primary.main',
                                                        '&:hover': { color: 'secondary.main', backgroundColor: 'transparent' }
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        e.currentTarget.blur();
                                                        setViewingKeyUser(u);
                                                        setShowKeyFingerprintDialog(true);
                                                    }}
                                                >
                                                    <LockIcon sx={{ fontSize: 12 }} />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Box>
                                }
                            />
                        </ListItem>
                    ))}
                </List>

                {/* GitHub Link & SRI Verification */}
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
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
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                            </svg>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={
                        <Box sx={{ textAlign: 'center' }}>
                            <div>Verify file hashes:</div>
                            <Box component="a" href="https://www.srihash.org/?url=https://c.growheads.de/index.html" target="_blank" rel="noopener noreferrer" sx={{ color: '#26c6da', display: 'block' }}>index.html</Box>
                            <Box component="a" href="https://www.srihash.org/?url=https://c.growheads.de/bundle.js" target="_blank" rel="noopener noreferrer" sx={{ color: '#26c6da', display: 'block' }}>bundle.js</Box>
                            <Box component="a" href="https://www.srihash.org/?url=https://c.growheads.de/sw.js" target="_blank" rel="noopener noreferrer" sx={{ color: '#26c6da', display: 'block' }}>sw.js</Box>
                        </Box>
                    }>
                        <IconButton
                            size="small"
                            sx={{ color: 'text.secondary' }}
                        >
                            <svg height="18" width="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                            </svg>
                        </IconButton>
                    </Tooltip>
                </Box>
            </Drawer>
        );
    }
}

export default UserList;

