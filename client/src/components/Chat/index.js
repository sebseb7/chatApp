import React, { Component, createRef } from 'react';
import { Box, Paper, Typography, Snackbar, Alert, Button, CircularProgress, useTheme, useMediaQuery } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { ChatProvider, ChatContext, ensureAudioContext } from './ChatContext';
import { useSocket } from '../../context/SocketContext';
import UserList from './UserList';
import Message from './Message';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import GroupDialog from './GroupDialog';
import AddMemberDialog from './AddMemberDialog';
import PassphraseDialog from './PassphraseDialog';
import KeyFingerprintDialog from './KeyFingerprintDialog';
import FullscreenImageDialog from './FullscreenImageDialog';
import ProfileSettings from '../ProfileSettings';

// Inner component that has access to ChatContext
class ChatInner extends Component {
    static contextType = ChatContext;
    
    constructor(props) {
        super(props);
        this.messagesEndRef = createRef();
        this.messagesContainerRef = createRef();
        this.prevMessageCount = 0;
        this.prevSelectedUser = null;
    }
    
    componentDidUpdate(prevProps, prevState) {
        const { selectedUser, messages } = this.context;
        const filteredMessages = this.context.getFilteredMessages();
        
        // If we selected a new user, scroll to bottom
        if (selectedUser !== this.prevSelectedUser) {
            this.prevSelectedUser = selectedUser;
            this.prevMessageCount = filteredMessages.length;
            this.scrollToBottom();
            return;
        }
        
        // If new messages were added at the end (not loaded history), scroll to bottom
        // History loads prepend messages, so count increases but we shouldn't scroll
        if (filteredMessages.length > this.prevMessageCount) {
            const isHistoryLoad = this.context.loadingHistory === false && 
                                  this.prevMessageCount > 0 &&
                                  filteredMessages.length - this.prevMessageCount <= 10;
            
            // Only scroll to bottom for new incoming/sent messages, not history loads
            // Check if the newest message ID is actually new
            const prevNewestId = this.prevNewestMsgId;
            const currentNewestId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].id : null;
            
            if (currentNewestId !== prevNewestId) {
                this.scrollToBottom();
            }
        }
        
        this.prevMessageCount = filteredMessages.length;
        this.prevNewestMsgId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].id : null;
    }
    
    scrollToBottom = () => {
        this.messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    
    render() {
        const {
            selectedUser,
            showProfileDialog,
            isConnected,
            user,
            socket,
            onUserUpdate,
            setShowProfileDialog,
            getFilteredMessages,
            users,
            hasMoreHistory,
            loadingHistory,
            loadMoreHistory
        } = this.context;
        
        const filteredMessages = getFilteredMessages();
        const currentUser = users.find(u => u.id === user.id) || user;
        const chatKey = selectedUser?.id;
        const canLoadMore = chatKey && hasMoreHistory[chatKey] !== false;
        const { isMobile } = this.context;
        
        return (
            <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }} onClick={ensureAudioContext}>
                <UserList />
                
                <Box component="main" sx={{ 
                    flexGrow: 1, 
                    p: isMobile ? 1 : 3, 
                    display: isMobile && !selectedUser ? 'none' : 'flex', 
                    flexDirection: 'column',
                    height: '100dvh',
                    width: isMobile ? '100%' : 'auto',
                    overflow: 'hidden',
                    // On mobile, use fixed positioning to prevent keyboard from pushing content
                    ...(isMobile && selectedUser && {
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 1,
                        background: '#0a1214',
                    }),
                }}>
                    {selectedUser ? (
                        <>
                            <ChatHeader />
                            
                            <Paper ref={this.messagesContainerRef} sx={{ flexGrow: 1, mb: 2, p: 2, overflowY: 'auto', minHeight: 0 }}>
                                {/* Load older messages button */}
                                {canLoadMore && filteredMessages.length > 0 && (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            onClick={loadMoreHistory}
                                            disabled={loadingHistory}
                                            startIcon={loadingHistory ? <CircularProgress size={16} /> : <HistoryIcon />}
                                            sx={{ 
                                                borderColor: 'rgba(0, 217, 255, 0.3)',
                                                '&:hover': { borderColor: 'rgba(0, 217, 255, 0.6)' }
                                            }}
                                        >
                                            {loadingHistory ? 'Loading...' : 'Load older messages'}
                                        </Button>
                                    </Box>
                                )}
                                
                                {filteredMessages.map((msg, index) => (
                                    <Message key={msg.id || index} msg={msg} />
                                ))}
                                <div ref={this.messagesEndRef} />
                            </Paper>
                            
                            <MessageInput />
                        </>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <Typography variant="h5" color="textSecondary">
                                Select a user or group to start chatting
                            </Typography>
                        </Box>
                    )}
                </Box>
                
                {/* Dialogs */}
                <GroupDialog />
                <AddMemberDialog />
                <PassphraseDialog />
                <KeyFingerprintDialog />
                <FullscreenImageDialog />
                
                {/* Profile Settings Dialog */}
                <ProfileSettings
                    open={showProfileDialog}
                    onClose={() => setShowProfileDialog(false)}
                    user={currentUser}
                    onSave={(updatedUser) => {
                        if (onUserUpdate) {
                            onUserUpdate(updatedUser);
                        }
                        if (socket) {
                            socket.emit('refresh_user_list');
                        }
                    }}
                />
                
                {/* Connection Status */}
                <Snackbar
                    open={!isConnected}
                    anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                >
                    <Alert severity="error" variant="filled" sx={{ width: '100%' }}>
                        Disconnected from server. Trying to reconnect...
                    </Alert>
                </Snackbar>
            </Box>
        );
    }
}

// Wrapper component to inject socket context into ChatProvider
// This is needed because ChatProvider is a class component that can't use hooks
class Chat extends Component {
    render() {
        const { user, onUserUpdate, socket, isConnected, isMobile } = this.props;
        
        return (
            <ChatProvider 
                user={user} 
                onUserUpdate={onUserUpdate}
                socket={socket}
                isConnected={isConnected}
                isMobile={isMobile}
            >
                <ChatInner />
            </ChatProvider>
        );
    }
}

// HOC to inject socket hook and media query into class component
function withSocket(WrappedComponent) {
    return function WithSocketWrapper(props) {
        const { socket, isConnected } = useSocket();
        const theme = useTheme();
        const isMobile = useMediaQuery(theme.breakpoints.down('md'));
        return <WrappedComponent {...props} socket={socket} isConnected={isConnected} isMobile={isMobile} />;
    };
}

export default withSocket(Chat);

