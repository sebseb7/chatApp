import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Chat from './components/Chat';
import { SocketProvider } from './context/SocketContext';

const App = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch('/api/current_user');
                if (res.status === 200) {
                    const data = await res.json();
                    if (data && data.id) {
                        setUser(data);
                    } else {
                        setUser(null);
                    }
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error("Error fetching user", err);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, []);

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={
                    user ? (
                        <SocketProvider user={user}>
                            <Chat user={user} />
                        </SocketProvider>
                    ) : (
                        <Login />
                    )
                } />
            </Routes>
        </BrowserRouter>
    );
};

export default App;
