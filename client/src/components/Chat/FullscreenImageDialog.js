import React, { Component } from 'react';
import { Dialog } from '@mui/material';
import { ChatContext } from './ChatContext';

class FullscreenImageDialog extends Component {
    static contextType = ChatContext;

    handleClose = () => {
        this.context.setFullscreenImage(null);
    };

    render() {
        const { fullscreenImage } = this.context;

        return (
            <Dialog
                open={!!fullscreenImage}
                onClose={this.handleClose}
                maxWidth={false}
                disableRestoreFocus
                PaperProps={{
                    sx: {
                        backgroundColor: 'transparent',
                        boxShadow: 'none',
                        maxWidth: '95vw',
                        maxHeight: '95vh'
                    }
                }}
                onClick={this.handleClose}
            >
                {fullscreenImage && (
                    <img
                        src={fullscreenImage}
                        alt="Vollbild"
                        style={{
                            maxWidth: '95vw',
                            maxHeight: '95vh',
                            objectFit: 'contain',
                            borderRadius: '8px'
                        }}
                    />
                )}
            </Dialog>
        );
    }
}

export default FullscreenImageDialog;

