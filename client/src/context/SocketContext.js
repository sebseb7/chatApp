import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

// Module-level singleton that survives HMR
let socketInstance = null;

export const SocketProvider = ({ children, user }) => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const userIdRef = useRef(user?.id);

    useEffect(() => {
        if (user) {
            // Reuse existing socket if it's still connected (survives HMR)
            if (socketInstance?.connected) {
                console.log('Reusing existing socket connection (HMR)');
                setSocket(socketInstance);
                setIsConnected(true);
                
                // Re-join if user changed
                if (userIdRef.current !== user.id) {
                    socketInstance.emit('join', user.id);
                    userIdRef.current = user.id;
                }
                return;
            }
            
            // Close any existing disconnected socket
            if (socketInstance) {
                socketInstance.close();
                socketInstance = null;
            }

            const newSocket = io('/', {
                withCredentials: true
            });

            newSocket.on('connect', () => {
                console.log('Connected to socket');
                setIsConnected(true);
                newSocket.emit('join', user.id);
            });

            newSocket.on('disconnect', () => {
                console.log('Disconnected from socket');
                setIsConnected(false);
            });

            newSocket.on('ping', () => {
                console.log('Ping received from server');
            });

            socketInstance = newSocket;
            setSocket(newSocket);
            userIdRef.current = user.id;

            // Don't close socket on cleanup - let it survive HMR
            // Socket will be reused or properly closed on actual unmount
            return () => {
                // Only close if we're actually leaving (not HMR)
                // Check if the socket is being replaced by checking a small delay
                // This is a workaround for HMR behavior
            };
        }
    }, [user?.id]); // Use user.id instead of user object to avoid reference issues

    // Cleanup on actual unmount (page navigation, logout)
    useEffect(() => {
        return () => {
            if (socketInstance) {
                socketInstance.close();
                socketInstance = null;
            }
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
