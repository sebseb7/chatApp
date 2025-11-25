import React, { createContext, Component } from 'react';
import { exportPublicKey, importPublicKey, loadKeys, clearKeys, previewPublicKey, decryptMessage } from '../../services/crypto';
import { subscribeToPush, isPushSupported } from '../../services/push';

export const ChatContext = createContext();

// Singleton AudioContext - created on first user gesture
let audioContext = null;

// Initialize AudioContext on user gesture
export const ensureAudioContext = () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
};

// Play a ding notification sound using Web Audio API
export const playDingSound = () => {
    try {
        const ctx = ensureAudioContext();
        if (!ctx || ctx.state !== 'running') {
            return;
        }
        
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.setValueAtTime(659.25, ctx.currentTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.warn('Could not play notification sound:', e);
    }
};

export class ChatProvider extends Component {
    constructor(props) {
        super(props);
        this.state = {
            users: [],
            selectedUser: null,
            messages: [],
            groups: [],
            groupMembers: [],
            localMutedGroups: {},
            unreadCounts: {},
            readReceipts: {},
            deliveryStatus: {},
            
            // E2EE State
            keyPair: null,
            passphrase: '',
            hasStoredKeys: false,
            peerPublicKeys: {},
            decryptedMessages: {},
            decryptionFailed: {}, // Track messages that failed to decrypt
            myPublicKeyJwk: null,
            previewKeyJwk: null,
            isE2EEEnabled: false,
            
            // Dialog States
            showGroupDialog: false,
            showAddMemberDialog: false,
            showProfileDialog: false,
            showPassphraseDialog: false,
            showKeyFingerprintDialog: false,
            viewingKeyUser: null,
            fullscreenImage: null,
            
            // Group creation form
            newGroupName: '',
            newGroupIsPublic: false,
            
            // History loading state
            hasMoreHistory: {},  // { oderId/groupId: boolean }
            loadingHistory: false,
        };
        
        this.selectedUserRef = { current: null };
    }
    
    componentDidMount() {
        this.initKeys();
        this.setupSocketListeners();
        this.initPushNotifications();
    }
    
    initPushNotifications = async () => {
        if (!isPushSupported()) {
            console.log('Push notifications not supported');
            return;
        }
        
        // Wait a moment for the app to settle, then request push permission
        setTimeout(async () => {
            const result = await subscribeToPush();
            if (result.success) {
                console.log('Push notifications enabled');
            } else {
                console.log('Push notifications not enabled:', result.error);
            }
        }, 2000);
    };
    
    componentDidUpdate(prevProps, prevState) {
        // Update ref when selectedUser changes
        if (prevState.selectedUser !== this.state.selectedUser) {
            this.selectedUserRef.current = this.state.selectedUser;
        }
        
        // Setup socket listeners when socket becomes available
        if (!prevProps.socket && this.props.socket) {
            this.setupSocketListeners();
        }
        
        // Re-broadcast key on reconnect
        if (this.state.keyPair && this.props.socket && !prevProps.isConnected && this.props.isConnected) {
            exportPublicKey(this.state.keyPair.publicKey).then(jwk => {
                this.props.socket.emit('update_public_key', { publicKey: jwk });
            });
        }
        
        // Live preview of key fingerprint (debounced in componentDidUpdate)
        if (prevState.passphrase !== this.state.passphrase && this.state.showPassphraseDialog) {
            this.updateKeyPreview();
        }
        
        // Fetch members when group selected
        if (this.state.selectedUser?.isGroup && 
            (!prevState.selectedUser?.isGroup || prevState.selectedUser?.id !== this.state.selectedUser?.id)) {
            this.props.socket?.emit('get_group_members', { groupId: this.state.selectedUser.id });
            this.setState({ isE2EEEnabled: false }); // E2EE not supported for groups
        } else if (this.state.selectedUser && !this.state.selectedUser.isGroup && 
                   prevState.selectedUser !== this.state.selectedUser) {
            // For P2P chats, enable E2EE by default if both users have keys
            const hasPeerKey = !!this.state.peerPublicKeys[this.state.selectedUser.id];
            const canEnableE2EE = !!this.state.keyPair && hasPeerKey;
            this.setState({ groupMembers: [], isE2EEEnabled: canEnableE2EE });
        }
        
        // Mark messages as read
        this.markMessagesAsRead();
        
        // Retry decryption when keys become available
        if ((prevState.keyPair !== this.state.keyPair && this.state.keyPair) ||
            (prevState.peerPublicKeys !== this.state.peerPublicKeys)) {
            this.retryDecryption();
        }
    }
    
    componentWillUnmount() {
        this.cleanupSocketListeners();
        if (this.keyPreviewTimer) {
            clearTimeout(this.keyPreviewTimer);
        }
    }
    
    updateKeyPreview = () => {
        if (this.keyPreviewTimer) {
            clearTimeout(this.keyPreviewTimer);
        }
        
        if (!this.state.passphrase || !this.state.showPassphraseDialog) {
            this.setState({ previewKeyJwk: null });
            return;
        }
        
        this.keyPreviewTimer = setTimeout(async () => {
            try {
                const preview = await previewPublicKey(this.state.passphrase, this.props.user.googleId);
                this.setState({ previewKeyJwk: preview });
            } catch (err) {
                console.warn('Preview key generation failed:', err);
                this.setState({ previewKeyJwk: null });
            }
        }, 300);
    };
    
    initKeys = async () => {
        const stored = localStorage.getItem("chat_e2ee_keys");
        if (stored) {
            this.setState({ hasStoredKeys: true });
            
            const savedPassphrase = sessionStorage.getItem("chat_e2ee_passphrase");
            if (savedPassphrase) {
                try {
                    const keys = await loadKeys(savedPassphrase, this.props.user.googleId);
                    const pubKeyJwk = await exportPublicKey(keys.publicKey);
                    
                    this.setState({
                        keyPair: keys,
                        passphrase: savedPassphrase,
                        myPublicKeyJwk: pubKeyJwk
                    });
                    
                    console.log('E2EE keys restored from session-preserved passphrase');
                    return;
                } catch (err) {
                    console.warn('Failed to restore keys from session passphrase:', err);
                    sessionStorage.removeItem("chat_e2ee_passphrase");
                }
            }
            
            this.setState({ showPassphraseDialog: true });
        }
    };
    
    setupSocketListeners = () => {
        const { socket } = this.props;
        if (!socket) {
            console.log('[setupSocketListeners] No socket, skipping');
            return;
        }
        
        console.log('[setupSocketListeners] Setting up listeners');
        socket.on('user_list', this.handleUserList);
        socket.on('group_list', this.handleGroupList);
        socket.on('group_members', this.handleGroupMembers);
        socket.on('receive_message', this.handleReceiveMessage);
        socket.on('message_read_update', this.handleMessageReadUpdate);
        socket.on('delivery_update', this.handleDeliveryUpdate);
        socket.on('history_loaded', this.handleHistoryLoaded);
        socket.on('message_deleted', this.handleMessageDeleted);
        socket.on('messages_deleted_bulk', this.handleMessagesDeletedBulk);
        
        socket.emit('get_groups');
        
        // Key is broadcast only on:
        // 1. Passphrase submit (handlePassphraseSubmit)
        // 2. Reconnect (componentDidUpdate when isConnected changes)
        // NOT here - setupSocketListeners can be called multiple times
    };
    
    cleanupSocketListeners = () => {
        const { socket } = this.props;
        if (!socket) return;
        
        socket.off('user_list', this.handleUserList);
        socket.off('group_list', this.handleGroupList);
        socket.off('group_members', this.handleGroupMembers);
        socket.off('receive_message', this.handleReceiveMessage);
        socket.off('message_read_update', this.handleMessageReadUpdate);
        socket.off('delivery_update', this.handleDeliveryUpdate);
        socket.off('history_loaded', this.handleHistoryLoaded);
        socket.off('message_deleted', this.handleMessageDeleted);
        socket.off('messages_deleted_bulk', this.handleMessagesDeletedBulk);
    };
    
    handleUserList = async (userList) => {
        console.log('[handleUserList] Received user list with', userList.length, 'users');
        this.setState({ users: userList });
        
        const newPeerKeys = { ...this.state.peerPublicKeys };
        for (const u of userList) {
            if (u.publicKey) {
                // Add or update key if changed
                try {
                    // Only re-import if we don't have it or if it changed
                    const existingKeyJson = newPeerKeys[u.id] ? 
                        JSON.stringify(await exportPublicKey(newPeerKeys[u.id])) : null;
                    const newKeyJson = JSON.stringify(u.publicKey);
                    if (existingKeyJson !== newKeyJson) {
                        console.log('[handleUserList] Importing/updating key for user', u.id);
                        newPeerKeys[u.id] = await importPublicKey(u.publicKey);
                    }
                } catch (e) {
                    console.error("Failed to import key for user", u.id, e);
                }
            } else {
                // User cleared their key - remove from cache
                if (newPeerKeys[u.id]) {
                    console.log('[handleUserList] Removing key for user', u.id, '(cleared)');
                    delete newPeerKeys[u.id];
                }
            }
        }
        this.setState({ peerPublicKeys: newPeerKeys });
    };
    
    handleGroupList = (groupList) => {
        this.setState({ groups: groupList });
    };
    
    handleGroupMembers = ({ groupId, members }) => {
        if (this.selectedUserRef.current?.id === groupId && this.selectedUserRef.current?.isGroup) {
            this.setState({ groupMembers: members });
        }
    };
    
    handleReceiveMessage = async (message) => {
        this.setState(prevState => {
            let newMessages;
            if (message.tempId) {
                const existingIndex = prevState.messages.findIndex(m => m.tempId === message.tempId);
                if (existingIndex !== -1) {
                    newMessages = [...prevState.messages];
                    newMessages[existingIndex] = message;
                    return { messages: newMessages };
                }
            }
            return { messages: [...prevState.messages, message] };
        });
        
        // Decrypt if EEE
        if (message.type === 'eee' && this.state.keyPair) {
            try {
                let otherKey;
                if (message.senderId === this.props.user.id) {
                    otherKey = this.state.peerPublicKeys[message.receiverId];
                } else {
                    otherKey = this.state.peerPublicKeys[message.senderId];
                    if (!otherKey && message.senderPublicKey) {
                        otherKey = await importPublicKey(message.senderPublicKey);
                        this.setState(prev => ({
                            peerPublicKeys: { ...prev.peerPublicKeys, [message.senderId]: otherKey }
                        }));
                    }
                }
                
                if (otherKey) {
                    const decrypted = await decryptMessage(JSON.parse(message.content), this.state.keyPair.privateKey, otherKey);
                    this.setState(prev => ({
                        decryptedMessages: { ...prev.decryptedMessages, [message.id]: decrypted }
                    }));
                } else {
                    console.error("Missing public key for message", message.id, {
                        senderId: message.senderId,
                        receiverId: message.receiverId,
                        myId: this.props.user.id,
                        availablePeerKeys: Object.keys(this.state.peerPublicKeys)
                    });
                    this.setState(prev => ({
                        decryptionFailed: { ...prev.decryptionFailed, [message.id]: 'missing_key' }
                    }));
                }
            } catch (e) {
                console.error("Decryption failed for message", message.id, e.name, e.message, {
                    senderId: message.senderId,
                    receiverId: message.receiverId,
                    myId: this.props.user.id,
                    hasSenderPublicKey: !!message.senderPublicKey,
                    hasReceiverPublicKey: !!message.receiverPublicKey
                });
                this.setState(prev => ({
                    decryptionFailed: { ...prev.decryptionFailed, [message.id]: e.name || 'unknown' }
                }));
            }
        }
        
        // Set initial delivery status
        if (message.senderId === this.props.user.id && message.delivered !== undefined) {
            this.setState(prev => ({
                deliveryStatus: {
                    ...prev.deliveryStatus,
                    [message.id]: message.delivered ? 'delivered' : 'queued'
                }
            }));
        }
        
        const isGroupMsg = !!message.groupId;
        const chatId = isGroupMsg ? message.groupId : message.senderId;
        const currentSelected = this.selectedUserRef.current;
        
        // Don't count own messages
        if (message.senderId == this.props.user.id) return;
        
        if (!currentSelected ||
            (isGroupMsg && (!currentSelected.isGroup || currentSelected.id !== chatId)) ||
            (!isGroupMsg && (currentSelected.isGroup || currentSelected.id !== chatId))) {
            
            if (isGroupMsg && this.state.localMutedGroups[chatId]) return;
            
            playDingSound();
            
            this.setState(prev => ({
                unreadCounts: {
                    ...prev.unreadCounts,
                    [chatId]: (prev.unreadCounts[chatId] || 0) + 1
                }
            }));
        }
    };
    
    handleMessageReadUpdate = ({ messageId, user }) => {
        this.setState(prev => {
            const currentReaders = prev.readReceipts[messageId] || [];
            if (currentReaders.some(u => u.id === user.id)) return null;
            return {
                readReceipts: {
                    ...prev.readReceipts,
                    [messageId]: [...currentReaders, user]
                }
            };
        });
    };
    
    handleDeliveryUpdate = ({ messageId }) => {
        this.setState(prev => ({
            deliveryStatus: {
                ...prev.deliveryStatus,
                [messageId]: 'delivered'
            }
        }));
    };
    
    handleHistoryLoaded = async ({ messages, oderId, groupId, hasMore }) => {
        const chatKey = groupId || oderId;
        
        // Decrypt E2EE messages
        const decryptedUpdates = {};
        const failedUpdates = {};
        for (const message of messages) {
            if (message.type === 'eee' && this.state.keyPair) {
                try {
                    let otherKey;
                    if (message.senderId === this.props.user.id) {
                        // I sent this message - need receiver's key to decrypt
                        otherKey = this.state.peerPublicKeys[message.receiverId];
                        // Use stored receiverPublicKey if peer key not available
                        if (!otherKey && message.receiverPublicKey) {
                            otherKey = await importPublicKey(message.receiverPublicKey);
                            this.setState(prev => ({
                                peerPublicKeys: { ...prev.peerPublicKeys, [message.receiverId]: otherKey }
                            }));
                        }
                    } else {
                        // I received this message - need sender's key to decrypt
                        otherKey = this.state.peerPublicKeys[message.senderId];
                        if (!otherKey && message.senderPublicKey) {
                            otherKey = await importPublicKey(message.senderPublicKey);
                            this.setState(prev => ({
                                peerPublicKeys: { ...prev.peerPublicKeys, [message.senderId]: otherKey }
                            }));
                        }
                    }
                    
                    if (otherKey) {
                        const decrypted = await decryptMessage(JSON.parse(message.content), this.state.keyPair.privateKey, otherKey);
                        decryptedUpdates[message.id] = decrypted;
                    } else {
                        console.error("Missing public key for history message", message.id, {
                            senderId: message.senderId,
                            receiverId: message.receiverId,
                            myId: this.props.user.id,
                            availablePeerKeys: Object.keys(this.state.peerPublicKeys),
                            hasSenderPublicKey: !!message.senderPublicKey,
                            hasReceiverPublicKey: !!message.receiverPublicKey
                        });
                        failedUpdates[message.id] = 'missing_key';
                    }
                } catch (e) {
                    console.error("Decryption failed for history message", message.id, e.name, e.message, {
                        senderId: message.senderId,
                        receiverId: message.receiverId,
                        myId: this.props.user.id,
                        hasSenderPublicKey: !!message.senderPublicKey,
                        hasReceiverPublicKey: !!message.receiverPublicKey
                    });
                    failedUpdates[message.id] = e.name || 'unknown';
                }
            }
        }
        
        this.setState(prev => {
            // Prepend history messages, avoiding duplicates
            const existingIds = new Set(prev.messages.map(m => m.id));
            const newMessages = messages.filter(m => !existingIds.has(m.id));
            
            return {
                messages: [...newMessages, ...prev.messages],
                hasMoreHistory: { ...prev.hasMoreHistory, [chatKey]: hasMore },
                loadingHistory: false,
                decryptedMessages: { ...prev.decryptedMessages, ...decryptedUpdates },
                decryptionFailed: { ...prev.decryptionFailed, ...failedUpdates }
            };
        });
    };
    
    handleMessageDeleted = ({ messageId, groupId, oderId }) => {
        this.setState(prev => ({
            messages: prev.messages.filter(m => m.id !== messageId)
        }));
    };
    
    handleMessagesDeletedBulk = ({ groupId, oderId }) => {
        this.setState(prev => {
            const deleterId = oderId; // The user who deleted
            let filteredMessages;
            
            if (groupId) {
                // In groups, only the deleter's messages are removed
                filteredMessages = prev.messages.filter(m => 
                    !(m.groupId === groupId && m.senderId === deleterId)
                );
            } else {
                // In P2P, all messages between current user and the other user are removed
                const myId = this.props.user.id;
                filteredMessages = prev.messages.filter(m => 
                    !((m.senderId === myId && m.receiverId === deleterId) ||
                      (m.senderId === deleterId && m.receiverId === myId))
                );
            }
            
            return { messages: filteredMessages };
        });
    };
    
    markMessagesAsRead = () => {
        const { selectedUser, messages, readReceipts } = this.state;
        const { socket, user } = this.props;
        
        if (!selectedUser || !messages.length || !socket) return;
        
        const unreadMessages = messages.filter(m => {
            if (m.senderId === user.id) return false;
            
            if (selectedUser.isGroup) {
                return m.groupId === selectedUser.id;
            } else {
                return (m.senderId === selectedUser.id && m.receiverId === user.id);
            }
        });
        
        unreadMessages.forEach(m => {
            const readers = readReceipts[m.id] || [];
            if (!readers.some(r => r.id === user.id)) {
                socket.emit('mark_read', {
                    messageId: m.id,
                    groupId: m.groupId,
                    senderId: m.senderId
                });
            }
        });
    };
    
    // Retry decryption for messages that failed (e.g., keys weren't loaded yet)
    retryDecryption = async () => {
        const { messages, decryptedMessages, decryptionFailed, keyPair, peerPublicKeys } = this.state;
        if (!keyPair) return;
        
        const decryptedUpdates = {};
        const failedUpdates = {};
        
        for (const message of messages) {
            // Skip if already decrypted or not E2EE
            if (message.type !== 'eee' || decryptedMessages[message.id]) continue;
            // Skip if already permanently failed (OperationError means wrong keys, won't change)
            if (decryptionFailed[message.id] === 'OperationError') continue;
            
            try {
                let otherKey;
                if (message.senderId === this.props.user.id) {
                    // I sent this message - need receiver's key
                    otherKey = peerPublicKeys[message.receiverId];
                    if (!otherKey && message.receiverPublicKey) {
                        otherKey = await importPublicKey(message.receiverPublicKey);
                        this.setState(prev => ({
                            peerPublicKeys: { ...prev.peerPublicKeys, [message.receiverId]: otherKey }
                        }));
                    }
                } else {
                    // I received this message - need sender's key
                    otherKey = peerPublicKeys[message.senderId];
                    if (!otherKey && message.senderPublicKey) {
                        otherKey = await importPublicKey(message.senderPublicKey);
                        this.setState(prev => ({
                            peerPublicKeys: { ...prev.peerPublicKeys, [message.senderId]: otherKey }
                        }));
                    }
                }
                
                if (otherKey) {
                    const decrypted = await decryptMessage(JSON.parse(message.content), keyPair.privateKey, otherKey);
                    decryptedUpdates[message.id] = decrypted;
                }
            } catch (e) {
                console.error("Retry decryption failed for message", message.id, e.name, e.message);
                failedUpdates[message.id] = e.name || 'unknown';
            }
        }
        
        if (Object.keys(decryptedUpdates).length > 0 || Object.keys(failedUpdates).length > 0) {
            this.setState(prev => ({
                decryptedMessages: { ...prev.decryptedMessages, ...decryptedUpdates },
                decryptionFailed: { ...prev.decryptionFailed, ...failedUpdates }
            }));
        }
    };
    
    // Actions
    setSelectedUser = (user) => {
        this.setState({ 
            selectedUser: user,
            unreadCounts: {
                ...this.state.unreadCounts,
                [user?.id]: 0
            }
        });
        
        // Load initial history for this chat
        if (user && this.props.socket) {
            const chatKey = user.isGroup ? user.id : user.id;
            // Only load if we haven't loaded for this chat yet
            if (this.state.hasMoreHistory[chatKey] === undefined) {
                this.setState({ loadingHistory: true });
                if (user.isGroup) {
                    this.props.socket.emit('load_history', { groupId: user.id, limit: 10 });
                } else {
                    this.props.socket.emit('load_history', { oderId: user.id, limit: 10 });
                }
            }
        }
    };
    
    setInput = (input) => {
        this.setState({ input });
    };
    
    setShowGroupDialog = (show) => {
        this.setState({ showGroupDialog: show });
    };
    
    setShowAddMemberDialog = (show) => {
        this.setState({ showAddMemberDialog: show });
    };
    
    setShowProfileDialog = (show) => {
        this.setState({ showProfileDialog: show });
    };
    
    setShowPassphraseDialog = (show) => {
        this.setState({ showPassphraseDialog: show });
    };
    
    setPassphrase = (passphrase) => {
        this.setState({ passphrase });
    };
    
    setNewGroupName = (name) => {
        this.setState({ newGroupName: name });
    };
    
    setNewGroupIsPublic = (isPublic) => {
        this.setState({ newGroupIsPublic: isPublic });
    };
    
    setIsE2EEEnabled = (enabled) => {
        this.setState({ isE2EEEnabled: enabled });
    };
    
    setFullscreenImage = (image) => {
        this.setState({ fullscreenImage: image });
    };
    
    setViewingKeyUser = (user) => {
        this.setState({ viewingKeyUser: user });
    };
    
    setShowKeyFingerprintDialog = (show) => {
        this.setState({ showKeyFingerprintDialog: show });
    };
    
    toggleLocalMute = (groupId) => {
        this.setState(prev => ({
            localMutedGroups: {
                ...prev.localMutedGroups,
                [groupId]: !prev.localMutedGroups[groupId]
            }
        }));
    };
    
    addMessage = (message) => {
        this.setState(prev => ({
            messages: [...prev.messages, message]
        }));
    };
    
    handlePassphraseSubmit = async () => {
        try {
            const keys = await loadKeys(this.state.passphrase, this.props.user.googleId);
            const pubKeyJwk = await exportPublicKey(keys.publicKey);
            
            this.setState({
                keyPair: keys,
                hasStoredKeys: true,
                showPassphraseDialog: false,
                myPublicKeyJwk: pubKeyJwk
            });
            
            sessionStorage.setItem("chat_e2ee_passphrase", this.state.passphrase);
            this.props.socket?.emit('update_public_key', { publicKey: pubKeyJwk });
            
        } catch (err) {
            alert("Error with keys: " + err.message);
            console.error(err);
        }
    };
    
    handleClearKeys = async () => {
        if (window.confirm("Clear stored keys? You can recover them by entering the same passphrase again.")) {
            await clearKeys();
            this.setState({
                keyPair: null,
                passphrase: '',
                hasStoredKeys: false,
                myPublicKeyJwk: null,
                showPassphraseDialog: true
            });
            sessionStorage.removeItem("chat_e2ee_passphrase");
            // Clear server-side stored public key
            this.props.socket?.emit('clear_public_key');
        }
    };
    
    createGroup = () => {
        const { newGroupName, newGroupIsPublic } = this.state;
        if (newGroupName.trim()) {
            this.props.socket?.emit('create_group', { name: newGroupName, isPublic: newGroupIsPublic });
            this.setState({
                newGroupName: '',
                newGroupIsPublic: false,
                showGroupDialog: false
            });
        }
    };
    
    leaveGroup = () => {
        const { selectedUser } = this.state;
        if (selectedUser && selectedUser.isGroup) {
            if (window.confirm(`Leave group "${selectedUser.name}"?`)) {
                this.props.socket?.emit('leave_group', { groupId: selectedUser.id });
                this.setState({ selectedUser: null });
            }
        }
    };
    
    toggleUserMute = (userId) => {
        const { selectedUser } = this.state;
        if (selectedUser && selectedUser.isGroup) {
            this.props.socket?.emit('toggle_mute', { groupId: selectedUser.id, userId });
        }
    };
    
    addToGroup = (userId) => {
        const { selectedUser } = this.state;
        if (selectedUser && selectedUser.isGroup) {
            this.props.socket?.emit('add_to_group', { groupId: selectedUser.id, userId });
            this.setState({ showAddMemberDialog: false });
        }
    };
    
    removeFromGroup = (userId) => {
        const { selectedUser } = this.state;
        if (selectedUser && selectedUser.isGroup) {
            if (window.confirm('Remove this user from the group?')) {
                this.props.socket?.emit('remove_from_group', { groupId: selectedUser.id, userId });
            }
        }
    };
    
    deleteGroup = (groupId) => {
        if (window.confirm(`Delete this group?`)) {
            this.props.socket?.emit('delete_group', { groupId });
            if (this.state.selectedUser?.id === groupId) {
                this.setState({ selectedUser: null });
            }
        }
    };
    
    handleSenderClick = (senderId) => {
        const targetUser = this.state.users.find(u => u.id === senderId);
        
        if (targetUser) {
            this.setSelectedUser(targetUser);
        } else {
            alert("Cannot start private chat with this user (User is invisible)");
        }
    };
    
    getFilteredMessages = () => {
        const { selectedUser, messages } = this.state;
        const { user } = this.props;
        
        if (!selectedUser) return [];
        
        return messages.filter(m => {
            if (selectedUser.isGroup) {
                return m.groupId === selectedUser.id;
            } else {
                return (m.senderId === user.id && m.receiverId === selectedUser.id) ||
                    (m.senderId === selectedUser.id && m.receiverId === user.id);
            }
        });
    };
    
    loadMoreHistory = () => {
        const { selectedUser, messages, loadingHistory } = this.state;
        const { socket } = this.props;
        
        if (!selectedUser || !socket || loadingHistory) return;
        
        // Find the oldest message ID for this chat
        const chatMessages = this.getFilteredMessages();
        if (chatMessages.length === 0) return;
        
        const oldestId = Math.min(...chatMessages.map(m => m.id));
        
        this.setState({ loadingHistory: true });
        
        if (selectedUser.isGroup) {
            socket.emit('load_history', { groupId: selectedUser.id, beforeId: oldestId, limit: 10 });
        } else {
            socket.emit('load_history', { oderId: selectedUser.id, beforeId: oldestId, limit: 10 });
        }
    };
    
    deleteMessage = (messageId) => {
        if (!window.confirm('Delete this message?')) return;
        this.props.socket?.emit('delete_message', { messageId });
    };
    
    deleteAllMessages = () => {
        const { selectedUser } = this.state;
        if (!selectedUser) return;
        
        const confirmMsg = selectedUser.isGroup 
            ? 'Delete all YOUR messages in this group? This cannot be undone.'
            : 'Delete ALL messages in this conversation? This cannot be undone.';
        
        if (!window.confirm(confirmMsg)) return;
        
        if (selectedUser.isGroup) {
            this.props.socket?.emit('delete_all_messages', { groupId: selectedUser.id });
        } else {
            this.props.socket?.emit('delete_all_messages', { oderId: selectedUser.id });
        }
    };
    
    render() {
        const value = {
            ...this.state,
            user: this.props.user,
            socket: this.props.socket,
            isConnected: this.props.isConnected,
            onUserUpdate: this.props.onUserUpdate,
            isMobile: this.props.isMobile,
            
            // Actions
            setSelectedUser: this.setSelectedUser,
            setShowGroupDialog: this.setShowGroupDialog,
            setShowAddMemberDialog: this.setShowAddMemberDialog,
            setShowProfileDialog: this.setShowProfileDialog,
            setShowPassphraseDialog: this.setShowPassphraseDialog,
            setPassphrase: this.setPassphrase,
            setNewGroupName: this.setNewGroupName,
            setNewGroupIsPublic: this.setNewGroupIsPublic,
            setIsE2EEEnabled: this.setIsE2EEEnabled,
            setFullscreenImage: this.setFullscreenImage,
            setViewingKeyUser: this.setViewingKeyUser,
            setShowKeyFingerprintDialog: this.setShowKeyFingerprintDialog,
            toggleLocalMute: this.toggleLocalMute,
            addMessage: this.addMessage,
            handlePassphraseSubmit: this.handlePassphraseSubmit,
            handleClearKeys: this.handleClearKeys,
            createGroup: this.createGroup,
            leaveGroup: this.leaveGroup,
            toggleUserMute: this.toggleUserMute,
            addToGroup: this.addToGroup,
            removeFromGroup: this.removeFromGroup,
            deleteGroup: this.deleteGroup,
            handleSenderClick: this.handleSenderClick,
            getFilteredMessages: this.getFilteredMessages,
            loadMoreHistory: this.loadMoreHistory,
            deleteMessage: this.deleteMessage,
            deleteAllMessages: this.deleteAllMessages,
        };
        
        return (
            <ChatContext.Provider value={value}>
                {this.props.children}
            </ChatContext.Provider>
        );
    }
}

